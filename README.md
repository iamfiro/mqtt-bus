# 🚌 스마트 버스 정류장 벨 시스템

노선 구분형 스마트 버스 정류장 벨 시스템의 TypeScript Node.js 서버입니다.

## 📋 시스템 개요

이 시스템은 다음과 같은 문제를 해결합니다:
- 버스가 정류장을 그냥 지나가는 문제
- 스마트폰 의존성으로 인한 디지털 소외 문제  
- GPS 알림 지연 문제

### 🎯 핵심 기능

- **정류장 버튼**: 노선별 색상 구분 물리 버튼
- **실시간 위치 추적**: GPS 기반 버스 위치 모니터링
- **1초 이내 알림**: 평균 1초 이내 버스 도착 알림
- **자동 해제**: 버스 통과 시 자동 버튼 해제

## 🛠 기술 스택

### 서버
- **Node.js + TypeScript**: 메인 서버
- **Express.js**: REST API
- **Socket.io**: 실시간 WebSocket 통신
- **Redis**: 실시간 데이터 저장 및 캐싱
- **MQTT**: IoT 기기 통신
- **Kafka**: 메시지 큐잉 (향후 확장)

### 위치 계산
- **haversine-distance**: 거리 계산
- **kalman-filter**: GPS 노이즈 필터링

### 모니터링
- **Winston**: 로깅
- **Prometheus**: 메트릭 (향후 추가)

## 🚀 빠른 시작

### 1. 환경 설정

```bash
# 저장소 클론
git clone <repository-url>
cd smart-bus-stop-bell-system

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

### 2. 환경 변수 구성

`.env` 파일을 편집하여 다음 값들을 설정하세요:

```env
# 서버 설정
PORT=3000
NODE_ENV=development

# Redis 설정
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MQTT 설정
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=

# 위치 설정
DISTANCE_THRESHOLD_METERS=500
ETA_UPDATE_INTERVAL_MS=2000
```

### 3. 인프라 구성

#### Redis 설치 및 실행
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis-server

# Docker
docker run -d -p 6379:6379 redis:alpine
```

#### MQTT 브로커 설치 및 실행
```bash
# Mosquitto 설치 (macOS)
brew install mosquitto
brew services start mosquitto

# Ubuntu
sudo apt install mosquitto mosquitto-clients
sudo systemctl start mosquitto

# Docker
docker run -d -p 1883:1883 eclipse-mosquitto
```

### 4. 개발 서버 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 빌드 및 실행
npm run build
npm start
```

## 📡 API 엔드포인트

### 정류장 관련

```http
GET /api/v1/stops/:stopId/calls
GET /api/v1/stops/:stopId/calls/:routeId
GET /api/v1/stops/:stopId/eta
POST /api/v1/stops/:stopId/calls
DELETE /api/v1/stops/:stopId/calls/:routeId
```

### 버스 관련

```http
GET /api/v1/buses/:busId/location
GET /api/v1/routes/:routeId/buses
GET /api/v1/buses/:busId/eta/:stopId
```

### 시스템 상태

```http
GET /api/v1/health
GET /api/v1/stats
GET /api/v1/info
```

### 예시 요청

```bash
# 정류장의 활성 호출 조회
curl http://localhost:3000/api/v1/stops/STOP001/calls

# 수동 버튼 호출 생성 (테스트용)
curl -X POST http://localhost:3000/api/v1/stops/STOP001/calls \
  -H "Content-Type: application/json" \
  -d '{"routeId": "BUS001", "routeName": "1번 버스"}'

