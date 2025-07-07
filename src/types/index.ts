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
  type: 'APPROACHING' | 'ARRIVED' | 'DEPARTED';
  timestamp: Date;
}

// MQTT 메시지 타입
export interface MQTTMessage {
  type: 'BUTTON_PRESS' | 'BUS_LOCATION' | 'NOTIFICATION';
  payload: BusStopCall | BusLocation | BusNotification;
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
}

// API 응답 타입
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
} 