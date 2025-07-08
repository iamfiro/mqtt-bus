export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface ButtonPressPayload {
  stopId: string;
  routeId: string;
  routeName: string;
  buttonColor?: string;
  passengerCount?: number;
}

export interface BusLocationPayload {
  busId: string;
  routeId: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
} 