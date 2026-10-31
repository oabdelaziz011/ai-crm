# syntax=docker/dockerfile:1

FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.13.1
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_APP_ORIGIN
ARG VITE_SITE_URL
ARG VITE_API_SERVER_URL
ARG VITE_WEBHOOK_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_APP_ORIGIN=$VITE_APP_ORIGIN \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_API_SERVER_URL=$VITE_API_SERVER_URL \
    VITE_WEBHOOK_BASE_URL=$VITE_WEBHOOK_BASE_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    NODE_ENV=production
RUN pnpm --dir artifacts/api-server build && pnpm --dir artifacts/login-app build

FROM node:22.23.4-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    VALUEOR_ENV=production \
    PORT=3000
COPY --from=build /app /app
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "deploy/vps/start-api.mjs"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS frontend
COPY deploy/vps/frontend.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/login-app/dist/public /usr/share/nginx/html
EXPOSE 8080
