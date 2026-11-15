# LARAS docs site: build Docusaurus, serve statically with nginx.
# Build context is the repository root (docker-compose convention), so every
# COPY path is repo-relative.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY docs-site/package.json docs-site/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY docs-site/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY docs-site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
