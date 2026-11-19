FROM node:22-bookworm-slim AS lesson-videos
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/watermark-lesson-videos.mjs /tools/watermark-lesson-videos.mjs
COPY apps/web/public/media/lessons/im-kaufhaus /input
COPY apps/web/public/branding/upi-logo.png /tools/upi-logo.png
RUN node /tools/watermark-lesson-videos.mjs /input /output /tools/upi-logo.png "Novia Anjani Dewi"

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
# poppler-utils renders scanned PDF pages to PNG for OCR.
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
COPY --from=web-build /app/package.json /app/package-lock.json ./
COPY --from=web-build /app/node_modules ./node_modules
COPY --from=web-build /app/apps/web ./apps/web
COPY --from=web-build /app/dist ./dist
COPY --from=lesson-videos /output/ ./apps/web/public/media/lessons/im-kaufhaus/
COPY --from=lesson-videos /output/ ./dist/apps/web/client/media/lessons/im-kaufhaus/
EXPOSE 3000
CMD ["npm", "run", "start", "--prefix", "apps/web"]

FROM debian:bookworm-slim AS pocketbase
# PocketBase needs trusted root certificates for SMTP TLS and HTTPS requests.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY apps/pocketbase/pocketbase ./pocketbase
COPY apps/pocketbase/pb_migrations ./pb_migrations
COPY apps/pocketbase/pb_hooks ./pb_hooks
RUN chmod 0755 ./pocketbase && mkdir -p /data
ENV PB_ENCRYPTION_KEY=""
EXPOSE 8090
CMD ["/app/pocketbase", "serve", "--http=0.0.0.0:8090", "--encryptionEnv=PB_ENCRYPTION_KEY", "--dir=/data", "--migrationsDir=/app/pb_migrations", "--hooksDir=/app/pb_hooks", "--hooksWatch=false"]
