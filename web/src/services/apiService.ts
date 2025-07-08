import axios, { AxiosInstance, AxiosResponse } from 'axios';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

interface BusCall {
  stopId: string;
  routeId: string;
  timestamp: string;
}



interface ETAData {
  stopId: string;
  routeId: string;
  busId: string;
  estimatedArrival: string;
  distance: number;
  accuracy: string;
}

class ApiService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    // 개발 환경에서는 proxy 사용, 프로덕션에서는 직접 URL
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://your-api-domain.com'
      : ''; // proxy 사용

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 요청 인터셉터
    this.client.interceptors.request.use(
      (config) => {
        console.log(`🚀 API 요청: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ API 요청 오류:', error);
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.client.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        console.log(`✅ API 응답: ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        console.error('❌ API 응답 오류:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // 🏥 헬스 체크
  async getHealth(): Promise<ApiResponse> {
    const response = await this.client.get('/api/v1/health');
    return response.data;
  }

  // 🚌 버스 호출 생성
  async createBusCall(stopId: string, routeId: string): Promise<ApiResponse<BusCall>> {
    const response = await this.client.post('/api/v1/calls', {
      stopId,
      routeId,
      timestamp: new Date().toISOString()
    });
    return response.data;
  }

  // 🚌 버스 호출 취소
  async cancelBusCall(stopId: string, routeId: string): Promise<ApiResponse> {
    const response = await this.client.delete(`/api/v1/calls/${stopId}/${routeId}`);
    return response.data;
  }



  // ⏰ ETA 조회
  async getETA(stopId: string, routeId?: string): Promise<ApiResponse<ETAData[]>> {
    const url = routeId 
      ? `/api/v1/arrival/${stopId}?routeId=${routeId}`
      : `/api/v1/arrival/${stopId}`;
    const response = await this.client.get(url);
    return response.data;
  }

  // 📊 정류장 통계
  async getStopStats(stopId: string): Promise<ApiResponse> {
    const response = await this.client.get(`/api/v1/stats/stops/${stopId}`);
    return response.data;
  }

  // 🗺️ 모든 정류장 목록
  async getAllStops(): Promise<ApiResponse> {
    const response = await this.client.get('/api/v1/stops');
    return response.data;
  }

  // 🚍 모든 노선 목록
  async getAllRoutes(): Promise<ApiResponse> {
    const response = await this.client.get('/api/v1/routes');
    return response.data;
  }

  // 📈 시스템 통계
  async getSystemStats(): Promise<ApiResponse> {
    const response = await this.client.get('/api/v1/stats');
    return response.data;
  }

  // 🔄 연결 상태 확인
  async checkConnection(): Promise<boolean> {
    try {
      await this.getHealth();
      return true;
    } catch (error) {
      console.error('서버 연결 실패:', error);
      return false;
    }
  }
}

export default new ApiService(); 