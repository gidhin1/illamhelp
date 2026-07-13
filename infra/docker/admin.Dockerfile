FROM node:24-alpine AS build
WORKDIR /workspace

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_MEDIA_GRPC_WEB_URL=http://localhost:9091
ARG NEXT_PUBLIC_WEB_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_MEDIA_GRPC_WEB_URL=$NEXT_PUBLIC_MEDIA_GRPC_WEB_URL
ENV NEXT_PUBLIC_WEB_APP_URL=$NEXT_PUBLIC_WEB_APP_URL

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages packages
COPY admin/package.json admin/package.json
RUN pnpm install --frozen-lockfile

COPY admin admin
RUN pnpm --filter @illamhelp/admin build

FROM node:24-alpine
WORKDIR /app/admin
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3003
RUN addgroup -S -g 10001 nodejs && adduser -S -u 10001 nextjs -G nodejs
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /workspace/admin/.next/standalone /app
COPY --from=build /workspace/admin/.next/static /app/admin/.next/static
RUN mkdir -p /app/admin/public
USER 10001:10001
EXPOSE 3003
CMD ["node", "server.js"]
