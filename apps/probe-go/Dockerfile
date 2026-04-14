FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY apps/probe-go/go.mod apps/probe-go/go.sum* ./
RUN go mod download

COPY apps/probe-go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /probe ./cmd/probe

FROM alpine:3.20

RUN adduser -D -u 10001 huha
USER huha
WORKDIR /home/huha

COPY --from=builder /probe /usr/local/bin/huha-probe
ENTRYPOINT ["huha-probe"]

