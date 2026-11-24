FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter @syncspace/web...
COPY apps/web apps/web
COPY packages/contracts packages/contracts
# The API origin is baked into the browser bundle, so it is a build argument.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @syncspace/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
