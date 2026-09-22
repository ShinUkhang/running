/**
 * 학생 실시간 러닝 트래커 및 구글 스프레드시트 연동 로직
 */

// ================= 앱 전역 상태 =================
const state = {
  student: {
    name: '김민준',
    class: '1-1',
    sport: '러닝'
  },
  settings: {
    gasUrl: localStorage.getItem('running_gas_url') || '',
    googleMapsKey: localStorage.getItem('running_gmaps_key') || ''
  },
  status: 'IDLE', // IDLE | RUNNING | PAUSED | FINISHED
  startTime: null,
  endTime: null,
  elapsedSeconds: 0,
  timerInterval: null,
  
  // GPS 트래킹 데이터
  watchId: null,
  coordinates: [], // [{lat, lng, time}]
  totalDistanceKm: 0,
  lastPosition: null,
  
  // 시뮬레이션 모드 (실내 테스트용)
  isSimulating: false,
  simInterval: null,
  simIndex: 0,
  
  // 지도 객체
  map: null,
  userMarker: null,
  routePolyline: null,
  isGoogleMaps: false
};

// 종목별 MET (대사당량) 수치 (체중 55kg 기준 소모 칼로리 계산)
const MET_VALUES = {
  '러닝': 9.8,
  '조깅': 7.0,
  '빠르게 걷기': 4.3,
  '사이클': 8.0
};
const DEFAULT_WEIGHT_KG = 55;

// ================= DOM 요소 참조 =================
const elements = {
  // 모달
  consentModal: document.getElementById('consentModal'),
  finishModal: document.getElementById('finishModal'),
  btnAgreeLocation: document.getElementById('btnAgreeLocation'),
  btnCloseFinishModal: document.getElementById('btnCloseFinishModal'),
  btnManualSendSheet: document.getElementById('btnManualSendSheet'),
  
  // 학생 정보 입력
  initStudentName: document.getElementById('initStudentName'),
  initStudentClass: document.getElementById('initStudentClass'),
  initSportType: document.getElementById('initSportType'),
  
  // 지도 및 배지
  gpsStatusText: document.getElementById('gpsStatusText'),
  gpsDot: document.getElementById('gpsDot'),
  pillNameBadge: document.getElementById('pillNameBadge'),
  pillClassBadge: document.getElementById('pillClassBadge'),
  pillSportBadge: document.getElementById('pillSportBadge'),
  
  // 지도 조작 버튼
  btnCenterMap: document.getElementById('btnCenterMap'),
  btnFitBounds: document.getElementById('btnFitBounds'),
  btnToggleSimulate: document.getElementById('btnToggleSimulate'),
  
  // 메트릭 디스플레이
  metricDuration: document.getElementById('metricDuration'),
  metricStartTime: document.getElementById('metricStartTime'),
  metricDistance: document.getElementById('metricDistance'),
  metricPace: document.getElementById('metricPace'),
  metricCalories: document.getElementById('metricCalories'),
  
  // 조작 버튼
  btnStartWorkout: document.getElementById('btnStartWorkout'),
  btnPauseWorkout: document.getElementById('btnPauseWorkout'),
  btnResumeWorkout: document.getElementById('btnResumeWorkout'),
  btnStopWorkout: document.getElementById('btnStopWorkout'),
  
  // 종료 리포트
  resStartTime: document.getElementById('resStartTime'),
  resEndTime: document.getElementById('resEndTime'),
  resDuration: document.getElementById('resDuration'),
  resDistance: document.getElementById('resDistance'),
  resCalories: document.getElementById('resCalories'),
  resPace: document.getElementById('resPace'),
  sheetSendStatus: document.getElementById('sheetSendStatus'),
  
  // 탭
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  dashboardTabBtn: document.getElementById('dashboardTabBtn'),
  btnRefreshSheet: document.getElementById('btnRefreshSheet'),
  
  // 대시보드
  sumStudentCount: document.getElementById('sumStudentCount'),
  sumTotalTime: document.getElementById('sumTotalTime'),
  sumTotalCalories: document.getElementById('sumTotalCalories'),
  sumAvgPace: document.getElementById('sumAvgPace'),
  sheetUpdatedTime: document.getElementById('sheetUpdatedTime'),
  sheetRecordsBody: document.getElementById('sheetRecordsBody'),
  
  // 설정
  settingStudentName: document.getElementById('settingStudentName'),
  settingStudentClass: document.getElementById('settingStudentClass'),
  settingSportType: document.getElementById('settingSportType'),
  btnSaveStudentInfo: document.getElementById('btnSaveStudentInfo'),
  settingGasUrl: document.getElementById('settingGasUrl'),
  btnSaveGasUrl: document.getElementById('btnSaveGasUrl'),
  settingGoogleMapsKey: document.getElementById('settingGoogleMapsKey'),
  btnSaveMapKey: document.getElementById('btnSaveMapKey')
};

