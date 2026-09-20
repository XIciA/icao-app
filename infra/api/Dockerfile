FROM node:22-alpine

ARG ICAO_API_RELEASE_ID=development
ARG ICAO_NPM_REGISTRY=https://registry.npmmirror.com

RUN COREPACK_NPM_REGISTRY="$ICAO_NPM_REGISTRY" corepack enable \
  && COREPACK_NPM_REGISTRY="$ICAO_NPM_REGISTRY" corepack prepare pnpm@11.7.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY modules/icao-distribution-environment modules/icao-distribution-environment
COPY modules/icao-wechat-auth modules/icao-wechat-auth
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/api/package.json services/api/package.json

RUN pnpm install --registry "$ICAO_NPM_REGISTRY" --frozen-lockfile --filter @icao/api...

COPY packages/contracts packages/contracts
COPY services/api services/api
COPY content/vocabulary content/vocabulary
COPY content/app-content/text.json content/app-content/text.json
COPY content/question-banks/opi-hotspots.json content/question-banks/opi-hotspots.json

RUN node --test packages/contracts/test/runtime.test.mjs \
  && pnpm --filter @icao/contracts build && pnpm --filter @icao/api build

ENV NODE_ENV=production
ENV API_RELEASE_ID=$ICAO_API_RELEASE_ID

CMD ["node", "services/api/dist/src/main.js"]
