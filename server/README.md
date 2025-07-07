# 🚌 Smart Bus Stop Bell System - MQTT Server

## 개요

스마트 버스정류장 벨 시스템의 **순수 MQTT 기반 서버**입니다. 기존의 REST API와 WebSocket을 제거하고 모든 통신을 MQTT 프로토콜로 처리합니다.

## 주요 특징

- **🔌 MQTT 전용 통신**: REST API 제거, 모든 통신을 MQTT로 처리
- **📡 RPC 패턴 지원**: 요청/응답 방식의 원격 프로시저 호출
- **🎯 이벤트 기반 아키텍처**: Pub/Sub 패턴을 통한 실시간 이벤트 처리
- **🔧 IoT 디바이스 친화적**: 정류장 버튼, LED, 버스 단말기와 직접 통신
- **📊 실시간 모니터링**: 시스템 상태 및 성능 지표 실시간 제공
- **🏥 헬스 체크**: 자동 헬스 모니터링 및 장애 감지

## 아키텍처

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   버스정류장     │    │   MQTT Broker   │    │   MQTT Server   │
│   버튼/LED      │◄──►│   (Mosquitto)   │◄──►│   (Node.js)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
┌─────────────────┐             │               ┌─────────────────┐
│   버스 단말기    │◄────────────┘               │   Redis Cache   │
│   GPS/알림      │                             │   ETA 처리기    │
└─────────────────┘                             └─────────────────┘
```

## 설치 및 실행

### 1. 의존성 설치

```bash
cd server
npm install
```

### 2. MQTT 브로커 실행 (Mosquitto)

```bash
# Docker로 Mosquitto 실행
docker run -it -p 1883:1883 -p 9001:9001 eclipse-mosquitto

# 또는 로컬 설치
brew install mosquitto  # macOS
mosquitto -c mosquitto.conf
```

### 3. Redis 실행

```bash
# Docker로 Redis 실행
docker run -d -p 6379:6379 redis:alpine

# 또는 로컬 설치
brew install redis  # macOS
redis-server
```

### 4. 환경 변수 설정

```bash
# .env 파일 생성
MQTT_BROKER_URL=mqtt://localhost:1883
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

### 5. 서버 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm run build
npm start
```

## MQTT 토픽 구조

### RPC (요청/응답) 패턴

| 목적 | 토픽 | 설명 |
|------|------|------|
| 요청 | `rpc/request/{method}` | RPC 메서드 호출 |
| 응답 | `rpc/response/{requestId}` | RPC 응답 수신 |

### 이벤트 (Pub/Sub) 패턴

| 이벤트 | 토픽 | 설명 |
|--------|------|------|
| 모든 이벤트 | `events/+` | 모든 시스템 이벤트 |
| 버튼 클릭 | `events/buttonPressed` | 정류장 버튼 클릭 |
| 호출 취소 | `events/callCancelled` | 호출 취소 |
| 버스 위치 | `events/busLocationUpdated` | 버스 위치 업데이트 |
| 버스 접근 | `events/busArriving` | 버스 정류장 접근 |

### IoT 디바이스 통신

| 디바이스 | 토픽 | 설명 |
|----------|------|------|
| 정류장 버튼 | `device/button/{stopId}/{routeId}` | 버튼 클릭 이벤트 |
| 버스 위치 | `device/bus/{busId}/location` | GPS 위치 데이터 |
| 버스 알림 | `device/bus/{busId}/notification` | 버스 알림 수신 |
| LED 제어 | `device/led/{stopId}/{routeId}` | LED 상태 제어 |

### 시스템 관리

| 기능 | 토픽 | 설명 |
|------|------|------|
| 서버 상태 | `system/server/status` | 서버 온라인/오프라인 |
| 헬스 체크 | `system/health` | 시스템 상태 확인 |

## 사용 가능한 RPC 메서드

### 시스템 관리

- `health`: 시스템 헬스 체크
- `info`: 시스템 정보 조회
- `stats`: 처리 통계 조회

### 버스정류장 기능

- `buttonPress`: 정류장 버튼 클릭 등록
- `cancelCall`: 호출 취소
- `getActiveCalls`: 활성 호출 조회
- `getETA`: 도착 예정 시간 조회
- `getNearbyBuses`: 근처 버스 조회

## 사용 예제

### 1. 헬스 체크

```javascript
// 요청
Topic: rpc/request/health
Payload: {
  "id": "req-123",
  "method": "health",
  "params": {},
  "timestamp": "2024-01-01T00:00:00.000Z"
}