// ================= 초기화 =================
document.addEventListener('DOMContentLoaded', () => {
  loadSavedSettings();
  initTabs();
  initMap();
  bindEvents();
  fetchSheetData(); // 시트 데이터 최초 로드
});

function loadSavedSettings() {
  const savedStudent = localStorage.getItem('running_student');
  if (savedStudent) {
    try {
      state.student = JSON.parse(savedStudent);
    } catch (e) {}
  }
  updateStudentDisplay();

  if (state.settings.gasUrl) {
    elements.settingGasUrl.value = state.settings.gasUrl;
  }
  if (state.settings.googleMapsKey) {
    elements.settingGoogleMapsKey.value = state.settings.googleMapsKey;
  }
}

function updateStudentDisplay() {
  elements.pillNameBadge.textContent = state.student.name;
  elements.pillClassBadge.textContent = state.student.class;
  elements.pillSportBadge.textContent = state.student.sport;

  elements.initStudentName.value = state.student.name;
  elements.initStudentClass.value = state.student.class;
  elements.initSportType.value = state.student.sport;

  elements.settingStudentName.value = state.student.name;
  elements.settingStudentClass.value = state.student.class;
  elements.settingSportType.value = state.student.sport;
}

// ================= 탭 전환 =================
function initTabs() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'trackerTab' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 200);
      }
      if (targetId === 'dashboardTab') {
        fetchSheetData();
      }
    });
  });
}

