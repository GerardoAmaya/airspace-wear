import { type Anthropic, RateLimitError } from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaToolResultBlockParam, BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  detectOrderQuestion,
  type Locale,
  type OrderDetail,
  type OrderQuestion,
  STYLIST_LIMITS,
  type StylistEvent,
  type StylistOrder,
  type StylistRecommendation,
  type StylistRequest,
  type StylistStatus,
} from '@airspace/contracts';
import { z } from 'zod';
import { CatalogService } from '../catalog/catalog.service.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { TtlCache } from '../common/ttl-cache.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionUser } from '../auth/session-auth.guard.js';
import { ORDER_DATA_TOOLS, orderTools, showProductsTool, signInTool, stylistSystemPrompt } from './prompt.js';
import { StylistOrders, TOOL_ORDER_LIMIT, toModelOrder, toStylistOrder } from './stylist-orders.js';
import { costMicros, today, type UsageCounts } from './usage.js';

// Cliente de Anthropic inyectable (las pruebas lo reemplazan por uno simulado).
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');
export type StylistModelClient = Pick<Anthropic, 'beta'>;

// Tope de salida por respuesta (el plan: unos 4.000 tokens).
const MAX_OUTPUT_TOKENS = 4000;

// Vueltas máximas con el modelo en una respuesta: leer pedidos y contestar
// (una consulta de datos y la respuesta; la tercera es margen).
const MAX_ROUNDS = 3;

// Entradas de las herramientas: se validan siempre (con eager_input_streaming
// la API no las valida y el SDK puede entregar un objeto truncado).
const toolInputSchema = z.object({
  products: z.array(z.object({ slug: z.string(), reason: z.string(), match: z.number() })),
});
const getOrderInputSchema = z.object({ number: z.string().max(40) });
// Números de pedido en el texto de la respuesta (para las tarjetas).
const ORDER_NUMBER = /\bAS-\d{4}-\d{6,}\b/gi;

type Emit = (event: StylistEvent) => void;

