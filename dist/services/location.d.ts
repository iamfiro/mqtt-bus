import { BusLocation, ETACalculation } from '../types';
interface Position {
    latitude: number;
    longitude: number;
}
declare class LocationService {
    private kalmanFilters;
    constructor();
    private createKalmanFilter;
    private initializeKalmanFilter;
    filterLocation(busId: string, rawLocation: Position): Position;
    calculateDistance(point1: Position, point2: Position): number;
    calculateETA(busLocation: BusLocation, stopLocation: Position, averageSpeed?: number): ETACalculation;
    isApproaching(busLocation: BusLocation, stopLocation: Position): boolean;
    hasPassed(busId: string, stopLocation: Position): Promise<boolean>;
    private getRecentPositions;
    calculateAverageSpeed(busId: string, seconds?: number): Promise<number>;
    predictNextStop(busLocation: BusLocation, route: string[]): string | null;
    cleanup(): void;
}
declare const _default: LocationService;
export default _default;
//# sourceMappingURL=location.d.ts.map