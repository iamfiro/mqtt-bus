"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
const redis_1 = __importDefault(require("./redis"));
const mqtt_1 = __importDefault(require("./mqtt"));
const location_1 = __importDefault(require("./location"));
class ETAProcessorService {
    processingInterval = null;
    isProcessing = false;
    // 가상의 정류장 데이터 (실제로는 데이터베이스에서 로드)
    busStops = new Map([
        ['STOP001', {
                stopId: 'STOP001',
                name: '시청앞',
                latitude: 37.5665,
                longitude: 126.9780,
                routes: ['BUS001', 'BUS002']
            }],
        ['STOP002', {
                stopId: 'STOP002',
                name: '강남역',
                latitude: 37.4979,
                longitude: 127.0276,
                routes: ['BUS001', 'BUS003']
            }],
        ['STOP003', {
                stopId: 'STOP003',
                name: '홍대입구',
                latitude: 37.5563,
                longitude: 126.9215,
                routes: ['BUS002', 'BUS003']
            }]
    ]);
    async startProcessing() {
        if (this.processingInterval) {
            logger_1.default.warn('ETA processing already started');
            return;
        }
        logger_1.default.info('Starting ETA processing...');
        this.processingInterval = setInterval(this.processETACalculations.bind(this), config_1.default.location.etaUpdateIntervalMs);
        // 즉시 한 번 실행
        await this.processETACalculations();
    }
    async stopProcessing() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
            logger_1.default.info('ETA processing stopped');
        }
    }
    async processETACalculations() {
        if (this.isProcessing) {
            logger_1.default.debug('ETA processing already in progress, skipping...');
            return;
        }
        this.isProcessing = true;
        try {
            // 모든 정류장에 대해 처리
            for (const [stopId, busStop] of this.busStops) {
                await this.processStopETAs(stopId, busStop);
            }
        }
        catch (error) {
            logger_1.default.error('Error in ETA processing:', error);
        }
        finally {
            this.isProcessing = false;
        }
    }
    async processStopETAs(stopId, busStop) {
        try {
            // 해당 정류장의 활성 호출 조회
            const activeCalls = await redis_1.default.getActiveCallsForStop(stopId);
            if (activeCalls.length === 0) {
                return;
            }
            logger_1.default.debug(`Processing ETAs for stop ${stopId} with ${activeCalls.length} active calls`);
            // 각 활성 호출에 대해 처리
            for (const call of activeCalls) {
                await this.processCallETA(call, busStop);
            }
        }
        catch (error) {
            logger_1.default.error(`Error processing ETAs for stop ${stopId}:`, error);
        }
    }
    async processCallETA(call, busStop) {
        try {
            // 해당 노선의 모든 버스 조회
            const buses = await redis_1.default.getBusesForRoute(call.routeId);
            if (buses.length === 0) {
                logger_1.default.debug(`No buses found for route ${call.routeId}`);
                return;
            }
            let closestBus = null;
            let bestETA = null;
            // 각 버스에 대해 ETA 계산
            for (const bus of buses) {
                const eta = location_1.default.calculateETA(bus, { latitude: busStop.latitude, longitude: busStop.longitude });
                eta.stopId = busStop.stopId;
                // 가장 가까운 버스 찾기
                if (!bestETA || eta.distanceMeters < bestETA.distanceMeters) {
                    bestETA = eta;
                    closestBus = bus;
                }
                // ETA 결과 저장
                await redis_1.default.saveETACalculation(eta);
            }
            if (closestBus && bestETA) {
                await this.handleBusApproach(closestBus, bestETA, call, busStop);
            }
        }
        catch (error) {
            logger_1.default.error(`Error processing call ETA for ${call.id}:`, error);
        }
    }
    async handleBusApproach(bus, eta, call, busStop) {
        const isApproaching = location_1.default.isApproaching(bus, { latitude: busStop.latitude, longitude: busStop.longitude });
        const hasPassed = await location_1.default.hasPassed(bus.busId, { latitude: busStop.latitude, longitude: busStop.longitude });
        if (hasPassed) {
            // 버스가 지나간 경우 - 버튼 해제 및 알림
            await this.handleBusPassed(bus, call, busStop);
        }
        else if (isApproaching) {
            // 버스가 접근 중인 경우 - 알림 전송
            await this.handleBusApproaching(bus, eta, call, busStop);
        }
    }
    async handleBusApproaching(bus, eta, call, busStop) {
        // 이미 접근 알림을 보냈는지 확인 (중복 방지)
        const notificationKey = `notification:${bus.busId}:${busStop.stopId}:approaching`;
        const alreadyNotified = await redis_1.default.isNotificationSent(bus.busId, busStop.stopId);
        if (alreadyNotified) {
            return;
        }
        // 버스에게 알림 전송
        const notification = {
            busId: bus.busId,
            stopId: busStop.stopId,
            routeId: call.routeId,
            routeName: call.routeName,
            message: `정류장 "${busStop.name}"에서 ${call.routeName} 노선 승차 요청이 있습니다.`,
            type: 'APPROACHING',
            timestamp: new Date()
        };
        await mqtt_1.default.sendNotificationToBus(bus.busId, notification);
        // 알림 전송 기록 (5분 TTL)
        await redis_1.default.setNotificationSent(bus.busId, busStop.stopId);
        logger_1.default.info(`Approaching notification sent to bus ${bus.busId} for stop ${busStop.stopId}`);
    }
    async handleBusPassed(bus, call, busStop) {
        // 버튼 호출 해제
        await redis_1.default.deactivateBusStopCall(busStop.stopId, call.routeId);
        // 정류장 LED 끄기
        await mqtt_1.default.updateButtonLED(busStop.stopId, call.routeId, 'OFF');
        // 버스에게 통과 알림
        const notification = {
            busId: bus.busId,
            stopId: busStop.stopId,
            routeId: call.routeId,
            routeName: call.routeName,
            message: `정류장 "${busStop.name}" 통과 완료`,
            type: 'DEPARTED',
            timestamp: new Date()
        };
        await mqtt_1.default.sendNotificationToBus(bus.busId, notification);
        logger_1.default.info(`Bus ${bus.busId} passed stop ${busStop.stopId}, call deactivated`);
    }
    // 버스 위치 업데이트 이벤트 핸들러
    async onBusLocationUpdate(busLocation) {
        try {
            // 위치 필터링 (Kalman Filter 적용)
            const filteredLocation = location_1.default.filterLocation(busLocation.busId, { latitude: busLocation.latitude, longitude: busLocation.longitude });
            // 필터링된 위치로 업데이트
            const updatedLocation = {
                ...busLocation,
                latitude: filteredLocation.latitude,
                longitude: filteredLocation.longitude
            };
            // Redis에 저장
            await redis_1.default.saveBusLocation(updatedLocation);
            // 관련 정류장에 대해 즉시 ETA 처리
            await this.processImmediateETA(updatedLocation);
        }
        catch (error) {
            logger_1.default.error(`Error handling bus location update for ${busLocation.busId}:`, error);
        }
    }
    async processImmediateETA(busLocation) {
        // 버스 노선에 포함된 정류장들에 대해서만 처리
        for (const [stopId, busStop] of this.busStops) {
            if (busStop.routes.includes(busLocation.routeId)) {
                const activeCalls = await redis_1.default.getActiveCallsForStop(stopId);
                for (const call of activeCalls) {
                    if (call.routeId === busLocation.routeId) {
                        await this.processCallETA(call, busStop);
                    }
                }
            }
        }
    }
    // 정류장 정보 업데이트 (실제로는 데이터베이스에서 로드)
    updateBusStops(stops) {
        this.busStops.clear();
        for (const stop of stops) {
            this.busStops.set(stop.stopId, stop);
        }
        logger_1.default.info(`Updated ${stops.length} bus stops`);
    }
    // 헬스 체크
    isHealthy() {
        return this.processingInterval !== null && !this.isProcessing;
    }
    // 통계 조회
    async getProcessingStats() {
        let totalCalls = 0;
        let activeStops = 0;
        for (const [stopId] of this.busStops) {
            const calls = await redis_1.default.getActiveCallsForStop(stopId);
            if (calls.length > 0) {
                activeStops++;
                totalCalls += calls.length;
            }
        }
        return {
            activeStops,
            totalCalls,
            isProcessing: this.isProcessing
        };
    }
}
exports.default = new ETAProcessorService();
//# sourceMappingURL=etaProcessor.js.map