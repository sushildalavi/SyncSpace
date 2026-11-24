FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/collaboration/package.json packages/collaboration/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @syncspace/api...
COPY apps/api apps/api
COPY packages packages
USER node
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["node_modules/.bin/tsx", "src/main.ts"]