@Injectable()
export class StylistService {
  private readonly logger = new Logger(StylistService.name);
  // Prompt y herramienta por idioma: estables mientras no cambie el catálogo.
  private readonly prompts = new TtlCache<{ system: string; slugs: string[] }>(10 * 60_000, 4);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ANTHROPIC_CLIENT) private readonly client: StylistModelClient | null,
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly orders: StylistOrders,
  ) {}

  async status(): Promise<StylistStatus> {
    return { available: this.config.stylist.enabled && this.client !== null && !(await this.overBudget()) };
  }

  private async overBudget(): Promise<boolean> {
    const usage = await this.prisma.stylistUsage.findUnique({ where: { day: today() } });
    return (usage?.costMicros ?? 0) >= this.config.stylist.dailyBudgetUsd * 1_000_000;
  }

  private promptFor(locale: Locale) {
    return this.prompts.get(`prompt:${locale}`, async () => {
      const { items } = await this.catalog.listProducts({ locale });
      return { system: stylistSystemPrompt(locale, items), slugs: items.map((item) => item.slug) };
    });
  }

  private async recordUsage(usage: UsageCounts): Promise<void> {
    const cost = costMicros(usage);
    await this.prisma.stylistUsage.upsert({
      where: { day: today() },
      create: { day: today(), requests: 1, ...usage, costMicros: cost },
      update: {
        requests: { increment: 1 },
        inputTokens: { increment: usage.inputTokens },
        outputTokens: { increment: usage.outputTokens },
        cacheReadTokens: { increment: usage.cacheReadTokens },
        cacheWriteTokens: { increment: usage.cacheWriteTokens },
        costMicros: { increment: cost },
      },
    });
  }

  // Responde un mensaje en streaming: texto a medida que llega, luego las
  // tarjetas (productos del catálogo validados, pedidos del usuario o la
  // acción de iniciar sesión) y "done". user: la sesión, si la web la reenvió.
  async chat(request: StylistRequest, emit: Emit, signal: AbortSignal, user: SessionUser | null = null): Promise<void> {
    const question = detectOrderQuestion(request.messages.at(-1)?.content ?? '');
    const unavailable = !this.config.stylist.enabled || !this.client;
    if (unavailable || (await this.overBudget())) {
      // Sin IA, las preguntas sobre pedidos se responden igual, con datos.
      if (question) return this.answerOrdersWithoutModel(question, user, request.locale, emit);
      return emit({ type: 'error', code: unavailable ? 'unavailable' : 'budget_exhausted' });
    }
    const client = this.client!;

    const { system, slugs } = await this.promptFor(request.locale);
    const known = new Set(slugs);
    // Con sesión, las herramientas de pedidos; sin ella, solo pedir que inicie
    // sesión. El orden es fijo: cada caso conserva su prefijo en caché.
    const tools = [showProductsTool(slugs), ...(user ? orderTools() : [signInTool()])];
    const messages: BetaMessageParam[] = request.messages.map((message) => ({ role: message.role, content: message.content }));
    const usage: UsageCounts = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    let products: StylistRecommendation[] = [];
    let answer = '';
    let signIn = false;
    // Pedidos leídos en esta respuesta (solo del usuario), en el orden en que
    // llegaron: las tarjetas solo pueden citar estos.
    const fetched = new Map<string, OrderDetail>();
    let wroteText = false;

    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const stream = client.beta.messages.stream(
          {
            model: this.config.stylist.model,
            max_tokens: MAX_OUTPUT_TOKENS,
            // Si el modelo declina por política, la API reintenta del lado del
            // servidor con el respaldo recomendado (por categoría).
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            // Chat corto: esfuerzo bajo (menos espera y costo, mismas reglas).
            output_config: { effort: 'low' },
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            tools,
            messages,
          },
          { signal },
        );

        // Entre vueltas, un espacio separa el texto nuevo del anterior.
        let separated = !wroteText;
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            if (!separated) {
              emit({ type: 'text', text: ' ' });
              separated = true;
            }
            wroteText = true;
            answer += event.delta.text;
            emit({ type: 'text', text: event.delta.text });
          }
        }
        const message = await stream.finalMessage();
        usage.inputTokens += message.usage.input_tokens;
        usage.outputTokens += message.usage.output_tokens;
        usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;

        if (message.stop_reason === 'refusal') {
          await this.recordUsage(usage);
          return emit({ type: 'error', code: 'refused' });
        }
        // Una entrada cortada por max_tokens puede parecer válida: esa vuelta
        // no ejecuta herramientas ni muestra tarjetas.
        if (message.stop_reason === 'max_tokens') break;

        const toolUses = message.content.filter((block): block is BetaToolUseBlock => block.type === 'tool_use');
        for (const block of toolUses) {
          if (block.name === 'show_products') products = this.recommendations(block.input, known) ?? products;
          else if (block.name === 'ask_to_sign_in' && !user) signIn = true;
        }

        // Si pidió datos de pedidos, se responden y el modelo sigue.
        const wantsData = user && toolUses.some((block) => (ORDER_DATA_TOOLS as readonly string[]).includes(block.name));
        if (!wantsData || message.stop_reason !== 'tool_use' || round === MAX_ROUNDS - 1) break;
        messages.push({ role: 'assistant', content: message.content });
        const results: BetaToolResultBlockParam[] = [];
        for (const block of toolUses) results.push(await this.runTool(block, user, request.locale, fetched));
        messages.push({ role: 'user', content: results });
      }

      await this.recordUsage(usage);
      if (products.length) emit({ type: 'products', items: products });
      const cards = this.orderCards(answer, fetched);
      if (cards.length) emit({ type: 'orders', items: cards });
      if (signIn) emit({ type: 'sign_in' });
      emit({ type: 'done' });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof RateLimitError) return emit({ type: 'error', code: 'rate_limited' });
      // Sin detalles del proveedor hacia el cliente; el registro sí los guarda.
      this.logger.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      emit({ type: 'error', code: 'internal_error' });
    }
  }

  // Recomendaciones: solo slugs que existen en el catálogo; como máximo tres.
  private recommendations(input: unknown, known: Set<string>): StylistRecommendation[] | null {
    const parsed = toolInputSchema.safeParse(input);
    if (!parsed.success) {
      this.logger.warn('show_products con entrada inválida; se omiten las tarjetas');
      return null;
    }
    return parsed.data.products
      .filter((product) => known.has(product.slug))
      .slice(0, STYLIST_LIMITS.recommendations)
      .map((product) => ({ slug: product.slug, reason: product.reason.slice(0, 160), match: Math.max(0, Math.min(100, Math.round(product.match))) }));
  }

  // Tarjetas de pedidos: los números que el modelo escribió en la respuesta,
  // en ese orden, y solo si los leyó en esta respuesta con la sesión del
  // usuario (nunca un número inventado o ajeno). Si no escribió ninguno, el
  // primero que leyó (el que pidió por número, o el más reciente).
  private orderCards(answer: string, fetched: Map<string, OrderDetail>): StylistOrder[] {
    const mentioned = [...new Set((answer.match(ORDER_NUMBER) ?? []).map((number) => number.toUpperCase()))].filter((number) => fetched.has(number));
    const numbers = mentioned.length ? mentioned : [...fetched.keys()].slice(0, 1);
    return numbers.slice(0, STYLIST_LIMITS.orders).map((number) => toStylistOrder(fetched.get(number)!));
  }

  // Ejecuta una herramienta de la vuelta. Las de mostrar (tarjetas, iniciar
  // sesión) no devuelven datos: solo confirman, para que el modelo siga.
  private async runTool(block: BetaToolUseBlock, user: SessionUser, locale: Locale, fetched: Map<string, OrderDetail>): Promise<BetaToolResultBlockParam> {
    const now = new Date();
    const result = (content: unknown, isError = false): BetaToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(content),
      ...(isError ? { is_error: true } : {}),
    });
    if (block.name === 'get_my_orders') {
      const orders = await this.orders.recent(user.id, locale, TOOL_ORDER_LIMIT, now);
      for (const order of orders) fetched.set(order.number, order);
      return result({ now: now.toISOString(), orders: orders.map((order) => toModelOrder(order, now)) });
    }
    if (block.name === 'get_order') {
      const parsed = getOrderInputSchema.safeParse(block.input);
      if (!parsed.success) return result({ INVALID_JSON: JSON.stringify(block.input) }, true);
      const order = await this.orders.byNumber(user.id, parsed.data.number, locale, now);
      if (!order) return result({ now: now.toISOString(), found: false });
      fetched.set(order.number, order);
      return result({ now: now.toISOString(), found: true, order: toModelOrder(order, now) });
    }
    return result({ shown: true });
  }

  // Respuesta de respaldo sin modelo (sin clave o sin presupuesto) a una
  // pregunta sobre pedidos: avisos que la web traduce y tarjetas con datos
  // reales del usuario. Sin sesión, la acción de iniciarla.
  private async answerOrdersWithoutModel(question: OrderQuestion, user: SessionUser | null, locale: Locale, emit: Emit): Promise<void> {
    try {
      if (!user) {
        emit({ type: 'notice', code: 'sign_in_required' });
        emit({ type: 'sign_in' });
        return emit({ type: 'done' });
      }
      if (question.number) {
        const order = await this.orders.byNumber(user.id, question.number, locale);
        if (order) {
          emit({ type: 'notice', code: 'order_found' });
          emit({ type: 'orders', items: [toStylistOrder(order)] });
          return emit({ type: 'done' });
        }
        const recent = await this.orders.recent(user.id, locale, STYLIST_LIMITS.orders);
        emit({ type: 'notice', code: 'order_not_found', count: recent.length });
        if (recent.length) emit({ type: 'orders', items: recent.map(toStylistOrder) });
        return emit({ type: 'done' });
      }
      const recent = await this.orders.recent(user.id, locale, question.latest ? 1 : STYLIST_LIMITS.orders);
      if (!recent.length) {
        emit({ type: 'notice', code: 'orders_empty' });
        return emit({ type: 'done' });
      }
      emit({ type: 'notice', code: 'orders_found', count: recent.length });
      emit({ type: 'orders', items: recent.map(toStylistOrder) });
      emit({ type: 'done' });
    } catch (error) {
      this.logger.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      emit({ type: 'error', code: 'internal_error' });
    }
  }
}
