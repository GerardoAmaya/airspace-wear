# syntax=docker/dockerfile:1.7
#
# Imagen de producción de la web (Next.js 16, salida standalone). Se construye
# desde la raíz del monorepo:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg API_URL=http://host.docker.internal:4001 \
#     --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:4001 \
#     -t airspace-wear-web .
#
# Importante: `next build` prerenderiza el catálogo y las fichas de producto,
# así que la API tiene que responder en API_URL durante el build (si no, el
# build falla en vez de publicar un catálogo vacío). Con el perfil `full` de
# docker-compose.yml primero se levanta la API y después se construye la web
# (ver README.md, sección Docker).
#
# La web no guarda secretos. REVALIDATE_SECRET llega como variable al ejecutar.

ARG NODE_IMAGE=node:22.23.4-alpine3.24

# ---------- Base: Node fijado y pnpm por corepack ----------
FROM ${NODE_IMAGE} AS base
ENV COREPACK_HOME=/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# ---------- Build: dependencias, contratos y web ----------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=airspace-pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store --filter @airspace/web...
COPY packages/contracts packages/contracts
COPY apps/web apps/web
# API_URL: dirección de la API para el servidor de Next durante el build (el
# prerender la necesita). En ejecución se usa la variable del contenedor.
# NEXT_PUBLIC_API_URL: dirección de la API para el navegador (estilista). Next
# la incrusta en el JavaScript del cliente, así que se fija aquí.
# SITE_URL: dirección pública del sitio para las URLs absolutas de los
# metadatos (hreflang y canónica); también se lee al construir.
ARG API_URL=http://host.docker.internal:4001
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:4001
ARG SITE_URL=http://localhost:3001
ENV API_URL=${API_URL} \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    SITE_URL=${SITE_URL} \
    BUILD_STANDALONE=1
RUN pnpm --filter @airspace/contracts build && pnpm --filter @airspace/web build

# ---------- Runtime: server.js de Next con los archivos trazados ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# La salida standalone replica la estructura del monorepo (apps/web/server.js).
# Los estáticos y public/ no vienen incluidos: se copian al lado.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/es').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
