# Plan del paso 2: del prototipo al sitio real

> Propuesta para aprobación (25 de noviembre de 2026). No se escribe código, no se instala nada y no se hacen commits hasta que lo apruebes.

## 1. Objetivo y alcance del paso 2

**Objetivo:** convertir el prototipo aprobado (`design/prototype/`) en el sitio real, con datos desde PostgreSQL y en español e inglés, sin perder su diseño ni su movimiento.

**Entra:**

- Monorepo con `apps/web` (Next.js), `apps/api` (NestJS) y Postgres en Docker.
- La home con las cinco secciones del prototipo.
- Catálogo, producto con 3D y AR, balones, estilista, club, créditos y aviso legal.
- El estilista IA real, con respuestas en streaming.
- Un carrito local (en el navegador), sin pago.
- Tests, chequeos de i18n, presupuestos de rendimiento y revisión visual.

**Queda para pasos posteriores:** el avatar 360° de Mixamo (el Hangar 360° sigue como adelanto "Próximamente"), el checkout con pagos reales y las cuentas de usuario. Ver la sección 10.

## 2. Estructura del monorepo

```
apps/web/             Next.js 16 + React Three Fiber
  app/[locale]/       rutas por idioma
  components/, lib/   UI por área; api, motion, theme, three, stores
  messages/           es.json y en.json
  styles/             tokens.css y base.css del prototipo
  public/models/      GLB existentes (no se tocan)
  public/posters/     pósters WebP generados
  public/vendor/      decodificador Meshopt para model-viewer
apps/api/             NestJS 12: src/modules y prisma/
packages/contracts/   esquemas zod compartidos
docker-compose.yml    Postgres local
```

- **`packages/contracts` es el único paquete compartido:** web y API intercambian las mismas formas (productos, eventos del estilista) y así no se desincronizan.
- **Cómo se preserva `public/models`:** `create-next-app` no acepta una carpeta con archivos, así que se genera en una carpeta temporal (sin git, sin instalar, sin Tailwind) y se copia sin tocar `public/models`. Se verifica con `git status`.
- pnpm 11 bloquea los scripts de instalación: se aprueban solo los necesarios (Prisma, sharp).

## 3. Frontend (apps/web)

### 3.1 Rutas e i18n

- next-intl con `[locale]` (`es` por defecto, `en`), configurado en `proxy.ts` (el nuevo nombre del middleware en Next 16). Rutas en inglés: `/es/catalog`, `/en/products/air-jordan-1`.
- Texto de UI en `messages/*.json`, con tipos: una llave faltante falla en `typecheck`. Nombres, descripciones y hotspots llegan de la API según el idioma.
- Precios y números con los formateadores de next-intl; metadatos traducidos con `hreflang` y `sitemap.ts`. El formato `es` de Intl escribe "180 US$"; el prototipo usa "US$180" (estilo latinoamericano). En next-intl se define un formato de moneda propio para `es` que dé "US$180", sin concatenar texto.

### 3.2 Tokens: variables CSS con CSS Modules

Se porta `core/tokens.css` casi tal cual y cada componente usa CSS Modules. Lo prefiero a Tailwind 4 porque el prototipo tiene unas 8.000 líneas de CSS aprobado (tablero split-flap, banda 3D, marcos HUD) que así se portan casi 1:1, y las variables ya resuelven el tema sin JavaScript. Los tokens de movimiento viven una vez en TypeScript y el layout los publica como variables CSS. Stylelint prohíbe colores y fuentes fuera de `tokens.css`.

### 3.3 Fuentes y tema

- `next/font/google` con Hubot Sans, Mona Sans y Martian Mono (eje `wdth`, subset `latin`), asignadas a `--font-display`, `--font-body` y `--font-mono`.
- Sin parpadeo: un script en línea en el `<head>` fija `data-theme` (elección guardada, luego sistema), agrega `lite` en equipos modestos y desactiva la restauración automática del scroll. El interruptor anima con View Transitions y un store avisa a las escenas 3D.

### 3.4 Páginas

