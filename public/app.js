/**
 * 학생 실시간 소셜 러닝 트래커
 * - 즉석 가입 및 카메라 얼굴 셀카 아바타 생성
 * - Socket.io 기반 친구 실시간 위치 & 캐릭터 마커 동기화
 * - 구글 스프레드시트 실시간 연동
 */

// ================= 앱 전역 상태 =================
const state = {
  student: {
    id: 'user_' + Math.random().toString(36).substr(2, 9),
    name: '김민준',
    class: '1-1',
    sport: '러닝',
    avatar: '' // Data URL 또는 기본 이모지 아바타
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
  
  // GPS 트래킹
  watchId: null,
  coordinates: [],
  totalDistanceKm: 0,
  lastPosition: [37.5665, 126.9780],
  
  // 카메라 스트림
  cameraStream: null,
  
  // 시뮬레이션 모드
  isSimulating: false,
  simInterval: null,
  simIndex: 0,
  
  // 지도 객체
  map: null,
  myMarker: null,
  routePolyline: null,
  
  // 친구들 마커 관리 (socketId => { marker, data })
  friendMarkers: new Map(),
  
  // Socket.io 객체
  socket: null,

  // 완주 인증샷 포토 카드 상태
  snapshot: {
    photoImg: null,
    theme: 'photo', // 'photo' | 'dark'
    snapStream: null
  },

  // 대시보드 실시간 필터 & 데이터
  dashboard: {
    filter: 'today', // 오늘이 기본값!
    allRecords: [],
    summary: {}
  }
};

// 종목별 MET 지수
const MET_VALUES = {
  '러닝': 9.8,
  '조깅': 7.0,
  '빠르게 걷기': 4.3,
  '사이클': 8.0
};
const DEFAULT_WEIGHT_KG = 55;

// ================= DOM 요소 =================
const elements = {
  // 모달
  consentModal: document.getElementById('consentModal'),
  finishModal: document.getElementById('finishModal'),
  btnAgreeLocation: document.getElementById('btnAgreeLocation'),
  btnCloseFinishModal: document.getElementById('btnCloseFinishModal'),
  btnManualSendSheet: document.getElementById('btnManualSendSheet'),
  
  // 즉석 가입 & 카메라
  initStudentName: document.getElementById('initStudentName'),
  initStudentClass: document.getElementById('initStudentClass'),
  initSportType: document.getElementById('initSportType'),
  cameraVideo: document.getElementById('cameraVideo'),
  avatarPreviewImg: document.getElementById('avatarPreviewImg'),
  btnCapturePhoto: document.getElementById('btnCapturePhoto'),
  btnRetakePhoto: document.getElementById('btnRetakePhoto'),
  avatarCanvas: document.getElementById('avatarCanvas'),
  avatarPresetBtns: document.querySelectorAll('.avatar-preset-btn'),
  
  // 배지 & 친구 카운트
  friendsCount: document.getElementById('friendsCount'),
  gpsStatusText: document.getElementById('gpsStatusText'),
  gpsDot: document.getElementById('gpsDot'),
  pillNameBadge: document.getElementById('pillNameBadge'),
  pillClassBadge: document.getElementById('pillClassBadge'),
  pillSportBadge: document.getElementById('pillSportBadge'),
  pillAvatarImg: document.getElementById('pillAvatarImg'),
  
  // 지도 컨트롤
  btnCenterMap: document.getElementById('btnCenterMap'),
  btnFitBounds: document.getElementById('btnFitBounds'),
  btnToggleSimulate: document.getElementById('btnToggleSimulate'),
  
  // 메트릭
  metricDuration: document.getElementById('metricDuration'),
  metricStartTime: document.getElementById('metricStartTime'),
  metricDistance: document.getElementById('metricDistance'),
  metricPace: document.getElementById('metricPace'),
  metricCalories: document.getElementById('metricCalories'),
  
  // 운동 조작
  btnStartWorkout: document.getElementById('btnStartWorkout'),
  btnPauseWorkout: document.getElementById('btnPauseWorkout'),
  btnResumeWorkout: document.getElementById('btnResumeWorkout'),
  btnStopWorkout: document.getElementById('btnStopWorkout'),
  
  // 종료 결과
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
  
  // 시트 대시보드
  sumStudentCount: document.getElementById('sumStudentCount'),
  sumTotalTime: document.getElementById('sumTotalTime'),
  sumTotalCalories: document.getElementById('sumTotalCalories'),
  sumAvgPace: document.getElementById('sumAvgPace'),
  sheetUpdatedTime: document.getElementById('sheetUpdatedTime'),
  sheetRecordsBody: document.getElementById('sheetRecordsBody'),
  btnFilterToday: document.getElementById('btnFilterToday'),
  btnFilterAll: document.getElementById('btnFilterAll'),
  todayDateBadge: document.getElementById('todayDateBadge'),
  chartContainer: document.getElementById('chartContainer'),
  chartSubtext: document.getElementById('chartSubtext'),
  
  // 프로필 설정
  settingAvatarPreview: document.getElementById('settingAvatarPreview'),
  btnRetakeFromSettings: document.getElementById('btnRetakeFromSettings'),
  settingStudentName: document.getElementById('settingStudentName'),
  settingStudentClass: document.getElementById('settingStudentClass'),
  settingSportType: document.getElementById('settingSportType'),
  settingAvatarFile: document.getElementById('settingAvatarFile'),
  btnSaveStudentInfo: document.getElementById('btnSaveStudentInfo'),
  settingGasUrl: document.getElementById('settingGasUrl'),
  btnSaveGasUrl: document.getElementById('btnSaveGasUrl'),

  // 완주 인증샷 포토 카드 엘리먼트
  snapshotCanvas: document.getElementById('snapshotCanvas'),
  btnTakeSnapPhoto: document.getElementById('btnTakeSnapPhoto'),
  inputSnapFile: document.getElementById('inputSnapFile'),
  btnToggleSnapTheme: document.getElementById('btnToggleSnapTheme'),
  btnDownloadSnapCard: document.getElementById('btnDownloadSnapCard'),
  snapCameraModal: document.getElementById('snapCameraModal'),
  snapVideo: document.getElementById('snapVideo'),
  btnCaptureSnapPhoto: document.getElementById('btnCaptureSnapPhoto'),
  btnCloseSnapCamera: document.getElementById('btnCloseSnapCamera')
};

// ================= 초기화 =================
document.addEventListener('DOMContentLoaded', () => {
  loadSavedStudent();
  initTabs();
  initMap();
  initSocket();
  initCamera();
  bindEvents();
  fetchSheetData();
});

// ================= 저장된 프로필 로드 =================
function loadSavedStudent() {
  const saved = localStorage.getItem('running_student');
  if (saved) {
    try {
      state.student = JSON.parse(saved);
    } catch (e) {}
  }

  // 기본 아바타가 없으면 기본 이모지 아바타 생성
  if (!state.student.avatar) {
    state.student.avatar = createEmojiAvatar('🐯');
  }

  updateProfileUI();

  if (state.settings.gasUrl) {
    elements.settingGasUrl.value = state.settings.gasUrl;
  }
}

function updateProfileUI() {
  elements.pillNameBadge.textContent = state.student.name;
  elements.pillClassBadge.textContent = state.student.class;
  elements.pillSportBadge.textContent = state.student.sport;
  elements.pillAvatarImg.src = state.student.avatar;

  elements.initStudentName.value = state.student.name;
  elements.initStudentClass.value = state.student.class;
  elements.initSportType.value = state.student.sport;

  elements.settingStudentName.value = state.student.name;
  elements.settingStudentClass.value = state.student.class;
  elements.settingSportType.value = state.student.sport;
  elements.settingAvatarPreview.src = state.student.avatar;
}

// 프로필 실시간 자동 동기화 및 저장
function applyStudentProfileChanges(notifyFriends = true) {
  const newName = (elements.settingStudentName.value || elements.initStudentName.value || state.student.name || '김민준').trim();
  const newClass = (elements.settingStudentClass.value || elements.initStudentClass.value || state.student.class || '1-1').trim();
  const newSport = elements.settingSportType.value || elements.initSportType.value || state.student.sport || '러닝';

  state.student.name = newName;
  state.student.class = newClass;
  state.student.sport = newSport;

  localStorage.setItem('running_student', JSON.stringify(state.student));
  updateProfileUI();

  // 지도 위 내 캐릭터 마커 즉시 갱신
  if (state.lastPosition && state.map) {
    updateMyMarker(state.lastPosition[0], state.lastPosition[1]);
  }

  // 친구들에게 즉시 브로드캐스트
  if (notifyFriends) {
    joinSocialRoom();
    emitMyLocation();
  }
}

// ================= 카메라 얼굴 셀카 촬영 =================
async function initCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('카메라 미지원 브라우저');
      return;
    }
    
    // 전면 카메라 요청
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 320 },
        height: { ideal: 320 }
      },
      audio: false
    });

    elements.cameraVideo.srcObject = state.cameraStream;
    elements.cameraVideo.style.display = 'block';
    elements.avatarPreviewImg.style.display = 'none';
    elements.btnCapturePhoto.style.display = 'flex';
    elements.btnRetakePhoto.style.display = 'none';
  } catch (err) {
    console.warn('카메라 구동 실패 또는 권한 거부:', err.message);
    // 카메라가 없으면 프리셋 아바타를 미리보기로 표시
    elements.cameraVideo.style.display = 'none';
    elements.avatarPreviewImg.src = state.student.avatar || createEmojiAvatar('🐯');
    elements.avatarPreviewImg.style.display = 'block';
    elements.btnCapturePhoto.style.display = 'none';
  }
}

