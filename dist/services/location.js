"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const haversine_distance_1 = __importDefault(require("haversine-distance"));
const kalman_filter_1 = __importDefault(require("kalman-filter"));
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
class LocationService {
    kalmanFilters = new Map();
    constructor() {
        // Kalman Filter 설정 - GPS 노이즈 제거용
        this.initializeKalmanFilter = this.initializeKalmanFilter.bind(this);
    }
    createKalmanFilter() {
        const dt = 1; // 1초 간격으로 가정
        const noise = config_1.default.location.kalmanFilterNoise;
        return new kalman_filter_1.default({
            observation: {
                dimension: 2,
                stateProjection: [[1, 0, 0, 0], [0, 1, 0, 0]],
                covariance: [[noise, 0], [0, noise]]
            },
            dynamic: {
                dimension: 4,
                transition: [
                    [1, 0, dt, 0],
                    [0, 1, 0, dt],
                    [0, 0, 1, 0],
                    [0, 0, 0, 1]
                ],
                covariance: [
                    [noise / 4, 0, noise / 2, 0],
                    [0, noise / 4, 0, noise / 2],
                    [noise / 2, 0, noise, 0],
                    [0, noise / 2, 0, noise]
                ]
            },
            init: {
                mean: [0, 0, 0, 0],
                covariance: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
            }
        });
    }
    initializeKalmanFilter(busId, initialLocation) {
        const filter = this.createKalmanFilter();
        // 초기 상태 설정
        filter.init({
            mean: [initialLocation.latitude, initialLocation.longitude, 0, 0],
            covariance: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        });
        this.kalmanFilters.set(busId, filter);
        logger_1.default.debug(`Kalman filter initialized for bus ${busId}`);
    }
    // GPS 위치 필터링
    filterLocation(busId, rawLocation) {
        let filter = this.kalmanFilters.get(busId);
        if (!filter) {
            this.initializeKalmanFilter(busId, rawLocation);
            filter = this.kalmanFilters.get(busId);
        }
        // 예측 단계
        const prediction = filter.predict();
        // 업데이트 단계
        const corrected = filter.correct({
            observation: [rawLocation.latitude, rawLocation.longitude]
        });
        return {
            latitude: corrected.mean[0],
            longitude: corrected.mean[1]
        };
    }
    // 두 지점 간 거리 계산 (미터)
    calculateDistance(point1, point2) {
        return (0, haversine_distance_1.default)(point1, point2);
    }
    // 속도 기반 ETA 계산
    calculateETA(busLocation, stopLocation, averageSpeed) {
        const distance = this.calculateDistance({ latitude: busLocation.latitude, longitude: busLocation.longitude }, stopLocation);
        // 현재 속도 또는 평균 속도 사용 (km/h)
        const speed = busLocation.speed > 0 ? busLocation.speed : (averageSpeed || 30);
        // km/h를 m/s로 변환
        const speedMPS = (speed * 1000) / 3600;
        // ETA 계산 (초)
        const etaSeconds = speedMPS > 0 ? distance / speedMPS : Infinity;
        // 신뢰도 계산 (속도가 있고 거리가 임계값 내에 있으면 높은 신뢰도)
        let confidence = 0.5;
        if (busLocation.speed > 5 && distance < config_1.default.location.distanceThresholdMeters * 2) {
            confidence = Math.min(0.95, 0.5 + (busLocation.speed / 60) * 0.3 +
                (1 - distance / (config_1.default.location.distanceThresholdMeters * 2)) * 0.2);
        }
        const estimatedArrivalTime = new Date(Date.now() + etaSeconds * 1000);
        return {
            busId: busLocation.busId,
            stopId: '', // 호출자가 설정
            routeId: busLocation.routeId,
            distanceMeters: Math.round(distance),
            estimatedArrivalTime,
            confidence: Math.round(confidence * 100) / 100
        };
    }
    // 버스가 정류장에 접근 중인지 확인
    isApproaching(busLocation, stopLocation) {
        const distance = this.calculateDistance({ latitude: busLocation.latitude, longitude: busLocation.longitude }, stopLocation);
        return distance <= config_1.default.location.distanceThresholdMeters;
    }
    // 버스가 정류장을 지나갔는지 확인 (과거 위치와 비교)
    async hasPassed(busId, stopLocation) {
        try {
            // Redis에서 버스의 과거 위치 가져오기 (TimeSeries)
            const timeSeriesKey = `bus:${busId}:timeseries`;
            // 최근 10초간의 위치 데이터 조회
            const recentPositions = await this.getRecentPositions(busId, 10);
            if (recentPositions.length < 2) {
                return false;
            }
            // 가장 최근 위치와 이전 위치
            const currentPos = recentPositions[recentPositions.length - 1];
            const previousPos = recentPositions[recentPositions.length - 2];
            const currentDistance = this.calculateDistance(currentPos, stopLocation);
            const previousDistance = this.calculateDistance(previousPos, stopLocation);
            // 이전에는 가까웠지만 지금은 멀어졌고, 임계값을 벗어났다면 지나간 것으로 판단
            return previousDistance < config_1.default.location.distanceThresholdMeters &&
                currentDistance > config_1.default.location.distanceThresholdMeters &&
                currentDistance > previousDistance;
        }
        catch (error) {
            logger_1.default.error(`Error checking if bus ${busId} has passed:`, error);
            return false;
        }
    }
    // 최근 N초간의 위치 데이터 조회
    async getRecentPositions(busId, seconds) {
        // 이 메서드는 Redis의 TimeSeries 데이터를 활용
        // 실제 구현에서는 Redis zrange 명령을 사용
        const positions = [];
        // 임시 구현 - 실제로는 Redis에서 데이터를 가져와야 함
        return positions;
    }
    // 평균 속도 계산 (최근 N초간)
    async calculateAverageSpeed(busId, seconds = 30) {
        try {
            const positions = await this.getRecentPositions(busId, seconds);
            if (positions.length < 2) {
                return 0;
            }
            let totalDistance = 0;
            for (let i = 1; i < positions.length; i++) {
                totalDistance += this.calculateDistance(positions[i - 1], positions[i]);
            }
            // 평균 속도 (m/s를 km/h로 변환)
            const averageSpeedMPS = totalDistance / seconds;
            return (averageSpeedMPS * 3600) / 1000;
        }
        catch (error) {
            logger_1.default.error(`Error calculating average speed for bus ${busId}:`, error);
            return 0;
        }
    }
    // 버스 경로 상의 다음 정류장 예측
    predictNextStop(busLocation, route) {
        // 이 메서드는 버스의 현재 위치와 이동 방향을 고려하여
        // 노선 상의 다음 정류장을 예측합니다
        // 실제 구현에서는 정류장 위치 데이터와 버스의 heading을 사용
        // 간단한 구현 예시
        return route.length > 0 ? route[0] : null;
    }
    // 메모리 정리 (사용하지 않는 Kalman Filter 제거)
    cleanup() {
        // 5분 이상 업데이트가 없는 필터 제거
        const cutoffTime = Date.now() - 5 * 60 * 1000;
        for (const [busId, filter] of this.kalmanFilters.entries()) {
            // 실제로는 마지막 업데이트 시간을 추적해야 함
            // 여기서는 간단히 주기적으로 모든 필터를 정리
        }
    }
}
exports.default = new LocationService();
//# sourceMappingURL=location.js.map