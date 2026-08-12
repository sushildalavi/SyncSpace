FROM node:22-alpine AS base
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @syncspace/web build
CMD ["pnpm", "--filter", "@syncspace/web", "start"]
