import { BusStopCall, BusLocation, ETACalculation } from '../types';
declare class RedisService {
    private client;
    private isConnected;
    constructor();
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    saveBusStopCall(call: BusStopCall): Promise<void>;
    getBusStopCall(stopId: string, routeId: string): Promise<BusStopCall | null>;
    getActiveCallsForStop(stopId: string): Promise<BusStopCall[]>;
    deactivateBusStopCall(stopId: string, routeId: string): Promise<void>;
    saveBusLocation(location: BusLocation): Promise<void>;
    getBusLocation(busId: string): Promise<BusLocation | null>;
    getBusesForRoute(routeId: string): Promise<BusLocation[]>;
    saveETACalculation(eta: ETACalculation): Promise<void>;
    getETACalculation(busId: string, stopId: string): Promise<ETACalculation | null>;
    getETAsForStop(stopId: string): Promise<ETACalculation[]>;
    setNotificationSent(busId: string, stopId: string): Promise<void>;
    isNotificationSent(busId: string, stopId: string): Promise<boolean>;
    clearNotificationSent(busId: string, stopId: string): Promise<void>;
    getAllActiveBuses(): Promise<BusLocation[]>;
    cancelCall(callId: string): Promise<void>;
    isHealthy(): boolean;
}
declare const _default: RedisService;
export default _default;
//# sourceMappingURL=redis.d.ts.map