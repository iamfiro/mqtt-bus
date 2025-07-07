"""MQTT 통신 모듈 (버스 장치)"""

from __future__ import annotations

import json
import time
import threading
from datetime import datetime
from typing import Callable, Dict, Optional

import paho.mqtt.client as mqtt

from .config import Config
from .logger import setup_logger


logger = setup_logger("MQTT")


class MQTTClient:
    """버스 장치용 MQTT 래퍼"""

    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected: bool = False
        self.topics = Config.get_topics()
        self.message_callbacks: Dict[str, Callable] = {}
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._running = False

    # ──────────────────────────────────────────────────────────
    # 초기화 / 연결
    # ──────────────────────────────────────────────────────────

    def initialize(self) -> bool:
        try:
            client_id = f"bus-{Config.BUS_ID}-{int(time.time())}"
            self.client = mqtt.Client(client_id)

            # 인증
            if Config.MQTT_USERNAME:
                self.client.username_pw_set(Config.MQTT_USERNAME, Config.MQTT_PASSWORD)

            # 콜백
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            # 유언 메시지
            will_payload = json.dumps({
                "busId": Config.BUS_ID,
                "status": "offline",
                "timestamp": datetime.utcnow().isoformat(),
            })
            self.client.will_set(self.topics["bus_status"], will_payload, qos=1, retain=True)

            logger.info("MQTT 클라이언트 초기화 완료 (%s)", client_id)
            return True
        except Exception as exc:  # pylint: disable=broad-except
            logger.error("MQTT 초기화 실패: %s", exc)
            return False

    def connect(self) -> bool:
        if not self.client:
            logger.error("MQTT 클라이언트가 초기화되지 않았습니다")
            return False

        try:
            logger.info("MQTT 브로커 연결 시도: %s:%s", Config.MQTT_BROKER_HOST, Config.MQTT_BROKER_PORT)
            self.client.connect(Config.MQTT_BROKER_HOST, Config.MQTT_BROKER_PORT, Config.MQTT_KEEPALIVE)
            self.client.loop_start()
            self._running = True

            # 연결 완료 대기 (최대 10초)
            for _ in range(100):
                if self.is_connected:
                    break
                time.sleep(0.1)

            if self.is_connected:
                self._start_heartbeat()
                self._publish_status("online")
                return True
            logger.error("MQTT 연결 실패")
            return False

        except Exception as exc:  # pylint: disable=broad-except
            logger.error("MQTT 연결 중 오류: %s", exc)
            return False

    def disconnect(self):
        self._running = False
        if self.client and self.is_connected:
            self._publish_status("offline")
            self.client.loop_stop()
            self.client.disconnect()
        logger.info("MQTT 연결 해제 완료")

    # ──────────────────────────────────────────────────────────
    # 콜백
    # ──────────────────────────────────────────────────────────

    def _on_connect(self, client, userdata, flags, rc):  # noqa: D401
        if rc == 0:
            self.is_connected = True
            logger.info("MQTT 브로커 연결 성공")

            # 구독
            client.subscribe(self.topics["route_call"], qos=1)
            client.subscribe(self.topics["system_health"], qos=1)
        else:
            logger.error("MQTT 연결 실패, 코드: %s", rc)

    def _on_disconnect(self, client, userdata, rc):  # noqa: D401
        self.is_connected = False
        if rc != 0:
            logger.warning("MQTT 연결이 예기치 않게 끊어짐")
        else:
            logger.info("MQTT 연결 해제됨")

    def _on_message(self, client, userdata, msg):  # noqa: D401
        topic = msg.topic
        payload_raw = msg.payload.decode()
        try:
            payload = json.loads(payload_raw)
        except json.JSONDecodeError:
            payload = payload_raw

        logger.debug("메시지 수신: %s -> %s", topic, payload)

        # 정류장 호출 메시지
        if topic.startswith("device/button/"):
            # 토픽 포맷: device/button/{stopId}/{routeId}
            parts = topic.split("/")
            if len(parts) >= 4:
                route_id = parts[-1]
                stop_id = parts[-2]
                if route_id == Config.ROUTE_ID:
                    logger.info("호출 감지: 정류장 %s (노선 %s)", stop_id, route_id)
                    callback = self.message_callbacks.get("route_call")
                    if callback:
                        callback(stop_id, payload)

        # 시스템 헬스
        elif topic == self.topics["system_health"]:
            callback = self.message_callbacks.get("system_health")
            if callback:
                callback(payload)

    # ──────────────────────────────────────────────────────────
    # 메시지 발행
    # ──────────────────────────────────────────────────────────

    def _publish_status(self, status: str):
        if not self.client:
            return
        message = {
            "busId": Config.BUS_ID,
            "routeId": Config.ROUTE_ID,
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
        }
        self.client.publish(self.topics["bus_status"], json.dumps(message), qos=1, retain=True)

    def publish_location(self, latitude: float, longitude: float, speed: float = 0.0, heading: float = 0.0):
        if not self.client or not self.is_connected:
            return
        message = {
            "busId": Config.BUS_ID,
            "routeId": Config.ROUTE_ID,
            "latitude": latitude,
            "longitude": longitude,
            "speed": speed,
            "heading": heading,
            "timestamp": datetime.utcnow().isoformat(),
        }
        self.client.publish(self.topics["bus_location"], json.dumps(message), qos=0)

    # ──────────────────────────────────────────────────────────
    # 헬스/하트비트
    # ──────────────────────────────────────────────────────────

    def _start_heartbeat(self):
        def _worker():
            while self._running and self.is_connected:
                self._publish_status("online")
                time.sleep(Config.HEARTBEAT_INTERVAL)

        self._heartbeat_thread = threading.Thread(target=_worker, daemon=True)
        self._heartbeat_thread.start()

    # ──────────────────────────────────────────────────────────
    # 콜백 등록
    # ──────────────────────────────────────────────────────────

    def register_callback(self, event_type: str, callback: Callable):
        self.message_callbacks[event_type] = callback

    # ──────────────────────────────────────────────────────────
    # 상태 헬퍼
    # ──────────────────────────────────────────────────────────

    def is_healthy(self) -> bool:
        return self.is_connected and self.client and self.client.is_connected() 