// 응답 구독: rpc/response/req-123
{
  "id": "req-123",
  "success": true,
  "result": {
    "redis": true,
    "mqtt": true,
    "etaProcessor": true,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. 정류장 버튼 클릭

```javascript
// RPC 방식
Topic: rpc/request/buttonPress
Payload: {
  "id": "req-124",
  "method": "buttonPress",
  "params": {
    "stopId": "STOP_GANGNAM_001",
    "routeId": "ROUTE_A",
    "routeName": "A노선",
    "buttonColor": "#FF0000",
    "passengerCount": 1
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}

// 또는 IoT 디바이스 방식
Topic: device/button/STOP_GANGNAM_001/ROUTE_A
Payload: {
  "routeName": "A노선",
  "buttonColor": "#FF0000",
  "passengerCount": 1
}
```

### 3. 버스 위치 업데이트

```javascript
Topic: device/bus/BUS_001/location
Payload: {
  "routeId": "ROUTE_A",
  "latitude": 37.5665,
  "longitude": 126.9780,
  "speed": 40,
  "heading": 180,
  "accuracy": 5
}
```

### 4. 이벤트 구독

```javascript
// 모든 이벤트 구독
client.subscribe('events/+');

// 특정 이벤트 구독
client.subscribe('events/buttonPressed');
client.subscribe('events/busLocationUpdated');
```

## 테스트 클라이언트

서버와 통신을 테스트할 수 있는 예제 클라이언트가 제공됩니다:

```bash
# MQTT 클라이언트 예제 실행
node mqtt-client-example.js
```

이 예제는 다음 기능을 테스트합니다:
- 헬스 체크
- 시스템 정보 조회
- 버튼 클릭 시뮬레이션
- 버스 위치 업데이트
- 활성 호출 조회
- 호출 취소

## 개발 명령어

```bash
# 개발 서버 실행 (TypeScript 컴파일 + 실행)
npm run dev

# 타입 체크
npm run type-check

# 빌드
npm run build

# 프로덕션 실행
npm start

# 테스트
npm test

# 린팅
npm run lint
```

## 환경 변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | MQTT 브로커 URL |
| `MQTT_USERNAME` | - | MQTT 인증 사용자명 |
| `MQTT_PASSWORD` | - | MQTT 인증 비밀번호 |
| `MQTT_QOS` | `1` | MQTT QoS 레벨 (0, 1, 2) |
| `REDIS_HOST` | `localhost` | Redis 호스트 |
| `REDIS_PORT` | `6379` | Redis 포트 |
| `REDIS_PASSWORD` | - | Redis 비밀번호 |
| `RESPONSE_TIMEOUT_MS` | `5000` | RPC 응답 타임아웃 |
| `KEEP_ALIVE_INTERVAL_MS` | `30000` | 헬스 체크 간격 |
| `ETA_UPDATE_INTERVAL_MS` | `2000` | ETA 계산 간격 |

## 로그 레벨

환경 변수 `LOG_LEVEL`로 로그 레벨을 설정할 수 있습니다:
- `error`: 오류만 출력
- `warn`: 경고 이상 출력
- `info`: 정보 이상 출력 (기본값)
- `debug`: 모든 로그 출력

## 문제 해결

### MQTT 브로커 연결 실패
```bash
# Mosquitto가 실행 중인지 확인
ps aux | grep mosquitto

# 포트가 사용 중인지 확인
lsof -i :1883
```

### Redis 연결 실패
```bash
# Redis가 실행 중인지 확인
redis-cli ping

# Redis 로그 확인
redis-server --loglevel verbose
```

### 메모리 사용량 모니터링
```bash
# Node.js 메모리 사용량 확인
node --max-old-space-size=4096 dist/index.js
```

## 성능 튜닝

- **MQTT QoS 설정**: 신뢰성 vs 성능을 고려하여 적절한 QoS 레벨 선택
- **Redis 연결 풀**: 높은 처리량을 위한 연결 풀 크기 조정
- **ETA 업데이트 간격**: 시스템 부하와 실시간성 요구사항 균형
- **이벤트 구독 최적화**: 필요한 이벤트만 구독하여 네트워크 트래픽 감소

## 라이선스

MIT License 