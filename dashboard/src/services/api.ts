import { ButtonPressPayload, BusLocationPayload } from '../types';

const API_BASE = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

async function request(path: string, body: any) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`API ${path} 실패`, await res.text());
  }
}

export default {
  pressButton(payload: ButtonPressPayload) {
    return request('/button-press', payload);
  },
  updateBusLocation(payload: BusLocationPayload) {
    return request('/bus-location', payload);
  },
}; 