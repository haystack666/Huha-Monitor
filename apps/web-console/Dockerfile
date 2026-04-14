FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

ARG VITE_HUHA_API_BASE_URL=http://localhost:4000
ARG VITE_HUHA_DASHBOARD_WS_URL=ws://localhost:4000/ws/dashboard
ENV VITE_HUHA_API_BASE_URL=$VITE_HUHA_API_BASE_URL
ENV VITE_HUHA_DASHBOARD_WS_URL=$VITE_HUHA_DASHBOARD_WS_URL

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web-console apps/web-console
RUN pnpm install --filter @huha/web-console --frozen-lockfile=false

RUN pnpm --filter @huha/web-console build

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/web-console/dist /usr/share/nginx/html
COPY apps/web-console/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
