import mqtt from 'mqtt';
import mitt from 'mitt';

const MQTT_URL = (import.meta as any).env.VITE_MQTT_WS_URL || 'ws://localhost:9001';

export type DashboardEvents = {
  'button-pressed': { stopId: string; routeId: string };
  'call-cancelled': { stopId: string; routeId: string };
};

const emitter = mitt<DashboardEvents>();

class MQTTService {
  private client: mqtt.MqttClient | null = null;

  connect() {
    if (this.client) return;
    this.client = mqtt.connect(MQTT_URL);

    this.client.on('connect', () => {
      console.log('[MQTT] Connected');
      this.client?.subscribe('events/+');
    });

    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (topic === 'events/buttonPressed') {
          emitter.emit('button-pressed', payload);
        } else if (topic === 'events/callCancelled') {
          emitter.emit('call-cancelled', payload);
        }
      } catch (e) {
        console.error('MQTT parse error', e);
      }
    });
  }

  on<E extends keyof DashboardEvents>(type: E, handler: (event: DashboardEvents[E]) => void) {
    emitter.on(type, handler);
  }
}

export default new MQTTService(); 