// ================= 지도 초기화 (Leaflet 기본) =================
function initMap() {
  // 기본 좌표: 서울 시청 부근 (위치 수신 전 기본 뷰)
  const defaultLat = 37.5665;
  const defaultLng = 126.9780;

  state.map = L.map('map', {
    zoomControl: false
  }).setView([defaultLat, defaultLng], 16);

  // 고화질 CartoDB 다크/모던 타일 레이어 적용
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(state.map);

  // 사용자 위치 마커 (펄스 아이콘)
  const pulsingIcon = L.divIcon({
    className: 'leaflet-pulsing-icon',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  state.userMarker = L.marker([defaultLat, defaultLng], { icon: pulsingIcon }).addTo(state.map);

  // 이동 경로 Polyline (네온 블루/오렌지)
  state.routePolyline = L.polyline([], {
    color: '#0284c7',
    weight: 6,
    opacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(state.map);
}

// ================= 이벤트 리스너 바인딩 =================
function bindEvents() {
  // 1. 위치 동의
  elements.btnAgreeLocation.addEventListener('click', onAgreeLocation);

  // 2. 운동 제어
  elements.btnStartWorkout.addEventListener('click', startWorkout);
  elements.btnPauseWorkout.addEventListener('click', pauseWorkout);
  elements.btnResumeWorkout.addEventListener('click', resumeWorkout);
  elements.btnStopWorkout.addEventListener('click', stopWorkout);

  // 3. 지도 조작
  elements.btnCenterMap.addEventListener('click', centerToUser);
  elements.btnFitBounds.addEventListener('click', fitRouteBounds);
  elements.btnToggleSimulate.addEventListener('click', toggleSimulation);

  // 4. 모달 조작
  elements.btnCloseFinishModal.addEventListener('click', () => {
    elements.finishModal.classList.remove('active');
    resetWorkoutUI();
  });
  elements.btnManualSendSheet.addEventListener('click', sendRecordToSheet);

  // 5. 대시보드 새로고침
  elements.btnRefreshSheet.addEventListener('click', fetchSheetData);

  // 6. 설정 저장
  elements.btnSaveStudentInfo.addEventListener('click', () => {
    state.student.name = elements.settingStudentName.value.trim() || '김민준';
    state.student.class = elements.settingStudentClass.value.trim() || '1-1';
    state.student.sport = elements.settingSportType.value;
    localStorage.setItem('running_student', JSON.stringify(state.student));
    updateStudentDisplay();
    alert('학생 정보가 저장되었습니다!');
  });

  elements.btnSaveGasUrl.addEventListener('click', () => {
    const url = elements.settingGasUrl.value.trim();
    state.settings.gasUrl = url;
    localStorage.setItem('running_gas_url', url);
    alert('구글 스프레드시트 연동 Web App URL이 저장되었습니다!');
  });

  elements.btnSaveMapKey.addEventListener('click', () => {
    const key = elements.settingGoogleMapsKey.value.trim();
    state.settings.googleMapsKey = key;
    localStorage.setItem('running_gmaps_key', key);
    alert('지도 키가 저장되었습니다.');
  });
}

// ================= 위치 정보 동의 및 시작 =================
function onAgreeLocation() {
  // 입력한 학생 정보 반영
  state.student.name = elements.initStudentName.value.trim() || '김민준';
  state.student.class = elements.initStudentClass.value.trim() || '1-1';
  state.student.sport = elements.initSportType.value;
  localStorage.setItem('running_student', JSON.stringify(state.student));
  updateStudentDisplay();

  // 모달 닫기
  elements.consentModal.classList.remove('active');

  // GPS 권한 요청 및 첫 위치 탐색
  requestGpsPosition();

  // 화면 꺼짐 방지(Wake Lock) 요청
  requestWakeLock();
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock 활성화됨');
    }
  } catch (err) {
    console.warn('Wake Lock 요청 실패:', err);
  }
}

function requestGpsPosition() {
  if (!('geolocation' in navigator)) {
    alert('이 브라우저는 위치 정보(GPS)를 지원하지 않습니다.');
    return;
  }

  elements.gpsStatusText.textContent = 'GPS 신호 검색중...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      elements.gpsStatusText.textContent = 'GPS 정상 연결';
      elements.gpsDot.classList.add('active');
      
      updateMapPosition(latitude, longitude);
      state.map.setView([latitude, longitude], 17);
    },
    (err) => {
      console.warn('GPS 오류:', err.message);
      elements.gpsStatusText.textContent = 'GPS 대기중 (시뮬레이션 가능)';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ================= 운동 시작/일시정지/종료 로직 =================
function startWorkout() {
  state.status = 'RUNNING';
  state.startTime = new Date();
  state.elapsedSeconds = 0;
  state.totalDistanceKm = 0;
  state.coordinates = [];
  state.lastPosition = null;

  // 출발 시간 UI 표시
  elements.metricStartTime.textContent = formatTime(state.startTime);

  // 버튼 상태 변경
  elements.btnStartWorkout.style.display = 'none';
  elements.btnPauseWorkout.style.display = 'flex';
  elements.btnStopWorkout.style.display = 'flex';
  elements.btnResumeWorkout.style.display = 'none';

  // 경로 초기화
  state.routePolyline.setLatLngs([]);

  // 타이머 가동 (1초 간격)
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(tickWorkout, 1000);

  // GPS 실시간 추적 시작
  startGpsTracking();
}

function pauseWorkout() {
  state.status = 'PAUSED';
  clearInterval(state.timerInterval);
  stopGpsTracking();

  elements.btnPauseWorkout.style.display = 'none';
  elements.btnResumeWorkout.style.display = 'flex';
}

function resumeWorkout() {
  state.status = 'RUNNING';
  state.timerInterval = setInterval(tickWorkout, 1000);
  startGpsTracking();

  elements.btnResumeWorkout.style.display = 'none';
  elements.btnPauseWorkout.style.display = 'flex';
}

function stopWorkout() {
  state.status = 'FINISHED';
  state.endTime = new Date();
  clearInterval(state.timerInterval);
  stopGpsTracking();
  if (state.isSimulating) stopSimulation();

  // 최종 리포트 데이터 구성
  const durationStr = formatDuration(state.elapsedSeconds);
  const distanceStr = state.totalDistanceKm.toFixed(2) + ' km';
  const paceStr = calculatePace(state.totalDistanceKm, state.elapsedSeconds);
  const caloriesStr = calculateCalories(state.student.sport, state.elapsedSeconds) + ' kcal';

  elements.resStartTime.textContent = formatTime(state.startTime);
  elements.resEndTime.textContent = formatTime(state.endTime);
  elements.resDuration.textContent = durationStr;
  elements.resDistance.textContent = distanceStr;
  elements.resCalories.textContent = caloriesStr;
  elements.resPace.textContent = paceStr + ' /km';

  // 결과 모달 열기
  elements.finishModal.classList.add('active');

  // 스프레드시트 자동 전송 시도
  sendRecordToSheet();
}

function resetWorkoutUI() {
  elements.btnStartWorkout.style.display = 'flex';
  elements.btnPauseWorkout.style.display = 'none';
  elements.btnResumeWorkout.style.display = 'none';
  elements.btnStopWorkout.style.display = 'none';

  elements.metricDuration.textContent = '00:00:00';
  elements.metricStartTime.textContent = '--:--:--';
  elements.metricDistance.textContent = '0.00';
  elements.metricPace.textContent = '--:--';
  elements.metricCalories.textContent = '0';
}

// 타이머 틱
function tickWorkout() {
  state.elapsedSeconds++;
  elements.metricDuration.textContent = formatDuration(state.elapsedSeconds);
  
  // 칼로리 갱신
  const cals = calculateCalories(state.student.sport, state.elapsedSeconds);
  elements.metricCalories.textContent = cals;

  // 페이스 갱신
  const pace = calculatePace(state.totalDistanceKm, state.elapsedSeconds);
  elements.metricPace.textContent = pace;
}

// ================= GPS 실시간 추적 =================
function startGpsTracking() {
  if (state.isSimulating) return;
  if (!('geolocation' in navigator)) return;

  state.watchId = navigator.geolocation.watchPosition(
    (pos) => handlePositionUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    (err) => console.warn('watchPosition 오류:', err),
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000
    }
  );
}

function stopGpsTracking() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
}

// 위치 갱신 처리 (하버사인 정밀 거리 계산)
function handlePositionUpdate(lat, lng, accuracy = 10) {
  // GPS 정확도가 30m 이상으로 너무 낮으면 노이즈 필터링
  if (accuracy > 30) return;

  const currentLatLng = [lat, lng];

  if (state.lastPosition) {
    const distMeters = getHaversineDistance(
      state.lastPosition[0], state.lastPosition[1],
      lat, lng
    );

    // 최소 2m 이상 이동하고, 비현실적인 순간이동(초당 25m 이상)이 아닐 때만 유효 이동으로 인정
    if (distMeters >= 2 && distMeters < 50) {
      state.totalDistanceKm += (distMeters / 1000);
      elements.metricDistance.textContent = state.totalDistanceKm.toFixed(2);
      
      state.coordinates.push(currentLatLng);
      state.routePolyline.addLatLng(currentLatLng);
    }
  } else {
    state.coordinates.push(currentLatLng);
    state.routePolyline.addLatLng(currentLatLng);
  }

  state.lastPosition = currentLatLng;
  updateMapPosition(lat, lng);
}

function updateMapPosition(lat, lng) {
  if (state.userMarker) {
    state.userMarker.setLatLng([lat, lng]);
  }
}

function centerToUser() {
  if (state.lastPosition && state.map) {
    state.map.panTo(state.lastPosition);
  }
}

function fitRouteBounds() {
  if (state.routePolyline && state.coordinates.length > 0 && state.map) {
    state.map.fitBounds(state.routePolyline.getBounds(), { padding: [30, 30] });
  }
}

// ================= 테스트용 달리기 시뮬레이션 모드 =================
// 사용자가 실내 또는 PC 브라우저에서 바로 테스트해볼 수 있도록 학교 운동장 트랙을 도는 가상 GPS를 생성합니다.
function toggleSimulation() {
  if (state.isSimulating) {
    stopSimulation();
    alert('가상 시뮬레이션 모드가 꺼졌습니다.');
  } else {
    startSimulation();
    alert('🏃‍♂️ 가상 달리기 시뮬레이션이 켜졌습니다!\n운동 시작을 누르면 지도 위에서 자동으로 트랙을 뛰며 거리와 페이스가 올라갑니다.');
  }
}

function startSimulation() {
  state.isSimulating = true;
  elements.btnToggleSimulate.style.background = '#0284c7';
  elements.gpsDot.className = 'gps-dot simulating';
  elements.gpsStatusText.textContent = '가상 러닝 모드 (400m 트랙)';

  // 현재 위치 기준(또는 기본 서울광장)으로 400m 타원형 트랙 생성
  const centerLat = state.lastPosition ? state.lastPosition[0] : 37.5665;
  const centerLng = state.lastPosition ? state.lastPosition[1] : 126.9780;
  
  const simTrackPoints = [];
  const totalPoints = 60; // 60초에 한 바퀴 (약 400m)
  const radiusX = 0.0012; // 경도 반경
  const radiusY = 0.0006; // 위도 반경

  for (let i = 0; i < totalPoints; i++) {
    const angle = (i / totalPoints) * 2 * Math.PI;
    const pLat = centerLat + radiusY * Math.sin(angle);
    const pLng = centerLng + radiusX * Math.cos(angle);
    simTrackPoints.push([pLat, pLng]);
  }

  state.simIndex = 0;
  state.map.setView([centerLat, centerLng], 17);

  clearInterval(state.simInterval);
  state.simInterval = setInterval(() => {
    if (state.status !== 'RUNNING') return;

    const pt = simTrackPoints[state.simIndex % simTrackPoints.length];
    state.simIndex++;
    handlePositionUpdate(pt[0], pt[1], 5);
  }, 1000);
}

function stopSimulation() {
  state.isSimulating = false;
  clearInterval(state.simInterval);
  elements.btnToggleSimulate.style.background = '';
  elements.gpsDot.className = 'gps-dot';
  elements.gpsStatusText.textContent = 'GPS 대기중';
}

// ================= 계산 유틸리티 =================
// 하버사인 공식 (두 위경도 사이의 거리 m 단위 계산)
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 지구 반지름 (m)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 시간 포맷 (HH:mm:ss)
function formatTime(date) {
  if (!date) return '--:--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// 경과 시간 포맷 (HH:mm:ss)
function formatDuration(totalSec) {
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// 페이스 계산 (분:초 /km)
function calculatePace(distanceKm, durationSeconds) {
  if (distanceKm <= 0.01 || durationSeconds <= 5) return '--:--';
  const secPerKm = durationSeconds / distanceKm;
  if (secPerKm > 3600) return '99:59'; // 정지 상태 필터

  const paceMin = Math.floor(secPerKm / 60);
  const paceSec = Math.floor(secPerKm % 60);
  return `${String(paceMin).padStart(2, '0')}:${String(paceSec).padStart(2, '0')}`;
}

// 칼로리 계산 (MET 기반)
function calculateCalories(sport, durationSeconds) {
  const met = MET_VALUES[sport] || 7.0;
  const hours = durationSeconds / 3600;
  // 공식: 칼로리(kcal) = MET * 체중(kg) * 시간(h)
  const kcal = Math.round(met * DEFAULT_WEIGHT_KG * hours);
  return kcal;
}

// ================= 구글 스프레드시트 데이터 전송 =================
async function sendRecordToSheet() {
  const payload = {
    name: state.student.name,
    studentClass: state.student.class,
    sport: state.student.sport,
    startTime: formatTime(state.startTime),
    endTime: formatTime(state.endTime),
    duration: formatDuration(state.elapsedSeconds),
    distance: state.totalDistanceKm.toFixed(2) + ' km',
    calories: calculateCalories(state.student.sport, state.elapsedSeconds) + ' kcal',
    pace: calculatePace(state.totalDistanceKm, state.elapsedSeconds)
  };

  elements.sheetSendStatus.style.color = '#38bdf8';
  elements.sheetSendStatus.textContent = '⏳ 스프레드시트로 전송 중...';

  // 설정된 Web App URL 또는 로컬 프록시 사용
  const gasUrl = state.settings.gasUrl;

  try {
    let res;
    if (gasUrl) {
      // 1. 설정된 Google Apps Script URL로 직접 POST (no-cors 전송 포함)
      try {
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        elements.sheetSendStatus.style.color = '#34d399';
        elements.sheetSendStatus.textContent = '✅ 구글 스프레드시트에 성공적으로 저장되었습니다!';
        fetchSheetData(); // 시트 데이터 새로고침
        return;
      } catch (directErr) {
        console.warn('직접 전송 실패, 프록시로 재시도합니다:', directErr);
      }
    }

    // 2. 서버 프록시 `/api/record`로 전송
    res = await fetch('/api/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gasUrl: gasUrl || 'https://script.google.com/macros/s/SAMPLE/exec',
        recordData: payload
      })
    });

    const result = await res.json();
    if (result.success) {
      elements.sheetSendStatus.style.color = '#34d399';
      elements.sheetSendStatus.textContent = '✅ 구글 스프레드시트에 성공적으로 저장되었습니다!';
      fetchSheetData();
    } else {
      elements.sheetSendStatus.style.color = '#f59e0b';
      elements.sheetSendStatus.innerHTML = `⚠️ 저장 대기: [설정] 탭에서 구글 Apps Script Web App URL을 등록해 주세요.<br><span style="font-size:11px; color:#94a3b8;">(기록은 로컬에 보관됩니다)</span>`;
    }
  } catch (error) {
    elements.sheetSendStatus.style.color = '#f59e0b';
    elements.sheetSendStatus.innerHTML = `ℹ️ 구글 연동 안내: [설정 & 가이드] 탭에서 Apps Script URL을 등록하면 원클릭 자동 저장됩니다.`;
  }
}