# 시스템 상태 확인
curl http://localhost:3000/api/v1/health
```

## 🔗 MQTT 토픽 구조

### 정류장 → 서버

```
bus-stop/{stopId}/button/{routeId}
```

메시지 형식:
```json
{
  "routeName": "1번 버스",
  "buttonColor": "#FF0000",
  "passengerCount": 1,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 버스 → 서버

```
bus/{busId}/location
```

메시지 형식:
```json
{
  "routeId": "BUS001",
  "latitude": 37.5665,
  "longitude": 126.9780,
  "speed": 45,
  "heading": 90,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 서버 → 버스

```
bus/{busId}/notification
```

메시지 형식:
```json
{
  "type": "APPROACHING",
  "stopId": "STOP001",
  "routeName": "1번 버스",
  "message": "정류장 시청앞에서 1번 버스 승차 요청이 있습니다.",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 서버 → 정류장

```
bus-stop/{stopId}/led/{routeId}
```

메시지 형식:
```json
{
  "status": "ON",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## 🌐 WebSocket 이벤트

클라이언트는 WebSocket을 통해 실시간 업데이트를 받을 수 있습니다:

```javascript
const socket = io('http://localhost:3000');

// 특정 정류장 구독
socket.emit('subscribe-stop', 'STOP001');

// 이벤트 수신
socket.on('button-pressed', (data) => {
  console.log('버튼 눌림:', data);
});

socket.on('eta-update', (data) => {
  console.log('ETA 업데이트:', data);
});
```

## 🧪 테스트

### MQTT 메시지 테스트

```bash
# 버튼 눌림 시뮬레이션
mosquitto_pub -h localhost -t "bus-stop/STOP001/button/BUS001" \
  -m '{"routeName":"1번 버스","buttonColor":"#FF0000","passengerCount":1}'

# 버스 위치 업데이트 시뮬레이션
mosquitto_pub -h localhost -t "bus/BUS001-1/location" \
  -m '{"routeId":"BUS001","latitude":37.5665,"longitude":126.9780,"speed":30,"heading":90}'
```

### API 테스트

```bash
# 시스템 상태 확인
curl http://localhost:3000/api/v1/health

# ETA 조회
curl http://localhost:3000/api/v1/stops/STOP001/eta
```

## 📊 시스템 아키텍처

```
[정류장 버튼] → [MQTT] → [Node.js 서버] → [Redis]
                            ↓
[버스 GPS] → [MQTT] → [ETA 계산 엔진] → [위치 필터링]
                            ↓
[WebSocket] ← [실시간 알림] ← [버스 알림]
```

### 데이터 플로우

1. **버튼 호출**: 승객이 정류장에서 버튼 누름
2. **위치 추적**: 버스 GPS 데이터 실시간 수집
3. **ETA 계산**: Haversine 거리 + Kalman 필터 속도로 도착 시간 예측
4. **접근 감지**: 버스가 500m 이내 접근 시 알림 전송
5. **자동 해제**: 버스 통과 후 버튼 자동 해제

## 🔧 운영 환경 설정

### Docker Compose

```yaml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
  
  mosquitto:
    image: eclipse-mosquitto
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
  
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - redis
      - mosquitto
    environment:
      - REDIS_HOST=redis
      - MQTT_BROKER_URL=mqtt://mosquitto:1883
```

### 환경별 설정

- **개발**: 로컬 Redis/MQTT
- **스테이징**: Docker Compose
- **프로덕션**: AWS ElastiCache (Redis) + AWS IoT Core (MQTT)

## 📈 모니터링

### 로그 확인

```bash
# 실시간 로그
tail -f logs/app.log

# 에러 로그만
tail -f logs/app.log | grep ERROR
```

### 주요 메트릭

- 활성 버튼 호출 수
- 평균 ETA 계산 시간
- MQTT 메시지 처리량
- Redis 연결 상태

## 🚧 향후 개발 계획

- [ ] Kafka 메시지 큐 통합
- [ ] GTFS-Realtime API 완성
- [ ] Prometheus/Grafana 모니터링
- [ ] 버스 경로 예측 알고리즘 개선
- [ ] 다중 정류장 동시 처리 최적화
- [ ] 실시간 대시보드 웹 인터페이스

## 🤝 기여 방법

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 Push (`git push origin feature/AmazingFeature`)
5. Pull Request 생성

## 📄 라이선스

MIT License - 자세한 내용은 `LICENSE` 파일 참조

## 📞 지원

- 이슈: [GitHub Issues](https://github.com/your-repo/issues)
- 문서: [Wiki](https://github.com/your-repo/wiki)

---

**노선 구분형 스마트 버스 정류장 벨 시스템** - 더 나은 대중교통 경험을 위해 🚌 