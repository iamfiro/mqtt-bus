import React from 'react';
import { Stop } from '../types';
import apiService from '../services/api';

interface Props {
  stops: Stop[];
  routeId: string;
}

const StopButtonPanel: React.FC<Props> = ({ stops, routeId }) => {
  const handlePress = (stop: Stop) => {
    apiService.pressButton({
      stopId: stop.id,
      routeId,
      routeName: '대시보드 노선',
      buttonColor: '#FF0000',
    });
  };

  return (
    <div style={{ width: 320, padding: 20, background: '#fafafa', overflowY: 'auto' }}>
      <h2>정류장 호출 패널</h2>
      {stops.map((stop) => (
        <div key={stop.id} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 'bold' }}>{stop.name}</div>
          <button onClick={() => handlePress(stop)} style={{ marginTop: 4 }}>
            호출
          </button>
        </div>
      ))}
    </div>
  );
};

export default StopButtonPanel; 