// ================= 구글 스프레드시트 실시간 데이터 조회 =================
async function fetchSheetData() {
  try {
    elements.sheetUpdatedTime.textContent = '동기화 중...';
    const res = await fetch('/api/sheet-data');
    if (!res.ok) throw new Error('데이터 조회 실패');

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    // 요약 표시
    elements.sumStudentCount.textContent = data.summary.studentCount || '-';
    elements.sumTotalTime.textContent = data.summary.totalTime || '-';
    elements.sumTotalCalories.textContent = data.summary.totalCalories || '-';
    elements.sumAvgPace.textContent = data.summary.avgPace || '-';

    elements.sheetUpdatedTime.textContent = new Date().toLocaleTimeString('ko-KR') + ' 갱신됨';

    // 테이블 렌더링
    if (data.records && data.records.length > 0) {
      elements.sheetRecordsBody.innerHTML = data.records.map(r => `
        <tr>
          <td style="font-weight:700; color:#f8fafc;">${escapeHtml(r.name)}</td>
          <td><span style="background:#334155; padding:2px 6px; border-radius:6px; font-size:11px;">${escapeHtml(r.studentClass)}</span></td>
          <td style="color:#34d399;">${escapeHtml(r.sport)}</td>
          <td style="color:#94a3b8;">${escapeHtml(r.startTime)}</td>
          <td style="color:#94a3b8;">${escapeHtml(r.endTime)}</td>
          <td style="font-weight:600; color:#38bdf8;">${escapeHtml(r.duration)}</td>
          <td style="font-weight:600;">${escapeHtml(r.distance)}</td>
          <td style="color:#f59e0b;">${escapeHtml(r.calories)}</td>
          <td style="color:#a78bfa;">${escapeHtml(r.pace)}</td>
        </tr>
      `).join('');
    } else {
      elements.sheetRecordsBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:20px; color:#64748b;">
            등록된 운동 기록이 없습니다.
          </td>
        </tr>
      `;
    }
  } catch (err) {
    console.error('시트 조회 오류:', err);
    elements.sheetUpdatedTime.textContent = '오류 발생';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
