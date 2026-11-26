# syntax=docker/dockerfile:1.7-labs
#
# Imagen de producción de la API (NestJS + Prisma 7). Se construye desde la
# raíz del monorepo:
#
#   docker build -f apps/api/Dockerfile -t airspace-wear-api .
#   docker build -f apps/api/Dockerfile --target tools -t airspace-wear-api-tools .
#
# Objetivos:
# - runtime (por defecto): solo dist/ y las dependencias de producción.
# - tools: migraciones (prisma migrate deploy, el CMD por defecto) y seed
#   (tsx prisma/seed/index.ts). Lleva las dependencias de desarrollo.
#
# Ninguna variable secreta entra a la imagen: DATABASE_URL, ANTHROPIC_API_KEY
# y el resto llegan como variables de entorno al ejecutar.

ARG NODE_IMAGE=node:22.23.4-alpine3.24

# ---------- Base: Node fijado y pnpm por corepack ----------
FROM ${NODE_IMAGE} AS base
ENV COREPACK_HOME=/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /repo

# ---------- Build: dependencias, contratos y API ----------
FROM base AS build
# Primero solo los manifiestos, para que la capa de dependencias se reutilice
# mientras no cambie el lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=airspace-pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter @airspace/api...
COPY packages/contracts packages/contracts
COPY apps/api apps/api
# El build de la API corre prisma generate (cliente en src/generated) y nest build.
RUN pnpm --filter @airspace/contracts build && pnpm --filter @airspace/api build

# ---------- Deploy: copia autónoma de la API ----------
# Solo dependencias de producción (incluye @airspace/contracts ya compilado).
# Etapa aparte para que /out no engorde la imagen tools.
FROM build AS deploy
RUN --mount=type=cache,id=airspace-pnpm,target=/pnpm-store \
    pnpm --filter @airspace/api deploy --prod --legacy --store-dir /pnpm-store /out

# ---------- Tools: migraciones y seed ----------
FROM build AS tools
# El seed lee el manifest de modelos (créditos) y comprueba qué pósters existen.
COPY assets/models/manifest.json assets/models/manifest.json
COPY apps/web/public/posters apps/web/public/posters
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /repo/apps/api
USER node
# Por defecto aplica las migraciones pendientes. Para el seed:
#   docker run ... airspace-wear-api-tools ./node_modules/.bin/tsx prisma/seed/index.ts
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

# ---------- Runtime: imagen mínima de la API ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=4000
WORKDIR /app
COPY --from=deploy --chown=node:node /out/package.json ./package.json
# @prisma/client declara el CLI de Prisma como peer opcional y pnpm lo enlaza
# con todo su árbol (Studio, PGlite, TypeScript, React): unos 200 MB que la API
# nunca carga. El cliente generado solo usa @prisma/client/runtime y el
# adaptador pg, así que esas carpetas se dejan fuera (--exclude, sintaxis labs).
COPY --from=deploy --chown=node:node \
  --exclude=.pnpm/prisma@* \
  --exclude=.pnpm/@prisma+studio-core@* \
  --exclude=.pnpm/@prisma+engines@* \
  --exclude=.pnpm/@prisma+dev@* \
  --exclude=.pnpm/@prisma+config@* \
  --exclude=.pnpm/effect@* \
  --exclude=.pnpm/typescript@* \
  --exclude=.pnpm/@electric-sql+pglite@* \
  --exclude=.pnpm/react-dom@* \
  --exclude=.pnpm/elkjs@* \
  /out/node_modules ./node_modules
COPY --from=deploy --chown=node:node /out/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.API_PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
