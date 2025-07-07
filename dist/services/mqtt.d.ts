import { BusNotification } from '../types';
declare class MQTTService {
    private client;
    private isConnected;
    private readonly topics;
    connect(): Promise<void>;
    private subscribeToTopics;
    private handleMessage;
    private handleButtonPress;
    private handleBusLocation;
    sendNotificationToBus(busId: string, notification: BusNotification): Promise<void>;
    updateButtonLED(stopId: string, routeId: string, status: 'ON' | 'OFF'): Promise<void>;
    broadcastSystemStatus(status: any): Promise<void>;
    disconnect(): Promise<void>;
    isHealthy(): boolean;
}
declare const _default: MQTTService;
export default _default;
//# sourceMappingURL=mqtt.d.ts.map