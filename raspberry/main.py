#!/usr/bin/env python3
"""
스마트 버스정류장 시스템 - 라즈베리파이 메인 애플리케이션
"""
import os
import sys
import signal
import time
import threading
from datetime import datetime

# 환경 변수 로드
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from config import Config
from logger import setup_logger
from mqtt_client import MQTTClient
from gpio_controller import GPIOController

logger = setup_logger('Main')

class BusStopSystem:
    def __init__(self):
        self.mqtt_client = MQTTClient()
        self.gpio_controller = GPIOController()
        self._running = False
        self._shutdown_event = threading.Event()
        
    def initialize(self) -> bool:
        """시스템 초기화"""
        logger.info("🚏 스마트 버스정류장 시스템 시작")
        
        # 설정 출력
        Config.print_config()
        
        # 설정 검증
        if not Config.validate_config():
            logger.error("❌ 설정 검증 실패")
            return False
        
        # GPIO 컨트롤러 초기화
        if not self.gpio_controller.initialize():
            logger.error("❌ GPIO 초기화 실패")
            return False
        
        # MQTT 클라이언트 초기화
        if not self.mqtt_client.initialize():
            logger.error("❌ MQTT 초기화 실패")
            return False
        
        # 이벤트 핸들러 등록
        self._setup_event_handlers()
        
        logger.info("✅ 시스템 초기화 완료")
        return True
    
    def _setup_event_handlers(self):
        """이벤트 핸들러 설정"""
        
        # 버튼 콜백 등록
        for route_id in Config.get_routes_config():
            self.gpio_controller.register_button_callback(
                route_id,
                self._on_button_pressed
            )
        
        # MQTT 콜백 등록
        self.mqtt_client.register_callback('led_control', self._on_led_control)
        self.mqtt_client.register_callback('system_health', self._on_system_health)
        
        logger.info("이벤트 핸들러 설정 완료")
    
    def _on_button_pressed(self, route_id: str, route_config: dict):
        """버튼 눌림 이벤트 처리"""
        try:
            logger.info(f"🔴 버튼 이벤트: 노선 {route_id} 호출")
            
            # MQTT로 버튼 클릭 전송
            success = self.mqtt_client.publish_button_press(
                route_id,
                route_config['name'],
                route_config['color']
            )
            
            if success:
                logger.info(f"✅ 노선 {route_id} 호출 전송 성공")
                # LED 깜빡임으로 전송 확인 표시
                self.gpio_controller.blink_led(route_id, duration=1.0, interval=0.2)
            else:
                logger.error(f"❌ 노선 {route_id} 호출 전송 실패")
                # LED 빠른 깜빡임으로 오류 표시
                self.gpio_controller.blink_led(route_id, duration=2.0, interval=0.1)
        
        except Exception as e:
            logger.error(f"버튼 이벤트 처리 오류: {e}")
    
    def _on_led_control(self, route_id: str, message: dict):
        """LED 제어 메시지 처리"""
        try:
            status = message.get('status', 'OFF')
            
            if status == 'ON':
                self.gpio_controller.set_led(route_id, True)
                logger.info(f"💡 노선 {route_id} LED 켜짐 (서버 명령)")
            elif status == 'OFF':
                self.gpio_controller.set_led(route_id, False)
                logger.info(f"💡 노선 {route_id} LED 꺼짐 (서버 명령)")
            elif status == 'BLINK':
                duration = message.get('duration', 2.0)
                interval = message.get('interval', 0.5)
                self.gpio_controller.blink_led(route_id, duration, interval)
                logger.info(f"💡 노선 {route_id} LED 깜빡임 (서버 명령)")
        
        except Exception as e:
            logger.error(f"LED 제어 오류: {e}")
    
    def _on_system_health(self, health_data: dict):
        """시스템 헬스 체크 응답"""
        logger.debug(f"시스템 헬스 수신: {health_data}")
    
    def start(self) -> bool:
        """시스템 시작"""
        if not self.initialize():
            return False
        
        # MQTT 연결
        if not self.mqtt_client.connect():
            logger.error("❌ MQTT 연결 실패")
            return False
        
        self._running = True
        
        # LED 테스트 (시작 확인)
        logger.info("🔧 시스템 테스트 중...")
        self.gpio_controller.test_all_leds(duration=0.5)
        
        logger.info("🚏 버스정류장 시스템 준비 완료")
        return True
    
    def run(self):
        """메인 루프 실행"""
        if not self.start():
            logger.error("❌ 시스템 시작 실패")
            return
        
        try:
            logger.info("🔄 시스템 실행 중... (Ctrl+C로 종료)")
            
            # 메인 루프
            while self._running and not self._shutdown_event.is_set():
                # 상태 모니터링
                if not self.mqtt_client.is_healthy():
                    logger.warning("⚠️ MQTT 연결 문제 감지")
                
                # 주기적 상태 출력 (5분마다)
                if int(time.time()) % 300 == 0:
                    self._print_status()
                
                time.sleep(1)
        
        except KeyboardInterrupt:
            logger.info("🛑 사용자 종료 요청")
        except Exception as e:
            logger.error(f"❌ 시스템 오류: {e}")
        finally:
            self.shutdown()
    
    def _print_status(self):
        """현재 상태 출력"""
        states = self.gpio_controller.get_all_states()
        logger.info("📊 시스템 상태:")
        logger.info(f"  MQTT 연결: {'✅' if self.mqtt_client.is_healthy() else '❌'}")
        logger.info(f"  GPIO 사용 가능: {'✅' if self.gpio_controller.is_available() else '❌'}")
        logger.info("  노선별 상태:")
        
        for route_id, state in states.items():
            route_config = Config.get_routes_config()[route_id]
            logger.info(f"    노선 {route_id} ({route_config['name']}): "
                       f"LED {'🔴' if state['led'] else '⚫'}")
    
    def shutdown(self):
        """시스템 종료"""
        logger.info("🔄 시스템 종료 중...")
        
        self._running = False
        self._shutdown_event.set()
        
        # MQTT 연결 해제
        if self.mqtt_client:
            self.mqtt_client.disconnect()
        
        # GPIO 정리
        if self.gpio_controller:
            self.gpio_controller.cleanup()
        
        logger.info("✅ 시스템 종료 완료")

def signal_handler(signum, frame):
    """시그널 핸들러"""
    logger.info(f"시그널 수신: {signum}")
    if 'bus_stop_system' in globals():
        bus_stop_system.shutdown()
    sys.exit(0)

def main():
    """메인 함수"""
    global bus_stop_system
    
    # 시그널 핸들러 등록
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # 시스템 생성 및 실행
        bus_stop_system = BusStopSystem()
        bus_stop_system.run()
        
    except Exception as e:
        logger.error(f"❌ 시스템 실행 오류: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 