import busMQTTService from './mqttService';
import { 
  BusNotification, 
  SystemHealth, 
  SystemInfo,
  ConnectionStatus,
  BusStatus
} from '../types';

interface CommunicationOptions {
  busId: string;
  routeId: string;
  routeName?: string;
}

type EventCallback = (data: any) => void;

class BusCommunicationService {
  private busStatus: BusStatus = {
    busId: '',
    routeId: '',
    routeName: '',
    notifications: [],
    connectionStatus: {
      mqtt: false,
      rpcReady: false,
      lastHeartbeat: null
    }
  };

  private eventCallbacks = new Map<string, EventCallback[]>();

  constructor() {
    this.setupMQTTEventHandlers();
  }

  private setupMQTTEventHandlers(): void {
    // 연결 상태 변경
    busMQTTService.on('connection-status', (status: ConnectionStatus) => {
      console.log('📶 MQTT 연결 상태 변경:', status);
      this.busStatus.connectionStatus = status;
      this.emit('connection-status', status);
      this.emit('bus-status', this.busStatus);
    });

    // 버스 알림 수신
    busMQTTService.on('bus-notification', (notification: BusNotification) => {
      console.log('🔔 버스 알림:', notification);
      
      // 알림 목록에 추가 (최근 10개만 유지)
      this.busStatus.notifications.unshift(notification);
      if (this.busStatus.notifications.length > 10) {
        this.busStatus.notifications = this.busStatus.notifications.slice(0, 10);
      }
      
      this.emit('bus-notification', notification);
      this.emit('bus-status', this.busStatus);
    });

    // 시스템 헬스 체크
    busMQTTService.on('system-health', (health: SystemHealth) => {
      console.log('🏥 시스템 헬스:', health);
      this.emit('system-health', health);
    });

    // 서버 상태
    busMQTTService.on('server-status', (status: any) => {
      console.log('🖥️ 서버 상태:', status);
      this.emit('server-status', status);
    });

    // MQTT 이벤트
    busMQTTService.on('mqtt-event', (event: any) => {
      console.log('🎯 MQTT 이벤트:', event);
      this.emit('mqtt-event', event);
      
      // 특정 이벤트 처리
      if (event.eventType === 'buttonPressed') {
        this.emit('button-pressed', event.data);
      }
    });
  }

  // 버스 초기화 및 MQTT 연결
  async initialize(options: CommunicationOptions): Promise<void> {
    console.log('🚌 버스 통신 서비스 초기화:', options);
    
    // 버스 상태 설정
    this.busStatus.busId = options.busId;
    this.busStatus.routeId = options.routeId;
    this.busStatus.routeName = options.routeName || `노선 ${options.routeId}`;
    
    try {
      // MQTT 연결
      await busMQTTService.connect(options.busId, options.routeId);
      console.log('✅ MQTT 연결 성공');
      
      // 초기 시스템 정보 조회
      try {
        const systemInfo = await busMQTTService.getSystemInfo();
        console.log('🖥️ 시스템 정보:', systemInfo);
        this.emit('system-info', systemInfo);
      } catch (error) {
        console.warn('⚠️ 시스템 정보 조회 실패:', error);
      }
      
    } catch (error) {
      console.error('❌ 버스 통신 서비스 초기화 실패:', error);
      throw error;
    }
  }



  // 시스템 헬스 체크
  async getSystemHealth(): Promise<SystemHealth> {
    return await busMQTTService.getSystemHealth();
  }

  // 시스템 정보 조회
  async getSystemInfo(): Promise<SystemInfo> {
    return await busMQTTService.getSystemInfo();
  }

  // 버스 상태 조회
  getBusStatus(): BusStatus {
    return { ...this.busStatus };
  }

  // 연결 상태 조회
  getConnectionStatus(): ConnectionStatus {
    return busMQTTService.getConnectionStatus();
  }

  // MQTT 연결 상태 확인
  isConnected(): boolean {
    return busMQTTService.isConnected();
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

  // 서비스 연결 해제
  disconnect(): void {
    console.log('🚌 버스 통신 서비스 연결 해제');
    
    // MQTT 연결 해제
    busMQTTService.disconnect();
    
    // 상태 초기화
    this.busStatus.connectionStatus = {
      mqtt: false,
      rpcReady: false,
      lastHeartbeat: null
    };
    
    // 이벤트 발행
    this.emit('bus-status', this.busStatus);
  }

  // 알림 클리어
  clearNotifications(): void {
    this.busStatus.notifications = [];
    this.emit('bus-status', this.busStatus);
  }
}

const busCommunicationService = new BusCommunicationService();
export default busCommunicationService; 