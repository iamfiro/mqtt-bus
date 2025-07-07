import mqtt, { MqttClient } from 'mqtt';
import config from '../config';
import logger from '../utils/logger';
import { MQTTMessage, BusStopCall, BusLocation, BusNotification } from '../types';
import redisService from './redis';
import etaProcessorService from './etaProcessor';

class MQTTService {
  private client: MqttClient | null = null;
  private isConnected = false;

  // MQTT 토픽 정의
  private readonly topics = {
    // 정류장 버튼 호출
    buttonPress: 'bus-stop/+/button/+', // bus-stop/{stopId}/button/{routeId}
    
    // 버스 위치 업데이트
    busLocation: 'bus/+/location', // bus/{busId}/location
    
    // 버스 알림
    busNotification: 'bus/+/notification', // bus/{busId}/notification
    
    // 시스템 상태
    systemStatus: 'system/status',
  };

  async connect(): Promise<void> {
    try {
      this.client = mqtt.connect(config.mqtt.brokerUrl, {
        username: config.mqtt.username,
        password: config.mqtt.password,
        clientId: `smart-bus-stop-server-${Date.now()}`,
        clean: true,
        reconnectPeriod: 1000,
        keepalive: 60,
      });

      this.client.on('connect', () => {
        logger.info('Connected to MQTT broker');
        this.isConnected = true;
        this.subscribeToTopics();
      });

      this.client.on('error', (error) => {
        logger.error('MQTT connection error:', error);
        this.isConnected = false;
      });

      this.client.on('disconnect', () => {
        logger.warn('Disconnected from MQTT broker');
        this.isConnected = false;
      });

      this.client.on('message', this.handleMessage.bind(this));

    } catch (error) {
      logger.error('Failed to connect to MQTT broker:', error);
      throw error;
    }
  }

  private async subscribeToTopics(): Promise<void> {
    if (!this.client) return;

    const subscriptions = [
      this.topics.buttonPress,
      this.topics.busLocation,
    ];

    for (const topic of subscriptions) {
      this.client.subscribe(topic, (err) => {
        if (err) {
          logger.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          logger.info(`Subscribed to ${topic}`);
        }
      });
    }
  }

  private async handleMessage(topic: string, message: Buffer): Promise<void> {
    try {
      const payload = JSON.parse(message.toString());
      logger.debug(`Received MQTT message on ${topic}:`, payload);

      if (topic.includes('/button/')) {
        await this.handleButtonPress(topic, payload);
      } else if (topic.includes('/location')) {
        await this.handleBusLocation(topic, payload);
      }

    } catch (error) {
      logger.error(`Error handling MQTT message on ${topic}:`, error);
    }
  }

  private async handleButtonPress(topic: string, payload: any): Promise<void> {
    // 토픽에서 stopId와 routeId 추출: bus-stop/{stopId}/button/{routeId}
    const parts = topic.split('/');
    const stopId = parts[1];
    const routeId = parts[3];

    const busStopCall: BusStopCall = {
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
    await redisService.saveBusStopCall(busStopCall);

    logger.info(`Button pressed at stop ${stopId} for route ${routeId}`);

    // 웹소켓을 통해 실시간 알림 (나중에 구현)
    // await this.notifyWebSocketClients(busStopCall);
  }

  private async handleBusLocation(topic: string, payload: any): Promise<void> {
    // 토픽에서 busId 추출: bus/{busId}/location
    const parts = topic.split('/');
    const busId = parts[1];

    const busLocation: BusLocation = {
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
    await redisService.saveBusLocation(busLocation);

    logger.debug(`Bus location updated: ${busId} at (${busLocation.latitude}, ${busLocation.longitude})`);

    // ETA 프로세서에 위치 업데이트 알림 (대규모 처리)
    await etaProcessorService.onBusLocationUpdate(busLocation);
  }

  // 버스에게 알림 전송
  async sendNotificationToBus(busId: string, notification: BusNotification): Promise<void> {
    if (!this.client || !this.isConnected) {
      logger.error('MQTT client not connected');
      return;
    }

    const topic = `bus/${busId}/notification`;
    const message = JSON.stringify(notification);

    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`Failed to send notification to bus ${busId}:`, err);
      } else {
        logger.info(`Notification sent to bus ${busId}: ${notification.type}`);
      }
    });
  }

  // 정류장 버튼 LED 상태 업데이트
  async updateButtonLED(stopId: string, routeId: string, status: 'ON' | 'OFF'): Promise<void> {
    if (!this.client || !this.isConnected) {
      logger.error('MQTT client not connected');
      return;
    }

    const topic = `bus-stop/${stopId}/led/${routeId}`;
    const message = JSON.stringify({ status, timestamp: new Date() });

    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`Failed to update LED for stop ${stopId}, route ${routeId}:`, err);
      } else {
        logger.info(`LED updated for stop ${stopId}, route ${routeId}: ${status}`);
      }
    });
  }

  // 시스템 상태 브로드캐스트
  async broadcastSystemStatus(status: any): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    const message = JSON.stringify({
      ...status,
      timestamp: new Date(),
    });

    this.client.publish(this.topics.systemStatus, message, { qos: 0 });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      logger.info('Disconnected from MQTT broker');
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }
}

export default new MQTTService(); 