| Ruta | Contenido |
| --- | --- |
| `/` | Hero con "Pieza por pieza", tablero con Hangar 360° (adelanto), balones, estilista, club y pie |
| `/catalog` | Cuadrícula con pósters y filtros por categoría y marca |
| `/products/[slug]` | Secciones 3D estilo Apple, hotspots, giro 360°, tallas, carrito y AR |
| `/balls` | Banda de balones y cuadrícula |
| `/stylist` | Consola del estilista a pantalla completa |
| `/club` | Tarjeta de miembro; registro "Próximamente" |
| `/credits` | Modelos (del manifest, vía API) y fuentes |
| `/legal` | No afiliación, precios ilustrativos, uso de IA y licencias |

Las páginas sin referencia en el prototipo reusan sus componentes, y te las muestro en capturas antes de pulirlas.

### 3.5 Mapa de componentes

| Prototipo | Componentes React |
| --- | --- |
| Encabezado | `SiteHeader`, `ThemeToggle`, `LocaleSwitch`, `CartDrawer` |
| `core/hud.js` | `HudFrame`, `HudLabel`, `Button`; hooks `useRevealText`, `useCountTo`, `useScramble` |
| `core/stage.js` | `Stage`, `StudioLights`, `StageHalo`, `ContactShadow`, `ProductModel` |
| `flight` | `HeroSection`, `BootIntro`, `DetailTour`, `HotspotRail` |
| `departures` | `CatalogBoard`, `SplitFlapRow`, `ProductDetails`, `HangarTeaser`, `DeckRig` |
| `baggage` | `BallShowcase`, `ConveyorBelt`, `BallSpotlight`, `BallPicker` |
| `tower` | `StylistConsole`, `ChatLog`, `SuggestionChips`, `RecommendationCard` |
| `boarding` | `ClubSection`, `MemberCard`, `SiteFooter` |

La lógica imperativa (`flap.js`, `belt.js`, `rig.js`) pasa a hooks con refs, sin estado de React por cuadro.

### 3.6 Arquitectura 3D (R3F)

- **Un `<Canvas>` por área** (hero, catálogo con hangar, balones, producto), con `next/dynamic` sin SSR y creado al acercarse a la vista.
- **Director de render** (zustand + IntersectionObserver): solo dibuja el canvas más visible; los demás quedan en `frameloop="never"`. DPR máximo 1,5 (1 en lite).
- **Luces y halo:** `LIGHT_PRESETS` por tema (con el kicker blanco), halo CSS detrás del canvas y sombra de contacto barata, como el prototipo. Entorno generado en local, sin descargar HDR.
- **Carga diferida:** `useGLTF` por slug. Solo se precarga el Air Jordan 1 del hero; el resto al pasar el cursor, enfocar o acercarse. Si falla, se ve el póster.
- **Catálogo y hangar:** un solo canvas que se traslada por tiempo del tablero a la plataforma, como `rig.js`.
- **Producto:** canvas `sticky` detrás de capítulos; al entrar cada uno, GSAP mueve la cámara por tiempo. Giro con arrastre y flechas.
- **AR:** model-viewer se importa al tocar "Ver en tu espacio", con `meshoptDecoderLocation` apuntando a la copia local del decodificador y `ar-scale="fixed"` (los modelos ya están a escala real).
- **Lite:** modelos `-lite.glb`, sin postprocesado y póster donde haga falta.
- **Pósters:** `pnpm models:posters` (Playwright) genera un WebP por modelo para tarjetas, lite y Open Graph.

### 3.7 Movimiento

Según `CLAUDE.md`: Lenis solo para saltos de ancla, movido por `gsap.ticker`; GSAP con `useGSAP` para entradas `once`, textos y cámara; Motion para hover, tap y el cajón del carrito; `<ViewTransition>` para que la tarjeta se transforme en la página de producto. Sin pin ni scrub, loops en pausa fuera de pantalla, versión estática con movimiento reducido, intro una vez por sesión y recarga que vuelve a la misma posición.

Lo que dejó la revisión de calidad del prototipo (se lleva tal cual):

