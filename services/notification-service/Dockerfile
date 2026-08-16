# ---------------------------------------------------------------- deps stage
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5

# --------------------------------------------------------------- build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# ------------------------------------------------------------- runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache curl

COPY package.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --omit=dev --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5

COPY --from=build /app/dist ./dist

USER node
EXPOSE 8089

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8089/health/live || exit 1

CMD ["node", "dist/server.js"]
