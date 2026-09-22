const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 기본 구글 스프레드시트 설정
const SPREADSHEET_ID = '1JtuAIHo6TUqhZWT98ASbrG85IOHT96-uui8EzeK-9K4';

// 1. 스프레드시트 실시간 데이터 조회 API (CSV 추출 파싱)
app.get('/api/sheet-data', async (req, res) => {
  try {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
    const response = await fetch(csvUrl);
    
    if (!response.ok) {
      return res.status(500).json({ error: '스프레드시트를 불러오는데 실패했습니다.' });
    }

    const csvText = await response.text();
    const lines = csvText.split('\n').map(line => {
      // CSV 파서 (따옴표 처리)
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

    // 3번 인덱스부터 학생 개별 데이터 (김민준, 이서연 등)
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
        distance: row[7] || '',
        calories: row[8] || '',
        pace: row[9] || ''
      });
    }

    // 1번 인덱스: 요약 데이터 ("10명", "7:04:25", ..., "05:46 /km")
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

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🏃 학생 러닝 앱 서버가 실행되었습니다!`);
  console.log(`📡 로컬 접속 주소: http://localhost:${PORT}`);
  console.log(`📊 구글 시트 ID: ${SPREADSHEET_ID}`);
  console.log(`====================================================`);
});
