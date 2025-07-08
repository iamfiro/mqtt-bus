import api from './api';

export interface BusState {
  position: any;
  index: number;
}

class BusSimulator {
  private timer: number | null = null;
  private path: any[] = [];
  private idx = 0;
  private busId = `BUS_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  startSimulation(path: any[], onUpdate: (state: BusState) => void) {
    this.stopSimulation();
    this.path = path;
    this.idx = 0;

    const tick = () => {
      if (!this.path.length) return;
      const position = this.path[this.idx];
      onUpdate({ position, index: this.idx });

      // 서버에 위치 업데이트
      api.updateBusLocation({
        busId: this.busId,
        routeId: 'ROUTE_A',
        latitude: position.lat(),
        longitude: position.lng(),
        speed: 30,
        heading: 0,
      });

      this.idx = (this.idx + 1) % this.path.length;
    };

    tick();
    this.timer = window.setInterval(tick, 1000);
  }

  stopSimulation() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export default new BusSimulator(); 