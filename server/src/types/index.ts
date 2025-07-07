// 정류장 버튼 호출 데이터
export interface BusStopCall {
  id: string;
  stopId: string;
  routeId: string;
  routeName: string;
  buttonColor: string;
  timestamp: Date;
  isActive: boolean;
  passengerCount?: number;
}

// 버스 위치 데이터
export interface BusLocation {
  busId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number; // degrees
  timestamp: Date;
  accuracy?: number; // meters
}

// 정류장 정보
export interface BusStop {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  routes: string[]; // 이 정류장을 경유하는 노선들
}

// 노선 정보
export interface Route {
  routeId: string;
  routeName: string;
  color: string;
  stops: string[]; // 정류장 ID 순서
}

// ETA 계산 결과
export interface ETACalculation {
  busId: string;
  stopId: string;
  routeId: string;
  distanceMeters: number;
  estimatedArrivalTime: Date;
  confidence: number; // 0-1
}

// 알림 데이터
export interface BusNotification {
  busId: string;
  stopId: string;
  routeId: string;
  routeName: string;
  message: string;
  type: 'APPROACHING' | 'ARRIVED' | 'DEPARTED' | 'PASSED';
  timestamp: Date;
}

// MQTT 메시지 타입
export interface MQTTMessage {
  type: 'BUTTON_PRESS' | 'BUS_LOCATION' | 'NOTIFICATION';
  payload: BusStopCall | BusLocation | BusNotification;
  timestamp: Date;
}

// MQTT RPC 요청/응답 구조
export interface MQTTRPCRequest {
  id: string;
  method: string;
  params: any;
  timestamp: Date;
}

export interface MQTTRPCResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: Date;
}

// MQTT 토픽 이벤트 타입
export interface MQTTEventMessage {
  eventType: string;
  data: any;
  timestamp: Date;
  source: string;
}

// 시스템 헬스 체크 데이터
export interface SystemHealth {
  redis: boolean;
  mqtt: boolean;
  etaProcessor: boolean;
  timestamp: Date;
}

// 시스템 정보
export interface SystemInfo {
  name: string;
  version: string;
  uptime: number;
  environment: string;
  memory: NodeJS.MemoryUsage;
  timestamp: Date;
}

// 설정 타입
export interface AppConfig {
  port: number;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  mqtt: {
    brokerUrl: string;
    username?: string;
    password?: string;
    clientId?: string;
    qos?: 0 | 1 | 2;
  };
  kafka: {
    brokers: string[];
    clientId: string;
    groupId: string;
  };
  location: {
    distanceThresholdMeters: number;
    etaUpdateIntervalMs: number;
    kalmanFilterNoise: number;
  };
  server: {
    responseTimeout: number;
    keepAliveInterval: number;
    maxClients: number;
  };
}

// MQTT 클라이언트 타입 정의
export interface MQTTClientInfo {
  clientId: string;
  connected: boolean;
  lastSeen: Date;
  subscriptions: string[];
}

// API 응답 타입 (MQTT에서도 사용)
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
} 