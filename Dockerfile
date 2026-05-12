# ─── Build Stage ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Production Stage ─────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm install && npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN addgroup -S motovoice && adduser -S motovoice -G motovoice
USER motovoice

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
