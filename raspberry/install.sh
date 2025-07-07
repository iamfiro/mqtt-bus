#!/bin/bash

# 스마트 버스정류장 시스템 설치 스크립트

set -e

echo "🚏 스마트 버스정류장 시스템 설치 시작"

# 권한 체크
if [ "$EUID" -eq 0 ]; then
    echo "❌ root 사용자로 실행하지 마세요. pi 사용자로 실행해주세요."
    exit 1
fi

# 현재 디렉토리 설정
INSTALL_DIR=$(pwd)
echo "📁 설치 디렉토리: $INSTALL_DIR"

# 1. 시스템 업데이트
echo "🔄 시스템 업데이트 중..."
sudo apt update && sudo apt upgrade -y

# 2. 필수 패키지 설치
echo "📦 필수 패키지 설치 중..."
sudo apt install -y python3-pip python3-venv git mosquitto-clients

# 3. Python 의존성 설치
echo "🐍 Python 의존성 설치 중..."
pip3 install -r requirements.txt

# 4. GPIO 권한 설정
echo "⚡ GPIO 권한 설정 중..."
sudo usermod -a -G gpio pi

# 5. 서비스 파일 설치
echo "🔧 시스템 서비스 설정 중..."
sudo cp bus-stop.service /etc/systemd/system/
sudo systemctl daemon-reload

# 6. 로그 로테이션 설정
echo "📝 로그 로테이션 설정 중..."
sudo tee /etc/logrotate.d/bus-stop > /dev/null <<EOF
$INSTALL_DIR/bus_stop.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 pi pi
}
EOF

# 7. 환경 설정 파일 생성
if [ ! -f .env ]; then
    echo "⚙️ 환경 설정 파일 생성 중..."
    cat > .env <<EOF
# MQTT 브로커 설정
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=

# 정류장 정보
STOP_ID=STOP001
STOP_NAME=시청앞정류장

# GPIO 설정  
GPIO_MODE=BCM
DEBOUNCE_TIME=0.3

# 로깅
LOG_LEVEL=INFO
LOG_FILE=bus_stop.log
EOF
    echo "📝 .env 파일을 수정하여 설정을 완료해주세요."
fi

# 8. 실행 권한 설정
chmod +x main.py
chmod +x start.sh
chmod +x stop.sh

echo "✅ 설치 완료!"
echo ""
echo "다음 단계:"
echo "1. .env 파일을 수정하여 MQTT 브로커 정보를 설정하세요"
echo "2. 하드웨어 연결을 확인하세요"
echo "3. 서비스를 시작하세요: sudo systemctl start bus-stop"
echo "4. 자동 시작을 활성화하세요: sudo systemctl enable bus-stop"
echo ""
echo "명령어:"
echo "  테스트 실행: python3 main.py"
echo "  서비스 시작: sudo systemctl start bus-stop"
echo "  서비스 상태: sudo systemctl status bus-stop"
echo "  로그 확인: sudo journalctl -u bus-stop -f" 