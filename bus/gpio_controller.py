"""GPIO 제어 (버스 장치)

• LED 바(빨강/초록) 제어
• Piezo 부저 제어

개발 환경에서는 RPi.GPIO 대신 Mock 을 사용해 테스트할 수 있다.
"""

import threading
import time
from typing import Optional


# ──────────────────────────────────────────────────────────────
# GPIO 라이브러리 로드 (Mock 지원)
# ──────────────────────────────────────────────────────────────

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:  # 개발 PC 등
    GPIO_AVAILABLE = False

    class MockGPIO:  # pylint: disable=too-few-public-methods
        BCM = "BCM"
        BOARD = "BOARD"
        OUT = "OUT"
        HIGH = True
        LOW = False

        @staticmethod
        def setmode(mode):
            print(f"[MOCK GPIO] setmode({mode})")

        @staticmethod
        def setup(pin, mode, **kwargs):
            print(f"[MOCK GPIO] setup(pin={pin}, mode={mode}, {kwargs})")

        @staticmethod
        def output(pin, state):
            print(f"[MOCK GPIO] output(pin={pin}, state={state})")

        @staticmethod
        def cleanup():
            print("[MOCK GPIO] cleanup()")

    GPIO = MockGPIO()  # type: ignore


from .config import Config
from .logger import setup_logger


logger = setup_logger("GPIO")


# ──────────────────────────────────────────────────────────────
# GPIO 컨트롤러
# ──────────────────────────────────────────────────────────────


class GPIOController:  # pylint: disable=too-many-instance-attributes
    """LED/부저 제어"""

    def __init__(self):
        self._initialized = False
        self.led_red_state = False
        self.led_green_state = False
        self._lock = threading.Lock()

    # ──────────────────────────────────────────────────────────
    # 초기화 / 정리
    # ──────────────────────────────────────────────────────────

    def initialize(self) -> bool:
        """GPIO 초기화"""
        if not GPIO_AVAILABLE:
            logger.warning("GPIO 모듈을 찾을 수 없어 Mock 모드로 동작합니다")
            return True

        try:
            mode = GPIO.BCM if Config.GPIO_MODE.upper() == "BCM" else GPIO.BOARD
            GPIO.setmode(mode)

            # LED 핀 설정
            GPIO.setup(Config.LED_RED_PIN, GPIO.OUT)
            GPIO.setup(Config.LED_GREEN_PIN, GPIO.OUT)

            # 부저 핀 설정
            GPIO.setup(Config.BUZZER_PIN, GPIO.OUT)

            # 초기 상태
            GPIO.output(Config.LED_RED_PIN, GPIO.LOW)
            GPIO.output(Config.LED_GREEN_PIN, GPIO.LOW)
            GPIO.output(Config.BUZZER_PIN, GPIO.LOW)

            self._initialized = True
            logger.info("GPIO 초기화 완료")
            return True

        except Exception as exc:  # pylint: disable=broad-except
            logger.error("GPIO 초기화 실패: %s", exc)
            return False

    def cleanup(self):
        """GPIO 정리"""
        if GPIO_AVAILABLE and self._initialized:
            GPIO.cleanup()
        logger.info("GPIO 정리 완료")

    # ──────────────────────────────────────────────────────────
    # LED 제어
    # ──────────────────────────────────────────────────────────

    def set_led(self, red: bool = False, green: bool = False):
        """LED 상태 설정"""
        with self._lock:
            self.led_red_state = red
            self.led_green_state = green

            if GPIO_AVAILABLE:
                GPIO.output(Config.LED_RED_PIN, GPIO.HIGH if red else GPIO.LOW)
                GPIO.output(Config.LED_GREEN_PIN, GPIO.HIGH if green else GPIO.LOW)
            else:
                logger.debug("[MOCK] LED 상태 → R:%s G:%s", red, green)

    def blink_led(self, duration: float = 2.0, interval: float = 0.3, color: str = "red"):
        """LED 깜빡임 (비동기)"""

        def _worker():
            end_time = time.time() + duration
            while time.time() < end_time:
                if color == "red":
                    self.set_led(red=True)
                elif color == "green":
                    self.set_led(green=True)
                time.sleep(interval)
                self.set_led(False, False)
                time.sleep(interval)

        threading.Thread(target=_worker, daemon=True).start()

    # ──────────────────────────────────────────────────────────
    # 부저(Buzzer)
    # ──────────────────────────────────────────────────────────

    def beep(self, duration: float = 0.2, repeats: int = 1):
        """부저 비프음"""

        def _worker():
            for _ in range(repeats):
                if GPIO_AVAILABLE:
                    GPIO.output(Config.BUZZER_PIN, GPIO.HIGH)
                logger.debug("Beep ON")
                time.sleep(duration)
                if GPIO_AVAILABLE:
                    GPIO.output(Config.BUZZER_PIN, GPIO.LOW)
                logger.debug("Beep OFF")
                time.sleep(0.05)

        threading.Thread(target=_worker, daemon=True).start()

    # ──────────────────────────────────────────────────────────
    # 상태 확인
    # ──────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        """GPIO 사용 가능 여부"""
        return GPIO_AVAILABLE and self._initialized 