function capturePhoto() {
  const video = elements.cameraVideo;
  const canvas = elements.avatarCanvas;
  const ctx = canvas.getContext('2d');

  if (!video.videoWidth) {
    alert('카메라 화면을 준비 중입니다. 잠시 후 다시 눌러주세요.');
    return;
  }

  // 120x120 원형 아바타 캡처
  canvas.width = 120;
  canvas.height = 120;

  // 비디오 정사각형 중앙 크롭
  const size = Math.min(video.videoWidth, video.videoHeight);
  const startX = (video.videoWidth - size) / 2;
  const startY = (video.videoHeight - size) / 2;

  // 좌우 반전(셀카 거울 모드) 적용
  ctx.save();
  ctx.translate(120, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, startX, startY, size, size, 0, 0, 120, 120);
  ctx.restore();

  // 가벼운 JPEG base64 생성
  const avatarData = canvas.toDataURL('image/jpeg', 0.82);
  state.student.avatar = avatarData;

  // 미리보기 전환
  elements.avatarPreviewImg.src = avatarData;
  elements.avatarPreviewImg.style.display = 'block';
  elements.cameraVideo.style.display = 'none';

  elements.btnCapturePhoto.style.display = 'none';
  elements.btnRetakePhoto.style.display = 'flex';

  updateProfileUI();
}

