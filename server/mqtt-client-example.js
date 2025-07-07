const mqtt = require('mqtt');

// MQTT 브로커 연결
const client = mqtt.connect('mqtt://localhost:1883', {
  clientId: `mqtt-client-example-${Date.now()}`,
  clean: true,
  keepalive: 60
});

client.on('connect', () => {
  console.log('🔗 Connected to MQTT broker');
  
  // 모든 이벤트 구독
  client.subscribe('events/+', (err) => {
    if (!err) {
      console.log('📡 Subscribed to all events');
    }
  });
  
  // 시스템 상태 구독
  client.subscribe('system/server/status', (err) => {
    if (!err) {
      console.log('📊 Subscribed to system status');
    }
  });
  
  // LED 상태 구독
  client.subscribe('device/led/+/+', (err) => {
    if (!err) {
      console.log('💡 Subscribed to LED status updates');
    }
  });

  // 예제 실행
  runExamples();
});

client.on('message', (topic, message) => {
  const payload = JSON.parse(message.toString());
  console.log(`\n📥 Received message on ${topic}:`);
  console.log(JSON.stringify(payload, null, 2));
});

client.on('error', (err) => {
  console.error('❌ MQTT connection error:', err);
});

async function runExamples() {
  console.log('\n🚀 Running MQTT client examples...\n');
  
  // 1초 간격으로 예제 실행
  setTimeout(() => healthCheckExample(), 1000);
  setTimeout(() => systemInfoExample(), 3000);
  setTimeout(() => buttonPressExample(), 5000);
  setTimeout(() => busLocationExample(), 7000);
  setTimeout(() => getActiveCallsExample(), 9000);
  setTimeout(() => cancelCallExample(), 11000);
  
  // 13초 후 종료
  setTimeout(() => {
    console.log('\n✅ Examples completed. Disconnecting...');
    client.end();
    process.exit(0);
  }, 13000);
}

function healthCheckExample() {
  console.log('1. 🏥 Health Check Example');
  
  const requestId = `health-${Date.now()}`;
  const request = {
    id: requestId,
    method: 'health',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  // 응답 구독
  client.subscribe(`rpc/response/${requestId}`, (err) => {
    if (!err) {
      console.log(`   Subscribed to response topic: rpc/response/${requestId}`);
    }
  });
  
  // 요청 발행
  client.publish('rpc/request/health', JSON.stringify(request), { qos: 1 });
  console.log('   Health check request sent');
}

function systemInfoExample() {
  console.log('\n2. ℹ️  System Info Example');
  
  const requestId = `info-${Date.now()}`;
  const request = {
    id: requestId,
    method: 'info',
    params: {},
    timestamp: new Date().toISOString()
  };
  
  // 응답 구독
  client.subscribe(`rpc/response/${requestId}`, (err) => {
    if (!err) {
      console.log(`   Subscribed to response topic: rpc/response/${requestId}`);
    }
  });
  
  // 요청 발행
  client.publish('rpc/request/info', JSON.stringify(request), { qos: 1 });
  console.log('   System info request sent');
}

function buttonPressExample() {
  console.log('\n3. 🔘 Button Press Example');
  
  // RPC 방식
  const requestId = `button-${Date.now()}`;
  const request = {
    id: requestId,
    method: 'buttonPress',
    params: {
      stopId: 'STOP_GANGNAM_001',
      routeId: 'ROUTE_A',
      routeName: 'A노선 (강남역)',
      buttonColor: '#FF0000',
      passengerCount: 2
    },
    timestamp: new Date().toISOString()
  };
  
  // 응답 구독
  client.subscribe(`rpc/response/${requestId}`, (err) => {
    if (!err) {
      console.log(`   Subscribed to response topic: rpc/response/${requestId}`);
    }
  });
  
  // 요청 발행
  client.publish('rpc/request/buttonPress', JSON.stringify(request), { qos: 1 });
  console.log('   Button press request sent (RPC)');
  
  // Device 방식도 테스트
  setTimeout(() => {
    const devicePayload = {
      routeName: 'B노선 (홍대입구)',
      buttonColor: '#00FF00',
      passengerCount: 1
    };
    
    client.publish('device/button/STOP_HONGDAE_001/ROUTE_B', JSON.stringify(devicePayload), { qos: 1 });
    console.log('   Button press sent (Device)');
  }, 500);
}

function busLocationExample() {
  console.log('\n4. 🚌 Bus Location Example');
  
  const busLocations = [
    {
      busId: 'BUS_001',
      routeId: 'ROUTE_A',
      latitude: 37.4979,
      longitude: 127.0276,
      speed: 35,
      heading: 90,
      accuracy: 5
    },
    {
      busId: 'BUS_002',
      routeId: 'ROUTE_B',
      latitude: 37.5563,
      longitude: 126.9215,
      speed: 20,
      heading: 180,
      accuracy: 3
    }
  ];
  
  busLocations.forEach((location, index) => {
    setTimeout(() => {
      client.publish(`device/bus/${location.busId}/location`, JSON.stringify(location), { qos: 1 });
      console.log(`   Bus ${location.busId} location sent`);
    }, index * 300);
  });
}

function getActiveCallsExample() {
  console.log('\n5. 📋 Get Active Calls Example');
  
  const requestId = `calls-${Date.now()}`;
  const request = {
    id: requestId,
    method: 'getActiveCalls',
    params: {
      stopId: 'STOP_GANGNAM_001'
    },
    timestamp: new Date().toISOString()
  };
  
  // 응답 구독
  client.subscribe(`rpc/response/${requestId}`, (err) => {
    if (!err) {
      console.log(`   Subscribed to response topic: rpc/response/${requestId}`);
    }
  });
  
  // 요청 발행
  client.publish('rpc/request/getActiveCalls', JSON.stringify(request), { qos: 1 });
  console.log('   Active calls request sent');
}

function cancelCallExample() {
  console.log('\n6. ❌ Cancel Call Example');
  
  const requestId = `cancel-${Date.now()}`;
  const request = {
    id: requestId,
    method: 'cancelCall',
    params: {
      stopId: 'STOP_GANGNAM_001',
      routeId: 'ROUTE_A'
    },
    timestamp: new Date().toISOString()
  };
  
  // 응답 구독
  client.subscribe(`rpc/response/${requestId}`, (err) => {
    if (!err) {
      console.log(`   Subscribed to response topic: rpc/response/${requestId}`);
    }
  });
  
  // 요청 발행
  client.publish('rpc/request/cancelCall', JSON.stringify(request), { qos: 1 });
  console.log('   Cancel call request sent');
} 