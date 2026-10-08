FROM node:22-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/pocketbase/package.json apps/pocketbase/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build --prefix apps/web
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=web-build /app/package.json /app/package-lock.json ./
COPY --from=web-build /app/node_modules ./node_modules
COPY --from=web-build /app/apps/web ./apps/web
COPY --from=web-build /app/dist ./dist
EXPOSE 3000
CMD ["npm", "run", "start", "--prefix", "apps/web"]

FROM debian:bookworm-slim AS pocketbase
WORKDIR /app
COPY apps/pocketbase/pocketbase ./pocketbase
COPY apps/pocketbase/pb_migrations ./pb_migrations
COPY apps/pocketbase/pb_hooks ./pb_hooks
RUN chmod 0755 ./pocketbase && mkdir -p /data
ENV PB_ENCRYPTION_KEY=""
EXPOSE 8090
CMD ["/app/pocketbase", "serve", "--http=0.0.0.0:8090", "--encryptionEnv=PB_ENCRYPTION_KEY", "--dir=/data", "--migrationsDir=/app/pb_migrations", "--hooksDir=/app/pb_hooks", "--hooksWatch=false"]