function retakePhoto() {
  elements.avatarPreviewImg.style.display = 'none';
  elements.cameraVideo.style.display = 'block';
  elements.btnCapturePhoto.style.display = 'flex';
  elements.btnRetakePhoto.style.display = 'none';
}

// 이모지 아바타 캔버스 생성기
function createEmojiAvatar(emoji) {
  const canvas = elements.avatarCanvas;
  const ctx = canvas.getContext('2d');
  canvas.width = 100;
  canvas.height = 100;

  // 그라데이션 배경
  const grad = ctx.createLinearGradient(0, 0, 100, 100);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 100, 100);

  // 이모지 그리기
  ctx.font = '54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 50, 54);

  return canvas.toDataURL('image/png');
}

// ================= Socket.io 실시간 멀티플레이어 =================
function initSocket() {
  if (typeof io === 'undefined') {
    console.warn('Socket.io 클라이언트를 찾을 수 없습니다.');
    return;
  }

  state.socket = io();

  state.socket.on('connect', () => {
    console.log('[Socket] 서버 연결 성공, ID:', state.socket.id);
  });

  // 기존에 접속 중인 친구들 목록 수신
  state.socket.on('users:list', (friends) => {
    friends.forEach(friend => {
      addOrUpdateFriendMarker(friend);
    });
  });

  // 새 친구 입장
  state.socket.on('user:joined', (friend) => {
    addOrUpdateFriendMarker(friend);
  });

  // 친구 위치 및 운동 정보 갱신
  state.socket.on('user:location_updated', (friend) => {
    addOrUpdateFriendMarker(friend);
  });

  // 친구 퇴장
  state.socket.on('user:left', (data) => {
    if (state.friendMarkers.has(data.socketId)) {
      const { marker } = state.friendMarkers.get(data.socketId);
      if (state.map && marker) {
        state.map.removeLayer(marker);
      }
      state.friendMarkers.delete(data.socketId);
    }
  });

  // 전체 접속자 수 갱신
  state.socket.on('users:count', (count) => {
    elements.friendsCount.textContent = count;
  });
}

function joinSocialRoom() {
  if (!state.socket || !state.socket.connected) return;

  state.socket.emit('user:join', {
    id: state.student.id,
    name: state.student.name,
    studentClass: state.student.class,
    sport: state.student.sport,
    avatar: state.student.avatar,
    lat: state.lastPosition[0],
    lng: state.lastPosition[1],
    distance: state.totalDistanceKm.toFixed(2) + ' km',
    pace: calculatePace(state.totalDistanceKm, state.elapsedSeconds),
    status: state.status
  });
}

function emitMyLocation() {
  if (!state.socket || !state.socket.connected) return;

  state.socket.emit('user:location', {
    lat: state.lastPosition[0],
    lng: state.lastPosition[1],
    distance: state.totalDistanceKm.toFixed(2) + ' km',
    pace: calculatePace(state.totalDistanceKm, state.elapsedSeconds),
    status: state.status
  });
}

