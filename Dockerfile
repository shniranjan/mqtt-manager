# ─── Rust Build Stage ──────────────────────────────────────────────────────────
FROM rust:1.85-alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app
COPY core/ .

RUN cargo build --release

# ─── Frontend Build Stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS frontend

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ─── Runtime Stage ─────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache \
    mosquitto \
    mosquitto-openrc \
    supervisor \
    libgcc

# Copy binary
COPY --from=builder /app/target/release/mqtt-manager-core /usr/local/bin/mqtt-manager-core

# Copy frontend dist
COPY --from=frontend /app/dist /app/frontend/dist

# Copy supervision config
COPY supervisord.conf /etc/supervisord.conf

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create required directories
RUN mkdir -p /var/lib/mosquitto /var/log/supervisor /config

EXPOSE 1883 8883 8000

ENTRYPOINT ["/entrypoint.sh"]
