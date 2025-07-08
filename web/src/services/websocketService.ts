import { io, Socket } from 'socket.io-client';

interface WebSocketEvents {
  'button-pressed': (data: any) => void;
  'eta-update': (data: any) => void;
  'system-status': (data: any) => void;
}

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private eventCallbacks: Map<string, Array<(data: any) => void>> = new Map();

  constructor() {
    this.connect();
  }

  private connect(): void {
    const serverUrl = process.env.NODE_ENV === 'production' 
      ? 'https://your-api-domain.com'
      : 'http://localhost:7000';

    console.log(`🔌 WebSocket 연결 시도: ${serverUrl}`);

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      retries: 3,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // 연결 성공
    this.socket.on('connect', () => {
      console.log('✅ WebSocket 연결됨:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.emit('connection-status', { connected: true, socketId: this.socket?.id });
    });

    // 연결 해제
    this.socket.on('disconnect', (reason: string) => {
      console.log('❌ WebSocket 연결 해제:', reason);
      this.emit('connection-status', { connected: false, reason });
      
      if (reason === 'io server disconnect') {
        // 서버에서 연결을 끊은 경우 수동으로 재연결
        this.handleReconnect();
      }
    });

    // 연결 오류
    this.socket.on('connect_error', (error: Error) => {
      console.error('❌ WebSocket 연결 오류:', error.message);
      this.emit('connection-error', error);
      this.handleReconnect();
    });

    // 재연결 시도
    this.socket.on('reconnect', (attemptNumber: number) => {
      console.log(`🔄 WebSocket 재연결 성공 (시도 ${attemptNumber}회)`);
      this.reconnectAttempts = 0;
    });

    // 재연결 실패
    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket 재연결 최대 시도 횟수 초과');
      this.emit('reconnect-failed', { maxAttempts: this.maxReconnectAttempts });
    });

    // 버스 호출 알림
    this.socket.on('button-pressed', (data: any) => {
      console.log('🚌 버스 호출 알림:', data);
      this.emit('button-pressed', data);
    });



    // ETA 업데이트
    this.socket.on('eta-update', (data: any) => {
      console.log('⏰ ETA 업데이트:', data);
      this.emit('eta-update', data);
    });

    // 시스템 상태
    this.socket.on('system-status', (data: any) => {
      console.log('🔧 시스템 상태:', data);
      this.emit('system-status', data);
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ WebSocket 재연결 포기');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 WebSocket 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    setTimeout(() => {
      if (!this.isConnected()) {
        this.connect();
      }
    }, this.reconnectInterval);
  }

  // 이벤트 구독
  on<K extends keyof WebSocketEvents>(event: K, callback: WebSocketEvents[K]): void;
  on(event: string, callback: (data: any) => void): void;
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event)?.push(callback);
  }

  // 이벤트 구독 해제
  off(event: string, callback?: (data: any) => void): void {
    if (!callback) {
      this.eventCallbacks.delete(event);
      return;
    }

    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // 이벤트 발생
  private emit(event: string, data: any): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // 정류장 구독
  subscribeToStop(stopId: string): void {
    if (this.socket) {
      this.socket.emit('subscribe-stop', stopId);
      console.log(`📍 정류장 구독: ${stopId}`);
    }
  }

  // 노선 구독
  subscribeToRoute(routeId: string): void {
    if (this.socket) {
      this.socket.emit('subscribe-route', routeId);
      console.log(`🚍 노선 구독: ${routeId}`);
    }
  }

  // 모든 업데이트 구독
  subscribeToAll(): void {
    if (this.socket) {
      this.socket.emit('subscribe-all');
      console.log('🌐 모든 업데이트 구독');
    }
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // 소켓 ID 가져오기
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // 연결 해제
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('🔌 WebSocket 연결 해제');
    }
  }

  // 재연결 강제 시도
  forceReconnect(): void {
    this.disconnect();
    this.reconnectAttempts = 0;
    setTimeout(() => this.connect(), 1000);
  }
}

export default new WebSocketService(); 