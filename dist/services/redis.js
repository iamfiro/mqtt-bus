"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("redis");
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
class RedisService {
    client;
    isConnected = false;
    constructor() {
        this.client = (0, redis_1.createClient)({
            socket: {
                host: config_1.default.redis.host,
                port: config_1.default.redis.port,
            },
            password: config_1.default.redis.password,
        });
        this.client.on('error', (err) => {
            logger_1.default.error('Redis Client Error:', err);
        });
        this.client.on('connect', () => {
            logger_1.default.info('Connected to Redis');
            this.isConnected = true;
        });
        this.client.on('disconnect', () => {
            logger_1.default.warn('Disconnected from Redis');
            this.isConnected = false;
        });
    }
    async connect() {
        try {
            await this.client.connect();
        }
        catch (error) {
            logger_1.default.error('Failed to connect to Redis:', error);
            throw error;
        }
    }
    async disconnect() {
        if (this.isConnected) {
            await this.client.disconnect();
        }
    }
    // 정류장 버튼 호출 저장
    async saveBusStopCall(call) {
        const key = `call:${call.stopId}:${call.routeId}`;
        const value = JSON.stringify(call);
        await this.client.setEx(key, 3600, value); // 1시간 TTL
        logger_1.default.info(`Bus stop call saved: ${key}`);
    }
    // 정류장 버튼 호출 조회
    async getBusStopCall(stopId, routeId) {
        const key = `call:${stopId}:${routeId}`;
        const value = await this.client.get(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }
    // 정류장의 모든 활성 호출 조회
    async getActiveCallsForStop(stopId) {
        const pattern = `call:${stopId}:*`;
        const keys = await this.client.keys(pattern);
        const calls = [];
        for (const key of keys) {
            const value = await this.client.get(key);
            if (value) {
                const call = JSON.parse(value);
                if (call.isActive) {
                    calls.push(call);
                }
            }
        }
        return calls;
    }
    // 버튼 호출 해제
    async deactivateBusStopCall(stopId, routeId) {
        const key = `call:${stopId}:${routeId}`;
        const value = await this.client.get(key);
        if (value) {
            const call = JSON.parse(value);
            call.isActive = false;
            call.timestamp = new Date();
            await this.client.setEx(key, 300, JSON.stringify(call)); // 5분 TTL로 단축
            logger_1.default.info(`Bus stop call deactivated: ${key}`);
        }
    }
    // 버스 위치 저장
    async saveBusLocation(location) {
        const key = `bus:${location.busId}:location`;
        const value = JSON.stringify(location);
        await this.client.setEx(key, 60, value); // 1분 TTL
        // TimeSeries 형태로도 저장 (최근 30초)
        const timeSeriesKey = `bus:${location.busId}:timeseries`;
        const score = location.timestamp.getTime();
        await this.client.zAdd(timeSeriesKey, {
            score,
            value: JSON.stringify({
                lat: location.latitude,
                lng: location.longitude,
                speed: location.speed,
                heading: location.heading,
            }),
        });
        // 30초 이전 데이터 제거
        const cutoff = Date.now() - 30000;
        await this.client.zRemRangeByScore(timeSeriesKey, 0, cutoff);
        logger_1.default.debug(`Bus location saved: ${location.busId}`);
    }
    // 버스 위치 조회
    async getBusLocation(busId) {
        const key = `bus:${busId}:location`;
        const value = await this.client.get(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }
    // 노선의 모든 버스 위치 조회
    async getBusesForRoute(routeId) {
        const pattern = `bus:*:location`;
        const keys = await this.client.keys(pattern);
        const buses = [];
        for (const key of keys) {
            const value = await this.client.get(key);
            if (value) {
                const location = JSON.parse(value);
                if (location.routeId === routeId) {
                    buses.push(location);
                }
            }
        }
        return buses;
    }
    // ETA 계산 결과 저장
    async saveETACalculation(eta) {
        const key = `eta:${eta.busId}:${eta.stopId}`;
        const value = JSON.stringify(eta);
        await this.client.setEx(key, 300, value); // 5분 TTL
        logger_1.default.debug(`ETA calculation saved: ${key}`);
    }
    // ETA 계산 결과 조회
    async getETACalculation(busId, stopId) {
        const key = `eta:${busId}:${stopId}`;
        const value = await this.client.get(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }
    // 정류장의 모든 ETA 조회
    async getETAsForStop(stopId) {
        const pattern = `eta:*:${stopId}`;
        const keys = await this.client.keys(pattern);
        const etas = [];
        for (const key of keys) {
            const value = await this.client.get(key);
            if (value) {
                etas.push(JSON.parse(value));
            }
        }
        return etas;
    }
    // 알림 중복 체크를 위한 키 설정/조회
    async setNotificationSent(busId, stopId) {
        const key = `notification:${busId}:${stopId}`;
        await this.client.setEx(key, 300, 'sent'); // 5분 TTL
    }
    async isNotificationSent(busId, stopId) {
        const key = `notification:${busId}:${stopId}`;
        const value = await this.client.get(key);
        return value !== null;
    }
    // 헬스 체크
    isHealthy() {
        return this.isConnected;
    }
}
exports.default = new RedisService();
//# sourceMappingURL=redis.js.map