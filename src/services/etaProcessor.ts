import config from '../config';
import logger from '../utils/logger';
import { BusLocation, BusStop, BusStopCall, BusNotification, ETACalculation } from '../types';
import redisService from './redis';
import mqttService from './mqtt';
import locationService from './location';

interface BusStopRegion {
  regionId: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  stops: BusStop[];
}

interface ProcessingStats {
  totalBuses: number;
  totalStops: number;
  activeCallsProcessed: number;
  etaCalculationsPerformed: number;
  processingTimeMs: number;
  lastProcessedAt: Date;
}

class ETAProcessorService {
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private processingStats: ProcessingStats = {
    totalBuses: 0,
    totalStops: 0,
    activeCallsProcessed: 0,
    etaCalculationsPerformed: 0,
    processingTimeMs: 0,
    lastProcessedAt: new Date()
  };

  // 지역별 정류장 클러스터 (대규모 처리를 위한 지역 분할)
  private busStopRegions: Map<string, BusStopRegion> = new Map();
  
  // 활성 버스 캐시 (성능 최적화)
  private activeBusCache: Map<string, BusLocation[]> = new Map();
  private busLocationCache: Map<string, BusLocation> = new Map();
  private cacheUpdateTime = 0;
  private readonly CACHE_TTL_MS = 5000; // 5초 캐시

  constructor() {
    this.initializeRegionalData();
  }

  private initializeRegionalData(): void {
    // 서울 주요 지역별 정류장 클러스터 (실제로는 데이터베이스에서 로드)
    const regions: BusStopRegion[] = [
      {
        regionId: 'REGION_GANGNAM',
        centerLat: 37.4979,
        centerLng: 127.0276,
        radiusKm: 3.0,
        stops: this.generateBusStopsForRegion('GANGNAM', 37.4979, 127.0276, 25)
      },
      {
        regionId: 'REGION_JONGNO',
        centerLat: 37.5665,
        centerLng: 126.9780,
        radiusKm: 2.5,
        stops: this.generateBusStopsForRegion('JONGNO', 37.5665, 126.9780, 20)
      },
      {
        regionId: 'REGION_HONGDAE',
        centerLat: 37.5563,
        centerLng: 126.9215,
        radiusKm: 2.0,
        stops: this.generateBusStopsForRegion('HONGDAE', 37.5563, 126.9215, 15)
      },
      {
        regionId: 'REGION_YEOUIDO',
        centerLat: 37.5219,
        centerLng: 126.9244,
        radiusKm: 2.5,
        stops: this.generateBusStopsForRegion('YEOUIDO', 37.5219, 126.9244, 18)
      },
      {
        regionId: 'REGION_ITAEWON',
        centerLat: 37.5349,
        centerLng: 126.9944,
        radiusKm: 1.8,
        stops: this.generateBusStopsForRegion('ITAEWON', 37.5349, 126.9944, 12)
      }
    ];

    for (const region of regions) {
      this.busStopRegions.set(region.regionId, region);
    }

    const totalStops = regions.reduce((sum, region) => sum + region.stops.length, 0);
    logger.info(`Initialized ${regions.length} regions with ${totalStops} bus stops`);
  }

  private generateBusStopsForRegion(regionName: string, centerLat: number, centerLng: number, count: number): BusStop[] {
    const stops: BusStop[] = [];
    const routeTemplates = ['BUS001', 'BUS002', 'BUS003', 'BUS004', 'BUS005', 'BUS006', 'BUS007', 'BUS008'];
    
    for (let i = 1; i <= count; i++) {
      // 중심점 주변에 랜덤하게 분포
      const latOffset = (Math.random() - 0.5) * 0.02; // 약 ±1km
      const lngOffset = (Math.random() - 0.5) * 0.02;
      
      // 각 정류장마다 2-4개의 노선이 지나감
      const numRoutes = Math.floor(Math.random() * 3) + 2;
      const selectedRoutes = routeTemplates
        .sort(() => Math.random() - 0.5)
        .slice(0, numRoutes);

      stops.push({
        stopId: `STOP_${regionName}_${i.toString().padStart(3, '0')}`,
        name: `${regionName} ${i}번 정류장`,
        latitude: centerLat + latOffset,
        longitude: centerLng + lngOffset,
        routes: selectedRoutes
      });
    }
    
    return stops;
  }