- **Anclas:** los enlaces del encabezado no escriben `#id` en la URL. Un enlace profundo se resuelve después de montar todo, y una recarga vuelve a la posición guardada aunque la URL traiga ancla. Los ids son en español (`#catalogo`, `#estilista`). Hay `scroll-padding-top` para el encabezado fijo.
- **Contenido siempre presente:** un estado inicial oculto solo usa opacidad y transform, definido en CSS, nunca `visibility: hidden` ni `autoAlpha`. Si el foco entra a un grupo que aún no animó, la entrada se completa al instante. Ningún valor se vacía para "escribirse" después.
- **Regiones vivas:** el texto que se revuelve (scramble) va con `aria-hidden`; el valor final se anuncia una vez en una región aparte.
- **Encabezado:** degradado arriba y barra sólida al bajar (cambio de estado, no animación ligada al scroll). Menú desplegable por debajo de 960 px, carrito con panel y conteo.
- **Un solo borde:** todo el contenido alinea su borde izquierdo con `--page-edge` (contenedor de 1440 px más el margen).
- **Descargas 3D compartidas:** un GLB se descarga una sola vez aunque lo usen dos escenas (en R3F, `useGLTF` ya cachea por URL).

### 3.8 Accesibilidad y presupuestos

WCAG 2.2 AA: teclado en todo control 3D, foco visible, contraste con la regla tinta y relleno, zonas táctiles de 44 px, y el estilista anuncia la respuesta completa, no cada palabra.

| Métrica | Meta |
| --- | --- |
| LCP / INP / CLS | < 2,5 s / < 200 ms / < 0,1 |
| JS inicial sin 3D | ≤ 220 KB gzip (3D diferido ≤ 350 KB) |
| GLB del hero | ≤ 1,1 MB (lite ≤ 450 KB) |
| Cuadros | 60 fps en un teléfono de gama media |

## 4. Backend (apps/api)

### 4.1 Módulos

`CatalogModule` (productos, marcas, categorías, tallas), `ContentModule` (textos por idioma, hotspots, créditos), `StylistModule` (IA, SSE, límites), `HealthModule` (`/health` con chequeo de la base) y `PrismaModule`. Variables de entorno validadas con zod; helmet, CORS solo para la web y throttling.

### 4.2 Esquema (borrador)

PostgreSQL con **Prisma 7.10.1** fijado (el tag `latest` del CLI apunta a una RC de la 8), con `prisma.config.ts` y el adaptador `@prisma/adapter-pg`.

| Tabla | Campos clave |
| --- | --- |
| `Brand` | `slug`, `name` |
| `Product` | `slug`, `reference` ("AS-001"), `category` (sneaker, apparel, ball), `brandId`, `priceCents`, `currency`, `availability`, `attributes` (JSON neutro: peso, paneles, año), `published`, `modelId` |
| `ProductTranslation` | `productId` + `locale` como clave, `name`, `colorway`, `tagline`, `description`, `materials`, `tags`, `edition` |
| `ProductSize` | `productId`, `system` (EU), `label`, `stock` |
| `Model3D` | `slug` del manifest, `heroUrl`, `liteUrl`, pesos, `foot`, `posterUrl`, `creditId` |
| `Hotspot` + `HotspotTranslation` | posición en metros y pose de cámara; `title` y `text` por idioma |
| `AssetCredit` | tipo, autor, fuente, licencia, uso comercial y cambios (códigos traducibles) |
| `StylistUsage` | día, peticiones, tokens y costo |

Las etiquetas de categoría y disponibilidad son texto de UI y viven en los mensajes.

### 4.3 Seed

- `core/catalog.js` y los hotspots de `flight/content.js` se convierten una vez a `apps/api/prisma/seed/catalog.ts` con `es` y `en` (redacto el inglés y lo revisas). Es la fuente que usa `/add-product`.
- El manifest se lee en cada seed para llenar `Model3D` y `AssetCredit`. Upsert por slug, repetible.
- Solo el Air Jordan 1 tiene hotspots; los demás omiten ese capítulo hasta tener los suyos.

### 4.4 Endpoints

