# ---------------------------------------------------------------- deps stage
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm install --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5

# --------------------------------------------------------------- build stage
FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_DEFAULT_LOCALE=ar
ARG NEXT_PUBLIC_DEFAULT_CURRENCY=AED
# متغيرات NEXT_PUBLIC_* تُدمج في الحزمة وقت البناء، لا وقت التشغيل
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE \
    NEXT_PUBLIC_DEFAULT_CURRENCY=$NEXT_PUBLIC_DEFAULT_CURRENCY \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ------------------------------------------------------------- runtime stage
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache curl

# output:'standalone' يحزم فقط ما يحتاجه التشغيل — صورة أصغر بكثير
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