  async startProcessing(): Promise<void> {
    if (this.processingInterval) {
      logger.warn('ETA processing already started');
      return;
    }

    logger.info('Starting large-scale ETA processing...');
    logger.info(`Total regions: ${this.busStopRegions.size}`);
    
    this.processingInterval = setInterval(
      this.processETACalculations.bind(this),
      config.location.etaUpdateIntervalMs
    );

    // 즉시 한 번 실행
    await this.processETACalculations();
  }

  async stopProcessing(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('ETA processing stopped');
    }
  }

  private async processETACalculations(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('ETA processing already in progress, skipping...');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      // 캐시 업데이트
      await this.updateActiveBusCache();

      // 통계 초기화
      this.processingStats.activeCallsProcessed = 0;
      this.processingStats.etaCalculationsPerformed = 0;

      // 병렬로 모든 지역 처리
      const regionPromises = Array.from(this.busStopRegions.values()).map(region => 
        this.processRegionETAs(region)
      );

      await Promise.all(regionPromises);

      // 통계 업데이트
      this.processingStats.processingTimeMs = Date.now() - startTime;
      this.processingStats.lastProcessedAt = new Date();
      this.processingStats.totalBuses = this.busLocationCache.size;
      this.processingStats.totalStops = Array.from(this.busStopRegions.values())
        .reduce((sum, region) => sum + region.stops.length, 0);

      logger.info(`ETA processing completed: ${this.processingStats.activeCallsProcessed} calls, ` +
                 `${this.processingStats.etaCalculationsPerformed} calculations in ${this.processingStats.processingTimeMs}ms`);

    } catch (error) {
      logger.error('Error in large-scale ETA processing:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async updateActiveBusCache(): Promise<void> {
    const now = Date.now();
    
    // 캐시가 유효하면 업데이트 스프리트
    if (now - this.cacheUpdateTime < this.CACHE_TTL_MS) {
      return;
    }

    try {
      // 모든 활성 버스 위치 조회
      const allBuses = await redisService.getAllActiveBuses();
      
      // 버스 위치 캐시 업데이트
      this.busLocationCache.clear();
      for (const bus of allBuses) {
        this.busLocationCache.set(bus.busId, bus);
      }

      // 노선별 버스 그룹핑
      this.activeBusCache.clear();
      for (const bus of allBuses) {
        if (!this.activeBusCache.has(bus.routeId)) {
          this.activeBusCache.set(bus.routeId, []);
        }
        this.activeBusCache.get(bus.routeId)!.push(bus);
      }

      this.cacheUpdateTime = now;
      logger.debug(`Bus cache updated: ${allBuses.length} active buses across ${this.activeBusCache.size} routes`);

    } catch (error) {
      logger.error('Error updating bus cache:', error);
    }
  }

  private async processRegionETAs(region: BusStopRegion): Promise<void> {
    try {
      // 지역 내 모든 정류장을 병렬로 처리
      const stopPromises = region.stops.map(stop => this.processStopETAs(stop.stopId, stop));
      await Promise.all(stopPromises);

    } catch (error) {
      logger.error(`Error processing region ${region.regionId}:`, error);
    }
  }

  private async processStopETAs(stopId: string, busStop: BusStop): Promise<void> {
    try {
      // 해당 정류장의 활성 호출 조회
      const activeCalls = await redisService.getActiveCallsForStop(stopId);
      
      if (activeCalls.length === 0) {
        return;
      }

      // 각 호출을 병렬로 처리
      const callPromises = activeCalls.map(call => this.processCallETA(call, busStop));
      await Promise.all(callPromises);

      this.processingStats.activeCallsProcessed += activeCalls.length;

    } catch (error) {
      logger.error(`Error processing stop ${stopId}:`, error);
    }
  }

  private async processCallETA(call: BusStopCall, busStop: BusStop): Promise<void> {
    try {
      // 캐시에서 해당 노선의 버스들 조회
      const buses = this.activeBusCache.get(call.routeId) || [];
      
      if (buses.length === 0) {
        logger.debug(`No active buses found for route ${call.routeId}`);
        return;
      }

      // 정류장과 가까운 버스들만 필터링 (10km 이내)
      const nearbyBuses = buses.filter(bus => {
        const distance = locationService.calculateDistance(
          { latitude: bus.latitude, longitude: bus.longitude },
          { latitude: busStop.latitude, longitude: busStop.longitude }
        );
        return distance <= 10000; // 10km
      });

      if (nearbyBuses.length === 0) {
        return;
      }

      // 모든 근처 버스에 대해 ETA 계산 (병렬 처리)
      const etaPromises = nearbyBuses.map(async (bus) => {
        const eta = locationService.calculateETA(
          bus,
          { latitude: busStop.latitude, longitude: busStop.longitude }
        );
        eta.stopId = busStop.stopId;

        // ETA 결과 저장
        await redisService.saveETACalculation(eta);
        this.processingStats.etaCalculationsPerformed++;

        return { bus, eta };
      });

      const results = await Promise.all(etaPromises);

      // 가장 가까운 버스 찾기
      const closest = results.reduce((closest, current) => 
        !closest || current.eta.distanceMeters < closest.eta.distanceMeters ? current : closest
      );

      if (closest) {
        await this.handleBusApproach(closest.bus, closest.eta, call, busStop);
      }

    } catch (error) {
      logger.error(`Error processing call ETA for ${call.id}:`, error);
    }
  }

  private async handleBusApproach(
    bus: BusLocation,
    eta: ETACalculation,
    call: BusStopCall,
    busStop: BusStop
  ): Promise<void> {
    const isApproaching = locationService.isApproaching(
      bus,
      { latitude: busStop.latitude, longitude: busStop.longitude }
    );

    const hasPassed = await locationService.hasPassed(
      bus.busId,
      { latitude: busStop.latitude, longitude: busStop.longitude }
    );

    if (hasPassed) {
      await this.handleBusPassed(bus, call, busStop);
    } else if (isApproaching) {
      await this.handleBusApproaching(bus, eta, call, busStop);
    }
  }

  private async handleBusApproaching(
    bus: BusLocation,
    eta: ETACalculation,
    call: BusStopCall,
    busStop: BusStop
  ): Promise<void> {
    // 중복 알림 방지
    const alreadyNotified = await redisService.isNotificationSent(bus.busId, busStop.stopId);
    if (alreadyNotified) {
      return;
    }

    // 버스에게 알림 전송
    const notification: BusNotification = {
      busId: bus.busId,
      stopId: busStop.stopId,
      routeId: call.routeId,
      routeName: call.routeName,
      message: `정류장 "${busStop.name}"에서 ${call.routeName} 노선 승차 요청이 있습니다.`,
      type: 'APPROACHING',
      timestamp: new Date()
    };

    await mqttService.sendNotificationToBus(bus.busId, notification);
    await redisService.setNotificationSent(bus.busId, busStop.stopId);

    logger.info(`Approaching notification sent to bus ${bus.busId} for stop ${busStop.stopId}`);
  }

  private async handleBusPassed(
    bus: BusLocation,
    call: BusStopCall,
    busStop: BusStop
  ): Promise<void> {
    // 버튼 호출 해제
    await redisService.cancelCall(call.id);

    // 버스에게 LED 끄기 알림
    const notification: BusNotification = {
      busId: bus.busId,
      stopId: busStop.stopId,
      routeId: call.routeId,
      routeName: call.routeName,
      message: `정류장 "${busStop.name}" 통과 완료. LED를 끄십시오.`,
      type: 'PASSED',
      timestamp: new Date()
    };

    await mqttService.sendNotificationToBus(bus.busId, notification);
    await redisService.clearNotificationSent(bus.busId, busStop.stopId);

    logger.info(`Bus ${bus.busId} passed stop ${busStop.stopId}, call cancelled`);
  }

  // 버스 위치 업데이트 이벤트 핸들러 (개선된 버전)
  async onBusLocationUpdate(busLocation: BusLocation): Promise<void> {
    try {
      // 위치 필터링 (Kalman Filter 적용)
      const filteredLocation = locationService.filterLocation(
        busLocation.busId,
        { latitude: busLocation.latitude, longitude: busLocation.longitude }
      );

      const updatedLocation: BusLocation = {
        ...busLocation,
        latitude: filteredLocation.latitude,
        longitude: filteredLocation.longitude
      };

      // Redis에 저장
      await redisService.saveBusLocation(updatedLocation);

      // 캐시 업데이트
      this.busLocationCache.set(updatedLocation.busId, updatedLocation);

      // 해당 버스가 지나는 지역에 대해서만 즉시 ETA 처리
      await this.processImmediateETAForBus(updatedLocation);

    } catch (error) {
      logger.error(`Error handling bus location update for ${busLocation.busId}:`, error);
    }
  }

  private async processImmediateETAForBus(busLocation: BusLocation): Promise<void> {
    // 버스 위치 기준으로 근처 지역 찾기
    const nearbyRegions = this.findNearbyRegions(busLocation.latitude, busLocation.longitude, 5); // 5km 반경

    for (const region of nearbyRegions) {
      // 해당 지역의 정류장 중 버스 노선이 지나는 곳만 처리
      const relevantStops = region.stops.filter(stop => stop.routes.includes(busLocation.routeId));
      
      for (const stop of relevantStops) {
        const activeCalls = await redisService.getActiveCallsForStop(stop.stopId);
        const relevantCalls = activeCalls.filter(call => call.routeId === busLocation.routeId);
        
        for (const call of relevantCalls) {
          await this.processCallETA(call, stop);
        }
      }
    }
  }

  private findNearbyRegions(latitude: number, longitude: number, radiusKm: number): BusStopRegion[] {
    const nearbyRegions: BusStopRegion[] = [];

    for (const region of this.busStopRegions.values()) {
      const distance = locationService.calculateDistance(
        { latitude, longitude },
        { latitude: region.centerLat, longitude: region.centerLng }
      ) / 1000; // 미터를 킬로미터로 변환

      if (distance <= radiusKm + region.radiusKm) {
        nearbyRegions.push(region);
      }
    }

    return nearbyRegions;
  }

  // 시스템 통계 조회
  getProcessingStats(): ProcessingStats {
    return { ...this.processingStats };
  }

  // 지역별 정류장 정보 조회
  getRegionInfo(): { regionId: string, stopCount: number, centerLat: number, centerLng: number }[] {
    return Array.from(this.busStopRegions.values()).map(region => ({
      regionId: region.regionId,
      stopCount: region.stops.length,
      centerLat: region.centerLat,
      centerLng: region.centerLng
    }));
  }

  // 모든 정류장 정보 조회 (페이징 지원)
  getAllBusStops(page: number = 1, limit: number = 50): { stops: BusStop[], total: number, page: number, totalPages: number } {
    const allStops: BusStop[] = [];
    for (const region of this.busStopRegions.values()) {
      allStops.push(...region.stops);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedStops = allStops.slice(startIndex, endIndex);

    return {
      stops: paginatedStops,
      total: allStops.length,
      page,
      totalPages: Math.ceil(allStops.length / limit)
    };
  }

  // 특정 지역의 정류장 정보 조회
  getStopsInRegion(regionId: string): BusStop[] {
    const region = this.busStopRegions.get(regionId);
    return region ? region.stops : [];
  }

  // 헬스 체크
  isHealthy(): boolean {
    return this.processingInterval !== null && 
           this.busStopRegions.size > 0 &&
           Date.now() - this.processingStats.lastProcessedAt.getTime() < 60000; // 1분 이내 처리됨
  }
}

export default new ETAProcessorService(); 