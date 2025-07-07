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
};

export default config; 