| Ruta | Uso |
| --- | --- |
| `GET /health` | Estado |
| `GET /v1/products?locale&category&brand` | Tarjetas |
| `GET /v1/products/:slug?locale` | Detalle con tallas, modelo 3D y hotspots |
| `GET /v1/brands`, `/v1/categories`, `/v1/credits` | Filtros y créditos |
| `POST /v1/stylist/chat` | Estilista en `text/event-stream` |

DTOs con **zod** (de `packages/contracts`) y un pipe propio, en lugar de class-validator, para tener un solo lenguaje de esquemas. Errores como `{ code }`, que la web traduce. Caché en memoria para lecturas, `Cache-Control` con `stale-while-revalidate`, y en la web `fetch` con `revalidate`.

## 5. Estilista IA

- **Modelo recomendado: `claude-opus-5-5`**, el que indica la skill `claude-api`, con esfuerzo bajo (`effort: "low"`): en un chat corto baja costo y espera sin perder disciplina con las reglas (solo catálogo, idioma correcto). Se lee de `STYLIST_MODEL`, así que cambiarlo es configuración. Costo estimado: unos 2 centavos de dólar por respuesta.
- **Solo productos del catálogo:** el prompt incluye una ficha compacta del catálogo en el idioma del visitante. El modelo recomienda con la herramienta `show_products` (`strict: true`, slugs limitados a un `enum`, máximo 3). La API valida cada slug contra la base y arma las tarjetas con datos reales: el modelo nunca escribe precios ni tallas.
- **Idioma:** la petición trae `locale` y el prompt ordena responder en ese idioma.
- **Streaming:** `client.messages.stream` del SDK `@anthropic-ai/sdk`, reenviado como SSE con eventos `text`, `products`, `done` y `error`. La web lo lee con `fetch` y lo cancela con `AbortController`.
- **Seguridad:** fuera de tema responde con amabilidad y redirige; el texto del visitante es dato, no instrucciones; la herramienta es de solo lectura y no hay acceso a la web; mensajes de hasta 500 caracteres y 10 por conversación; las negativas (`refusal`) se manejan con un mensaje traducido y el parámetro `fallbacks: "default"` que recomienda la skill; no se guardan conversaciones (`/legal` lo explica).
- **Costos:** caché del prompt por idioma, tope de unos 4.000 tokens de salida, rate limit por IP, presupuesto diario (`STYLIST_DAILY_BUDGET_USD`) medido con `usage`, respuestas de las ideas sugeridas en caché e interruptor `STYLIST_ENABLED`. Sin presupuesto, la consola vuelve al guion del prototipo.
- **Secretos:** `ANTHROPIC_API_KEY` y `DATABASE_URL` en el `.env` de la raíz (ignorado por git); la web no tiene secretos. Cada variable nueva se documenta en `.env.example`.

## 6. Docker

`docker-compose.yml` con PostgreSQL (imagen oficial, versión fijada), volumen, healthcheck, puerto solo en `127.0.0.1` y una base `airspace_test`. La API puede correr en Docker con el perfil `full`; en el día a día ambas apps corren con `pnpm dev`.

## 7. Calidad

- **API:** tests unitarios con el runner del scaffold de Nest (filtros, DTOs, seed, prompt, validación de `show_products`, presupuesto, SSE con el SDK simulado) e integración contra `airspace_test`.
- **E2E (Playwright):** home en ambos idiomas sin errores, tema que persiste sin parpadeo, cambio de idioma, del catálogo al producto, hotspots con teclado, carrito, estilista con SSE simulado (sin gastar), créditos, movimiento reducido y `?lite`.
- **i18n:** `/i18n-check` al cerrar cada fase con UI, un test que compara las llaves de `es.json` y `en.json` y busca rayas largas, y ESLint `react/jsx-no-literals`.
- **Lighthouse:** rendimiento ≥ 90 en escritorio y ≥ 80 en móvil en la home (≥ 90 en el resto); accesibilidad, buenas prácticas y SEO ≥ 95.
- **Visual:** capturas a 1720x816 y 390x844 en ambos temas, con la home comparada contra el prototipo; el 3D se revisa a mano. Recargas en varias posiciones y prueba en un teléfono real.

## 8. Fases y orden de trabajo

