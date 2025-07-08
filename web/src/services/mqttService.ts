import mqtt, { MqttClient } from 'mqtt';
import { 
  BusNotification, 
  MQTTRPCRequest, 
  MQTTRPCResponse, 
  MQTTEventMessage,
  SystemHealth,
  SystemInfo,
  ConnectionStatus
} from '../types';

type EventCallback = (data: any) => void;

class BusMQTTService {
  private client: MqttClient | null = null;
  private busId: string = '';
  private routeId: string = '';
  private _isConnected: boolean = false;
  
  // 이벤트 콜백들
  private eventCallbacks = new Map<string, EventCallback[]>();
  
  // RPC 요청 관리
  private pendingRPCRequests = new Map<string, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  private connectionStatus: ConnectionStatus = {
    mqtt: false,
    rpcReady: false,
    lastHeartbeat: null
  };

  // WebSocket over MQTT 연결
  private get brokerUrl(): string {
    return process.env.NODE_ENV === 'production' 
      ? 'wss://your-mqtt-broker.com:9001/mqtt'
      : 'ws://localhost:7003'; // Docker Mosquitto WebSocket 포트
  }

  async connect(busId: string, routeId: string): Promise<void> {
    this.busId = busId;
    this.routeId = routeId;
    
    return new Promise((resolve, reject) => {
      try {
        console.log(`🚌 버스 ${busId} MQTT 연결 시작...`);
        
        this.client = mqtt.connect(this.brokerUrl, {
          clientId: `bus-${busId}-${Date.now()}`,
          clean: true,
          reconnectPeriod: 5000,
          connectTimeout: 15000,
          keepalive: 60,
          will: {
            topic: `system/bus/${busId}/status`,
            payload: JSON.stringify({ 
              status: 'offline', 
              busId,
              timestamp: new Date() 
            }),
            qos: 1,
            retain: true
          }
        });

        const timeout = setTimeout(() => {
          console.error('❌ MQTT 연결 타임아웃');
          this.disconnect();
          reject(new Error('MQTT 연결 타임아웃'));
        }, 15000);

        this.client.on('connect', () => {
          clearTimeout(timeout);
          console.log('✅ MQTT 브로커 연결 성공');
          this._isConnected = true;
          this.connectionStatus.mqtt = true;
          
          this.subscribeToTopics();
          this.publishBusStatus('online');
          this.startHeartbeat();
          
          resolve();
        });

        this.client.on('error', (error) => {
          clearTimeout(timeout);
          console.error('❌ MQTT 연결 오류:', error);
          this._isConnected = false;
          this.connectionStatus.mqtt = false;
          reject(error);
        });

        this.client.on('disconnect', () => {
          console.log('🔌 MQTT 연결 끊어짐');
          this._isConnected = false;
          this.connectionStatus.mqtt = false;
          this.connectionStatus.rpcReady = false;
          this.emit('connection-status', this.connectionStatus);
        });

        this.client.on('reconnect', () => {
          console.log('🔄 MQTT 재연결 시도 중...');
        });

        this.client.on('message', this.handleMessage.bind(this));

      } catch (error) {
        console.error('❌ MQTT 클라이언트 생성 실패:', error);
        reject(error);
      }
    });
  }

