"""
스마트 버스정류장 시스템 - 라즈베리파이 설정
"""
import os
import json
from typing import Dict, Any

class Config:
    # MQTT 브로커 설정
    MQTT_BROKER_HOST = os.getenv('MQTT_BROKER_HOST', 'localhost')
    MQTT_BROKER_PORT = int(os.getenv('MQTT_BROKER_PORT', '1883'))
    MQTT_USERNAME = os.getenv('MQTT_USERNAME', '')
    MQTT_PASSWORD = os.getenv('MQTT_PASSWORD', '')
    MQTT_KEEPALIVE = int(os.getenv('MQTT_KEEPALIVE', '60'))
    
    # 정류장 정보
    STOP_ID = os.getenv('STOP_ID', 'STOP001')
    STOP_NAME = os.getenv('STOP_NAME', '시청앞정류장')
    
    # 노선 설정 (기본값)
    DEFAULT_ROUTES_CONFIG = {
        "1": {
            "name": "1번",
            "color": "#FF0000",
            "button_pin": 18,
            "led_pin": 19
        },
        "2": {
            "name": "2번", 
            "color": "#00FF00",
            "button_pin": 20,
            "led_pin": 21
        },
        "3": {
            "name": "3번",
            "color": "#0000FF", 
            "button_pin": 22,
            "led_pin": 23
        },
        "4": {
            "name": "4번",
            "color": "#FFFF00",
            "button_pin": 24,
            "led_pin": 25
        }
    }
    
    @classmethod
    def get_routes_config(cls) -> Dict[str, Dict[str, Any]]:
        """노선 설정을 가져옵니다"""
        routes_json = os.getenv('ROUTES_CONFIG')
        if routes_json:
            try:
                return json.loads(routes_json)
            except json.JSONDecodeError:
                print("⚠️ ROUTES_CONFIG JSON 파싱 오류, 기본값 사용")
        
        return cls.DEFAULT_ROUTES_CONFIG
    
    # GPIO 설정
    GPIO_MODE = os.getenv('GPIO_MODE', 'BCM')  # BCM 또는 BOARD
    DEBOUNCE_TIME = float(os.getenv('DEBOUNCE_TIME', '0.3'))
    
    # 로깅 설정
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'bus_stop.log')
    
    # 하트비트 설정
    HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '30'))
    
    # MQTT 토픽 설정
    @classmethod
    def get_mqtt_topics(cls):
        return {
            'button_press': f'device/button/{cls.STOP_ID}',
            'led_control': f'device/led/{cls.STOP_ID}/+',  # +는 routeId를 위한 와일드카드
            'heartbeat': f'device/heartbeat/{cls.STOP_ID}',
            'status': f'device/status/{cls.STOP_ID}',
            'system_health': 'system/health'
        }
    
    @classmethod
    def validate_config(cls) -> bool:
        """설정 유효성 검사"""
        routes = cls.get_routes_config()
        
        if not routes:
            print("❌ 노선 설정이 없습니다")
            return False
            
        # 핀 번호 중복 체크
        used_pins = set()
        for route_id, route_config in routes.items():
            button_pin = route_config.get('button_pin')
            led_pin = route_config.get('led_pin')
            
            if button_pin in used_pins or led_pin in used_pins:
                print(f"❌ 핀 번호 중복: 노선 {route_id}")
                return False
                
            used_pins.add(button_pin)
            used_pins.add(led_pin)
        
        print("✅ 설정 검증 완료")
        return True
    
    @classmethod
    def print_config(cls):
        """현재 설정 출력"""
        print("📋 스마트 버스정류장 시스템 설정")
        print(f"  정류장: {cls.STOP_NAME} ({cls.STOP_ID})")
        print(f"  MQTT 브로커: {cls.MQTT_BROKER_HOST}:{cls.MQTT_BROKER_PORT}")
        print(f"  GPIO 모드: {cls.GPIO_MODE}")
        print(f"  디바운스 시간: {cls.DEBOUNCE_TIME}초")
        print("  노선 설정:")
        
        for route_id, route_config in cls.get_routes_config().items():
            print(f"    노선 {route_id}: {route_config['name']} "
                  f"(버튼: GPIO{route_config['button_pin']}, "
                  f"LED: GPIO{route_config['led_pin']})") 