import config, { validateConfig } from './config';
import logger from './utils/logger';
import redisService from './services/redis';
import mqttServerService from './services/mqtt';
import etaProcessorService from './services/etaProcessor';

class SmartBusStopMQTTServer {
  private isShuttingDown = false;

  constructor() {
    // 설정 검증
    try {
      validateConfig();
      logger.info('Configuration validated successfully');
    } catch (error) {
      logger.error('Configuration validation failed:', error);
      process.exit(1);
    }
  }

  private async initializeServices(): Promise<void> {
    logger.info('🚌 Initializing Smart Bus Stop MQTT Server...');

    try {
      // Redis 연결
      await redisService.connect();
      logger.info('✓ Redis connected');

      // MQTT 서버 초기화
      await mqttServerService.initialize();
      logger.info('✓ MQTT Server initialized');

      // ETA 프로세서 시작
      await etaProcessorService.startProcessing();
      logger.info('✓ ETA Processor started');

      logger.info('🎉 All services initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Force shutdown...');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      const timeout = setTimeout(() => {
        logger.error('Shutdown timeout exceeded. Force exit.');
        process.exit(1);
      }, 30000); // 30초 타임아웃

      try {
        // ETA 프로세서 중지
        logger.info('Stopping ETA processor...');
        await etaProcessorService.stopProcessing();

        // MQTT 서버 종료
        logger.info('Disconnecting from MQTT broker...');
        await mqttServerService.disconnect();

        // Redis 연결 종료
        logger.info('Disconnecting from Redis...');
        await redisService.disconnect();

        clearTimeout(timeout);
        logger.info('💤 Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        logger.error('Error during shutdown:', error);
        clearTimeout(timeout);
        process.exit(1);
      }
    };

    // 시그널 핸들러 등록
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));

    // 예외 처리
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  public async start(): Promise<void> {
    try {
      this.setupGracefulShutdown();
      await this.initializeServices();

      // 서버 상태 로깅
      logger.info('📊 Server Status:');
      logger.info(`   Mode: MQTT-only (No HTTP/WebSocket)`);
      logger.info(`   MQTT Broker: ${config.mqtt.brokerUrl}`);
      logger.info(`   Redis: ${config.redis.host}:${config.redis.port}`);
      logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Process ID: ${process.pid}`);

      // 주요 MQTT 토픽 정보
      logger.info('📡 Available MQTT Topics:');
      logger.info('   RPC Requests: rpc/request/{method}');
      logger.info('   Events: events/{eventType}');
      logger.info('   Button Calls: device/button/{stopId}/{routeId}');
      logger.info('   Bus Locations: device/bus/{busId}/location');
      logger.info('   LED Control: device/led/{stopId}/{routeId}');
      logger.info('   System Status: system/server/status');

      // 사용 가능한 RPC 메서드 정보
      logger.info('🔧 Available RPC Methods:');
      logger.info('   - health: System health check');
      logger.info('   - info: System information');
      logger.info('   - stats: Processing statistics');
      logger.info('   - buttonPress: Register button press');
      logger.info('   - cancelCall: Cancel active call');
      logger.info('   - getActiveCalls: Get active calls for stop');
      logger.info('   - getETA: Get ETA for stop');
      logger.info('   - getNearbyBuses: Get buses for route');

      logger.info('🚌 Smart Bus Stop MQTT Server is ready!');
      logger.info('💡 Use MQTT client to interact with the system');
      
      // 예시 MQTT 클라이언트 사용법 출력
      this.printUsageExamples();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private printUsageExamples(): void {
    logger.info('');
    logger.info('📖 MQTT Client Usage Examples:');
    logger.info('');
    logger.info('1. Health Check (RPC):');
    logger.info('   Topic: rpc/request/health');
    logger.info('   Payload: {"id": "req-123", "method": "health", "params": {}, "timestamp": "2024-01-01T00:00:00.000Z"}');
    logger.info('   Response Topic: rpc/response/req-123');
    logger.info('');
    logger.info('2. Button Press (RPC):');
    logger.info('   Topic: rpc/request/buttonPress');
    logger.info('   Payload: {"id": "req-124", "method": "buttonPress", "params": {"stopId": "STOP_001", "routeId": "ROUTE_A", "routeName": "A노선"}, "timestamp": "2024-01-01T00:00:00.000Z"}');
    logger.info('');
    logger.info('3. Button Press (Device):');
    logger.info('   Topic: device/button/STOP_001/ROUTE_A');
    logger.info('   Payload: {"routeName": "A노선", "buttonColor": "#FF0000", "passengerCount": 1}');
    logger.info('');
    logger.info('4. Bus Location Update:');
    logger.info('   Topic: device/bus/BUS_001/location');
    logger.info('   Payload: {"routeId": "ROUTE_A", "latitude": 37.5665, "longitude": 126.9780, "speed": 40, "heading": 180}');
    logger.info('');
    logger.info('5. Subscribe to Events:');
    logger.info('   Topic: events/+');
    logger.info('   Events: buttonPressed, callCancelled, busLocationUpdated, busArriving, healthCheck, clientStatusChanged');
    logger.info('');
  }
}

// 서버 시작
const server = new SmartBusStopMQTTServer();
server.start(); 