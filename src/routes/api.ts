import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { ApiResponse, BusStopCall, BusLocation } from '../types';
import redisService from '../services/redis';
import mqttService from '../services/mqtt';
import etaProcessorService from '../services/etaProcessor';
import logger from '../utils/logger';

const router = Router();

// 응답 헬퍼 함수
const sendResponse = <T>(res: Response, success: boolean, data?: T, error?: string): void => {
  const response: ApiResponse<T> = {
    success,
    data,
    error,
    timestamp: new Date()
  };
  res.json(response);
};

// 에러 핸들링 미들웨어
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendResponse(res, false, undefined, `Validation error: ${errors.array().map(e => e.msg).join(', ')}`);
  }
  next();
};

// 비동기 에러 핸들링 래퍼
const asyncHandler = (fn: (req: Request, res: Response, next: any) => Promise<void>) => 
  (req: Request, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags:
 *       - System
 *     summary: 시스템 헬스 체크
 *     description: Redis, MQTT, ETA 처리 엔진의 상태를 확인합니다.
 *     responses:
 *       200:
 *         description: 시스템이 정상적으로 작동 중
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SystemHealth'
 *       503:
 *         description: 하나 이상의 서비스가 비정상 상태
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/health', (req: Request, res: Response) => {
  const health = {
    redis: redisService.isHealthy(),
    mqtt: mqttService.isHealthy(),
    etaProcessor: etaProcessorService.isHealthy(),
    timestamp: new Date()
  };
  
  const isHealthy = Object.values(health).every(status => typeof status === 'boolean' ? status : true);
  
  res.status(isHealthy ? 200 : 503);
  sendResponse(res, isHealthy, health);
});

/**
 * @swagger
 * /api/v1/info:
 *   get:
 *     tags:
 *       - System
 *     summary: 시스템 정보 조회
 *     description: 시스템 이름, 버전, 가동 시간, 메모리 사용량 등 기본 정보를 반환합니다.
 *     responses:
 *       200:
 *         description: 시스템 정보
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SystemInfo'
 */
router.get('/info', (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/v1/stats:
 *   get:
 *     tags:
 *       - System
 *     summary: 시스템 통계 조회
 *     description: ETA 처리 통계 및 시스템 성능 지표를 반환합니다.
 *     responses:
 *       200:
 *         description: 시스템 통계
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await etaProcessorService.getProcessingStats();
    sendResponse(res, true, stats);
  })
);

