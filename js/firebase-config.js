// ① Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)에 나오는 firebaseConfig 를 그대로 붙여 넣으세요.
//    (이 값들은 비밀번호가 아니에요. 웹페이지에 들어가는 것이 정상이고, 보안은 database.rules.json 규칙이 맡아요.)
export const firebaseConfig = {
  apiKey: 'AIzaSyADwOKcRFH2jKax51MB42JvgmAiMU9ku6Q',
  authDomain: 'ssaem-class-5726.firebaseapp.com',
  databaseURL: 'https://ssaem-class-5726-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ssaem-class-5726',
  storageBucket: 'ssaem-class-5726.firebasestorage.app',
  messagingSenderId: '855612395867',
  appId: '1:855612395867:web:3fbb920d7917c18a6e8a7e',
};

// ② 화면 공유 연결용 서버 목록. 학생 쪽 네트워크가 막혀 영상이 안 나오면 TURN 서버를 추가하세요.
export const iceServers = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // { urls: 'turn:서버주소:3478', username: '아이디', credential: '비밀번호' },
];

// ③ 지각 기준(분): 수업을 연 뒤 이 시간이 지나 처음 들어오면 '지각'
export const LATE_MINUTES = 10;
export const PERIODS = 7;
