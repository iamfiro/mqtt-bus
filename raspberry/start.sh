#!/bin/bash

# 버스정류장 시스템 시작 스크립트

echo "🚏 스마트 버스정류장 시스템 시작"

# 서비스 상태 확인
if systemctl is-active --quiet bus-stop; then
    echo "⚠️ 서비스가 이미 실행 중입니다"
    echo "상태 확인: sudo systemctl status bus-stop"
    exit 0
fi

# 서비스 시작
echo "🔄 서비스 시작 중..."
sudo systemctl start bus-stop

# 시작 대기
sleep 2

# 상태 확인
if systemctl is-active --quiet bus-stop; then
    echo "✅ 서비스 시작 완료"
    echo "📊 상태: sudo systemctl status bus-stop"
    echo "📝 로그: sudo journalctl -u bus-stop -f"
else
    echo "❌ 서비스 시작 실패"
    echo "로그를 확인하세요: sudo journalctl -u bus-stop -n 20"
    exit 1
fi 