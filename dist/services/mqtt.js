"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt_1 = __importDefault(require("mqtt"));
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
const redis_1 = __importDefault(require("./redis"));
const etaProcessor_1 = __importDefault(require("./etaProcessor"));
class MQTTService {
    client = null;
    isConnected = false;
    // MQTT 토픽 정의
    topics = {
        // 정류장 버튼 호출
        buttonPress: 'bus-stop/+/button/+', // bus-stop/{stopId}/button/{routeId}
        // 버스 위치 업데이트
        busLocation: 'bus/+/location', // bus/{busId}/location
        // 버스 알림
        busNotification: 'bus/+/notification', // bus/{busId}/notification
        // 시스템 상태
        systemStatus: 'system/status',
    };
    async connect() {
        try {
            this.client = mqtt_1.default.connect(config_1.default.mqtt.brokerUrl, {
                username: config_1.default.mqtt.username,
                password: config_1.default.mqtt.password,
                clientId: `smart-bus-stop-server-${Date.now()}`,
                clean: true,
                reconnectPeriod: 1000,
                keepalive: 60,
            });
            this.client.on('connect', () => {
                logger_1.default.info('Connected to MQTT broker');
                this.isConnected = true;
                this.subscribeToTopics();
            });
            this.client.on('error', (error) => {
                logger_1.default.error('MQTT connection error:', error);
                this.isConnected = false;
            });
            this.client.on('disconnect', () => {
                logger_1.default.warn('Disconnected from MQTT broker');
                this.isConnected = false;
            });
            this.client.on('message', this.handleMessage.bind(this));
        }
        catch (error) {
            logger_1.default.error('Failed to connect to MQTT broker:', error);
            throw error;
        }
    }
    async subscribeToTopics() {
        if (!this.client)
            return;
        const subscriptions = [
            this.topics.buttonPress,
            this.topics.busLocation,
        ];
        for (const topic of subscriptions) {
            this.client.subscribe(topic, (err) => {
                if (err) {
                    logger_1.default.error(`Failed to subscribe to ${topic}:`, err);
                }
                else {
                    logger_1.default.info(`Subscribed to ${topic}`);
                }
            });
        }
    }
    async handleMessage(topic, message) {
        try {
            const payload = JSON.parse(message.toString());
            logger_1.default.debug(`Received MQTT message on ${topic}:`, payload);
            if (topic.includes('/button/')) {
                await this.handleButtonPress(topic, payload);
            }
            else if (topic.includes('/location')) {
                await this.handleBusLocation(topic, payload);
            }
        }
        catch (error) {
            logger_1.default.error(`Error handling MQTT message on ${topic}:`, error);
        }
    }
    async handleButtonPress(topic, payload) {
        // 토픽에서 stopId와 routeId 추출: bus-stop/{stopId}/button/{routeId}
        const parts = topic.split('/');
        const stopId = parts[1];
        const routeId = parts[3];
        const busStopCall = {
            id: `${stopId}-${routeId}-${Date.now()}`,
            stopId,
            routeId,
            routeName: payload.routeName || routeId,
            buttonColor: payload.buttonColor || '#FF0000',
            timestamp: new Date(),
            isActive: true,
            passengerCount: payload.passengerCount || 1,
        };
        // Redis에 호출 저장
        await redis_1.default.saveBusStopCall(busStopCall);
        logger_1.default.info(`Button pressed at stop ${stopId} for route ${routeId}`);
        // 웹소켓을 통해 실시간 알림 (나중에 구현)
        // await this.notifyWebSocketClients(busStopCall);
    }
    async handleBusLocation(topic, payload) {
        // 토픽에서 busId 추출: bus/{busId}/location
        const parts = topic.split('/');
        const busId = parts[1];
        const busLocation = {
            busId,
            routeId: payload.routeId,
            latitude: payload.latitude || payload.lat,
            longitude: payload.longitude || payload.lng,
            speed: payload.speed || 0,
            heading: payload.heading || 0,
            timestamp: new Date(payload.timestamp || Date.now()),
            accuracy: payload.accuracy,
        };
        // Redis에 위치 저장
        await redis_1.default.saveBusLocation(busLocation);
        logger_1.default.debug(`Bus location updated: ${busId} at (${busLocation.latitude}, ${busLocation.longitude})`);
        // ETA 프로세서에 위치 업데이트 알림 (대규모 처리)
        await etaProcessor_1.default.onBusLocationUpdate(busLocation);
    }
    // 버스에게 알림 전송
    async sendNotificationToBus(busId, notification) {
        if (!this.client || !this.isConnected) {
            logger_1.default.error('MQTT client not connected');
            return;
        }
        const topic = `bus/${busId}/notification`;
        const message = JSON.stringify(notification);
        this.client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) {
                logger_1.default.error(`Failed to send notification to bus ${busId}:`, err);
            }
            else {
                logger_1.default.info(`Notification sent to bus ${busId}: ${notification.type}`);
            }
        });
    }
    // 정류장 버튼 LED 상태 업데이트
    async updateButtonLED(stopId, routeId, status) {
        if (!this.client || !this.isConnected) {
            logger_1.default.error('MQTT client not connected');
            return;
        }
        const topic = `bus-stop/${stopId}/led/${routeId}`;
        const message = JSON.stringify({ status, timestamp: new Date() });
        this.client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) {
                logger_1.default.error(`Failed to update LED for stop ${stopId}, route ${routeId}:`, err);
            }
            else {
                logger_1.default.info(`LED updated for stop ${stopId}, route ${routeId}: ${status}`);
            }
        });
    }
    // 시스템 상태 브로드캐스트
    async broadcastSystemStatus(status) {
        if (!this.client || !this.isConnected) {
            return;
        }
        const message = JSON.stringify({
            ...status,
            timestamp: new Date(),
        });
        this.client.publish(this.topics.systemStatus, message, { qos: 0 });
    }
    async disconnect() {
        if (this.client) {
            this.client.end();
            this.isConnected = false;
            logger_1.default.info('Disconnected from MQTT broker');
        }
    }
    isHealthy() {
        return this.isConnected;
    }
}
exports.default = new MQTTService();
//# sourceMappingURL=mqtt.js.map