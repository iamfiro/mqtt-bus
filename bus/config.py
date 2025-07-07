"""
버스 장치용 설정
라즈베리 파이에서 실행되는 버스 운행 모듈의 환경 변수를 관리합니다.
"""

import os


class Config:
    """환경 설정 클래스"""

    # ──────────────────────────────────────────────────────────────
    # MQTT 브로커 설정
    # ──────────────────────────────────────────────────────────────
    MQTT_BROKER_HOST: str = os.getenv("MQTT_BROKER_HOST", "localhost")
    MQTT_BROKER_PORT: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    MQTT_USERNAME: str = os.getenv("MQTT_USERNAME", "")
    MQTT_PASSWORD: str = os.getenv("MQTT_PASSWORD", "")
    MQTT_KEEPALIVE: int = int(os.getenv("MQTT_KEEPALIVE", "60"))

    # ──────────────────────────────────────────────────────────────
    # 버스 정보
    # ──────────────────────────────────────────────────────────────
    BUS_ID: str = os.getenv("BUS_ID", os.uname().nodename)
    ROUTE_ID: str = os.getenv("ROUTE_ID", "100")
    ROUTE_NAME: str = os.getenv("ROUTE_NAME", f"노선 {ROUTE_ID}")

    # ──────────────────────────────────────────────────────────────
    # GPIO 핀 매핑 (BCM 기준)
    # ──────────────────────────────────────────────────────────────
    LED_RED_PIN: int = int(os.getenv("LED_RED_PIN", "5"))   # 빨간색 LED 바
    LED_GREEN_PIN: int = int(os.getenv("LED_GREEN_PIN", "6"))  # 초록색 LED 바
    BUZZER_PIN: int = int(os.getenv("BUZZER_PIN", "13"))

    GPIO_MODE: str = os.getenv("GPIO_MODE", "BCM")  # BCM / BOARD

    # ──────────────────────────────────────────────────────────────
    # 주기 설정
    # ──────────────────────────────────────────────────────────────
    LOCATION_INTERVAL: float = float(os.getenv("LOCATION_INTERVAL", "2.0"))  # 위치 전송 주기 (초)
    HEARTBEAT_INTERVAL: int = int(os.getenv("HEARTBEAT_INTERVAL", "30"))

    # ──────────────────────────────────────────────────────────────
    # 토픽 헬퍼
    # ──────────────────────────────────────────────────────────────
    @classmethod
    def get_topics(cls):
        """MQTT 토픽 사전 반환"""
        return {
            # 정류장 호출(버튼) 토픽 (stopId, routeId) 와일드카드 두 개
            "route_call": "device/button/+/+",
            # 버스 위치 전송 토픽
            "bus_location": f"bus/location/{cls.BUS_ID}",
            # 버스 상태
            "bus_status": f"bus/status/{cls.BUS_ID}",
            # 시스템 헬스
            "system_health": "system/health",
        }

    # ──────────────────────────────────────────────────────────────
    # 로깅
    # ──────────────────────────────────────────────────────────────
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "bus.log")

    @classmethod
    def print_config(cls):  # pragma: no cover
        """현재 설정을 터미널에 출력"""
        print("📋  버스 장치 설정 요약")
        for k in dir(cls):
            if k.isupper() and not k.startswith("__"):
                print(f"  {k}: {getattr(cls, k)}") 