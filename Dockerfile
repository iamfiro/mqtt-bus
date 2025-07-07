# 빌드 스테이지
FROM node:18-alpine AS builder

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci --only=production && npm cache clean --force

# 소스 코드 복사
COPY . .

# TypeScript 빌드
RUN npm run build

# 프로덕션 스테이지
FROM node:18-alpine AS production

# 시스템 패키지 업데이트 및 필수 도구 설치
RUN apk update && apk add --no-cache \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# 타임존 설정
ENV TZ=Asia/Seoul

# 앱 사용자 생성
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

WORKDIR /app

# 필요한 파일들 복사
COPY --from=builder --chown=nodeuser:nodejs /app/dist ./dist
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/package*.json ./

# 로그 디렉토리 생성
RUN mkdir -p logs && chown -R nodeuser:nodejs logs

# 사용자 전환
USER nodeuser

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# 앱 실행
CMD ["node", "dist/index.js"] 