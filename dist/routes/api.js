"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const redis_1 = __importDefault(require("../services/redis"));
const mqtt_1 = __importDefault(require("../services/mqtt"));
const etaProcessor_1 = __importDefault(require("../services/etaProcessor"));
const logger_1 = __importDefault(require("../utils/logger"));
const router = (0, express_1.Router)();
// 응답 헬퍼 함수
const sendResponse = (res, success, data, error) => {
    const response = {
        success,
        data,
        error,
        timestamp: new Date()
    };
    res.json(response);
};
// 에러 핸들링 미들웨어
const handleValidationErrors = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return sendResponse(res, false, undefined, `Validation error: ${errors.array().map(e => e.msg).join(', ')}`);
    }
    next();
};
// 비동기 에러 핸들링 래퍼
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
// Health check endpoint
router.get('/health', (req, res) => {
    sendResponse(res, true, {
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        services: {
            redis: redis_1.default.isHealthy(),
            mqtt: mqtt_1.default.isHealthy(),
        }
    });
});
// 정류장 버튼 클릭 API
router.post('/button-press', [
    (0, express_validator_1.body)('stopId').notEmpty().withMessage('Stop ID is required'),
    (0, express_validator_1.body)('routeId').notEmpty().withMessage('Route ID is required'),
    (0, express_validator_1.body)('routeName').notEmpty().withMessage('Route name is required'),
    (0, express_validator_1.body)('buttonColor').optional().isHexColor().withMessage('Button color must be a valid hex color'),
    (0, express_validator_1.body)('passengerCount').optional().isInt({ min: 1 }).withMessage('Passenger count must be a positive integer'),
], handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId, routeId, routeName, buttonColor = '#FF0000', passengerCount = 1 } = req.body;
    const busStopCall = {
        id: `${stopId}-${routeId}-${Date.now()}`,
        stopId,
        routeId,
        routeName,
        buttonColor,
        timestamp: new Date(),
        isActive: true,
        passengerCount,
    };
    // Redis에 호출 저장
    await redis_1.default.saveBusStopCall(busStopCall);
    logger_1.default.info(`Button pressed at stop ${stopId} for route ${routeId}`);
    sendResponse(res, true, {
        message: 'Button press registered successfully',
        call: busStopCall
    });
}));
// 정류장의 활성 호출 조회 API
router.get('/stops/:stopId/calls', [
    (0, express_validator_1.param)('stopId').notEmpty().withMessage('Stop ID is required'),
], handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId } = req.params;
    const activeCalls = await redis_1.default.getActiveCallsForStop(stopId);
    sendResponse(res, true, {
        stopId,
        activeCalls,
        count: activeCalls.length
    });
}));
// 버스 위치 업데이트 API (시뮬레이션용)
router.post('/bus-location', [
    (0, express_validator_1.body)('busId').notEmpty().withMessage('Bus ID is required'),
    (0, express_validator_1.body)('routeId').notEmpty().withMessage('Route ID is required'),
    (0, express_validator_1.body)('latitude').isFloat().withMessage('Latitude must be a valid number'),
    (0, express_validator_1.body)('longitude').isFloat().withMessage('Longitude must be a valid number'),
    (0, express_validator_1.body)('speed').optional().isFloat({ min: 0 }).withMessage('Speed must be a positive number'),
    (0, express_validator_1.body)('heading').optional().isFloat({ min: 0, max: 360 }).withMessage('Heading must be between 0 and 360'),
], handleValidationErrors, asyncHandler(async (req, res) => {
    const { busId, routeId, latitude, longitude, speed = 0, heading = 0, accuracy } = req.body;
    const busLocation = {
        busId,
        routeId,
        latitude,
        longitude,
        speed,
        heading,
        timestamp: new Date(),
        accuracy,
    };
    // Redis에 위치 저장
    await redis_1.default.saveBusLocation(busLocation);
    logger_1.default.info(`Bus location updated: ${busId} at (${latitude}, ${longitude})`);
    sendResponse(res, true, {
        message: 'Bus location updated successfully',
        location: busLocation
    });
}));
// =============================================================================
// 정류장 관련 API
// =============================================================================
// 정류장의 활성 호출 조회
router.get('/stops/:stopId/calls', (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId } = req.params;
    const calls = await redis_1.default.getActiveCallsForStop(stopId);
    sendResponse(res, true, calls);
    logger_1.default.info(`Retrieved ${calls.length} active calls for stop ${stopId}`);
}));
// 특정 노선 호출 조회
router.get('/stops/:stopId/calls/:routeId', (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), (0, express_validator_1.param)('routeId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId, routeId } = req.params;
    const call = await redis_1.default.getBusStopCall(stopId, routeId);
    if (!call) {
        return sendResponse(res, false, undefined, `No active call found for stop ${stopId}, route ${routeId}`);
    }
    sendResponse(res, true, call);
}));
// 정류장 ETA 정보 조회
router.get('/stops/:stopId/eta', (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId } = req.params;
    const etas = await redis_1.default.getETAsForStop(stopId);
    sendResponse(res, true, etas);
    logger_1.default.info(`Retrieved ${etas.length} ETAs for stop ${stopId}`);
}));
// =============================================================================
// 버스 관련 API
// =============================================================================
// 버스 위치 조회
router.get('/buses/:busId/location', (0, express_validator_1.param)('busId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { busId } = req.params;
    const location = await redis_1.default.getBusLocation(busId);
    if (!location) {
        return sendResponse(res, false, undefined, `Bus ${busId} not found`);
    }
    sendResponse(res, true, location);
}));
// 노선의 모든 버스 위치 조회
router.get('/routes/:routeId/buses', (0, express_validator_1.param)('routeId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { routeId } = req.params;
    const buses = await redis_1.default.getBusesForRoute(routeId);
    sendResponse(res, true, buses);
    logger_1.default.info(`Retrieved ${buses.length} buses for route ${routeId}`);
}));
// 버스 ETA 조회
router.get('/buses/:busId/eta/:stopId', (0, express_validator_1.param)('busId').isString().isLength({ min: 1 }), (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { busId, stopId } = req.params;
    const eta = await redis_1.default.getETACalculation(busId, stopId);
    if (!eta) {
        return sendResponse(res, false, undefined, `No ETA found for bus ${busId} to stop ${stopId}`);
    }
    sendResponse(res, true, eta);
}));
// =============================================================================
// 제어 API
// =============================================================================
// 수동 버튼 호출 생성 (테스트용)
router.post('/stops/:stopId/calls', (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), (0, express_validator_1.body)('routeId').isString().isLength({ min: 1 }), (0, express_validator_1.body)('routeName').optional().isString(), (0, express_validator_1.body)('buttonColor').optional().isString(), (0, express_validator_1.body)('passengerCount').optional().isInt({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId } = req.params;
    const { routeId, routeName, buttonColor, passengerCount } = req.body;
    const call = {
        id: `${stopId}-${routeId}-${Date.now()}`,
        stopId,
        routeId,
        routeName: routeName || routeId,
        buttonColor: buttonColor || '#FF0000',
        timestamp: new Date(),
        isActive: true,
        passengerCount: passengerCount || 1
    };
    await redis_1.default.saveBusStopCall(call);
    sendResponse(res, true, call);
    logger_1.default.info(`Manual call created: ${call.id}`);
}));
// 버튼 호출 해제
router.delete('/stops/:stopId/calls/:routeId', (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), (0, express_validator_1.param)('routeId').isString().isLength({ min: 1 }), handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId, routeId } = req.params;
    await redis_1.default.deactivateBusStopCall(stopId, routeId);
    await mqtt_1.default.updateButtonLED(stopId, routeId, 'OFF');
    sendResponse(res, true, { message: 'Call deactivated successfully' });
    logger_1.default.info(`Call deactivated: stop ${stopId}, route ${routeId}`);
}));
// LED 상태 업데이트
router.post('/stops/:stopId/led/:routeId', (0, express_validator_1.param)('stopId').isString().isLength({ min: 1 }), (0, express_validator_1.param)('routeId').isString().isLength({ min: 1 }), (0, express_validator_1.body)('status').isIn(['ON', 'OFF']), handleValidationErrors, asyncHandler(async (req, res) => {
    const { stopId, routeId } = req.params;
    const { status } = req.body;
    await mqtt_1.default.updateButtonLED(stopId, routeId, status);
    sendResponse(res, true, { message: `LED ${status} command sent` });
    logger_1.default.info(`LED ${status} command sent to stop ${stopId}, route ${routeId}`);
}));
// =============================================================================
// 시스템 상태 API
// =============================================================================
// 헬스 체크
router.get('/health', (req, res) => {
    const health = {
        redis: redis_1.default.isHealthy(),
        mqtt: mqtt_1.default.isHealthy(),
        etaProcessor: etaProcessor_1.default.isHealthy(),
        timestamp: new Date()
    };
    const isHealthy = Object.values(health).every(status => typeof status === 'boolean' ? status : true);
    res.status(isHealthy ? 200 : 503);
    sendResponse(res, isHealthy, health);
});
// 시스템 통계
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = await etaProcessor_1.default.getProcessingStats();
    sendResponse(res, true, stats);
}));
// 시스템 정보
router.get('/info', (req, res) => {
    const info = {
        name: 'Smart Bus Stop Bell System',
        version: '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        timestamp: new Date()
    };
    sendResponse(res, true, info);
});
// =============================================================================
// GTFS Realtime 호환 API (미래 확장용)
// =============================================================================
// GTFS Realtime feed
router.get('/gtfs/vehicle-positions', (req, res) => {
    // 향후 GTFS-Realtime 형식으로 버스 위치 제공
    res.json({
        message: 'GTFS-Realtime vehicle positions endpoint - To be implemented',
        timestamp: new Date()
    });
});
router.get('/gtfs/trip-updates', (req, res) => {
    // 향후 GTFS-Realtime 형식으로 여행 업데이트 제공
    res.json({
        message: 'GTFS-Realtime trip updates endpoint - To be implemented',
        timestamp: new Date()
    });
});
// 에러 핸들링 미들웨어
router.use((error, req, res, next) => {
    logger_1.default.error('API Error:', error);
    sendResponse(res, false, undefined, 'Internal server error');
});
exports.default = router;
//# sourceMappingURL=api.js.map