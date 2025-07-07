declare module 'kalman-filter' {
  interface KalmanFilterOptions<T> {
    observation: {
      dimension?: number;
      stateProjection?: number[][];
      covariance?: number[][];
    };
    transition: {
      stateProjection?: number[][];
      covariance?: number[][];
    };
    dynamic?: {
      dimension?: number;
      stateProjection?: any;
      covariance?: any;
      transition?: any;
    };
  }

  interface KalmanState {
    mean: number[];
    covariance: number[][];
  }

  class KalmanFilter<T = any> {
    constructor(options: any);
    init(state: any): void;
    filter(observation: any): any;
    predict(): any;
    correct(observation: any): any;
  }

  export = KalmanFilter;
} 