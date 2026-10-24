# ──────────────────────────────────────────────────────────────
# evening-motion-cs-notice — Coolify 배포용 Dockerfile (Next.js standalone)
# ──────────────────────────────────────────────────────────────
# 빌드: docker build -t evening-motion-cs-notice .
# 실행: docker run -p 3000:3000 evening-motion-cs-notice
# ──────────────────────────────────────────────────────────────

# Stage 1: deps
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Coolify 는 빌드에 NODE_ENV=production 을 주입한다 → 그대로면 설치가
# devDependencies(tailwindcss·@tailwindcss/postcss·typescript 등)를 스킵해 빌드가 깨진다.
# 설치 단계에서만 development 로 덮어써 devDependencies 까지 설치되게 한다.
# (standalone 출력이라 devDependencies 는 최종 runner 이미지에 포함되지 않음)
ENV NODE_ENV=development
# npm ci 가 아니라 npm install 을 쓴다: Windows 개발 PC 에서 만든 package-lock.json 은
# linux-musl 전용 선택적 네이티브 의존성(@emnapi 등)을 누락해, lock 완전일치를 요구하는
# npm ci 가 컨테이너(node:20-alpine)에서 깨진다. npm install 은 플랫폼에 맞게 보충한다.
RUN npm install --no-audit --no-fund

# Stage 2: builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* 를 쓰면, 사용하는 변수마다 아래 2줄(ARG + ENV)을 npm run build 전에 추가하세요.
# 선언하지 않으면 Coolify 가 Build Variable 로 넘긴 값이 무시되어 undefined 로 번들에 박혀,
# 빌드는 통과하지만 브라우저에서 깨집니다. (예시 — 실제 쓰는 변수명으로 바꿔서 사용)
#   ARG NEXT_PUBLIC_API_BASE_URL
#   ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
# (devDependencies 설치는 deps 스테이지의 ENV NODE_ENV=development 가 보장 — 그 줄을 지우지 마세요.)
RUN npm run build

# Stage 3: runner (production, slim)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# /app/data 는 화면에서 추가한 회신 저장 경로(APP_DATA_DIR) — Coolify 영구볼륨이 마운트되므로
# 비루트 전환 전에 미리 만들고 소유권을 넘긴다.
ENV APP_DATA_DIR=/app/data
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir -p /app/data \
 && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Coolify Health Check Path: /api/healthz
CMD ["node", "server.js"]
