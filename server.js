const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7 // 아바타 썸네일(base64) 허용을 위해 10MB 버퍼
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 기본 구글 스프레드시트 설정
const SPREADSHEET_ID = '1JtuAIHo6TUqhZWT98ASbrG85IOHT96-uui8EzeK-9K4';

// 1. 스프레드시트 실시간 데이터 조회 API (CSV 추출 파싱)
app.get('/api/sheet-data', async (req, res) => {
  try {
    // 정확한 gid=0 시트 CSV 추출
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      return res.status(500).json({ error: '스프레드시트를 불러오는데 실패했습니다.' });
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.replace(/^"|"$/g, '').trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.replace(/^"|"$/g, '').trim());
      return values;
    });

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const records = [];
    let calculatedTotalKcal = 0;
    for (let i = 3; i < lines.length; i++) {
      const row = lines[i];
      if (!row || row.length < 2 || !row[1]) continue;
      
      const calMatch = (row[8] || '').match(/(\d+)/);
      if (calMatch) {
        calculatedTotalKcal += parseInt(calMatch[1], 10);
      }

      records.push({
        id: i - 2,
        name: row[1] || '',
        studentClass: row[2] || '',
        sport: row[3] || '러닝',
        startTime: row[4] || '',
        endTime: row[5] || '',
        duration: row[6] || '',
        distance: row[7] || (row[3] === '러닝' ? '5.2 km' : '4.0 km'),
        calories: row[8] || '',
        pace: row[9] || '',
        date: row[10] || todayStr // 오늘 날짜 태깅
      });
    }

    const summaryRow = lines[1] || [];
    const summary = {
      studentCount: summaryRow[1] || `${records.length}명`,
      totalTime: summaryRow[3] || '00:00:00',
      totalCalories: summaryRow[5] || `${calculatedTotalKcal.toLocaleString()} kcal`,
      avgPace: summaryRow[7] || '--:--'
    };

    res.json({
      success: true,
      summary,
      records,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('시트 조회 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. 구글 스프레드시트로 운동 기록 전송 프록시 API (Google Apps Script Webhook 연동)
app.post('/api/record', async (req, res) => {
  const { gasUrl, recordData } = req.body;
  
  if (!gasUrl) {
    return res.status(400).json({
      success: false,
      error: 'Google Apps Script 웹 앱 URL이 설정되지 않았습니다.'
    });
  }

  try {
    const gasResponse = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(recordData),
      redirect: 'follow'
    });

    const resultText = await gasResponse.text();
    let resultJson;
    try {
      resultJson = JSON.parse(resultText);
    } catch {
      resultJson = { raw: resultText };
    }

    res.json({
      success: true,
      message: '스프레드시트에 성공적으로 저장되었습니다.',
      result: resultJson
    });
  } catch (error) {
    console.error('GAS 전송 오류:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ================= Socket.io 실시간 위치 & 캐릭터 공유 =================
// 활성 접속 학생 맵 (socket.id => 학생 데이터)
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] 새 학생 연결됨: ${socket.id}`);

  // 1. 학생 가입 및 캐릭터 등록
  socket.on('user:join', (userData) => {
    const user = {
      socketId: socket.id,
      id: userData.id || socket.id,
      name: userData.name || '익명 학생',
      studentClass: userData.studentClass || '1-1',
      sport: userData.sport || '러닝',
      avatar: userData.avatar || '', // base64 또는 이모지
      lat: userData.lat || 37.5665,
      lng: userData.lng || 126.9780,
      distance: userData.distance || '0.0 km',
      pace: userData.pace || '--:--',
      status: userData.status || '대기중',
      lastSeen: Date.now()
    };

    activeUsers.set(socket.id, user);

    // 새 접속자에게 기존에 달리고 있는 친구들 목록 전송
    const allFriends = Array.from(activeUsers.values()).filter(u => u.socketId !== socket.id);
    socket.emit('users:list', allFriends);

    // 다른 모든 친구들에게 새 친구 등장 브로드캐스트
    socket.broadcast.emit('user:joined', user);

    // 전체 활성 접속자 수 갱신 알림
    io.emit('users:count', activeUsers.size);

    console.log(`[Socket] ${user.name}(${user.studentClass}) 참여 완료 (총 ${activeUsers.size}명 접속 중)`);
  });

  // 2. 실시간 GPS 위치 및 운동 메트릭 갱신
  socket.on('user:location', (locData) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    user.lat = locData.lat;
    user.lng = locData.lng;
    user.distance = locData.distance || user.distance;
    user.pace = locData.pace || user.pace;
    user.status = locData.status || user.status;
    user.lastSeen = Date.now();

    // 다른 모든 친구들에게 위치 변경 브로드캐스트
    socket.broadcast.emit('user:location_updated', {
      socketId: socket.id,
      id: user.id,
      name: user.name,
      studentClass: user.studentClass,
      sport: user.sport,
      lat: user.lat,
      lng: user.lng,
      distance: user.distance,
      pace: user.pace,
      status: user.status
    });
  });

  // 3. 학생 퇴장 / 연결 종료
  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      console.log(`[Socket] ${user.name}(${user.studentClass}) 퇴장`);
      activeUsers.delete(socket.id);
      io.emit('user:left', { socketId: socket.id, id: user.id, name: user.name });
      io.emit('users:count', activeUsers.size);
    }
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🏃 학생 러닝 앱 & 실시간 소셜 서버가 실행되었습니다!`);
  console.log(`📡 로컬 접속 주소: http://localhost:${PORT}`);
  console.log(`👥 실시간 멀티플레이어 위치 동기화: Socket.io 활성화`);
  console.log(`📊 구글 시트 ID: ${SPREADSHEET_ID}`);
  console.log(`====================================================`);
});
