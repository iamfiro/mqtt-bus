import swaggerJSDoc from 'swagger-jsdoc';
import path from 'path';

// 디버깅을 위한 로그
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

const swaggerDefinition: swaggerJSDoc.SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: '🚌 스마트 버스정류장 벨 시스템 API',
    version: '1.0.0',
    description: `
## 📋 시스템 개요

노선별 구분이 되는 스마트 버스정류장 벨 시스템의 백엔드 API입니다.

### 🎯 주요 기능
- **노선별 버튼**: 색상으로 구분된 물리적 버튼으로 특정 노선 호출
- **실시간 알림**: 1초 이내의 빠른 도착 알림
- **스마트폰 독립적**: 누구나 쉽게 사용 가능한 물리적 인터페이스
- **확장 가능한 플랫폼**: REST API, WebSocket, GTFS-Realtime 지원

### 🔧 기술 스택
- **백엔드**: Node.js, TypeScript, Express.js
- **데이터베이스**: Redis (TimeSeries)
- **메시징**: Apache Kafka, MQTT
- **IoT**: ESP32/STM32, GPS/GNSS
- **API**: REST, WebSocket, GTFS-Realtime

### 📊 시스템 아키텍처
\`\`\`
[정류장 버튼] → [MQTT] → [Kafka] → [ETA 엔진] → [Redis] → [WebSocket/API]
\`\`\`
    `,
    contact: {
      name: '스마트 버스정류장 벨 시스템',
      email: 'admin@smartbusstop.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000/api/v1',
      description: '개발 서버'
    },
    {
      url: 'https://api.smartbusstop.com/api/v1',
      description: '프로덕션 서버'
    }
  ],
  paths: {
    // =============================================================================
    // System APIs
    // =============================================================================
    '/health': {
      get: {
        tags: ['System'],
        summary: '시스템 헬스 체크',
        description: 'Redis, MQTT, ETA 처리 엔진의 상태를 확인합니다.',
        responses: {
          '200': {
            description: '시스템이 정상적으로 작동 중',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/SystemHealth' }
                      }
                    }
                  ]
                }
              }
            }
          },
          '503': {
            description: '하나 이상의 서비스가 비정상 상태',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    },
    '/info': {
      get: {
        tags: ['System'],
        summary: '시스템 정보 조회',
        description: '시스템 이름, 버전, 가동 시간, 메모리 사용량 등 기본 정보를 반환합니다.',
        responses: {
          '200': {
            description: '시스템 정보',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/SystemInfo' }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/stats': {
      get: {
        tags: ['System'],
        summary: '시스템 통계 조회',
        description: 'ETA 처리 통계 및 시스템 성능 지표를 반환합니다.',
        responses: {
          '200': {
            description: '시스템 통계',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiResponse' }
              }
            }
          }
        }
      }
    },

    // =============================================================================
    // Button Calls APIs
    // =============================================================================
    '/button-press': {
      post: {
        tags: ['Button Calls'],
        summary: '정류장 버튼 클릭 처리',
        description: '정류장에서 특정 노선 버튼이 눌렸을 때 호출을 등록합니다.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['stopId', 'routeId', 'routeName'],
                properties: {
                  stopId: {
                    type: 'string',
                    description: '정류장 ID',
                    example: 'BUS_STOP_001'
                  },
                  routeId: {
                    type: 'string',
                    description: '노선 ID',
                    example: 'ROUTE_A'
                  },
                  routeName: {
                    type: 'string',
                    description: '노선 이름',
                    example: 'A노선'
                  },
                  buttonColor: {
                    type: 'string',
                    description: '버튼 색상 (HEX)',
                    example: '#FF0000'
                  },
                  passengerCount: {
                    type: 'integer',
                    minimum: 1,
                    description: '승객 수',
                    example: 2
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: '버튼 클릭이 성공적으로 등록됨',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            message: { type: 'string' },
                            call: { $ref: '#/components/schemas/BusStopCall' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },
    '/stops/{stopId}/calls': {
      get: {
        tags: ['Button Calls'],
        summary: '정류장의 활성 호출 조회',
        description: '특정 정류장에서 현재 활성화된 모든 버튼 호출을 조회합니다.',
        parameters: [
          { $ref: '#/components/parameters/StopId' }
        ],
        responses: {
          '200': {
            description: '활성 호출 목록',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            stopId: { type: 'string', description: '정류장 ID' },
                            activeCalls: {
                              type: 'array',
                              items: { $ref: '#/components/schemas/BusStopCall' }
                            },
                            count: { type: 'integer', description: '활성 호출 수' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      },
      post: {
        tags: ['Control'],
        summary: '수동 버튼 호출 생성',
        description: '테스트용으로 수동으로 버튼 호출을 생성합니다.',
        parameters: [
          { $ref: '#/components/parameters/StopId' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['routeId'],
                properties: {
                  routeId: { type: 'string', description: '노선 ID', example: 'ROUTE_A' },
                  routeName: { type: 'string', description: '노선 이름', example: 'A노선' },
                  buttonColor: { type: 'string', description: '버튼 색상 (HEX)', example: '#FF0000' },
                  passengerCount: { type: 'integer', minimum: 1, description: '승객 수', example: 2 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: '호출이 성공적으로 생성됨',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/BusStopCall' }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },

    // =============================================================================
    // Bus Location APIs
    // =============================================================================
    '/bus-location': {
      post: {
        tags: ['Bus Location'],
        summary: '버스 위치 업데이트',
        description: '버스의 현재 위치 정보를 업데이트합니다 (시뮬레이션 및 테스트용).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['busId', 'routeId', 'latitude', 'longitude'],
                properties: {
                  busId: { type: 'string', description: '버스 ID', example: 'BUS_001' },
                  routeId: { type: 'string', description: '노선 ID', example: 'ROUTE_A' },
                  latitude: { type: 'number', format: 'double', description: '위도', example: 37.5665 },
                  longitude: { type: 'number', format: 'double', description: '경도', example: 126.9780 },
                  speed: { type: 'number', format: 'double', minimum: 0, description: '속도 (km/h)', example: 30.5 },
                  heading: { type: 'number', format: 'double', minimum: 0, maximum: 360, description: '방향 (degrees)', example: 90.0 },
                  accuracy: { type: 'number', format: 'double', description: '위치 정확도 (meters)', example: 5.0 }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: '버스 위치가 성공적으로 업데이트됨',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            message: { type: 'string' },
                            location: { $ref: '#/components/schemas/BusLocation' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },
    '/buses/{busId}/location': {
      get: {
        tags: ['Bus Location'],
        summary: '버스 위치 조회',
        description: '특정 버스의 현재 위치 정보를 조회합니다.',
        parameters: [
          { $ref: '#/components/parameters/BusId' }
        ],
        responses: {
          '200': {
            description: '버스 위치 정보',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/BusLocation' }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },
    '/routes/{routeId}/buses': {
      get: {
        tags: ['Bus Location'],
        summary: '노선의 모든 버스 조회',
        description: '특정 노선에 속한 모든 버스의 위치 정보를 조회합니다.',
        parameters: [
          { $ref: '#/components/parameters/RouteId' }
        ],
        responses: {
          '200': {
            description: '노선의 버스 목록',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/BusLocation' }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },

    // =============================================================================
    // ETA APIs
    // =============================================================================
    '/stops/{stopId}/eta': {
      get: {
        tags: ['ETA'],
        summary: '정류장의 ETA 조회',
        description: '특정 정류장에 대한 모든 버스의 예상 도착 시간을 조회합니다.',
        parameters: [
          { $ref: '#/components/parameters/StopId' }
        ],
        responses: {
          '200': {
            description: 'ETA 목록',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/ETACalculation' }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },
    '/buses/{busId}/eta/{stopId}': {
      get: {
        tags: ['ETA'],
        summary: '특정 버스의 ETA 조회',
        description: '특정 버스가 특정 정류장에 도착할 예상 시간을 조회합니다.',
        parameters: [
          { $ref: '#/components/parameters/BusId' },
          { $ref: '#/components/parameters/StopId' }
        ],
        responses: {
          '200': {
            description: 'ETA 정보',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: { $ref: '#/components/schemas/ETACalculation' }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },

    // =============================================================================
    // Control APIs
    // =============================================================================
    '/stops/{stopId}/calls/{routeId}': {
      delete: {
        tags: ['Control'],
        summary: '버튼 호출 해제',
        description: '특정 정류장의 특정 노선 버튼 호출을 해제합니다.',
        parameters: [
          { $ref: '#/components/parameters/StopId' },
          { $ref: '#/components/parameters/RouteId' }
        ],
        responses: {
          '200': {
            description: '호출이 성공적으로 해제됨',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            message: { type: 'string', example: 'Call deactivated successfully' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },
    '/stops/{stopId}/led/{routeId}': {
      post: {
        tags: ['Control'],
        summary: 'LED 상태 업데이트',
        description: '특정 정류장의 특정 노선 버튼 LED 상태를 업데이트합니다.',
        parameters: [
          { $ref: '#/components/parameters/StopId' },
          { $ref: '#/components/parameters/RouteId' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['ON', 'OFF'],
                    description: 'LED 상태',
                    example: 'ON'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'LED 상태가 성공적으로 업데이트됨',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiResponse' },
                    {
                      type: 'object',
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            message: { type: 'string', example: 'LED ON command sent' }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalError' }
        }
      }
    },

    // =============================================================================
    // GTFS APIs
    // =============================================================================
    '/gtfs/vehicle-positions': {
      get: {
        tags: ['GTFS'],
        summary: 'GTFS-Realtime 차량 위치 피드',
        description: 'GTFS-Realtime 형식으로 모든 버스의 위치 정보를 제공합니다. (향후 구현 예정)',
        responses: {
          '200': {
            description: 'GTFS-Realtime 차량 위치 데이터',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'GTFS-Realtime vehicle positions endpoint - To be implemented' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '501': {
            description: '아직 구현되지 않음'
          }
        }
      }
    },
    '/gtfs/trip-updates': {
      get: {
        tags: ['GTFS'],
        summary: 'GTFS-Realtime 여행 업데이트 피드',
        description: 'GTFS-Realtime 형식으로 여행 업데이트 정보를 제공합니다. (향후 구현 예정)',
        responses: {
          '200': {
            description: 'GTFS-Realtime 여행 업데이트 데이터',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'GTFS-Realtime trip updates endpoint - To be implemented' },
                    timestamp: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '501': {
            description: '아직 구현되지 않음'
          }
        }
      }
    }
  },
  components: {
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: '요청 성공 여부',
            example: true
          },
          data: {
            description: '응답 데이터 (성공시에만 포함)',
            oneOf: [
              { type: 'object' },
              { type: 'array' },
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' }
            ]
          },
          error: {
            type: 'string',
            description: '에러 메시지 (실패시에만 포함)',
            example: 'Invalid request parameters'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: '응답 생성 시간',
            example: '2024-01-15T10:30:00.000Z'
          }
        },
        required: ['success', 'timestamp']
      },
      BusStopCall: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '호출 고유 ID',
            example: 'call_BUS_STOP_001_ROUTE_A_1734844008889'
          },
          stopId: {
            type: 'string',
            description: '정류장 ID',
            example: 'BUS_STOP_001'
          },
          routeId: {
            type: 'string',
            description: '노선 ID',
            example: 'ROUTE_A'
          },
          routeName: {
            type: 'string',
            description: '노선 이름',
            example: 'A노선'
          },
          buttonColor: {
            type: 'string',
            description: '버튼 색상',
            example: '#FF0000'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: '호출 시간'
          },
          isActive: {
            type: 'boolean',
            description: '활성 상태'
          },
          passengerCount: {
            type: 'integer',
            minimum: 1,
            description: '승객 수',
            example: 2
          }
        },
        required: ['id', 'stopId', 'routeId', 'routeName', 'timestamp', 'isActive']
      },
      BusLocation: {
        type: 'object',
        properties: {
          busId: {
            type: 'string',
            description: '버스 고유 ID',
            example: 'BUS_001'
          },
          routeId: {
            type: 'string',
            description: '버스가 운행 중인 노선 ID',
            example: 'ROUTE_A'
          },
          latitude: {
            type: 'number',
            format: 'double',
            minimum: -90,
            maximum: 90,
            description: '위도 (GPS 좌표)',
            example: 37.5665
          },
          longitude: {
            type: 'number',
            format: 'double',
            minimum: -180,
            maximum: 180,
            description: '경도 (GPS 좌표)',
            example: 126.9780
          },
          speed: {
            type: 'number',
            minimum: 0,
            description: '현재 속도 (km/h)',
            example: 35.5
          },
          heading: {
            type: 'number',
            minimum: 0,
            maximum: 359,
            description: '진행 방향 (도, 북쪽 기준)',
            example: 180
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'GPS 데이터 수신 시간'
          }
        },
        required: ['busId', 'routeId', 'latitude', 'longitude', 'timestamp']
      },
      ETACalculation: {
        type: 'object',
        properties: {
          busId: {
            type: 'string',
            description: '버스 ID',
            example: 'BUS_001'
          },
          stopId: {
            type: 'string',
            description: '정류장 ID',
            example: 'BUS_STOP_001'
          },
          routeId: {
            type: 'string',
            description: '노선 ID',
            example: 'ROUTE_A'
          },
          distanceMeters: {
            type: 'number',
            minimum: 0,
            description: '남은 거리 (미터)',
            example: 1250.5
          },
          estimatedArrivalTime: {
            type: 'string',
            format: 'date-time',
            description: '예상 도착 시간'
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: '예측 신뢰도 (0-1)',
            example: 0.85
          }
        },
        required: ['busId', 'stopId', 'routeId', 'distanceMeters', 'estimatedArrivalTime', 'confidence']
      },
      SystemHealth: {
        type: 'object',
        properties: {
          redis: {
            type: 'boolean',
            description: 'Redis 연결 상태'
          },
          mqtt: {
            type: 'boolean',
            description: 'MQTT 브로커 연결 상태'
          },
          etaProcessor: {
            type: 'boolean',
            description: 'ETA 처리 엔진 상태'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: '상태 확인 시간'
          }
        },
        required: ['redis', 'mqtt', 'etaProcessor', 'timestamp']
      },
      SystemInfo: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '시스템 이름',
            example: 'Smart Bus Stop Bell System'
          },
          version: {
            type: 'string',
            description: '버전',
            example: '1.0.0'
          },
          uptime: {
            type: 'number',
            description: '가동 시간 (seconds)',
            example: 3600.25
          },
          environment: {
            type: 'string',
            description: '환경',
            example: 'development'
          },
          memory: {
            type: 'object',
            properties: {
              rss: { type: 'number', description: 'RSS 메모리' },
              heapTotal: { type: 'number', description: '힙 총 메모리' },
              heapUsed: { type: 'number', description: '힙 사용 메모리' },
              external: { type: 'number', description: '외부 메모리' }
            }
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: '정보 조회 시간'
          }
        },
        required: ['name', 'version', 'uptime', 'environment', 'memory', 'timestamp']
      },
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'string',
            description: '에러 메시지'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: '에러 발생 시간'
          }
        },
        required: ['success', 'error', 'timestamp']
      }
    },
    parameters: {
      StopId: {
        name: 'stopId',
        in: 'path',
        required: true,
        description: '정류장 ID',
        schema: {
          type: 'string',
          example: 'BUS_STOP_001'
        }
      },
      RouteId: {
        name: 'routeId',
        in: 'path',
        required: true,
        description: '노선 ID',
        schema: {
          type: 'string',
          example: 'ROUTE_A'
        }
      },
      BusId: {
        name: 'busId',
        in: 'path',
        required: true,
        description: '버스 ID',
        schema: {
          type: 'string',
          example: 'BUS_001'
        }
      }
    },
    responses: {
      Success: {
        description: '성공',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiResponse'
            }
          }
        }
      },
      BadRequest: {
        description: '잘못된 요청',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      NotFound: {
        description: '리소스를 찾을 수 없음',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      InternalError: {
        description: '내부 서버 오류',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: 'System',
      description: '시스템 상태 및 정보'
    },
    {
      name: 'Button Calls',
      description: '정류장 버튼 호출 관리'
    },
    {
      name: 'Bus Location',
      description: '버스 위치 추적'
    },
    {
      name: 'ETA',
      description: '도착 예정 시간 계산'
    },
    {
      name: 'Control',
      description: '시스템 제어 (LED, 호출 해제 등)'
    },
    {
      name: 'GTFS',
      description: 'GTFS-Realtime 호환 API'
    }
  ]
};

const options: swaggerJSDoc.Options = {
  definition: swaggerDefinition,
  apis: [], // 모든 경로가 직접 정의됨
};

export const swaggerSpec = swaggerJSDoc(options);
export default swaggerSpec; 