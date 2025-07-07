import mqtt, { MqttClient } from 'mqtt';
import config from '../config';
import logger from '../utils/logger';
import { 
  MQTTRPCRequest, 
  MQTTRPCResponse, 
  MQTTEventMessage, 
  BusStopCall, 
  BusLocation, 
  BusNotification,
  SystemHealth,
  SystemInfo,
  MQTTClientInfo
} from '../types';
import redisService from './redis';
import etaProcessorService from './etaProcessor';

type RPCHandler = (params: any) => Promise<any>;
type EventHandler = (eventType: string, data: any, source: string) => Promise<void>;

class MQTTServerService {
  private client: MqttClient | null = null;
  private isConnected = false;
  private rpcHandlers = new Map<string, RPCHandler>();
  private eventHandlers = new Map<string, EventHandler[]>();
  private pendingRequests = new Map<string, NodeJS.Timeout>();
  private connectedClients = new Map<string, MQTTClientInfo>();

  // MQTT 토픽 구조
  private readonly topics = {
    // RPC 요청/응답 패턴
    rpcRequest: 'rpc/request/+',  // rpc/request/{method}
    rpcResponse: 'rpc/response/+', // rpc/response/{requestId}
    
    // 이벤트 pub/sub 패턴
    events: 'events/+',           // events/{eventType}
    
    // IoT 디바이스 통신
    buttonPress: 'device/button/+/+',     // device/button/{stopId}/{routeId}
    busLocation: 'device/bus/+/location', // device/bus/{busId}/location
    busNotification: 'device/bus/+/notification', // device/bus/{busId}/notification
    ledControl: 'device/led/+/+',         // device/led/{stopId}/{routeId}
    
    // 시스템 관리
    systemHealth: 'system/health',
    systemInfo: 'system/info',
    systemStats: 'system/stats',
    
    // 클라이언트 관리
    clientConnect: '$SYS/broker/connection/+/state',
    clientDisconnect: '$SYS/broker/disconnection/+/state',
  };

