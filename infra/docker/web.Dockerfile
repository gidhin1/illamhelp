FROM node:24-alpine AS build
WORKDIR /workspace

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_MEDIA_GRPC_WEB_URL=http://localhost:9091
ARG NEXT_PUBLIC_GA4_MEASUREMENT_ID=
ARG NEXT_PUBLIC_GTM_ID=
ARG NEXT_PUBLIC_GA4_DEBUG_MODE=false
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_MEDIA_GRPC_WEB_URL=$NEXT_PUBLIC_MEDIA_GRPC_WEB_URL
ENV NEXT_PUBLIC_GA4_MEASUREMENT_ID=$NEXT_PUBLIC_GA4_MEASUREMENT_ID
ENV NEXT_PUBLIC_GTM_ID=$NEXT_PUBLIC_GTM_ID
ENV NEXT_PUBLIC_GA4_DEBUG_MODE=$NEXT_PUBLIC_GA4_DEBUG_MODE

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY web/package.json web/package.json
RUN pnpm install --frozen-lockfile

COPY web web
RUN pnpm --filter @illamhelp/web build

FROM node:24-alpine
WORKDIR /app/web
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S -g 10001 nodejs && adduser -S -u 10001 nextjs -G nodejs
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /workspace/web/.next/standalone /app
COPY --from=build /workspace/web/.next/static /app/web/.next/static
RUN mkdir -p /app/web/public
USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
