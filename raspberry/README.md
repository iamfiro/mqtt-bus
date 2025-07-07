# 🚏 스마트 버스정류장 시스템 - 라즈베리파이

## 개요

이 시스템은 스마트 버스정류장의 라즈베리파이 모듈로, 다음 기능을 제공합니다:

- 🔴 노선별 구분된 물리적 버튼
- 💡 LED 상태 표시
- 📡 MQTT를 통한 서버 통신
- 🌦️ 방수 설계 (IP54)
- ⚡ 저온 배터리 동작

## 하드웨어 구성

### 기본 구성
- Raspberry Pi 4B+ (권장)
- MicroSD 카드 (32GB 이상)
- GPIO 확장 보드
- 방수 케이스 (IP54 등급)

### 노선별 구성 (노선당)
- 🔴 푸시 버튼 (방수)
- 💡 LED 표시등
- 저항 (Pull-up: 10KΩ, LED: 220Ω)

### 기본 GPIO 핀 배치
```
노선 1: 버튼 GPIO18, LED GPIO19
노선 2: 버튼 GPIO20, LED GPIO21  
노선 3: 버튼 GPIO22, LED GPIO23
노선 4: 버튼 GPIO24, LED GPIO25
```

## 소프트웨어 설치

### 1. 라즈베리파이 OS 설치
```bash
# Raspberry Pi Imager 사용 권장
# SSH, WiFi 미리 설정

# SSH 접속 후
sudo apt update && sudo apt upgrade -y
```

### 2. Python 의존성 설치
```bash
cd /home/pi
git clone <repository-url>
cd raspberry/

# 의존성 설치
pip3 install -r requirements.txt
```

### 3. 환경 설정
```bash
# 환경 변수 설정
cp .env.example .env
nano .env

# 필수 설정
MQTT_BROKER_HOST=your-mqtt-broker.com
STOP_ID=STOP001
STOP_NAME=시청앞정류장
```

### 4. GPIO 권한 설정
```bash
# pi 사용자를 gpio 그룹에 추가
sudo usermod -a -G gpio pi

# 재부팅
sudo reboot
```

## 설정

### 환경 변수 (.env)
```bash
# MQTT 브로커 설정
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=

# 정류장 정보
STOP_ID=STOP001
STOP_NAME=시청앞정류장

# 노선 설정 (JSON)
ROUTES_CONFIG={"1": {"name": "1번", "color": "#FF0000", "button_pin": 18, "led_pin": 19}}

# GPIO 설정
GPIO_MODE=BCM
DEBOUNCE_TIME=0.3

# 로깅
LOG_LEVEL=INFO
LOG_FILE=bus_stop.log
```

### 노선 추가/변경
`config.py`에서 `DEFAULT_ROUTES_CONFIG` 수정하거나 환경 변수 `ROUTES_CONFIG` 사용:

```json
{
  "1": {"name": "1번", "color": "#FF0000", "button_pin": 18, "led_pin": 19},
  "2": {"name": "2번", "color": "#00FF00", "button_pin": 20, "led_pin": 21},
  "3": {"name": "3번", "color": "#0000FF", "button_pin": 22, "led_pin": 23}
}
```

## 실행

### 수동 실행
```bash
# 테스트 실행
python3 main.py

# 백그라운드 실행
nohup python3 main.py > output.log 2>&1 &
```

### 시스템 서비스 등록
```bash
# 서비스 파일 복사
sudo cp bus-stop.service /etc/systemd/system/

# 서비스 활성화
sudo systemctl daemon-reload
sudo systemctl enable bus-stop
sudo systemctl start bus-stop

# 상태 확인
sudo systemctl status bus-stop

# 로그 확인
sudo journalctl -u bus-stop -f
```

## 사용법

### 1. 시스템 시작
- 전원을 켜면 자동으로 시작
- LED 테스트 후 준비 완료

### 2. 버스 호출
- 원하는 노선 버튼 누르기
- LED가 켜지며 호출 신호 전송
- 서버 확인 후 LED 깜빡임

### 3. 호출 취소
- 서버에서 자동으로 처리
- LED가 꺼지면 취소 완료

## 모니터링

### 로그 확인
```bash
# 실시간 로그
tail -f bus_stop.log

# 시스템 로그
sudo journalctl -u bus-stop -f

# 오류만 필터링
grep ERROR bus_stop.log
```

### 상태 확인
```bash
# 서비스 상태
sudo systemctl status bus-stop

# MQTT 연결 확인
mosquitto_sub -h localhost -t "device/status/STOP001"

# GPIO 상태 확인
gpio readall
```

## 문제 해결

### MQTT 연결 실패
```bash
# 브로커 접근 확인
mosquitto_pub -h broker-host -t test -m "hello"

# 방화벽 확인
sudo ufw status

# 네트워크 확인
ping broker-host
```

### GPIO 오류
```bash
# 권한 확인
groups pi

# GPIO 상태 확인
gpio readall

# 서비스 재시작
sudo systemctl restart bus-stop
```

### LED 안 켜짐
1. 하드웨어 연결 확인
2. 저항값 확인 (220Ω)
3. GPIO 핀 번호 확인
4. 전원 공급 확인

### 버튼 안 눌림
1. Pull-up 저항 확인 (10KΩ)
2. 디바운스 시간 조정
3. 버튼 하드웨어 확인

## 유지보수

### 정기 점검 (월 1회)
- [ ] LED 동작 확인
- [ ] 버튼 동작 확인  
- [ ] MQTT 연결 상태
- [ ] 로그 파일 크기
- [ ] 시스템 업데이트

### 로그 정리
```bash
# 로그 로테이션 설정
sudo nano /etc/logrotate.d/bus-stop

# 내용:
/home/pi/raspberry/bus_stop.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### 백업
```bash
# 설정 백업
tar -czf backup-$(date +%Y%m%d).tar.gz .env config.py

# 전체 시스템 백업 (선택)
sudo dd if=/dev/mmcblk0 of=backup.img bs=4M
```

## API 참조

### MQTT 토픽

#### 발행 (Publish)
- `device/button/{stopId}/{routeId}` - 버튼 클릭
- `device/status/{stopId}` - 정류장 상태
- `device/heartbeat/{stopId}` - 하트비트

#### 구독 (Subscribe)  
- `device/led/{stopId}/{routeId}` - LED 제어
- `system/health` - 시스템 헬스

### 메시지 형식

#### 버튼 클릭
```json
{
  "stopId": "STOP001",
  "routeId": "1", 
  "routeName": "1번",
  "buttonColor": "#FF0000",
  "timestamp": "2024-01-01T12:00:00Z",
  "passengerCount": 1
}
```

#### LED 제어
```json
{
  "status": "ON|OFF|BLINK",
  "duration": 2.0,
  "interval": 0.5,
  "color": "#FF0000",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## 라이선스

이 프로젝트는 MIT 라이선스하에 배포됩니다.

## 지원

문제 발생 시:
1. 로그 파일 확인
2. GitHub Issues 등록
3. 기술 지원팀 연락 