Cada fase cierra con una demo y espera tu visto bueno.

| Fase | Entrega | Se verifica |
| --- | --- | --- |
| 0. Cimientos | Scaffold de web y API, `contracts`, lint, Postgres, `.env.example`; pruebas de R3F en Next 16 y de Prisma 7 en Nest 12 | Ambas apps levantan; `/es`, `/en` y `/health` responden; el Air Jordan 1 gira; modelos intactos |
| 1. API de catálogo | Esquema, migración, seed, endpoints y tests | Tests verdes, seed repetible, ambos idiomas; revisas el inglés |
| 2. Base del sitio | Layout, tokens, fuentes, tema, encabezado, pie, movimiento, pósters, `/catalog`, `/credits`, `/legal`, carrito | Capturas en 2 tamaños y 2 temas, sin parpadeo, `/i18n-check` limpio |
| 3. Producto 3D | Kit 3D, director de render, hotspots, giro, AR y transición desde la tarjeta | Un solo canvas dibujando, 60 fps, AR en iPhone y Android; apruebas el diseño |
| 4. Home completa | Hero, tablero y Hangar, balones, consola con guion, club, `/balls`, `/club` | Lado a lado con el prototipo, recargas, lite y movimiento reducido |
| 5. Estilista IA | Módulo, SSE, límites, presupuesto y `/stylist` | Tests con el SDK simulado, pruebas de fuera de tema e inyección, costo medido |
| 6. Cierre | E2E, Lighthouse, axe, teléfono real, Dockerfile, documentación y vista previa si se aprueba | Metas de la sección 7 cumplidas |

## 9. Riesgos y decisiones que necesitan aprobación

| # | Decisión | Recomendación |
| --- | --- | --- |
| 1 | Estilos: CSS Modules o Tailwind 4 | CSS Modules con variables: porta el CSS aprobado casi 1:1 |
| 2 | ORM: Prisma 7.10.1 o Drizzle | Prisma: migraciones y seed listos, y es lo que asume `/add-product` |
| 3 | 3D: un canvas por área o uno global con drei `View` | Uno por área: con scroll nativo no hay desfase y cada escena tiene su postprocesado; `View` queda de plan B |
| 4 | Modelo del estilista: Opus 5.5 (US$4 / US$20 por millón de tokens), Sonnet 5.5 (US$2 / US$10) o Haiku 5.5 (US$0,10 / US$0,50) | Opus 5.5 con esfuerzo bajo y presupuesto diario; bajar de modelo por costo es tu decisión |
| 5 | Datos de la web: solo por la API o Next lee Postgres | Solo por la API: una sola fuente de verdad |
| 6 | Ropa: sembrar productos de muestra o solo el esquema | Solo esquema y filtros hasta tener imágenes o modelos con licencia |
| 7 | Despliegue: Vercel + Railway o un VPS con compose | Vercel (web) + Railway (API y Postgres), como vista previa al final y solo si lo apruebas |

**Riesgos:**

- Next trae su propio React y R3F 9.8.2 pide React < 19.4: se confirma en la fase 0.
- Prisma 7 cambió su cliente; su formato de módulos debe calzar con Nest 12 (fase 0).
- Memoria WebGL en teléfonos: máximo 3 canvas en la home, creados al acercarse.
- El build estático necesita la API arriba; si no está, las páginas se generan en la primera visita.
- Abuso del estilista: rate limit, presupuesto diario e interruptor.
- La Adidas Samba (CC BY-NC-SA) sirve para un portafolio; si el proyecto se vuelve comercial, se reemplaza.

## 10. Qué NO se hace en el paso 2

- Avatar 360° de Mixamo y el Hangar real.
- Checkout, pagos, órdenes y correos.
- Cuentas, login, club real y captura de emails.
- Panel de administración: el catálogo se edita con el seed y `/add-product`.
- Modelos 3D nuevos o cambios al pipeline, salvo el script de pósters.
- Búsqueda avanzada o memoria del estilista entre visitas.
- Idiomas además de `es` y `en`, y analítica.
- Despliegue a producción con dominio propio.
- Commits sin que los pidas.
