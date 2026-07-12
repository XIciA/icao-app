FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/api/package.json services/api/package.json

RUN pnpm install --frozen-lockfile --filter @icao/api...

COPY packages/contracts packages/contracts
COPY services/api services/api

RUN pnpm --filter @icao/contracts build && pnpm --filter @icao/api build

ENV NODE_ENV=production

CMD ["node", "services/api/dist/src/main.js"]
