"""
GPIO 제어 모듈 - 버튼과 LED 관리
"""
import time
import threading
from typing import Dict, Callable, Optional

try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
    # 개발 환경용 Mock GPIO
    class MockGPIO:
        BCM = 'BCM'
        BOARD = 'BOARD'
        IN = 'IN'
        OUT = 'OUT'
        PUD_UP = 'PUD_UP'
        PUD_DOWN = 'PUD_DOWN'
        RISING = 'RISING'
        FALLING = 'FALLING'
        HIGH = 'HIGH'
        LOW = 'LOW'
        
        @staticmethod
        def setmode(mode): pass
        @staticmethod
        def setup(pin, mode, **kwargs): pass
        @staticmethod
        def output(pin, state): pass
        @staticmethod
        def input(pin): return False
        @staticmethod
        def add_event_detect(pin, edge, callback=None, bouncetime=0): pass
        @staticmethod
        def cleanup(): pass
        @staticmethod
        def remove_event_detect(pin): pass
    
    GPIO = MockGPIO()

from config import Config
from logger import setup_logger

logger = setup_logger('GPIO')

class GPIOController:
    def __init__(self):
        self.routes_config = Config.get_routes_config()
        self.button_states: Dict[str, bool] = {}
        self.led_states: Dict[str, bool] = {}
        self.button_callbacks: Dict[str, Callable] = {}
        self.last_button_press: Dict[str, float] = {}
        self._initialized = False
        
    def initialize(self) -> bool:
        """GPIO 초기화"""
        try:
            if not GPIO_AVAILABLE:
                logger.warning("⚠️ GPIO 모듈을 사용할 수 없습니다 (개발 환경)")
                return True
            
            # GPIO 모드 설정
            if Config.GPIO_MODE == 'BCM':
                GPIO.setmode(GPIO.BCM)
            else:
                GPIO.setmode(GPIO.BOARD)
            
            logger.info(f"GPIO 모드 설정: {Config.GPIO_MODE}")
            
            # 각 노선별 GPIO 설정
            for route_id, route_config in self.routes_config.items():
                button_pin = route_config['button_pin']
                led_pin = route_config['led_pin']
                
                # 버튼 핀 설정 (풀업 저항 사용)
                GPIO.setup(button_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                
                # LED 핀 설정
                GPIO.setup(led_pin, GPIO.OUT)
                GPIO.output(led_pin, GPIO.LOW)  # 초기 상태는 꺼짐
                
                # 상태 초기화
                self.button_states[route_id] = False
                self.led_states[route_id] = False
                self.last_button_press[route_id] = 0
                
                # 버튼 이벤트 감지 (하강 에지 - 버튼 눌림)
                GPIO.add_event_detect(
                    button_pin,
                    GPIO.FALLING,
                    callback=lambda channel, rid=route_id: self._button_callback(rid, channel),
                    bouncetime=int(Config.DEBOUNCE_TIME * 1000)  # ms로 변환
                )
                
                logger.info(f"노선 {route_id} GPIO 설정 완료 - 버튼: {button_pin}, LED: {led_pin}")
            
            self._initialized = True
            logger.info("GPIO 초기화 완료")
            return True
            
        except Exception as e:
            logger.error(f"GPIO 초기화 실패: {e}")
            return False
    
    def cleanup(self):
        """GPIO 정리"""
        if not GPIO_AVAILABLE or not self._initialized:
            return
            
        try:
            # 모든 LED 끄기
            for route_id in self.routes_config:
                self.set_led(route_id, False)
            
            # 이벤트 감지 제거
            for route_config in self.routes_config.values():
                try:
                    GPIO.remove_event_detect(route_config['button_pin'])
                except:
                    pass
            
            # GPIO 정리
            GPIO.cleanup()
            logger.info("GPIO 정리 완료")
            
        except Exception as e:
            logger.error(f"GPIO 정리 오류: {e}")
    
    def _button_callback(self, route_id: str, channel: int):
        """버튼 눌림 콜백"""
        try:
            current_time = time.time()
            
            # 디바운싱 (추가 보호)
            if current_time - self.last_button_press.get(route_id, 0) < Config.DEBOUNCE_TIME:
                return
            
            self.last_button_press[route_id] = current_time
            
            # 버튼 상태 업데이트
            self.button_states[route_id] = True
            
            route_config = self.routes_config[route_id]
            logger.info(f"🔴 버튼 눌림: 노선 {route_id} ({route_config['name']})")
            
            # LED 켜기
            self.set_led(route_id, True)
            
            # 콜백 호출
            callback = self.button_callbacks.get(route_id)
            if callback:
                # 별도 스레드에서 콜백 실행 (블로킹 방지)
                threading.Thread(
                    target=callback,
                    args=(route_id, route_config),
                    daemon=True
                ).start()
            
        except Exception as e:
            logger.error(f"버튼 콜백 오류: {e}")
    
    def register_button_callback(self, route_id: str, callback: Callable):
        """버튼 콜백 등록"""
        self.button_callbacks[route_id] = callback
        logger.debug(f"노선 {route_id} 버튼 콜백 등록")
    
    def set_led(self, route_id: str, state: bool) -> bool:
        """LED 상태 설정"""
        try:
            if route_id not in self.routes_config:
                logger.error(f"알 수 없는 노선: {route_id}")
                return False
            
            if not GPIO_AVAILABLE:
                logger.debug(f"Mock LED {route_id}: {'ON' if state else 'OFF'}")
                self.led_states[route_id] = state
                return True
            
            led_pin = self.routes_config[route_id]['led_pin']
            GPIO.output(led_pin, GPIO.HIGH if state else GPIO.LOW)
            self.led_states[route_id] = state
            
            logger.info(f"💡 LED {route_id}: {'켜짐' if state else '꺼짐'}")
            return True
            
        except Exception as e:
            logger.error(f"LED 제어 오류 (노선 {route_id}): {e}")
            return False
    
    def toggle_led(self, route_id: str) -> bool:
        """LED 토글"""
        current_state = self.led_states.get(route_id, False)
        return self.set_led(route_id, not current_state)
    
    def blink_led(self, route_id: str, duration: float = 2.0, interval: float = 0.5):
        """LED 깜빡임"""
        def blink_worker():
            try:
                original_state = self.led_states.get(route_id, False)
                start_time = time.time()
                
                while time.time() - start_time < duration:
                    self.set_led(route_id, True)
                    time.sleep(interval)
                    self.set_led(route_id, False)
                    time.sleep(interval)
                
                # 원래 상태로 복원
                self.set_led(route_id, original_state)
                
            except Exception as e:
                logger.error(f"LED 깜빡임 오류: {e}")
        
        threading.Thread(target=blink_worker, daemon=True).start()
    
    def get_button_state(self, route_id: str) -> bool:
        """버튼 상태 조회"""
        return self.button_states.get(route_id, False)
    
    def get_led_state(self, route_id: str) -> bool:
        """LED 상태 조회"""
        return self.led_states.get(route_id, False)
    
    def get_all_states(self) -> Dict[str, Dict[str, bool]]:
        """모든 상태 조회"""
        return {
            route_id: {
                'button': self.get_button_state(route_id),
                'led': self.get_led_state(route_id)
            }
            for route_id in self.routes_config
        }
    
    def test_all_leds(self, duration: float = 1.0):
        """모든 LED 테스트"""
        logger.info("LED 테스트 시작")
        
        for route_id in self.routes_config:
            logger.info(f"노선 {route_id} LED 테스트")
            self.set_led(route_id, True)
            time.sleep(duration)
            self.set_led(route_id, False)
            time.sleep(0.2)
        
        logger.info("LED 테스트 완료")
    
    def is_available(self) -> bool:
        """GPIO 사용 가능 여부"""
        return GPIO_AVAILABLE and self._initialized 