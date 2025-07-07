import { createClient, RedisClientType } from 'redis';
import config from '../config';
import logger from '../utils/logger';
import { BusStopCall, BusLocation, ETACalculation } from '../types';

class RedisService {
  private client: RedisClientType;
  private isConnected = false;

  constructor() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      logger.info('Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Disconnected from Redis');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  // 정류장 버튼 호출 저장
  async saveBusStopCall(call: BusStopCall): Promise<void> {
    const key = `call:${call.stopId}:${call.routeId}`;
    const value = JSON.stringify(call);
    
    await this.client.setEx(key, 3600, value); // 1시간 TTL
    logger.info(`Bus stop call saved: ${key}`);
  }

  // 정류장 버튼 호출 조회
  async getBusStopCall(stopId: string, routeId: string): Promise<BusStopCall | null> {
    const key = `call:${stopId}:${routeId}`;
    const value = await this.client.get(key);
    
    if (!value) {
      return null;
    }
    
    return JSON.parse(value) as BusStopCall;
  }

  // 정류장의 모든 활성 호출 조회
  async getActiveCallsForStop(stopId: string): Promise<BusStopCall[]> {
    const pattern = `call:${stopId}:*`;
    const keys = await this.client.keys(pattern);
    
    const calls: BusStopCall[] = [];
    for (const key of keys) {
      const value = await this.client.get(key);
      if (value) {
        const call = JSON.parse(value) as BusStopCall;
        if (call.isActive) {
          calls.push(call);
        }
      }
    }
    
    return calls;
  }

  // 버튼 호출 해제
  async deactivateBusStopCall(stopId: string, routeId: string): Promise<void> {
    const key = `call:${stopId}:${routeId}`;
    const value = await this.client.get(key);
    
    if (value) {
      const call = JSON.parse(value) as BusStopCall;
      call.isActive = false;
      call.timestamp = new Date();
      
      await this.client.setEx(key, 300, JSON.stringify(call)); // 5분 TTL로 단축
      logger.info(`Bus stop call deactivated: ${key}`);
    }
  }

  // 버스 위치 저장
  async saveBusLocation(location: BusLocation): Promise<void> {
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
    
    logger.debug(`Bus location saved: ${location.busId}`);
  }

  // 버스 위치 조회
  async getBusLocation(busId: string): Promise<BusLocation | null> {
    const key = `bus:${busId}:location`;
    const value = await this.client.get(key);
    
    if (!value) {
      return null;
    }
    
    return JSON.parse(value) as BusLocation;
  }

  // 노선의 모든 버스 위치 조회
  async getBusesForRoute(routeId: string): Promise<BusLocation[]> {
    const pattern = `bus:*:location`;
    const keys = await this.client.keys(pattern);
    
    const buses: BusLocation[] = [];
    for (const key of keys) {
      const value = await this.client.get(key);
      if (value) {
        const location = JSON.parse(value) as BusLocation;
        if (location.routeId === routeId) {
          buses.push(location);
        }
      }
    }
    
    return buses;
  }

  // ETA 계산 결과 저장
  async saveETACalculation(eta: ETACalculation): Promise<void> {
    const key = `eta:${eta.busId}:${eta.stopId}`;
    const value = JSON.stringify(eta);
    
    await this.client.setEx(key, 300, value); // 5분 TTL
    logger.debug(`ETA calculation saved: ${key}`);
  }

  // ETA 계산 결과 조회
  async getETACalculation(busId: string, stopId: string): Promise<ETACalculation | null> {
    const key = `eta:${busId}:${stopId}`;
    const value = await this.client.get(key);
    
    if (!value) {
      return null;
    }
    
    return JSON.parse(value) as ETACalculation;
  }

  // 정류장의 모든 ETA 조회
  async getETAsForStop(stopId: string): Promise<ETACalculation[]> {
    const pattern = `eta:*:${stopId}`;
    const keys = await this.client.keys(pattern);
    
    const etas: ETACalculation[] = [];
    for (const key of keys) {
      const value = await this.client.get(key);
      if (value) {
        etas.push(JSON.parse(value) as ETACalculation);
      }
    }
    
    return etas;
  }

  // 알림 중복 체크를 위한 키 설정/조회
  async setNotificationSent(busId: string, stopId: string): Promise<void> {
    const key = `notification:${busId}:${stopId}`;
    await this.client.setEx(key, 300, 'sent'); // 5분 TTL
  }

  async isNotificationSent(busId: string, stopId: string): Promise<boolean> {
    const key = `notification:${busId}:${stopId}`;
    const value = await this.client.get(key);
    return value !== null;
  }

  // 헬스 체크
  isHealthy(): boolean {
    return this.isConnected;
  }
}

export default new RedisService(); 