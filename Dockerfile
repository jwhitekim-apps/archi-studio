# 빌드 단계: 의존성 설치 후 SvelteKit(adapter-node) 빌드
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# 실행 단계: 빌드 결과와 운영 의존성만 담는다
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/data/analysis ./data/analysis
USER node
EXPOSE 8000
CMD ["node", "build"]
