import dotenv from 'dotenv';
import { AppConfig } from '../types';

// 환경 변수 로드
dotenv.config();

const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    clientId: process.env.MQTT_CLIENT_ID || `smart-bus-server-${Date.now()}`,
    qos: (parseInt(process.env.MQTT_QOS || '1', 10) as 0 | 1 | 2),
  },
  
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'smart-bus-stop-system',
    groupId: process.env.KAFKA_GROUP_ID || 'bus-location-group',
  },
  
  location: {
    distanceThresholdMeters: parseInt(process.env.DISTANCE_THRESHOLD_METERS || '500', 10),
    etaUpdateIntervalMs: parseInt(process.env.ETA_UPDATE_INTERVAL_MS || '2000', 10),
    kalmanFilterNoise: parseFloat(process.env.KALMAN_FILTER_NOISE || '0.1'),
  },

  server: {
    responseTimeout: parseInt(process.env.RESPONSE_TIMEOUT_MS || '5000', 10),
    keepAliveInterval: parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '30000', 10),
    maxClients: parseInt(process.env.MAX_CLIENTS || '1000', 10),
  },
};

// 설정 유효성 검사
export const validateConfig = (): void => {
  const requiredEnvVars: string[] = [];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  // 포트 번호 유효성 검사
  if (config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid port number: ${config.port}`);
  }
  
  // Redis 설정 검사
  if (!config.redis.host) {
    throw new Error('Redis host is required');
  }
  
  // MQTT 설정 검사
  if (!config.mqtt.brokerUrl) {
    throw new Error('MQTT broker URL is required');
  }

  // QoS 레벨 검사
  if (![0, 1, 2].includes(config.mqtt.qos!)) {
    throw new Error('Invalid MQTT QoS level. Must be 0, 1, or 2');
  }

  // 타임아웃 설정 검사
  if (config.server.responseTimeout < 1000) {
    throw new Error('Response timeout must be at least 1000ms');
  }
};

export default config; 