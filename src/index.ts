import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';

import config, { validateConfig } from './config';
import logger from './utils/logger';
import apiRoutes from './routes/api';
import redisService from './services/redis';
import mqttService from './services/mqtt';
import etaProcessorService from './services/etaProcessor';
import swaggerSpec from './config/swagger';

class SmartBusStopServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer | null = null;
  private isShuttingDown = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    // 보안 미들웨어 - Swagger UI를 위한 CSP 설정 수정
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Swagger UI를 위해 추가
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "https:", "data:"], // Swagger UI 폰트를 위해 추가
        },
      },
    }));

    // CORS 설정
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : true,
      credentials: true,
    }));

    // 압축 및 기본 미들웨어
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // 요청 로깅 미들웨어
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
      });
      
      next();
    });
  }

  private setupRoutes(): void {
    // Swagger API 문서
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Smart Bus Stop Bell System API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        operationsSorter: 'alpha',
        tagsSorter: 'alpha',
        tryItOutEnabled: true,
        defaultModelsExpandDepth: 2
      }
    }));

    // API 라우트
    this.app.use('/api/v1', apiRoutes);

    // 루트 엔드포인트 - Swagger 문서 링크 추가
    this.app.get('/', (req, res) => {
      res.json({
        message: '🚌 Smart Bus Stop Bell System',
        version: '2.0.0',
        status: 'running',
        features: [
          'Large-scale bus tracking (100+ buses)',
          'Regional clustering',
          'Parallel ETA processing',
          'Real-time notifications',
          'Performance monitoring'
        ],
        docs: '/api/v1/docs'
      });
    });

    // 404 핸들러
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        timestamp: new Date()
      });
    });

    // 글로벌 에러 핸들러
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          timestamp: new Date()
        });
      }
    });
  }

  private setupWebSocket(): void {
    this.server = createServer(this.app);
    
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://yourdomain.com'] 
          : true,
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);

      // 클라이언트가 특정 정류장 구독
      socket.on('subscribe-stop', (stopId: string) => {
        socket.join(`stop-${stopId}`);
        logger.info(`Client ${socket.id} subscribed to stop ${stopId}`);
      });

      // 클라이언트가 특정 노선 구독
      socket.on('subscribe-route', (routeId: string) => {
        socket.join(`route-${routeId}`);
        logger.info(`Client ${socket.id} subscribed to route ${routeId}`);
      });

      // 클라이언트가 모든 업데이트 구독
      socket.on('subscribe-all', () => {
        socket.join('all-updates');
        logger.info(`Client ${socket.id} subscribed to all updates`);
      });

      socket.on('disconnect', () => {
        logger.info(`WebSocket client disconnected: ${socket.id}`);
      });
    });
  }

  // WebSocket을 통한 실시간 알림 전송
  public notifyButtonPress(stopId: string, call: any): void {
    if (this.io) {
      this.io.to(`stop-${stopId}`).emit('button-pressed', call);
      this.io.to('all-updates').emit('button-pressed', call);
      logger.debug(`Button press notification sent for stop ${stopId}`);
    }
  }

  public notifyBusLocation(routeId: string, location: any): void {
    if (this.io) {
      this.io.to(`route-${routeId}`).emit('bus-location', location);
      this.io.to('all-updates').emit('bus-location', location);
      logger.debug(`Bus location notification sent for route ${routeId}`);
    }
  }

  public notifyETAUpdate(stopId: string, eta: any): void {
    if (this.io) {
      this.io.to(`stop-${stopId}`).emit('eta-update', eta);
      this.io.to('all-updates').emit('eta-update', eta);
      logger.debug(`ETA update notification sent for stop ${stopId}`);
    }
  }

  private async initializeServices(): Promise<void> {
    logger.info('Initializing services...');

    try {
      // Redis 연결
      await redisService.connect();
      logger.info('✓ Redis connected');

      // MQTT 연결
      await mqttService.connect();
      logger.info('✓ MQTT connected');

      // ETA 프로세서 시작 (대규모 처리)
      await etaProcessorService.startProcessing();
      logger.info('✓ Large-scale ETA processor started');

      logger.info('All services initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Force shutdown initiated');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // 새로운 연결 차단
        if (this.server) {
          this.server.close(() => {
            logger.info('HTTP server closed');
          });
        }

        // WebSocket 연결 종료
        if (this.io) {
          this.io.close();
          logger.info('WebSocket server closed');
        }

        // 서비스 정리
        await etaProcessorService.stopProcessing();
        logger.info('Large-scale ETA processor stopped');

        await mqttService.disconnect();
        logger.info('MQTT disconnected');

        await redisService.disconnect();
        logger.info('Redis disconnected');

        logger.info('Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // 예외 처리
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  public async start(): Promise<void> {
    try {
      // 설정 검증
      validateConfig();
      logger.info('Configuration validated');

      // 서비스 초기화
      await this.initializeServices();

      // 서버 시작
      const port = config.port;
      this.server.listen(port, () => {
        logger.info(`🌐 Smart Bus Stop Bell System started on port ${port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`📖 API Documentation: http://localhost:${port}/api-docs`);
        
        // 시스템 통계 출력
        const stats = etaProcessorService.getProcessingStats();
        const regions = etaProcessorService.getRegionInfo();
        
        logger.info(`📍 Initialized ${regions.length} regions with ${stats.totalStops} total stops`);
        logger.info(`🚌 Ready to process 100+ buses across multiple regions`);
        logger.info(`⏱️  ETA processing interval: ${config.location.etaUpdateIntervalMs}ms`);
      });

      // Graceful shutdown 설정
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// 서버 시작
if (require.main === module) {
  const server = new SmartBusStopServer();
  server.start().catch((error) => {
    logger.error('Server startup failed:', error);
    process.exit(1);
  });
}

export default SmartBusStopServer; 