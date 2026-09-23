FROM node:22-alpine AS build

ARG ICAO_NPM_REGISTRY=https://registry.npmmirror.com

WORKDIR /workspace
RUN COREPACK_NPM_REGISTRY="$ICAO_NPM_REGISTRY" corepack enable \
  && COREPACK_NPM_REGISTRY="$ICAO_NPM_REGISTRY" corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY modules/icao-distribution-environment modules/icao-distribution-environment
COPY modules/icao-wechat-auth modules/icao-wechat-auth
COPY apps/ops/package.json apps/ops/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --registry "$ICAO_NPM_REGISTRY" --frozen-lockfile --filter @icao/ops... --filter @icao/contracts...
COPY apps/ops apps/ops
COPY packages/contracts packages/contracts
RUN pnpm --filter @icao/ops build

FROM caddy:2.11.4-alpine
COPY infra/ops/static.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/ops/dist /srv
EXPOSE 8080