  async initialize(): Promise<void> {
    try {
      await this.connect();
      this.registerRPCHandlers();
      this.registerEventHandlers();
      this.startHealthMonitoring();
      logger.info('MQTT Server Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MQTT Server Service:', error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client = mqtt.connect(config.mqtt.brokerUrl, {
          username: config.mqtt.username,
          password: config.mqtt.password,
          clientId: config.mqtt.clientId,
          clean: true,
          reconnectPeriod: 1000,
          keepalive: 60,
          will: {
            topic: 'system/server/status',
            payload: JSON.stringify({ 
              status: 'offline', 
              timestamp: new Date() 
            }),
            qos: 1,
            retain: true
          }
        });

        this.client.on('connect', () => {
          logger.info('Connected to MQTT broker');
          this.isConnected = true;
          this.subscribeToTopics();
          this.publishServerStatus('online');
          resolve();
        });

        this.client.on('error', (error) => {
          logger.error('MQTT connection error:', error);
          this.isConnected = false;
          reject(error);
        });

        this.client.on('disconnect', () => {
          logger.warn('Disconnected from MQTT broker');
          this.isConnected = false;
        });

        this.client.on('reconnect', () => {
          logger.info('Reconnecting to MQTT broker...');
        });

        this.client.on('message', this.handleMessage.bind(this));

      } catch (error) {
        logger.error('Failed to connect to MQTT broker:', error);
        reject(error);
      }
    });
  }

  private async subscribeToTopics(): Promise<void> {
    if (!this.client) return;

    const subscriptions = [
      this.topics.rpcRequest,
      this.topics.buttonPress,
      this.topics.busLocation,
      this.topics.clientConnect,
      this.topics.clientDisconnect,
    ];

    for (const topic of subscriptions) {
      this.client.subscribe(topic, { qos: config.mqtt.qos || 1 }, (err) => {
        if (err) {
          logger.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          logger.info(`Subscribed to ${topic}`);
        }
      });
    }
  }

  private async handleMessage(topic: string, message: Buffer): Promise<void> {
    try {
      const payload = JSON.parse(message.toString());
      logger.debug(`Received MQTT message on ${topic}:`, payload);

      // RPC 요청 처리
      if (topic.startsWith('rpc/request/')) {
        await this.handleRPCRequest(topic, payload);
      }
      // 버튼 호출 처리
      else if (topic.includes('/button/')) {
        await this.handleButtonPress(topic, payload);
      }
      // 버스 위치 처리
      else if (topic.includes('/location')) {
        await this.handleBusLocation(topic, payload);
      }
      // 클라이언트 연결/해제 처리
      else if (topic.includes('$SYS/broker/')) {
        await this.handleClientStatusChange(topic, payload);
      }

    } catch (error) {
      logger.error(`Error handling MQTT message on ${topic}:`, error);
    }
  }

  // RPC 핸들러 등록
  private registerRPCHandlers(): void {
    // 시스템 헬스 체크
    this.registerRPCHandler('health', async () => {
      return {
        redis: redisService.isHealthy(),
        mqtt: this.isHealthy(),
        etaProcessor: etaProcessorService.isHealthy(),
        timestamp: new Date()
      };
    });

    // 시스템 정보 조회
    this.registerRPCHandler('info', async () => {
      return {
        name: 'Smart Bus Stop Bell System',
        version: '2.0.0-mqtt',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        connectedClients: this.connectedClients.size,
        timestamp: new Date()
      };
    });

    // 통계 조회
    this.registerRPCHandler('stats', async () => {
      return await etaProcessorService.getProcessingStats();
    });

    // 버튼 클릭 처리
    this.registerRPCHandler('buttonPress', async (params) => {
      const { stopId, routeId, routeName, buttonColor, passengerCount } = params;
      
      const busStopCall: BusStopCall = {
        id: `${stopId}-${routeId}-${Date.now()}`,
        stopId,
        routeId,
        routeName: routeName || routeId,
        buttonColor: buttonColor || '#FF0000',
        timestamp: new Date(),
        isActive: true,
        passengerCount: passengerCount || 1,
      };

      await redisService.saveBusStopCall(busStopCall);
      
      // 이벤트 발행
      await this.publishEvent('buttonPressed', busStopCall);
      
      // LED 켜기
      await this.updateButtonLED(stopId, routeId, 'ON');

      return {
        message: 'Button press registered successfully',
        call: busStopCall
      };
    });

    // 호출 취소
    this.registerRPCHandler('cancelCall', async (params) => {
      const { stopId, routeId } = params;
      
      await redisService.deactivateBusStopCall(stopId, routeId);
      
      // 이벤트 발행
      await this.publishEvent('callCancelled', { stopId, routeId });
      
      // LED 끄기
      await this.updateButtonLED(stopId, routeId, 'OFF');

      return {
        message: 'Call cancelled successfully'
      };
    });

    // 활성 호출 조회
    this.registerRPCHandler('getActiveCalls', async (params) => {
      const { stopId } = params;
      return await redisService.getActiveCallsForStop(stopId);
    });

    // ETA 조회
    this.registerRPCHandler('getETA', async (params) => {
      const { stopId, routeId } = params;
      return await redisService.getETAsForStop(stopId);
    });

    // 근처 버스 조회
    this.registerRPCHandler('getNearbyBuses', async (params) => {
      const { routeId, radiusMeters } = params;
      return await redisService.getBusesForRoute(routeId);
    });
  }

  // 이벤트 핸들러 등록
  private registerEventHandlers(): void {
    // 버튼 클릭 이벤트 처리
    this.registerEventHandler('buttonPressed', async (eventType, data, source) => {
      logger.info(`Button pressed event: Stop ${data.stopId}, Route ${data.routeId}`);
      // 추가 처리 로직
    });

    // 호출 취소 이벤트 처리
    this.registerEventHandler('callCancelled', async (eventType, data, source) => {
      logger.info(`Call cancelled event: Stop ${data.stopId}, Route ${data.routeId}`);
      // 추가 처리 로직
    });

    // 버스 도착 이벤트 처리
    this.registerEventHandler('busArriving', async (eventType, data, source) => {
      logger.info(`Bus arriving event: Bus ${data.busId} at Stop ${data.stopId}`);
      // 알림 전송 로직
      await this.sendNotificationToBus(data.busId, {
        busId: data.busId,
        stopId: data.stopId,
        routeId: data.routeId,
        routeName: data.routeName,
        message: 'Passenger waiting at stop',
        type: 'APPROACHING',
        timestamp: new Date()
      });
    });
  }

  // RPC 요청 처리
  private async handleRPCRequest(topic: string, request: MQTTRPCRequest): Promise<void> {
    const method = topic.split('/').pop();
    const handler = this.rpcHandlers.get(method!);

    const response: MQTTRPCResponse = {
      id: request.id,
      success: false,
      timestamp: new Date()
    };

    try {
      if (handler) {
        response.result = await handler(request.params);
        response.success = true;
      } else {
        response.error = `Unknown method: ${method}`;
      }
    } catch (error) {
      response.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`RPC error for method ${method}:`, error);
    }

    // 응답 발행
    const responseTopic = `rpc/response/${request.id}`;
    await this.publish(responseTopic, response, { qos: 1 });

    // 타임아웃 설정 (응답 후 정리)
    setTimeout(() => {
      this.pendingRequests.delete(request.id);
    }, config.server.responseTimeout);
  }

  private async handleButtonPress(topic: string, payload: any): Promise<void> {
    // 토픽에서 stopId와 routeId 추출: device/button/{stopId}/{routeId}
    const parts = topic.split('/');
    const stopId = parts[2];
    const routeId = parts[3];

    const busStopCall: BusStopCall = {
      id: `${stopId}-${routeId}-${Date.now()}`,
      stopId,
      routeId,
      routeName: payload.routeName || routeId,
      buttonColor: payload.buttonColor || '#FF0000',
      timestamp: new Date(),
      isActive: true,
      passengerCount: payload.passengerCount || 1,
    };

    await redisService.saveBusStopCall(busStopCall);
    
    // 이벤트 발행
    await this.publishEvent('buttonPressed', busStopCall);
    
    // LED 켜기
    await this.updateButtonLED(stopId, routeId, 'ON');

    logger.info(`Button pressed at stop ${stopId} for route ${routeId}`);
  }

  private async handleBusLocation(topic: string, payload: any): Promise<void> {
    // 토픽에서 busId 추출: device/bus/{busId}/location
    const parts = topic.split('/');
    const busId = parts[2];

    const busLocation: BusLocation = {
      busId,
      routeId: payload.routeId,
      latitude: payload.latitude || payload.lat,
      longitude: payload.longitude || payload.lng,
      speed: payload.speed || 0,
      heading: payload.heading || 0,
      timestamp: new Date(payload.timestamp || Date.now()),
      accuracy: payload.accuracy,
    };

    await redisService.saveBusLocation(busLocation);
    
    // 이벤트 발행
    await this.publishEvent('busLocationUpdated', busLocation);

    // ETA 프로세서에 위치 업데이트 알림
    await etaProcessorService.onBusLocationUpdate(busLocation);

    logger.debug(`Bus location updated: ${busId} at (${busLocation.latitude}, ${busLocation.longitude})`);
  }

  private async handleClientStatusChange(topic: string, payload: any): Promise<void> {
    // 클라이언트 연결/해제 상태 추적
    const isConnection = topic.includes('connection');
    const clientId = topic.split('/')[3];

    if (isConnection) {
      this.connectedClients.set(clientId, {
        clientId,
        connected: true,
        lastSeen: new Date(),
        subscriptions: []
      });
      logger.info(`Client connected: ${clientId}`);
    } else {
      this.connectedClients.delete(clientId);
      logger.info(`Client disconnected: ${clientId}`);
    }

    // 클라이언트 상태 변경 이벤트 발행
    await this.publishEvent('clientStatusChanged', {
      clientId,
      connected: isConnection,
      totalClients: this.connectedClients.size
    });
  }

  // RPC 핸들러 등록
  public registerRPCHandler(method: string, handler: RPCHandler): void {
    this.rpcHandlers.set(method, handler);
    logger.debug(`RPC handler registered: ${method}`);
  }

  // 이벤트 핸들러 등록
  public registerEventHandler(eventType: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
    logger.debug(`Event handler registered: ${eventType}`);
  }

  // 이벤트 발행
  public async publishEvent(eventType: string, data: any, source: string = 'server'): Promise<void> {
    const eventMessage: MQTTEventMessage = {
      eventType,
      data,
      timestamp: new Date(),
      source
    };

    const topic = `events/${eventType}`;
    await this.publish(topic, eventMessage);

    // 로컬 이벤트 핸들러 실행
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(eventType, data, source);
        } catch (error) {
          logger.error(`Error in event handler for ${eventType}:`, error);
        }
      }
    }
  }

  // 메시지 발행
  public async publish(topic: string, message: any, options: any = {}): Promise<void> {
    if (!this.client || !this.isConnected) {
      logger.error('MQTT client not connected');
      return;
    }

    const payload = JSON.stringify(message);
    const publishOptions = {
      qos: config.mqtt.qos,
      retain: false,
      ...options
    };

    this.client.publish(topic, payload, publishOptions, (err) => {
      if (err) {
        logger.error(`Failed to publish to ${topic}:`, err);
      } else {
        logger.debug(`Published to ${topic}: ${payload.substring(0, 100)}...`);
      }
    });
  }

  // 버스에게 알림 전송
  public async sendNotificationToBus(busId: string, notification: BusNotification): Promise<void> {
    const topic = `device/bus/${busId}/notification`;
    await this.publish(topic, notification, { qos: 1 });
    logger.info(`Notification sent to bus ${busId}: ${notification.type}`);
  }

  // 정류장 버튼 LED 상태 업데이트
  public async updateButtonLED(stopId: string, routeId: string, status: 'ON' | 'OFF'): Promise<void> {
    const topic = `device/led/${stopId}/${routeId}`;
    const message = { 
      status, 
      timestamp: new Date(),
      color: status === 'ON' ? '#FF0000' : '#000000'
    };
    
    await this.publish(topic, message, { qos: 1 });
    logger.info(`LED updated for stop ${stopId}, route ${routeId}: ${status}`);
  }

  // 서버 상태 발행
  private async publishServerStatus(status: 'online' | 'offline'): Promise<void> {
    const topic = 'system/server/status';
    const message = {
      status,
      serverId: config.mqtt.clientId,
      timestamp: new Date(),
      version: '2.0.0-mqtt'
    };
    
    await this.publish(topic, message, { qos: 1, retain: true });
  }

  // 헬스 모니터링 시작
  private startHealthMonitoring(): void {
    setInterval(async () => {
      const health: SystemHealth = {
        redis: redisService.isHealthy(),
        mqtt: this.isHealthy(),
        etaProcessor: etaProcessorService.isHealthy(),
        timestamp: new Date()
      };

      await this.publishEvent('healthCheck', health);
    }, config.server.keepAliveInterval);
  }

  // 헬스 체크
  public isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  // 연결된 클라이언트 정보 반환
  public getConnectedClients(): MQTTClientInfo[] {
    return Array.from(this.connectedClients.values());
  }

  // 서비스 종료
  public async disconnect(): Promise<void> {
    if (this.client) {
      // 서버 오프라인 상태 발행
      await this.publishServerStatus('offline');
      
      // 대기 중인 요청 정리
      this.pendingRequests.forEach((timeout) => clearTimeout(timeout));
      this.pendingRequests.clear();
      
      // MQTT 클라이언트 종료
      this.client.end();
      this.client = null;
      this.isConnected = false;
      
      logger.info('MQTT Server Service disconnected');
    }
  }
}

export default new MQTTServerService(); 