import React, { useState, useEffect } from 'react';
import communicationService from '../services/communicationService';
import { BusNotification } from '../types';

const BusNotificationScreen: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState({ api: false, websocket: false, mqtt: false });
  const [isBlinking, setIsBlinking] = useState(false);
  const [busId] = useState(() => `BUS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
  const [routeId] = useState(() => `ROUTE-${Math.floor(Math.random() * 900) + 100}`);

  const [lastNotification, setLastNotification] = useState<BusNotification | null>(null);
  const [etaData, setEtaData] = useState<any[]>([]);

  useEffect(() => {
    // 통신 서비스 초기화
    const initializeCommunication = async () => {
      try {
        // 버스 모드로 초기화 (MQTT 활성화)
        communicationService.initialize({
          busId: busId,
          routeId: routeId,
          routeName: `노선 ${routeId}`
        });

        // 연결 상태 모니터링
        communicationService.on('connection-status', (status) => {
          console.log('연결 상태 업데이트:', status);
          setConnectionStatus(status);
        });

        // 정류장 호출 알림 리스너
        communicationService.on('button-pressed', (data) => {
          console.log('정류장 호출 알림:', data);
          setLastNotification({
            stopId: data.stopId,
            routeId: data.routeId,
            busId: busId,
            routeName: `노선 ${data.routeId}`,
            message: `정류장 ${data.stopId}에서 호출`,
            timestamp: data.timestamp,
            type: 'APPROACHING'
          });
          triggerBlink();
        });

        // MQTT 버스 알림 리스너
        communicationService.on('bus-notification', (notification) => {
          console.log('버스 알림 수신:', notification);
          setLastNotification(notification);
          triggerBlink();
        });

        // ETA 업데이트 리스너
        communicationService.on('eta-update', (data) => {
          console.log('ETA 업데이트:', data);
          setEtaData(prev => [...prev.slice(-4), data]); // 최근 5개만 유지
        });

        console.log('통신 서비스 초기화 완료');
        
      } catch (error) {
        console.error('통신 서비스 초기화 실패:', error);
      }
    };

    initializeCommunication();

    return () => {
      communicationService.disconnect();
    };
  }, [busId, routeId]);



  const triggerBlink = () => {
    setIsBlinking(true);
    setTimeout(() => {
      setIsBlinking(false);
    }, 3000); // 3초간 깜빡임
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: isBlinking ? '#ff0000' : '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      transition: isBlinking ? 'background-color 0.5s ease-in-out' : 'none',
      animation: isBlinking ? 'blink 0.5s ease-in-out infinite' : 'none'
    }}>
      <style>{`
        @keyframes blink {
          0%, 100% { background-color: #ff0000; }
          50% { background-color: #ffffff; }
        }
      `}</style>
      
      <div style={{
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '30px',
        borderRadius: '15px',
        textAlign: 'center',
        margin: '20px'
      }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '20px' }}>
          🚌 버스 운행 시스템
        </h1>
        
        <div style={{ fontSize: '1.5rem', marginBottom: '15px' }}>
          <strong>버스 ID:</strong> {busId}
        </div>
        
        <div style={{ fontSize: '1.5rem', marginBottom: '15px' }}>
          <strong>노선 ID:</strong> {routeId}
        </div>
        
        <div style={{ fontSize: '1.2rem', marginBottom: '15px' }}>
          <strong>연결 상태:</strong><br/>
          MQTT: {connectionStatus.mqtt ? '✅' : '❌'}
        </div>
        

        
        {etaData.length > 0 && (
          <div style={{ 
            fontSize: '1.2rem', 
            marginTop: '15px',
            padding: '15px',
            backgroundColor: '#2196F3',
            borderRadius: '10px'
          }}>
            <strong>ETA 정보:</strong><br/>
            {etaData.slice(-3).map((eta, index) => (
              <div key={index} style={{ margin: '5px 0' }}>
                정류장 {eta.stopId}: {eta.estimatedArrival}
              </div>
            ))}
          </div>
        )}

        {lastNotification && (
          <div style={{ 
            fontSize: '1.5rem', 
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#4CAF50',
            borderRadius: '10px'
          }}>
            <strong>최근 알림:</strong><br/>
            정류장 {lastNotification.stopId} 도착 예정<br/>
            <small>{new Date(lastNotification.timestamp).toLocaleTimeString()}</small>
          </div>
        )}
        
        {isBlinking && (
          <div style={{ 
            fontSize: '2rem', 
            marginTop: '20px',
            fontWeight: 'bold',
            color: '#ff0000'
          }}>
            ⚠️ 정류장 접근 알림! ⚠️
          </div>
        )}
      </div>
    </div>
  );
};

export default BusNotificationScreen; 