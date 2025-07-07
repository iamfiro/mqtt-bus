declare class SmartBusStopServer {
    private app;
    private server;
    private io;
    private isShuttingDown;
    constructor();
    private setupMiddleware;
    private setupRoutes;
    private setupWebSocket;
    notifyButtonPress(stopId: string, call: any): void;
    notifyBusLocation(routeId: string, location: any): void;
    notifyETAUpdate(stopId: string, eta: any): void;
    private initializeServices;
    private setupGracefulShutdown;
    start(): Promise<void>;
}
export default SmartBusStopServer;
//# sourceMappingURL=index.d.ts.map