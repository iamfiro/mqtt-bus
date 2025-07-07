#!/bin/bash

# 버스정류장 시스템 중지 스크립트

echo "🛑 스마트 버스정류장 시스템 중지"

# 서비스 상태 확인
if ! systemctl is-active --quiet bus-stop; then
    echo "⚠️ 서비스가 실행되고 있지 않습니다"
    exit 0
fi

# 서비스 중지
echo "🔄 서비스 중지 중..."
sudo systemctl stop bus-stop

# 중지 대기
sleep 2

# 상태 확인
if ! systemctl is-active --quiet bus-stop; then
    echo "✅ 서비스 중지 완료"
else
    echo "❌ 서비스 중지 실패"
    echo "강제 중지를 시도합니다..."
    sudo systemctl kill bus-stop
    sleep 1
    
    if ! systemctl is-active --quiet bus-stop; then
        echo "✅ 강제 중지 완료"
    else
        echo "❌ 강제 중지 실패"
        exit 1
    fi
fi 