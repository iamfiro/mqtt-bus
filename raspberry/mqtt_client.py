"""
MQTT 클라이언트 모듈
"""
import json
import time
import threading
from datetime import datetime
from typing import Dict, Callable, Any
import paho.mqtt.client as mqtt

from config import Config
from logger import setup_logger

logger = setup_logger('MQTT')

class MQTTClient:
    def __init__(self):
        self.client = None
        self.is_connected = False
        self.topics = Config.get_mqtt_topics()
        self.message_callbacks: Dict[str, Callable] = {}
        self.last_heartbeat = None
        self.heartbeat_thread = None
        self._running = False
        
    def initialize(self) -> bool:
        """MQTT 클라이언트 초기화"""
        try:
            # 클라이언트 생성
            client_id = f"busstop-{Config.STOP_ID}-{int(time.time())}"
            self.client = mqtt.Client(client_id)
            
            # 콜백 설정
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            self.client.on_publish = self._on_publish
            self.client.on_subscribe = self._on_subscribe
            
            # 인증 설정
            if Config.MQTT_USERNAME and Config.MQTT_PASSWORD:
                self.client.username_pw_set(Config.MQTT_USERNAME, Config.MQTT_PASSWORD)
            
            # 유언 메시지 설정 (정류장 오프라인 상태)
            will_topic = self.topics['status']
            will_message = json.dumps({
                'status': 'offline',
                'stopId': Config.STOP_ID,
                'timestamp': datetime.now().isoformat()
            })
            self.client.will_set(will_topic, will_message, qos=1, retain=True)
            
            logger.info(f"MQTT 클라이언트 초기화 완료: {client_id}")
            return True
            
        except Exception as e:
            logger.error(f"MQTT 클라이언트 초기화 실패: {e}")
            return False
    
    def connect(self) -> bool:
        """MQTT 브로커에 연결"""
        try:
            logger.info(f"MQTT 브로커 연결 시도: {Config.MQTT_BROKER_HOST}:{Config.MQTT_BROKER_PORT}")
            
            self.client.connect(
                Config.MQTT_BROKER_HOST,
                Config.MQTT_BROKER_PORT,
                Config.MQTT_KEEPALIVE
            )
            
            # 백그라운드에서 연결 유지
            self.client.loop_start()
            self._running = True
            
            # 연결 대기 (최대 10초)
            for _ in range(100):
                if self.is_connected:
                    break
                time.sleep(0.1)
            
            if self.is_connected:
                logger.info("MQTT 브로커 연결 성공")
                self._start_heartbeat()
                self._publish_status('online')
                return True
            else:
                logger.error("MQTT 브로커 연결 타임아웃")
                return False
                
        except Exception as e:
            logger.error(f"MQTT 브로커 연결 실패: {e}")
            return False
    
    def disconnect(self):
        """MQTT 브로커에서 연결 해제"""
        self._running = False
        
        if self.heartbeat_thread:
            self.heartbeat_thread.join(timeout=2)
        
        if self.client and self.is_connected:
            self._publish_status('offline')
            self.client.loop_stop()
            self.client.disconnect()
            
        logger.info("MQTT 연결 해제 완료")
    
    def _on_connect(self, client, userdata, flags, rc):
        """연결 성공 콜백"""
        if rc == 0:
            self.is_connected = True
            logger.info("MQTT 브로커 연결됨")
            
            # 구독할 토픽들
            subscribe_topics = [
                (self.topics['led_control'], 1),
                (self.topics['system_health'], 1),
            ]
            
            for topic, qos in subscribe_topics:
                self.client.subscribe(topic, qos)
                logger.debug(f"토픽 구독: {topic}")
        else:
            self.is_connected = False
            logger.error(f"MQTT 연결 실패, 코드: {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """연결 해제 콜백"""
        self.is_connected = False
        if rc != 0:
            logger.warning("MQTT 연결이 예기치 않게 끊어짐")
        else:
            logger.info("MQTT 연결 해제됨")
    
    def _on_message(self, client, userdata, msg):
        """메시지 수신 콜백"""
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            
            logger.debug(f"메시지 수신: {topic} -> {payload}")
            
            # LED 제어 메시지 처리
            if topic.startswith(f"device/led/{Config.STOP_ID}/"):
                route_id = topic.split('/')[-1]
                callback = self.message_callbacks.get('led_control')
                if callback:
                    callback(route_id, payload)
            
            # 시스템 헬스 메시지 처리
            elif topic == 'system/health':
                callback = self.message_callbacks.get('system_health')
                if callback:
                    callback(payload)
            
        except Exception as e:
            logger.error(f"메시지 처리 오류: {e}")
    
    def _on_publish(self, client, userdata, mid):
        """메시지 발행 콜백"""
        logger.debug(f"메시지 발행 완료: {mid}")
    
    def _on_subscribe(self, client, userdata, mid, granted_qos):
        """구독 성공 콜백"""
        logger.debug(f"구독 완료: {mid}, QoS: {granted_qos}")
    
    def register_callback(self, event_type: str, callback: Callable):
        """이벤트 콜백 등록"""
        self.message_callbacks[event_type] = callback
        logger.debug(f"콜백 등록: {event_type}")
    
    def publish_button_press(self, route_id: str, route_name: str, color: str) -> bool:
        """버튼 클릭 메시지 발행"""
        if not self.is_connected:
            logger.error("MQTT 연결되지 않음 - 버튼 클릭 전송 실패")
            return False
        
        try:
            topic = f"{self.topics['button_press']}/{route_id}"
            message = {
                'stopId': Config.STOP_ID,
                'routeId': route_id,
                'routeName': route_name,
                'buttonColor': color,
                'timestamp': datetime.now().isoformat(),
                'passengerCount': 1
            }
            
            result = self.client.publish(topic, json.dumps(message), qos=1)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f"버튼 클릭 전송: 노선 {route_id}")
                return True
            else:
                logger.error(f"버튼 클릭 전송 실패: {result.rc}")
                return False
                
        except Exception as e:
            logger.error(f"버튼 클릭 전송 오류: {e}")
            return False
    
    def _publish_status(self, status: str):
        """정류장 상태 발행"""
        if not self.client:
            return
            
        message = {
            'status': status,
            'stopId': Config.STOP_ID,
            'stopName': Config.STOP_NAME,
            'timestamp': datetime.now().isoformat(),
            'routes': list(Config.get_routes_config().keys())
        }
        
        self.client.publish(self.topics['status'], json.dumps(message), qos=1, retain=True)
        logger.info(f"정류장 상태 발행: {status}")
    
    def _publish_heartbeat(self):
        """하트비트 발행"""
        if not self.is_connected:
            return
            
        message = {
            'stopId': Config.STOP_ID,
            'timestamp': datetime.now().isoformat(),
            'uptime': time.time() - (self.last_heartbeat or time.time()),
            'routes': list(Config.get_routes_config().keys())
        }
        
        self.client.publish(self.topics['heartbeat'], json.dumps(message), qos=0)
        self.last_heartbeat = time.time()
        logger.debug("하트비트 전송")
    
    def _start_heartbeat(self):
        """하트비트 스레드 시작"""
        def heartbeat_worker():
            while self._running and self.is_connected:
                self._publish_heartbeat()
                time.sleep(Config.HEARTBEAT_INTERVAL)
        
        self.heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True)
        self.heartbeat_thread.start()
        logger.info("하트비트 시작")
    
    def is_healthy(self) -> bool:
        """MQTT 연결 상태 확인"""
        return self.is_connected and self.client and self.client.is_connected() 