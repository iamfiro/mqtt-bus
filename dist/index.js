"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const config_1 = __importStar(require("./config"));
const logger_1 = __importDefault(require("./utils/logger"));
const api_1 = __importDefault(require("./routes/api"));
const redis_1 = __importDefault(require("./services/redis"));
const mqtt_1 = __importDefault(require("./services/mqtt"));
const etaProcessor_1 = __importDefault(require("./services/etaProcessor"));
class SmartBusStopServer {
    app;
    server;
    io = null;
    isShuttingDown = false;
    constructor() {
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }
    setupMiddleware() {
        // 보안 미들웨어
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));
        // CORS 설정
        this.app.use((0, cors_1.default)({
            origin: process.env.NODE_ENV === 'production'
                ? ['https://yourdomain.com']
                : true,
            credentials: true,
        }));
        // 압축 및 기본 미들웨어
        this.app.use((0, compression_1.default)());
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true }));
        // 요청 로깅 미들웨어
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger_1.default.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
            });
            next();
        });
    }
    setupRoutes() {
        // API 라우트
        this.app.use('/api/v1', api_1.default);
        // 루트 엔드포인트
        this.app.get('/', (req, res) => {
            res.json({
                name: 'Smart Bus Stop Bell System',
                version: '1.0.0',
                status: 'running',
                timestamp: new Date(),
                endpoints: {
                    api: '/api/v1',
                    health: '/api/v1/health',
                    stats: '/api/v1/stats',
                    websocket: '/socket.io'
                }
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
        this.app.use((error, req, res, next) => {
            logger_1.default.error('Unhandled error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Internal server error',
                    timestamp: new Date()
                });
            }
        });
    }
    setupWebSocket() {
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: process.env.NODE_ENV === 'production'
                    ? ['https://yourdomain.com']
                    : true,
                methods: ['GET', 'POST']
            }
        });
        this.io.on('connection', (socket) => {
            logger_1.default.info(`WebSocket client connected: ${socket.id}`);
            // 클라이언트가 특정 정류장 구독
            socket.on('subscribe-stop', (stopId) => {
                socket.join(`stop-${stopId}`);
                logger_1.default.info(`Client ${socket.id} subscribed to stop ${stopId}`);
            });
            // 클라이언트가 특정 노선 구독
            socket.on('subscribe-route', (routeId) => {
                socket.join(`route-${routeId}`);
                logger_1.default.info(`Client ${socket.id} subscribed to route ${routeId}`);
            });
            // 클라이언트가 모든 업데이트 구독
            socket.on('subscribe-all', () => {
                socket.join('all-updates');
                logger_1.default.info(`Client ${socket.id} subscribed to all updates`);
            });
            socket.on('disconnect', () => {
                logger_1.default.info(`WebSocket client disconnected: ${socket.id}`);
            });
        });
    }
    // WebSocket을 통한 실시간 알림 전송
    notifyButtonPress(stopId, call) {
        if (this.io) {
            this.io.to(`stop-${stopId}`).emit('button-pressed', call);
            this.io.to('all-updates').emit('button-pressed', call);
            logger_1.default.debug(`Button press notification sent for stop ${stopId}`);
        }
    }
    notifyBusLocation(routeId, location) {
        if (this.io) {
            this.io.to(`route-${routeId}`).emit('bus-location', location);
            this.io.to('all-updates').emit('bus-location', location);
            logger_1.default.debug(`Bus location notification sent for route ${routeId}`);
        }
    }
    notifyETAUpdate(stopId, eta) {
        if (this.io) {
            this.io.to(`stop-${stopId}`).emit('eta-update', eta);
            this.io.to('all-updates').emit('eta-update', eta);
            logger_1.default.debug(`ETA update notification sent for stop ${stopId}`);
        }
    }
    async initializeServices() {
        logger_1.default.info('Initializing services...');
        try {
            // Redis 연결
            await redis_1.default.connect();
            logger_1.default.info('✓ Redis connected');
            // MQTT 연결
            await mqtt_1.default.connect();
            logger_1.default.info('✓ MQTT connected');
            // ETA 프로세서 시작
            await etaProcessor_1.default.startProcessing();
            logger_1.default.info('✓ ETA processor started');
            logger_1.default.info('All services initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize services:', error);
            throw error;
        }
    }
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            if (this.isShuttingDown) {
                logger_1.default.warn('Force shutdown initiated');
                process.exit(1);
            }
            this.isShuttingDown = true;
            logger_1.default.info(`Received ${signal}, starting graceful shutdown...`);
            try {
                // 새로운 연결 차단
                if (this.server) {
                    this.server.close(() => {
                        logger_1.default.info('HTTP server closed');
                    });
                }
                // WebSocket 연결 종료
                if (this.io) {
                    this.io.close();
                    logger_1.default.info('WebSocket server closed');
                }
                // 서비스 정리
                await etaProcessor_1.default.stopProcessing();
                logger_1.default.info('ETA processor stopped');
                await mqtt_1.default.disconnect();
                logger_1.default.info('MQTT disconnected');
                await redis_1.default.disconnect();
                logger_1.default.info('Redis disconnected');
                logger_1.default.info('Graceful shutdown completed');
                process.exit(0);
            }
            catch (error) {
                logger_1.default.error('Error during shutdown:', error);
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        // 예외 처리
        process.on('uncaughtException', (error) => {
            logger_1.default.error('Uncaught exception:', error);
            shutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_1.default.error('Unhandled rejection at:', promise, 'reason:', reason);
            shutdown('unhandledRejection');
        });
    }
    async start() {
        try {
            // 설정 검증
            (0, config_1.validateConfig)();
            logger_1.default.info('Configuration validated');
            // 서비스 초기화
            await this.initializeServices();
            // 서버 시작
            const port = config_1.default.port;
            this.server.listen(port, () => {
                logger_1.default.info(`🚌 Smart Bus Stop Bell System started on port ${port}`);
                logger_1.default.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
                logger_1.default.info(`API: http://localhost:${port}/api/v1`);
                logger_1.default.info(`WebSocket: ws://localhost:${port}/socket.io`);
            });
            // Graceful shutdown 설정
            this.setupGracefulShutdown();
        }
        catch (error) {
            logger_1.default.error('Failed to start server:', error);
            process.exit(1);
        }
    }
}
// 서버 시작
if (require.main === module) {
    const server = new SmartBusStopServer();
    server.start().catch((error) => {
        logger_1.default.error('Server startup failed:', error);
        process.exit(1);
    });
}
exports.default = SmartBusStopServer;
//# sourceMappingURL=index.js.map