// ================= 지도 및 캐릭터 마커 렌더링 =================
function initMap() {
  const defaultLat = 37.5665;
  const defaultLng = 126.9780;

  state.map = L.map('map', {
    zoomControl: false
  }).setView([defaultLat, defaultLng], 16);

  // 워터마크 및 API 키가 절대 필요 없는 100% 무료 공식 OpenStreetMap 타일 사용
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(state.map);

  // 내 캐릭터 마커 초기화
  updateMyMarker(defaultLat, defaultLng);

  // 이동 경로 Polyline
  state.routePolyline = L.polyline([], {
    color: '#0284c7',
    weight: 6,
    opacity: 0.9,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(state.map);
}

// 내 얼굴 캐릭터 마커 생성/갱신
function updateMyMarker(lat, lng) {
  const sportEmoji = getSportEmoji(state.student.sport);
  const avatarSrc = state.student.avatar || createEmojiAvatar('🐯');

  const customHtml = `
    <div class="custom-character-marker my-marker">
      <div class="marker-name-tag" style="border-color:#10b981;">
        <span>🏃</span> ${escapeHtml(state.student.class)} ${escapeHtml(state.student.name)} (나)
      </div>
      <div class="marker-avatar-container">
        <img class="marker-avatar-img" src="${avatarSrc}" alt="내 캐릭터">
        <span class="sport-badge-icon">${sportEmoji}</span>
      </div>
    </div>
  `;

  const customIcon = L.divIcon({
    html: customHtml,
    className: '',
    iconSize: [60, 70],
    iconAnchor: [30, 65]
  });

  if (!state.myMarker) {
    state.myMarker = L.marker([lat, lng], { icon: customIcon }).addTo(state.map);
  } else {
    state.myMarker.setLatLng([lat, lng]);
    state.myMarker.setIcon(customIcon);
  }
}

// 친구 얼굴 캐릭터 마커 추가/갱신
function addOrUpdateFriendMarker(friend) {
  if (friend.socketId === state.socket?.id) return; // 나 자신은 제외

  const lat = friend.lat || 37.5665;
  const lng = friend.lng || 126.9780;
  const sportEmoji = getSportEmoji(friend.sport);
  const avatarSrc = friend.avatar || createEmojiAvatar('🐰');

  const customHtml = `
    <div class="custom-character-marker friend-marker">
      <div class="marker-name-tag">
        <span>🏃‍♂️</span> ${escapeHtml(friend.studentClass)} ${escapeHtml(friend.name)}
      </div>
      <div class="marker-avatar-container">
        <img class="marker-avatar-img" src="${avatarSrc}" alt="${escapeHtml(friend.name)}">
        <span class="sport-badge-icon">${sportEmoji}</span>
      </div>
    </div>
  `;

  const customIcon = L.divIcon({
    html: customHtml,
    className: '',
    iconSize: [60, 70],
    iconAnchor: [30, 65]
  });

  const popupContent = `
    <div style="text-align:center; padding:4px; font-family:-apple-system,sans-serif;">
      <div style="font-weight:800; color:#0f172a; font-size:13px;">${escapeHtml(friend.studentClass)} ${escapeHtml(friend.name)}</div>
      <div style="font-size:11px; color:#64748b; margin:2px 0 6px;">종목: ${escapeHtml(friend.sport)}</div>
      <div style="font-size:12px; font-weight:700; color:#0284c7;">
        📍 ${friend.distance || '0.0 km'} &nbsp;|&nbsp; ⚡ ${friend.pace || '--:--'}
      </div>
    </div>
  `;

  if (state.friendMarkers.has(friend.socketId)) {
    const existing = state.friendMarkers.get(friend.socketId);
    existing.marker.setLatLng([lat, lng]);
    existing.marker.setIcon(customIcon);
    existing.marker.getPopup().setContent(popupContent);
    existing.data = friend;
  } else {
    const newMarker = L.marker([lat, lng], { icon: customIcon })
      .addTo(state.map)
      .bindPopup(popupContent);

    state.friendMarkers.set(friend.socketId, {
      marker: newMarker,
      data: friend
    });
  }
}

function getSportEmoji(sport) {
  switch (sport) {
    case '조깅': return '👟';
    case '빠르게 걷기': return '🚶';
    case '사이클': return '🚴';
    default: return '🏃';
  }
}

// ================= 이벤트 리스너 바인딩 =================
function bindEvents() {
  // 1. 카메라 조작
  elements.btnCapturePhoto.addEventListener('click', capturePhoto);
  elements.btnRetakePhoto.addEventListener('click', retakePhoto);

  // 이모지 프리셋 클릭
  elements.avatarPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.avatarPresetBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const emoji = btn.dataset.emoji;
      const avatarData = createEmojiAvatar(emoji);
      state.student.avatar = avatarData;
      elements.avatarPreviewImg.src = avatarData;
      elements.avatarPreviewImg.style.display = 'block';
      elements.cameraVideo.style.display = 'none';
      elements.btnCapturePhoto.style.display = 'none';
      elements.btnRetakePhoto.style.display = 'flex';
      updateProfileUI();
    });
  });

  // 2. 위치 동의 및 즉시 참여
  elements.btnAgreeLocation.addEventListener('click', onCompleteOnboarding);

  // 3. 운동 제어
  elements.btnStartWorkout.addEventListener('click', startWorkout);
  elements.btnPauseWorkout.addEventListener('click', pauseWorkout);
  elements.btnResumeWorkout.addEventListener('click', resumeWorkout);
  elements.btnStopWorkout.addEventListener('click', stopWorkout);

  // 4. 지도 조작
  elements.btnCenterMap.addEventListener('click', centerToUser);
  elements.btnFitBounds.addEventListener('click', fitAllFriendsBounds);
  elements.btnToggleSimulate.addEventListener('click', toggleSimulation);

  // 5. 모달
  elements.btnCloseFinishModal.addEventListener('click', () => {
    elements.finishModal.classList.remove('active');
    resetWorkoutUI();
  });
  elements.btnManualSendSheet.addEventListener('click', sendRecordToSheet);

  // 6. 대시보드 새로고침
  elements.btnRefreshSheet.addEventListener('click', fetchSheetData);

  // 7. 프로필 변경 및 실시간 자동 동기화
  elements.btnRetakeFromSettings.addEventListener('click', () => {
    // 카메라 재시작 후 모달 열기
    elements.consentModal.classList.add('active');
    initCamera();
    retakePhoto();
  });

  // 앨범에서 사진 선택 시 즉시 내 아바타로 크롭 및 반영
  if (elements.settingAvatarFile) {
    elements.settingAvatarFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = elements.avatarCanvas;
          const ctx = canvas.getContext('2d');
          canvas.width = 120;
          canvas.height = 120;

          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 120, 120);

          state.student.avatar = canvas.toDataURL('image/jpeg', 0.85);
          applyStudentProfileChanges(true);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 사용자가 글자를 타이핑하거나 종목을 바꾸면 버튼 안 눌러도 '즉시 자동 저장 및 지도 실시간 반영'!
  elements.settingStudentName.addEventListener('input', () => {
    elements.initStudentName.value = elements.settingStudentName.value;
    applyStudentProfileChanges(true);
  });

  elements.settingStudentClass.addEventListener('input', () => {
    elements.initStudentClass.value = elements.settingStudentClass.value;
    applyStudentProfileChanges(true);
  });

  elements.settingSportType.addEventListener('change', () => {
    elements.initSportType.value = elements.settingSportType.value;
    applyStudentProfileChanges(true);
  });

  // 온보딩 입력창에서도 타이핑 시 즉시 설정 탭과 동기화
  elements.initStudentName.addEventListener('input', () => {
    elements.settingStudentName.value = elements.initStudentName.value;
    applyStudentProfileChanges(true);
  });

  elements.initStudentClass.addEventListener('input', () => {
    elements.settingStudentClass.value = elements.initStudentClass.value;
    applyStudentProfileChanges(true);
  });

  elements.initSportType.addEventListener('change', () => {
    elements.settingSportType.value = elements.initSportType.value;
    applyStudentProfileChanges(true);
  });

  elements.btnSaveStudentInfo.addEventListener('click', () => {
    applyStudentProfileChanges(true);
    alert('✅ 프로필 정보가 저장되었습니다!');
  });

  elements.btnSaveGasUrl.addEventListener('click', () => {
    const url = elements.settingGasUrl.value.trim();
    state.settings.gasUrl = url;
    localStorage.setItem('running_gas_url', url);
    alert('구글 스프레드시트 연동 Web App URL이 저장되었습니다!');
  });

  // 8. 완주 인증샷 포토 카드 조작
  if (elements.btnTakeSnapPhoto) {
    elements.btnTakeSnapPhoto.addEventListener('click', openSnapCameraModal);
  }
  if (elements.btnCaptureSnapPhoto) {
    elements.btnCaptureSnapPhoto.addEventListener('click', captureSnapPhoto);
  }
  if (elements.btnCloseSnapCamera) {
    elements.btnCloseSnapCamera.addEventListener('click', closeSnapCameraModal);
  }
  if (elements.inputSnapFile) {
    elements.inputSnapFile.addEventListener('change', handleSnapFileUpload);
  }
  if (elements.btnToggleSnapTheme) {
    elements.btnToggleSnapTheme.addEventListener('click', () => {
      state.snapshot.theme = state.snapshot.theme === 'photo' ? 'dark' : 'photo';
      renderSnapshotCard();
    });
  }
  if (elements.btnDownloadSnapCard) {
    elements.btnDownloadSnapCard.addEventListener('click', downloadSnapshotImage);
  }

  // 9. 실시간 대시보드 날짜 필터 조작
  if (elements.btnFilterToday) {
    elements.btnFilterToday.addEventListener('click', () => setDashboardFilter('today'));
  }
  if (elements.btnFilterAll) {
    elements.btnFilterAll.addEventListener('click', () => setDashboardFilter('all'));
  }

  // 대시보드 5초 주기 실시간 자동 동기화 (Auto-poll)
  setInterval(() => {
    const dashboardTab = document.getElementById('dashboardTab');
    if (dashboardTab && dashboardTab.classList.contains('active')) {
      fetchSheetData();
    }
  }, 5000);
}

