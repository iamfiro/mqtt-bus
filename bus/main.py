#!/usr/bin/env python3
"""스마트 버스 시스템 – 버스측 애플리케이션

라즈베리 파이에서 실행되어 MQTT 로 정류장 호출을 수신하고
LED / 부저로 기사님에게 알림을 제공한다.
또한 버스 위치, 상태를 주기적으로 서버(MQTT)로 전송한다.
"""

from __future__ import annotations

import signal
import sys
import threading
import time
from random import uniform

# 
# 외부 의존 모듈
#

try:
    import gps  # gpsd 클라이언트 (optional)
    GPS_AVAILABLE = True
except ImportError:
    GPS_AVAILABLE = False

# 내부 모듈
from bus.config import Config
from bus.gpio_controller import GPIOController
from bus.logger import setup_logger
from bus.mqtt_client import MQTTClient


logger = setup_logger("Main")


class BusDevice:
    """버스 장치 메인 클래스"""

    def __init__(self):
        self.gpio = GPIOController()
        self.mqtt = MQTTClient()
        self._running = False
        self._shutdown_evt = threading.Event()

    # ────────────────────────────────────────────────────────
    # 초기화
    # ────────────────────────────────────────────────────────

    def initialize(self) -> bool:
        logger.info("🚌 버스 장치 초기화 시작")

        Config.print_config()

        if not self.gpio.initialize():
            logger.error("GPIO 초기화 실패")
            return False

        if not self.mqtt.initialize():
            logger.error("MQTT 초기화 실패")
            return False

        # 이벤트 콜백 등록
        self.mqtt.register_callback("route_call", self._on_route_call)
        self.mqtt.register_callback("system_health", self._on_system_health)

        logger.info("✅ 초기화 완료")
        return True

    # ────────────────────────────────────────────────────────
    # 이벤트 핸들러
    # ────────────────────────────────────────────────────────

    def _on_route_call(self, stop_id: str, payload):
        logger.info("정류장 %s 호출 수신", stop_id)
        # 시청 앞 등 알림
        self.gpio.blink_led(duration=3.0, interval=0.3, color="red")
        self.gpio.beep(duration=0.15, repeats=3)

    def _on_system_health(self, data):
        logger.debug("시스템 헬스 체크: %s", data)

    # ────────────────────────────────────────────────────────
    # GPS / 위치 전송 (데모용 랜덤 좌표 사용 가능)
    # ────────────────────────────────────────────────────────

    def _start_location_loop(self):
        def _worker():
            while self._running and not self._shutdown_evt.is_set():
                lat, lng, speed, heading = self._get_location()
                self.mqtt.publish_location(lat, lng, speed, heading)
                time.sleep(Config.LOCATION_INTERVAL)

        threading.Thread(target=_worker, daemon=True).start()

    def _get_location(self):
        """GPS 위치를 얻어온다 (GPS가 없는 환경에선 임의값)"""
        if GPS_AVAILABLE:
            try:
                session = gps.gps(mode=gps.WATCH_ENABLE)
                report = session.next()
                if report["class"] == "TPV":
                    lat = getattr(report, "lat", 0.0)
                    lng = getattr(report, "lon", 0.0)
                    speed = getattr(report, "speed", 0.0)
                    heading = getattr(report, "track", 0.0)
                    return lat, lng, speed, heading
            except Exception as exc:  # pylint: disable=broad-except
                logger.warning("GPS 오류: %s", exc)

        # GPS 사용 불가 – 임의 좌표
        lat = uniform(35.0, 37.0)
        lng = uniform(126.0, 128.0)
        return lat, lng, 0.0, 0.0

    # ────────────────────────────────────────────────────────
    # 실행 / 종료
    # ────────────────────────────────────────────────────────

    def start(self) -> bool:
        if not self.initialize():
            return False

        if not self.mqtt.connect():
            logger.error("MQTT 연결 실패")
            return False

        self._running = True
        self._start_location_loop()

        # 준비 완료 표시 (초록 LED)
        self.gpio.set_led(green=True)

        logger.info("🚀 버스 장치 실행 중 (Ctrl+C 종료)")
        return True

    def run(self):
        if not self.start():
            return

        try:
            while self._running and not self._shutdown_evt.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("사용자 중지 요청")
        finally:
            self.shutdown()

    def shutdown(self):
        logger.info("🛑 버스 장치 종료")
        self._running = False
        self._shutdown_evt.set()

        self.mqtt.disconnect()
        self.gpio.cleanup()

        # LED 끄기
        self.gpio.set_led(False, False)

        logger.info("종료 완료")


# ────────────────────────────────────────────────────────────
# 진입점
# ────────────────────────────────────────────────────────────


bus_device: BusDevice  # 전역 참조용


def _signal_handler(signum, frame):  # noqa: D401, D403
    logger.info("시그널 수신: %s", signum)
    if "bus_device" in globals():
        globals()["bus_device"].shutdown()
    sys.exit(0)


def main():
    global bus_device  # pylint: disable=global-statement

    # 시그널 핸들러 등록
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    bus_device = BusDevice()
    bus_device.run()


if __name__ == "__main__":
    main() 