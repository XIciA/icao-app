FROM node:22-alpine AS build

WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY modules/icao-distribution-environment modules/icao-distribution-environment
COPY apps/ops/package.json apps/ops/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @icao/ops... --filter @icao/contracts...
COPY apps/ops apps/ops
COPY packages/contracts packages/contracts
RUN pnpm --filter @icao/ops build

FROM caddy:2-alpine
COPY infra/ops/static.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/ops/dist /srv
EXPOSE 8080
