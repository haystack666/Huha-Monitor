FROM golang:1.22-alpine AS probe-builder

WORKDIR /src
COPY apps/probe-go/go.mod apps/probe-go/go.sum ./apps/probe-go/
WORKDIR /src/apps/probe-go
RUN go mod download

WORKDIR /src
COPY apps/probe-go ./apps/probe-go
COPY scripts/build-probes.sh ./scripts/build-probes.sh
RUN mkdir -p /out && sh ./scripts/build-probes.sh /out /src/apps/probe-go

FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/protocol packages/protocol
COPY apps/control-server apps/control-server
RUN pnpm install --filter @huha/control-server... --frozen-lockfile=false

RUN pnpm --filter @huha/protocol build
RUN pnpm --filter @huha/control-server build

FROM node:20-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/protocol ./packages/protocol
COPY --from=builder /app/apps/control-server ./apps/control-server
COPY --from=probe-builder /out ./apps/control-server/assets/probes

WORKDIR /app/apps/control-server
EXPOSE 4000
CMD ["node", "dist/app.js"]