/**
 * @swagger
 * /api/v1/button-press:
 *   post:
 *     tags:
 *       - Button Calls
 *     summary: 정류장 버튼 클릭 처리
 *     description: 정류장에서 특정 노선 버튼이 눌렸을 때 호출을 등록합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stopId
 *               - routeId
 *               - routeName
 *             properties:
 *               stopId:
 *                 type: string
 *                 description: 정류장 ID
 *                 example: "BUS_STOP_001"
 *               routeId:
 *                 type: string
 *                 description: 노선 ID
 *                 example: "ROUTE_A"
 *               routeName:
 *                 type: string
 *                 description: 노선 이름
 *                 example: "A노선"
 *               buttonColor:
 *                 type: string
 *                 description: 버튼 색상 (HEX)
 *                 example: "#FF0000"
 *               passengerCount:
 *                 type: integer
 *                 minimum: 1
 *                 description: 승객 수
 *                 example: 2
 *     responses:
 *       200:
 *         description: 버튼 클릭이 성공적으로 등록됨
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                         call:
 *                           $ref: '#/components/schemas/BusStopCall'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/button-press', [
  body('stopId').notEmpty().withMessage('Stop ID is required'),
  body('routeId').notEmpty().withMessage('Route ID is required'),
  body('routeName').notEmpty().withMessage('Route name is required'),
  body('buttonColor').optional().isHexColor().withMessage('Button color must be a valid hex color'),
  body('passengerCount').optional().isInt({ min: 1 }).withMessage('Passenger count must be a positive integer'),
], handleValidationErrors, asyncHandler(async (req: Request, res: Response) => {
  const { stopId, routeId, routeName, buttonColor = '#FF0000', passengerCount = 1 } = req.body;

  const busStopCall: BusStopCall = {
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
  await redisService.saveBusStopCall(busStopCall);

  logger.info(`Button pressed at stop ${stopId} for route ${routeId}`);

  sendResponse(res, true, {
    message: 'Button press registered successfully',
    call: busStopCall
  });
}));

/**
 * @swagger
 * /api/v1/bus-location:
 *   post:
 *     tags:
 *       - Bus Location
 *     summary: 버스 위치 업데이트
 *     description: 버스의 현재 위치 정보를 업데이트합니다 (시뮬레이션 및 테스트용).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - busId
 *               - routeId
 *               - latitude
 *               - longitude
 *             properties:
 *               busId:
 *                 type: string
 *                 description: 버스 ID
 *                 example: "BUS_001"
 *               routeId:
 *                 type: string
 *                 description: 노선 ID
 *                 example: "ROUTE_A"
 *               latitude:
 *                 type: number
 *                 format: double
 *                 description: 위도
 *                 example: 37.5665
 *               longitude:
 *                 type: number
 *                 format: double
 *                 description: 경도
 *                 example: 126.9780
 *               speed:
 *                 type: number
 *                 format: double
 *                 minimum: 0
 *                 description: 속도 (km/h)
 *                 example: 30.5
 *               heading:
 *                 type: number
 *                 format: double
 *                 minimum: 0
 *                 maximum: 360
 *                 description: 방향 (degrees)
 *                 example: 90.0
 *               accuracy:
 *                 type: number
 *                 format: double
 *                 description: 위치 정확도 (meters)
 *                 example: 5.0
 *     responses:
 *       200:
 *         description: 버스 위치가 성공적으로 업데이트됨
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                         location:
 *                           $ref: '#/components/schemas/BusLocation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/bus-location', [
  body('busId').notEmpty().withMessage('Bus ID is required'),
  body('routeId').notEmpty().withMessage('Route ID is required'),
  body('latitude').isFloat().withMessage('Latitude must be a valid number'),
  body('longitude').isFloat().withMessage('Longitude must be a valid number'),
  body('speed').optional().isFloat({ min: 0 }).withMessage('Speed must be a positive number'),
  body('heading').optional().isFloat({ min: 0, max: 360 }).withMessage('Heading must be between 0 and 360'),
], handleValidationErrors, asyncHandler(async (req: Request, res: Response) => {
  const { busId, routeId, latitude, longitude, speed = 0, heading = 0, accuracy } = req.body;

  const busLocation: BusLocation = {
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
  await redisService.saveBusLocation(busLocation);

  logger.info(`Bus location updated: ${busId} at (${latitude}, ${longitude})`);

  sendResponse(res, true, {
    message: 'Bus location updated successfully',
    location: busLocation
  });
}));

// =============================================================================
// 정류장 호출 관련 API
// =============================================================================

/**
 * @swagger
 * /api/v1/stops/{stopId}/calls:
 *   get:
 *     tags:
 *       - Button Calls
 *     summary: 정류장의 활성 호출 조회
 *     description: 특정 정류장에서 현재 활성화된 모든 버튼 호출을 조회합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/StopId'
 *     responses:
 *       200:
 *         description: 활성 호출 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         stopId:
 *                           type: string
 *                           description: 정류장 ID
 *                         activeCalls:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/BusStopCall'
 *                         count:
 *                           type: integer
 *                           description: 활성 호출 수
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/stops/:stopId/calls',
  param('stopId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { stopId } = req.params;
    
    const activeCalls = await redisService.getActiveCallsForStop(stopId);
    sendResponse(res, true, {
      stopId,
      activeCalls,
      count: activeCalls.length
    });
    
    logger.info(`Retrieved ${activeCalls.length} active calls for stop ${stopId}`);
  })
);

/**
 * @swagger
 * /api/v1/stops/{stopId}/eta:
 *   get:
 *     tags:
 *       - ETA
 *     summary: 정류장의 ETA 조회
 *     description: 특정 정류장에 대한 모든 버스의 예상 도착 시간을 조회합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/StopId'
 *     responses:
 *       200:
 *         description: ETA 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ETACalculation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/stops/:stopId/eta',
  param('stopId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { stopId } = req.params;
    
    const etas = await redisService.getETAsForStop(stopId);
    sendResponse(res, true, etas);
    
    logger.info(`Retrieved ${etas.length} ETAs for stop ${stopId}`);
  })
);

// =============================================================================
// 버스 관련 API
// =============================================================================

/**
 * @swagger
 * /api/v1/buses/{busId}/location:
 *   get:
 *     tags:
 *       - Bus Location
 *     summary: 버스 위치 조회
 *     description: 특정 버스의 현재 위치 정보를 조회합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/BusId'
 *     responses:
 *       200:
 *         description: 버스 위치 정보
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BusLocation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/buses/:busId/location',
  param('busId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { busId } = req.params;
    
    const location = await redisService.getBusLocation(busId);
    if (!location) {
      return sendResponse(res, false, undefined, `Bus ${busId} not found`);
    }
    
    sendResponse(res, true, location);
  })
);

/**
 * @swagger
 * /api/v1/routes/{routeId}/buses:
 *   get:
 *     tags:
 *       - Bus Location
 *     summary: 노선의 모든 버스 조회
 *     description: 특정 노선에 속한 모든 버스의 위치 정보를 조회합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/RouteId'
 *     responses:
 *       200:
 *         description: 노선의 버스 목록
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BusLocation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/routes/:routeId/buses',
  param('routeId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { routeId } = req.params;
    
    const buses = await redisService.getBusesForRoute(routeId);
    sendResponse(res, true, buses);
    
    logger.info(`Retrieved ${buses.length} buses for route ${routeId}`);
  })
);

/**
 * @swagger
 * /api/v1/buses/{busId}/eta/{stopId}:
 *   get:
 *     tags:
 *       - ETA
 *     summary: 특정 버스의 ETA 조회
 *     description: 특정 버스가 특정 정류장에 도착할 예상 시간을 조회합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/BusId'
 *       - $ref: '#/components/parameters/StopId'
 *     responses:
 *       200:
 *         description: ETA 정보
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ETACalculation'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/buses/:busId/eta/:stopId',
  param('busId').isString().isLength({ min: 1 }),
  param('stopId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { busId, stopId } = req.params;
    
    const eta = await redisService.getETACalculation(busId, stopId);
    if (!eta) {
      return sendResponse(res, false, undefined, `No ETA found for bus ${busId} to stop ${stopId}`);
    }
    
    sendResponse(res, true, eta);
  })
);

// =============================================================================
// 제어 API
// =============================================================================

/**
 * @swagger
 * /api/v1/stops/{stopId}/calls:
 *   post:
 *     tags:
 *       - Control
 *     summary: 수동 버튼 호출 생성
 *     description: 테스트용으로 수동으로 버튼 호출을 생성합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/StopId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - routeId
 *             properties:
 *               routeId:
 *                 type: string
 *                 description: 노선 ID
 *                 example: "ROUTE_A"
 *               routeName:
 *                 type: string
 *                 description: 노선 이름
 *                 example: "A노선"
 *               buttonColor:
 *                 type: string
 *                 description: 버튼 색상 (HEX)
 *                 example: "#FF0000"
 *               passengerCount:
 *                 type: integer
 *                 minimum: 1
 *                 description: 승객 수
 *                 example: 2
 *     responses:
 *       200:
 *         description: 호출이 성공적으로 생성됨
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BusStopCall'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/stops/:stopId/calls',
  param('stopId').isString().isLength({ min: 1 }),
  body('routeId').isString().isLength({ min: 1 }),
  body('routeName').optional().isString(),
  body('buttonColor').optional().isString(),
  body('passengerCount').optional().isInt({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { stopId } = req.params;
    const { routeId, routeName, buttonColor, passengerCount } = req.body;
    
    const call: BusStopCall = {
      id: `${stopId}-${routeId}-${Date.now()}`,
      stopId,
      routeId,
      routeName: routeName || routeId,
      buttonColor: buttonColor || '#FF0000',
      timestamp: new Date(),
      isActive: true,
      passengerCount: passengerCount || 1
    };
    
    await redisService.saveBusStopCall(call);
    sendResponse(res, true, call);
    
    logger.info(`Manual call created: ${call.id}`);
  })
);

/**
 * @swagger
 * /api/v1/stops/{stopId}/calls/{routeId}:
 *   delete:
 *     tags:
 *       - Control
 *     summary: 버튼 호출 해제
 *     description: 특정 정류장의 특정 노선 버튼 호출을 해제합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/StopId'
 *       - $ref: '#/components/parameters/RouteId'
 *     responses:
 *       200:
 *         description: 호출이 성공적으로 해제됨
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "Call deactivated successfully"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.delete('/stops/:stopId/calls/:routeId',
  param('stopId').isString().isLength({ min: 1 }),
  param('routeId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { stopId, routeId } = req.params;
    
    await redisService.deactivateBusStopCall(stopId, routeId);
    await mqttService.updateButtonLED(stopId, routeId, 'OFF');
    
    sendResponse(res, true, { message: 'Call deactivated successfully' });
    
    logger.info(`Call deactivated: stop ${stopId}, route ${routeId}`);
  })
);

/**
 * @swagger
 * /api/v1/stops/{stopId}/led/{routeId}:
 *   post:
 *     tags:
 *       - Control
 *     summary: LED 상태 업데이트
 *     description: 특정 정류장의 특정 노선 버튼 LED 상태를 업데이트합니다.
 *     parameters:
 *       - $ref: '#/components/parameters/StopId'
 *       - $ref: '#/components/parameters/RouteId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: ['ON', 'OFF']
 *                 description: LED 상태
 *                 example: "ON"
 *     responses:
 *       200:
 *         description: LED 상태가 성공적으로 업데이트됨
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "LED ON command sent"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/stops/:stopId/led/:routeId',
  param('stopId').isString().isLength({ min: 1 }),
  param('routeId').isString().isLength({ min: 1 }),
  body('status').isIn(['ON', 'OFF']),
  handleValidationErrors,
  asyncHandler(async (req: Request, res: Response) => {
    const { stopId, routeId } = req.params;
    const { status } = req.body;
    
    await mqttService.updateButtonLED(stopId, routeId, status);
    sendResponse(res, true, { message: `LED ${status} command sent` });
    
    logger.info(`LED ${status} command sent to stop ${stopId}, route ${routeId}`);
  })
);

// =============================================================================
// GTFS Realtime 호환 API (미래 확장용)
// =============================================================================

/**
 * @swagger
 * /api/v1/gtfs/vehicle-positions:
 *   get:
 *     tags:
 *       - GTFS
 *     summary: GTFS-Realtime 차량 위치 피드
 *     description: GTFS-Realtime 형식으로 모든 버스의 위치 정보를 제공합니다. (향후 구현 예정)
 *     responses:
 *       200:
 *         description: GTFS-Realtime 차량 위치 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "GTFS-Realtime vehicle positions endpoint - To be implemented"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       501:
 *         description: 아직 구현되지 않음
 */
