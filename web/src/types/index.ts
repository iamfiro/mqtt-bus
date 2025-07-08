// 서버와 동일한 타입 정의들

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

// 정류장 정보
export interface BusStop {
  stopId: string;
  name: string;
  routes: string[]; // 이 정류장을 경유하는 노선들
}

// 노선 정보
export interface Route {
  routeId: string;
  routeName: string;
  color: string;
  stops: string[]; // 정류장 ID 순서
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

// MQTT RPC 요청/응답
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

// MQTT 이벤트 메시지
export interface MQTTEventMessage {
  eventType: string;
  data: any;
  timestamp: Date;
  source: string;
}

// 시스템 헬스
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
  connectedClients: number;
  timestamp: Date;
}

// 연결 상태
export interface ConnectionStatus {
  mqtt: boolean;
  rpcReady: boolean;
  lastHeartbeat: Date | null;
}

// 버스 상태
export interface BusStatus {
  busId: string;
  routeId: string;
  routeName?: string;
  notifications: BusNotification[];
  connectionStatus: ConnectionStatus;
} 