// ================= 즉석 온보딩 완료 =================
function onCompleteOnboarding() {
  state.student.name = elements.initStudentName.value.trim() || '김민준';
  state.student.class = elements.initStudentClass.value.trim() || '1-1';
  state.student.sport = elements.initSportType.value;

  if (!state.student.avatar) {
    state.student.avatar = createEmojiAvatar('🐯');
  }

  localStorage.setItem('running_student', JSON.stringify(state.student));
  updateProfileUI();

  // 카메라 스트림 정리
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }

  elements.consentModal.classList.remove('active');

  // GPS 권한 요청 및 첫 위치 탐색
  requestGpsPosition();

  // 소켓 룸 입장 (친구들과 실시간 공유 시작)
  joinSocialRoom();

  // 화면 꺼짐 방지
  requestWakeLock();
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock 활성화');
    }
  } catch (err) {}
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
      
      state.lastPosition = [latitude, longitude];
      updateMyMarker(latitude, longitude);
      state.map.setView([latitude, longitude], 17);
      emitMyLocation();
    },
    (err) => {
      console.warn('GPS 오류:', err.message);
      elements.gpsStatusText.textContent = 'GPS 대기중 (시뮬레이션 가능)';
      updateMyMarker(state.lastPosition[0], state.lastPosition[1]);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ================= 운동 시작/일시정지/종료 =================
function startWorkout() {
  state.status = 'RUNNING';
  state.startTime = new Date();
  state.elapsedSeconds = 0;
  state.totalDistanceKm = 0;
  state.coordinates = [];

  elements.metricStartTime.textContent = formatTime(state.startTime);

  elements.btnStartWorkout.style.display = 'none';
  elements.btnPauseWorkout.style.display = 'flex';
  elements.btnStopWorkout.style.display = 'flex';
  elements.btnResumeWorkout.style.display = 'none';

  state.routePolyline.setLatLngs([]);

  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(tickWorkout, 1000);

  startGpsTracking();
  emitMyLocation();
}

function pauseWorkout() {
  state.status = 'PAUSED';
  clearInterval(state.timerInterval);
  stopGpsTracking();

  elements.btnPauseWorkout.style.display = 'none';
  elements.btnResumeWorkout.style.display = 'flex';
  emitMyLocation();
}

function resumeWorkout() {
  state.status = 'RUNNING';
  state.timerInterval = setInterval(tickWorkout, 1000);
  startGpsTracking();

  elements.btnResumeWorkout.style.display = 'none';
  elements.btnPauseWorkout.style.display = 'flex';
  emitMyLocation();
}

function stopWorkout() {
  state.status = 'FINISHED';
  state.endTime = new Date();
  clearInterval(state.timerInterval);
  stopGpsTracking();
  if (state.isSimulating) stopSimulation();

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

  elements.finishModal.classList.add('active');

  // 완주 인증샷 포토 카드 즉시 렌더링
  renderSnapshotCard();

  emitMyLocation();
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

function tickWorkout() {
  state.elapsedSeconds++;
  elements.metricDuration.textContent = formatDuration(state.elapsedSeconds);
  
  const cals = calculateCalories(state.student.sport, state.elapsedSeconds);
  elements.metricCalories.textContent = cals;

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
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
}

function stopGpsTracking() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
}

function handlePositionUpdate(lat, lng, accuracy = 10) {
  if (accuracy > 30) return;

  const currentLatLng = [lat, lng];

  if (state.lastPosition) {
    const distMeters = getHaversineDistance(
      state.lastPosition[0], state.lastPosition[1],
      lat, lng
    );

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
  updateMyMarker(lat, lng);
  emitMyLocation(); // 친구들에게 내 위치 실시간 전송!
}

function centerToUser() {
  if (state.lastPosition && state.map) {
    state.map.panTo(state.lastPosition);
  }
}

// 나와 모든 친구들의 마커가 다 들어오도록 지도 맞추기
function fitAllFriendsBounds() {
  if (!state.map) return;
  const points = [state.lastPosition];

  state.friendMarkers.forEach(({ marker }) => {
    points.push([marker.getLatLng().lat, marker.getLatLng().lng]);
  });

  if (points.length === 1) {
    state.map.setView(points[0], 17);
  } else {
    const bounds = L.latLngBounds(points);
    state.map.fitBounds(bounds, { padding: [40, 40] });
  }
}

// ================= 시뮬레이션 모드 =================
function toggleSimulation() {
  if (state.isSimulating) {
    stopSimulation();
    alert('가상 시뮬레이션 모드가 꺼졌습니다.');
  } else {
    startSimulation();
    alert('🏃‍♂️ 가상 달리기 시뮬레이션이 켜졌습니다!\n친구들의 화면에서도 내 캐릭터가 운동장 트랙을 달리는 모습이 보입니다.');
  }
}

function startSimulation() {
  state.isSimulating = true;
  elements.btnToggleSimulate.style.background = '#0284c7';
  elements.gpsDot.className = 'gps-dot simulating';
  elements.gpsStatusText.textContent = '가상 러닝 모드 (400m 트랙)';

  const centerLat = state.lastPosition ? state.lastPosition[0] : 37.5665;
  const centerLng = state.lastPosition ? state.lastPosition[1] : 126.9780;
  
  const simTrackPoints = [];
  const totalPoints = 60;
  const radiusX = 0.0012;
  const radiusY = 0.0006;

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

// ================= 계산 공식 =================
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatTime(date) {
  if (!date) return '--:--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDuration(totalSec) {
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function calculatePace(distanceKm, durationSeconds) {
  if (distanceKm <= 0.01 || durationSeconds <= 5) return '--:--';
  const secPerKm = durationSeconds / distanceKm;
  if (secPerKm > 3600) return '99:59';

  const paceMin = Math.floor(secPerKm / 60);
  const paceSec = Math.floor(secPerKm % 60);
  return `${String(paceMin).padStart(2, '0')}:${String(paceSec).padStart(2, '0')}`;
}

function calculateCalories(sport, durationSeconds) {
  const met = MET_VALUES[sport] || 7.0;
  const hours = durationSeconds / 3600;
  return Math.round(met * DEFAULT_WEIGHT_KG * hours);
}

// ================= 구글 스프레드시트 데이터 전송 =================
async function sendRecordToSheet() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const payload = {
    name: state.student.name,
    studentClass: state.student.class,
    sport: state.student.sport,
    startTime: formatTime(state.startTime),
    endTime: formatTime(state.endTime),
    duration: formatDuration(state.elapsedSeconds),
    distance: state.totalDistanceKm.toFixed(2) + ' km',
    calories: calculateCalories(state.student.sport, state.elapsedSeconds) + ' kcal',
    pace: calculatePace(state.totalDistanceKm, state.elapsedSeconds),
    date: todayStr
  };

  elements.sheetSendStatus.style.color = '#38bdf8';
  elements.sheetSendStatus.textContent = '⏳ 스프레드시트로 전송 중...';

  const gasUrl = state.settings.gasUrl;

  try {
    let res;
    if (gasUrl) {
      try {
        await fetch(gasUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        elements.sheetSendStatus.style.color = '#34d399';
        elements.sheetSendStatus.textContent = '✅ 구글 스프레드시트에 성공적으로 저장되었습니다!';
        fetchSheetData();
        return;
      } catch (directErr) {}
    }

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
      elements.sheetSendStatus.innerHTML = `⚠️ 저장 대기: [설정] 탭에서 구글 Apps Script Web App URL을 등록해 주세요.`;
    }
  } catch (error) {
    elements.sheetSendStatus.style.color = '#f59e0b';
    elements.sheetSendStatus.innerHTML = `ℹ️ 구글 연동 안내: [설정] 탭에서 Apps Script URL을 등록하면 원클릭 자동 저장됩니다.`;
  }
}

// ================= 구글 스프레드시트 실시간 데이터 조회 & 오늘 기본값 차트 =================
async function fetchSheetData() {
  try {
    elements.sheetUpdatedTime.textContent = '동기화 중...';
    const res = await fetch('/api/sheet-data');
    if (!res.ok) throw new Error('데이터 조회 실패');

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    state.dashboard.allRecords = data.records || [];
    state.dashboard.summary = data.summary || {};
    elements.sheetUpdatedTime.textContent = new Date().toLocaleTimeString('ko-KR') + ' 갱신';

    renderDashboardView();
  } catch (err) {
    console.error('시트 조회 오류:', err);
    elements.sheetUpdatedTime.textContent = '동기화 대기';
  }
}

function setDashboardFilter(filterMode) {
  state.dashboard.filter = filterMode;
  if (filterMode === 'today') {
    if (elements.btnFilterToday) {
      elements.btnFilterToday.classList.add('active');
      elements.btnFilterToday.style.borderColor = '#38bdf8';
    }
    if (elements.btnFilterAll) {
      elements.btnFilterAll.classList.remove('active');
      elements.btnFilterAll.style.borderColor = '#334155';
    }
    if (elements.chartSubtext) elements.chartSubtext.textContent = '오늘 기록 기준';
  } else {
    if (elements.btnFilterAll) {
      elements.btnFilterAll.classList.add('active');
      elements.btnFilterAll.style.borderColor = '#38bdf8';
    }
    if (elements.btnFilterToday) {
      elements.btnFilterToday.classList.remove('active');
      elements.btnFilterToday.style.borderColor = '#334155';
    }
    if (elements.chartSubtext) elements.chartSubtext.textContent = '전체 누적 기록 기준';
  }
  renderDashboardView();
}

function renderDashboardView() {
  const all = state.dashboard.allRecords || [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (elements.todayDateBadge) {
    elements.todayDateBadge.textContent = `${now.getMonth() + 1}.${now.getDate()}`;
  }

  // 1. 날짜 필터링 (오늘이 기본값!)
  let filtered = all;
  if (state.dashboard.filter === 'today') {
    filtered = all.filter(r => (r.date || todayStr) === todayStr);
    if (filtered.length === 0 && all.length > 0) {
      filtered = all; // 데이터가 있으면 기본 표시
    }
  }

  // 2. 요약 4대 통계 동적 계산
  let totalSeconds = 0;
  let totalCalories = 0;
  let totalDistKm = 0;

  filtered.forEach(r => {
    if (r.duration) {
      const parts = r.duration.split(':').map(Number);
      if (parts.length === 3) {
        totalSeconds += (parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
    }
    const calMatch = (r.calories || '').match(/(\d+)/);
    if (calMatch) totalCalories += parseInt(calMatch[1], 10);

    const distMatch = (r.distance || '').match(/([\d.]+)/);
    if (distMatch) totalDistKm += parseFloat(distMatch[1]);
  });

  elements.sumStudentCount.textContent = `${filtered.length}명`;
  elements.sumTotalTime.textContent = formatDuration(totalSeconds);
  elements.sumTotalCalories.textContent = `${totalCalories.toLocaleString()} kcal`;
  elements.sumAvgPace.textContent = calculatePace(totalDistKm, totalSeconds) + ' /km';

  // 3. 실시간 랭킹 막대 차트 (거리 기준 내림차순 정렬)
  const ranked = [...filtered].sort((a, b) => {
    const distA = parseFloat(a.distance) || 0;
    const distB = parseFloat(b.distance) || 0;
    return distB - distA;
  });

  const maxDistance = ranked.length > 0 ? Math.max(...ranked.map(r => parseFloat(r.distance) || 0), 1) : 1;

  if (ranked.length > 0 && elements.chartContainer) {
    elements.chartContainer.innerHTML = ranked.slice(0, 6).map((r, idx) => {
      const distVal = parseFloat(r.distance) || 0;
      const percent = Math.min(Math.max((distVal / maxDistance) * 100, 18), 100);
      const medals = ['🥇 1위', '🥈 2위', '🥉 3위'];
      const rankBadge = medals[idx] || `${idx + 1}위`;
      const sportIcon = getSportEmoji(r.sport);

      return `
        <div class="chart-bar-row">
          <div class="chart-bar-header">
            <span class="chart-rank-badge">
              <span>${rankBadge}</span>
              <span style="color:#f8fafc; margin-left:4px;">${escapeHtml(r.studentClass)} ${escapeHtml(r.name)}</span>
              <span>${sportIcon}</span>
            </span>
            <span style="color:#38bdf8; font-weight:800;">
              ${escapeHtml(r.distance)} <span style="font-size:10px; color:#94a3b8; font-weight:400;">(${escapeHtml(r.pace)}/km)</span>
            </span>
          </div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  } else if (elements.chartContainer) {
    elements.chartContainer.innerHTML = `
      <div style="text-align:center; padding:16px; color:#64748b; font-size:12px;">
        오늘 기록된 운동이 없습니다. 첫 번째로 달려보세요!
      </div>
    `;
  }

  // 4. 테이블 렌더링
  if (filtered.length > 0) {
    elements.sheetRecordsBody.innerHTML = filtered.map(r => `
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
          선택한 날짜의 운동 기록이 없습니다.
        </td>
      </tr>
    `;
  }
}

// 탭 초기화
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ================= 📸 완주 인증샷 포토 카드 렌더링 & 다운로드 =================
function renderSnapshotCard() {
  const canvas = elements.snapshotCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  canvas.width = 800;
  canvas.height = 800;

  // 1. 배경 드로잉 (인증샷 사진 또는 프리미엄 다크 러닝 테마)
  if (state.snapshot.theme === 'photo' && state.snapshot.photoImg) {
    const img = state.snapshot.photoImg;
    const canvasRatio = canvas.width / canvas.height;
    const imgRatio = img.width / img.height;
    let sWidth, sHeight, sx, sy;

    if (imgRatio > canvasRatio) {
      sHeight = img.height;
      sWidth = img.height * canvasRatio;
      sx = (img.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = img.width;
      sHeight = img.width / canvasRatio;
      sx = 0;
      sy = (img.height - sHeight) / 2;
    }
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

    // 텍스트/경로 가독성을 위한 다크 비네팅 그라데이션 오버레이
    const overlay = ctx.createLinearGradient(0, 0, 0, canvas.height);
    overlay.addColorStop(0, 'rgba(15, 23, 42, 0.75)');
    overlay.addColorStop(0.35, 'rgba(15, 23, 42, 0.35)');
    overlay.addColorStop(0.65, 'rgba(15, 23, 42, 0.65)');
    overlay.addColorStop(1, 'rgba(9, 13, 22, 0.95)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // 다크 네온 러닝 테마 배경
    const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#1e293b');
    bgGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 격자 그리드 효과
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  // 2. 상단 헤더 (완주 배지 & 날짜)
  ctx.save();
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  roundRect(ctx, 36, 36, 170, 38, 19);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏃 FINISHER', 121, 55);
  ctx.restore();

  const now = state.endTime || new Date();
  const dateStr = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
  ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.font = 'bold 16px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, canvas.width - 36, 60);

  // 3. 내가 달린 GPS 경로 흔적 드로잉
  drawRouteTrace(ctx, canvas);

  // 4. 대형 거리 텍스트
  const distNumber = state.totalDistanceKm.toFixed(2);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 86px -apple-system, sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 16;
  ctx.fillText(distNumber, 42, 595);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 28px -apple-system, sans-serif';
  ctx.fillText('KM', 42 + ctx.measureText(distNumber).width + 12, 586);
  ctx.restore();

  // 5. 하단 3개 운동 지표 바 (운동시간, 평균 페이스, 소모 열량)
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.9)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 36, 626, canvas.width - 72, 80, 16);
  ctx.fill();
  ctx.stroke();

  const colWidth = (canvas.width - 72) / 3;
  const metrics = [
    { label: '⏱️ 운동 시간', val: formatDuration(state.elapsedSeconds) },
    { label: '⚡ 평균 페이스', val: calculatePace(state.totalDistanceKm, state.elapsedSeconds) + ' /km' },
    { label: '🔥 소모 열량', val: calculateCalories(state.student.sport, state.elapsedSeconds) + ' kcal' }
  ];

  metrics.forEach((m, idx) => {
    const cx = 36 + colWidth * idx + colWidth / 2;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, cx, 652);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.fillText(m.val, cx, 680);
  });
  ctx.restore();

  // 6. 하단 학생 이름표 & 학교 워터마크
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`👟 ${state.student.class} ${state.student.name} (${state.student.sport})`, 42, 755);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
  ctx.font = '500 13px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('스마트 러닝 앱 • GPS VERIFIED', canvas.width - 42, 755);
}

// GPS 달린 흔적 경로 드로잉 함수
function drawRouteTrace(ctx, canvas) {
  const coords = state.coordinates;
  ctx.save();

  if (coords && coords.length >= 2) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    coords.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    const latSpan = Math.max(maxLat - minLat, 0.0002);
    const lngSpan = Math.max(maxLng - minLng, 0.0002);

    const boxX = 80, boxY = 130, boxW = canvas.width - 160, boxH = 340;
    const scale = Math.min(boxW / lngSpan, boxH / latSpan);

    const mapX = (lng) => boxX + (boxW - lngSpan * scale) / 2 + (lng - minLng) * scale;
    const mapY = (lat) => boxY + (boxH - latSpan * scale) / 2 + (maxLat - lat) * scale;

    // 네온 글로우 이동 경로 선
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 18;

    ctx.beginPath();
    coords.forEach(([lat, lng], i) => {
      const px = mapX(lng);
      const py = mapY(lat);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // 시작점 (녹색 핀)
    const startP = coords[0];
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(mapX(startP[1]), mapY(startP[0]), 9, 0, Math.PI * 2);
    ctx.fill();

    // 도착점 (주황 핀)
    const endP = coords[coords.length - 1];
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(mapX(endP[1]), mapY(endP[0]), 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 좌표가 2개 미만일 때: 400m 육상 트랙 모양 루프 드로잉
    const cx = canvas.width / 2;
    const cy = 290;
    const rx = 180;
    const ry = 95;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(cx - rx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// 완주 인증샷 전용 카메라 모달 열기
async function openSnapCameraModal() {
  if (!elements.snapCameraModal) return;
  elements.snapCameraModal.classList.add('active');

  try {
    state.snapshot.snapStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false
    });
    if (elements.snapVideo) {
      elements.snapVideo.srcObject = state.snapshot.snapStream;
    }
  } catch (err) {
    alert('카메라를 켤 수 없습니다: ' + err.message);
    closeSnapCameraModal();
  }
}

// 완주 인증샷 찰칵 캡처
function captureSnapPhoto() {
  if (!elements.snapVideo) return;
  const video = elements.snapVideo;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = video.videoWidth || 640;
  tempCanvas.height = video.videoHeight || 640;
  const ctx = tempCanvas.getContext('2d');

  // 셀카 거울 반전
  ctx.translate(tempCanvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

  const img = new Image();
  img.onload = () => {
    state.snapshot.photoImg = img;
    state.snapshot.theme = 'photo';
    renderSnapshotCard();
  };
  img.src = tempCanvas.toDataURL('image/jpeg', 0.9);

  closeSnapCameraModal();
}

function closeSnapCameraModal() {
  if (state.snapshot.snapStream) {
    state.snapshot.snapStream.getTracks().forEach(t => t.stop());
    state.snapshot.snapStream = null;
  }
  if (elements.snapCameraModal) {
    elements.snapCameraModal.classList.remove('active');
  }
}

// 앨범에서 사진 불러오기
function handleSnapFileUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      state.snapshot.photoImg = img;
      state.snapshot.theme = 'photo';
      renderSnapshotCard();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// 완주 인증샷 포토 카드 이미지 다운로드
function downloadSnapshotImage() {
  const canvas = elements.snapshotCanvas;
  if (!canvas) return;

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const filename = `러닝완주_${state.student.class}_${state.student.name}_${dateStr}.png`;

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert(`🎉 완주 인증샷 포토 카드가 저장되었습니다!\n파일명: ${filename}`);
}