router.get('/gtfs/vehicle-positions', (req: Request, res: Response) => {
  // 향후 GTFS-Realtime 형식으로 버스 위치 제공
  res.json({
    message: 'GTFS-Realtime vehicle positions endpoint - To be implemented',
    timestamp: new Date()
  });
});

/**
 * @swagger
 * /api/v1/gtfs/trip-updates:
 *   get:
 *     tags:
 *       - GTFS
 *     summary: GTFS-Realtime 여행 업데이트 피드
 *     description: GTFS-Realtime 형식으로 여행 업데이트 정보를 제공합니다. (향후 구현 예정)
 *     responses:
 *       200:
 *         description: GTFS-Realtime 여행 업데이트 데이터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "GTFS-Realtime trip updates endpoint - To be implemented"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       501:
 *         description: 아직 구현되지 않음
 */
router.get('/gtfs/trip-updates', (req: Request, res: Response) => {
  // 향후 GTFS-Realtime 형식으로 여행 업데이트 제공
  res.json({
    message: 'GTFS-Realtime trip updates endpoint - To be implemented',
    timestamp: new Date()
  });
});

// 🔵 대규모 시스템 모니터링 APIs
router.get('/system/stats', 
  asyncHandler(async (req, res) => {
    const stats = etaProcessorService.getProcessingStats();
    const regionInfo = etaProcessorService.getRegionInfo();
    
    const systemStats = {
      processing: stats,
      regions: regionInfo,
      systemHealth: {
        isProcessing: stats.processingTimeMs > 0,
        lastUpdate: stats.lastProcessedAt,
        avgProcessingTime: stats.processingTimeMs
      }
    };
    
    sendResponse(res, true, systemStats);
  })
);

