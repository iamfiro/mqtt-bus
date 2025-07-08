import React, { useEffect, useRef, useState } from 'react';
import { Stop } from '../types';
import busSimulator, { BusState } from '../services/busSimulator';
import mqttService from '../services/mqttService';

const stops: Stop[] = [
  { id: 'STOP_GANGNAM_001', name: '강남역', lat: 37.498095, lng: 127.02761 },
  { id: 'STOP_YEOKSAM_001', name: '역삼역', lat: 37.500868, lng: 127.036421 },
  { id: 'STOP_SEONGBOK_001', name: '선릉역', lat: 37.504503, lng: 127.050275 },
  { id: 'STOP_SAMSEONG_001', name: '삼성역', lat: 37.508643, lng: 127.063172 },
];

const MapDashboard: React.FC = () => {
  const mapRef = useRef<any>(null);
  const busMarkerRef = useRef<any>(null);
  const stopMarkersRef = useRef<Record<string, any>>({});
  const [busState, setBusState] = useState<BusState | null>(null);

  useEffect(() => {
    const init = () => {
      const naverMaps = (window as any).naver.maps;
      const center = new naverMaps.LatLng(stops[0].lat, stops[0].lng);
      const map = new naverMaps.Map('map', {
        center,
        zoom: 15,
      });
      mapRef.current = map;

      // 경로 폴리라인
      const routePath = stops.map((s) => new naverMaps.LatLng(s.lat, s.lng));
      new naverMaps.Polyline({
        map,
        path: routePath,
        strokeColor: '#2196F3',
        strokeWeight: 4,
      });

      // 정류장 마커 저장
      stops.forEach((stop) => {
        const marker = new naverMaps.Marker({
          map,
          position: new naverMaps.LatLng(stop.lat, stop.lng),
          icon: getStopIcon(false),
          title: stop.name,
        });
        stopMarkersRef.current[stop.id] = marker;
      });

      // 버스 마커
      const busMarker = new naverMaps.Marker({
        map,
        position: center,
        icon: {
          content:
            '<div style="background:#4CAF50;border-radius:50%;width:20px;height:20px;border:2px solid white;"></div>',
          anchor: new naverMaps.Point(10, 10),
        },
      });
      busMarkerRef.current = busMarker;

      // 시뮬레이션 시작
      busSimulator.startSimulation(routePath, (state: BusState) => {
        busMarker.setPosition(state.position);
        setBusState(state);
      });

      // MQTT 연결 및 이벤트 처리
      mqttService.connect();
      mqttService.on('button-pressed', ({ stopId }) => {
        const marker = stopMarkersRef.current[stopId];
        if (marker) marker.setIcon(getStopIcon(true));
      });
      mqttService.on('call-cancelled', ({ stopId }) => {
        const marker = stopMarkersRef.current[stopId];
        if (marker) marker.setIcon(getStopIcon(false));
      });
    };

    // 네이버 스크립트 로드 여부 확인
    if ((window as any).naver && (window as any).naver.maps) {
      init();
    } else {
      const scriptId = 'naver-map-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${(import.meta as any).env.VITE_NAVER_CLIENT_ID}`;
        script.async = true;
        script.onload = init;
        document.body.appendChild(script);
      } else {
        script.addEventListener('load', init);
      }
    }

    return () => {
      busSimulator.stopSimulation();
    };
  }, []);

  function getStopIcon(active: boolean) {
    const color = active ? '#FF0000' : '#FF9800';
    return {
      content: `<div style="background:${color};border-radius:50%;width:16px;height:16px;border:2px solid white;"></div>`,
      anchor: new (window as any).naver.maps.Point(8, 8),
    };
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div id="map" style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default MapDashboard; 