  private async subscribeToTopics(): Promise<void> {
    if (!this.client) return;

    const topics = [
      // 버스 알림 수신
      `device/bus/${this.busId}/notification`,
      
      // 시스템 이벤트
      'events/+',
      
      // RPC 응답 (동적으로 구독)
      // 'rpc/response/+' - 필요시 동적 구독
      
      // 시스템 상태
      'system/server/status',
      'system/health'
    ];

    for (const topic of topics) {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ 토픽 구독 실패: ${topic}`, err);
        } else {
          console.log(`✅ 토픽 구독 성공: ${topic}`);
        }
      });
    }

    // RPC 준비 상태로 설정
    this.connectionStatus.rpcReady = true;
    this.emit('connection-status', this.connectionStatus);
  }

  private handleMessage(topic: string, message: Buffer): void {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`📥 MQTT 메시지 수신: ${topic}`, payload);

      // RPC 응답 처리
      if (topic.startsWith('rpc/response/')) {
        this.handleRPCResponse(topic, payload);
      }
      // 이벤트 처리
      else if (topic.startsWith('events/')) {
        this.handleEvent(topic, payload);
      }
      // 버스 알림 처리
      else if (topic === `device/bus/${this.busId}/notification`) {
        this.handleBusNotification(payload);
      }
      // 시스템 상태 처리
      else if (topic === 'system/server/status') {
        this.handleServerStatus(payload);
      }
      else if (topic === 'system/health') {
        this.handleHealthCheck(payload);
      }

    } catch (error) {
      console.error('❌ 메시지 파싱 오류:', error);
    }
  }

  private handleRPCResponse(topic: string, response: MQTTRPCResponse): void {
    const requestId = topic.split('/').pop();
    const pendingRequest = this.pendingRPCRequests.get(requestId!);
    
    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout);
      this.pendingRPCRequests.delete(requestId!);
      
      if (response.success) {
        pendingRequest.resolve(response.result);
      } else {
        pendingRequest.reject(new Error(response.error || 'RPC 요청 실패'));
      }
    }
  }

  private handleEvent(topic: string, event: MQTTEventMessage): void {
    const eventType = topic.split('/').pop();
    console.log(`🎯 이벤트 수신: ${eventType}`, event);
    
    this.emit(`event-${eventType}`, event.data);
    this.emit('mqtt-event', { eventType, data: event.data });
  }

  private handleBusNotification(notification: BusNotification): void {
    console.log(`🔔 버스 알림 수신:`, notification);
    
    // 타임스탬프를 Date 객체로 변환
    notification.timestamp = new Date(notification.timestamp);
    
    this.emit('bus-notification', notification);
  }

  private handleServerStatus(status: any): void {
    console.log('🖥️ 서버 상태:', status);
    this.emit('server-status', status);
  }

  private handleHealthCheck(health: SystemHealth): void {
    console.log('🏥 시스템 헬스:', health);
    this.connectionStatus.lastHeartbeat = new Date();
    this.emit('system-health', health);
    this.emit('connection-status', this.connectionStatus);
  }

  // RPC 요청 메서드
  async callRPC(method: string, params: any = {}, timeout: number = 5000): Promise<any> {
    if (!this.client || !this._isConnected || !this.connectionStatus.rpcReady) {
      throw new Error('MQTT RPC가 준비되지 않았습니다');
    }

    const requestId = `${method}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const request: MQTTRPCRequest = {
      id: requestId,
      method,
      params,
      timestamp: new Date()
    };

    return new Promise((resolve, reject) => {
      // 응답 토픽 구독
      this.client!.subscribe(`rpc/response/${requestId}`, { qos: 1 });

      // 타임아웃 설정
      const timeoutHandle = setTimeout(() => {
        this.pendingRPCRequests.delete(requestId);
        this.client!.unsubscribe(`rpc/response/${requestId}`);
        reject(new Error(`RPC 타임아웃: ${method}`));
      }, timeout);

      // 요청 저장
      this.pendingRPCRequests.set(requestId, {
        resolve: (result) => {
          this.client!.unsubscribe(`rpc/response/${requestId}`);
          resolve(result);
        },
        reject: (error) => {
          this.client!.unsubscribe(`rpc/response/${requestId}`);
          reject(error);
        },
        timeout: timeoutHandle
      });

      // 요청 발행
      this.client!.publish(`rpc/request/${method}`, JSON.stringify(request), { qos: 1 });
      console.log(`📡 RPC 요청: ${method}`, params);
    });
  }

  // 시스템 헬스 체크
  async getSystemHealth(): Promise<SystemHealth> {
    return await this.callRPC('health');
  }

  // 시스템 정보 조회
  async getSystemInfo(): Promise<SystemInfo> {
    return await this.callRPC('info');
  }



  // 버스 상태 발행
  private publishBusStatus(status: 'online' | 'offline'): void {
    if (!this.client) return;
    
    const topic = `system/bus/${this.busId}/status`;
    const message = {
      status,
      busId: this.busId,
      routeId: this.routeId,
      timestamp: new Date()
    };
    
    this.client.publish(topic, JSON.stringify(message), { qos: 1, retain: true });
  }

  // 클래스 멤버로 타이머 ID 저장
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // 하트비트 시작
  private startHeartbeat(): void {
    // 기존 타이머가 있으면 제거
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.getSystemHealth();
      } catch (error) {
        console.warn('⚠️ 하트비트 실패:', error);
      }
    }, 30000); // 30초마다
  }

  // 이벤트 리스너 등록
  on(event: string, callback: EventCallback): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event)!.push(callback);
  }

  // 이벤트 리스너 제거
  off(event: string, callback?: EventCallback): void {
    if (!this.eventCallbacks.has(event)) return;
    
    if (callback) {
      const callbacks = this.eventCallbacks.get(event)!;
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    } else {
      this.eventCallbacks.delete(event);
    }
  }

  // 이벤트 발행
  private emit(event: string, data: any): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ 이벤트 콜백 오류 (${event}):`, error);
        }
      });
    }
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this._isConnected && this.client?.connected === true;
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  // 연결 해제
  disconnect(): void {
    // 버스 오프라인 상태 발행
    this.publishBusStatus('offline');
    
    // 대기 중인 RPC 요청들 정리
    this.pendingRPCRequests.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error('MQTT 연결 해제됨'));
    });
    this.pendingRPCRequests.clear();
    
    // MQTT 클라이언트 종료
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    
    this._isConnected = false;
    this.connectionStatus = {
      mqtt: false,
      rpcReady: false,
      lastHeartbeat: null
    };
    
    console.log('🚌 MQTT 서비스 연결 해제 완료');
  }
}

const busMQTTService = new BusMQTTService();
export default busMQTTService; 