// 지역별 정류장 정보 조회
router.get('/regions/:regionId/stops',
  param('regionId').isString().isLength({ min: 1 }),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const { regionId } = req.params;
    const stops = etaProcessorService.getStopsInRegion(regionId);
    
    if (stops.length === 0) {
      return sendResponse(res, false, undefined, `No stops found in region ${regionId}`);
    }
    
    sendResponse(res, true, { regionId, stops, count: stops.length });
  })
);

// 모든 정류장 조회 (페이징 지원)
router.get('/stops/all',
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const result = etaProcessorService.getAllBusStops(page, limit);
    sendResponse(res, true, result);
  })
);

// 지역 정보 조회
router.get('/regions',
  asyncHandler(async (req, res) => {
    const regions = etaProcessorService.getRegionInfo();
    sendResponse(res, true, { regions, count: regions.length });
  })
);

// 🔵 실시간 대규모 ETA 조회 (지역별)
router.get('/regions/:regionId/eta',
  param('regionId').isString().isLength({ min: 1 }),
  asyncHandler(async (req, res) => {
    const { regionId } = req.params;
    const stops = etaProcessorService.getStopsInRegion(regionId);
    
    if (stops.length === 0) {
      return sendResponse(res, false, undefined, `No stops found in region ${regionId}`);
    }
    
    // 각 정류장의 ETA 정보를 병렬로 조회
    const etaPromises = stops.map(async (stop) => {
      const activeCalls = await redisService.getActiveCallsForStop(stop.stopId);
      const etaData = [];
      
      for (const call of activeCalls) {
        // 해당 노선의 모든 버스 ETA 조회
        const buses = await redisService.getBusesForRoute(call.routeId);
        for (const bus of buses) {
          const eta = await redisService.getETACalculation(bus.busId, stop.stopId);
          if (eta) {
            etaData.push(eta);
          }
        }
      }
      
      return {
        stopId: stop.stopId,
        stopName: stop.name,
        activeCalls: activeCalls.length,
        etas: etaData
      };
    });
    
    const results = await Promise.all(etaPromises);
    sendResponse(res, true, { regionId, stops: results });
  })
);

// 에러 핸들링 미들웨어
router.use((error: Error, req: Request, res: Response, next: Function) => {
  logger.error('API Error:', error);
  sendResponse(res, false, undefined, 'Internal server error');
});

export default router; 