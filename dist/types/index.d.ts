export interface BusStopCall {
    id: string;
    stopId: string;
    routeId: string;
    routeName: string;
    buttonColor: string;
    timestamp: Date;
    isActive: boolean;
    passengerCount?: number;
}
export interface BusLocation {
    busId: string;
    routeId: string;
    latitude: number;
    longitude: number;
    speed: number;
    heading: number;
    timestamp: Date;
    accuracy?: number;
}
export interface BusStop {
    stopId: string;
    name: string;
    latitude: number;
    longitude: number;
    routes: string[];
}
export interface Route {
    routeId: string;
    routeName: string;
    color: string;
    stops: string[];
}
export interface ETACalculation {
    busId: string;
    stopId: string;
    routeId: string;
    distanceMeters: number;
    estimatedArrivalTime: Date;
    confidence: number;
}
export interface BusNotification {
    busId: string;
    stopId: string;
    routeId: string;
    routeName: string;
    message: string;
    type: 'APPROACHING' | 'ARRIVED' | 'DEPARTED' | 'PASSED';
    timestamp: Date;
}
export interface MQTTMessage {
    type: 'BUTTON_PRESS' | 'BUS_LOCATION' | 'NOTIFICATION';
    payload: BusStopCall | BusLocation | BusNotification;
    timestamp: Date;
}
export interface AppConfig {
    port: number;
    redis: {
        host: string;
        port: number;
        password?: string;
    };
    mqtt: {
        brokerUrl: string;
        username?: string;
        password?: string;
    };
    kafka: {
        brokers: string[];
        clientId: string;
        groupId: string;
    };
    location: {
        distanceThresholdMeters: number;
        etaUpdateIntervalMs: number;
        kalmanFilterNoise: number;
    };
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: Date;
}
//# sourceMappingURL=index.d.ts.map