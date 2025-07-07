import { BusLocation, BusStop } from '../types';
interface ProcessingStats {
    totalBuses: number;
    totalStops: number;
    activeCallsProcessed: number;
    etaCalculationsPerformed: number;
    processingTimeMs: number;
    lastProcessedAt: Date;
}
declare class ETAProcessorService {
    private processingInterval;
    private isProcessing;
    private processingStats;
    private busStopRegions;
    private activeBusCache;
    private busLocationCache;
    private cacheUpdateTime;
    private readonly CACHE_TTL_MS;
    constructor();
    private initializeRegionalData;
    private generateBusStopsForRegion;
    startProcessing(): Promise<void>;
    stopProcessing(): Promise<void>;
    private processETACalculations;
    private updateActiveBusCache;
    private processRegionETAs;
    private processStopETAs;
    private processCallETA;
    private handleBusApproach;
    private handleBusApproaching;
    private handleBusPassed;
    onBusLocationUpdate(busLocation: BusLocation): Promise<void>;
    private processImmediateETAForBus;
    private findNearbyRegions;
    getProcessingStats(): ProcessingStats;
    getRegionInfo(): {
        regionId: string;
        stopCount: number;
        centerLat: number;
        centerLng: number;
    }[];
    getAllBusStops(page?: number, limit?: number): {
        stops: BusStop[];
        total: number;
        page: number;
        totalPages: number;
    };
    getStopsInRegion(regionId: string): BusStop[];
    isHealthy(): boolean;
}
declare const _default: ETAProcessorService;
export default _default;
//# sourceMappingURL=etaProcessor.d.ts.map