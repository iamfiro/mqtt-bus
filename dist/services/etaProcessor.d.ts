import { BusLocation, BusStop } from '../types';
declare class ETAProcessorService {
    private processingInterval;
    private isProcessing;
    private busStops;
    startProcessing(): Promise<void>;
    stopProcessing(): Promise<void>;
    private processETACalculations;
    private processStopETAs;
    private processCallETA;
    private handleBusApproach;
    private handleBusApproaching;
    private handleBusPassed;
    onBusLocationUpdate(busLocation: BusLocation): Promise<void>;
    private processImmediateETA;
    updateBusStops(stops: BusStop[]): void;
    isHealthy(): boolean;
    getProcessingStats(): Promise<{
        activeStops: number;
        totalCalls: number;
        isProcessing: boolean;
    }>;
}
declare const _default: ETAProcessorService;
export default _default;
//# sourceMappingURL=etaProcessor.d.ts.map