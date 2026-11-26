import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Locale, STYLIST_LIMITS, type StylistEvent, type StylistRequest, type StylistStatus } from '@airspace/contracts';
import { z } from 'zod';
import { CatalogService } from '../catalog/catalog.service.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { TtlCache } from '../common/ttl-cache.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { showProductsTool, stylistSystemPrompt } from './prompt.js';
import { costMicros, today, type UsageCounts } from './usage.js';

// Cliente de Anthropic inyectable (las pruebas lo reemplazan por uno simulado).
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');
export type StylistModelClient = Pick<Anthropic, 'beta'>;

// Tope de salida por respuesta (el plan: unos 4.000 tokens).
const MAX_OUTPUT_TOKENS = 4000;

const toolInputSchema = z.object({
  products: z.array(z.object({ slug: z.string(), reason: z.string(), match: z.number() })),
});

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
  // recomendaciones (solo slugs del catálogo, validados) y "done".
  async chat(request: StylistRequest, emit: Emit, signal: AbortSignal): Promise<void> {
    if (!this.config.stylist.enabled || !this.client) return emit({ type: 'error', code: 'unavailable' });
    if (await this.overBudget()) return emit({ type: 'error', code: 'budget_exhausted' });

    const { system, slugs } = await this.promptFor(request.locale);
    const known = new Set(slugs);

    try {
      const stream = this.client.beta.messages.stream(
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
          tools: [showProductsTool(slugs)],
          messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') emit({ type: 'text', text: event.delta.text });
      }
      const message = await stream.finalMessage();

      await this.recordUsage({
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      });

      if (message.stop_reason === 'refusal') return emit({ type: 'error', code: 'refused' });

      // Recomendaciones: solo con la respuesta completa (no truncada) y solo
      // slugs que existen en el catálogo; como máximo tres.
      const toolUse = message.content.find((block) => block.type === 'tool_use' && block.name === 'show_products');
      if (toolUse && toolUse.type === 'tool_use' && message.stop_reason !== 'max_tokens') {
        const parsed = toolInputSchema.safeParse(toolUse.input);
        if (parsed.success) {
          const items = parsed.data.products
            .filter((product) => known.has(product.slug))
            .slice(0, STYLIST_LIMITS.recommendations)
            .map((product) => ({ slug: product.slug, reason: product.reason.slice(0, 160), match: Math.max(0, Math.min(100, Math.round(product.match))) }));
          if (items.length) emit({ type: 'products', items });
        } else {
          this.logger.warn('show_products con entrada inválida; se omiten las tarjetas');
        }
      }
      emit({ type: 'done' });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof Anthropic.RateLimitError) return emit({ type: 'error', code: 'rate_limited' });
      // Sin detalles del proveedor hacia el cliente; el registro sí los guarda.
      this.logger.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      emit({ type: 'error', code: 'internal_error' });
    }
  }
}
