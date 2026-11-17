# 수업 화면 미러링 (GitHub Pages + Firebase 버전)

서버 PC 없이 **웹사이트 하나**로 돌아가요.
- 화면: GitHub Pages (`https://내아이디.github.io/저장소이름/`)
- 데이터: Firebase (로그인 · Realtime Database)

| 주소 | 누가 |
|---|---|
| `…/` (index.html) | 학생: 수업 코드 + 학번 + 이름으로 입장 |
| `…/admin.html` | 선생님: 구글 로그인, 반·학생 명단, 수업 열기, 출석부 |
| `…/teacher.html?l=…` | 선생님: 수업 진행 (관리 화면에서 열림) |

---

## 1. Firebase 준비 (한 번만)
1. https://console.firebase.google.com → **프로젝트 만들기** (Google 애널리틱스는 꺼도 됨)
2. **빌드 → Authentication → 시작하기** → 로그인 방법에서 **Google** 사용 설정, **익명** 사용 설정
3. **빌드 → Realtime Database → 데이터베이스 만들기** → 위치 **싱가포르(asia-southeast1)** → **잠금 모드**
4. Realtime Database의 **규칙** 탭 → 내용을 모두 지우고 이 폴더의 `database.rules.json` 내용을 붙여 넣기 → **게시**
5. 프로젝트 개요 → **`</>` (웹 앱 추가)** → 이름 `web` → 등록 → 나오는 `firebaseConfig` 값을
   `js/firebase-config.js` 에 붙여 넣기

## 2. 내 PC에서 먼저 해 보기 (선택)
- `미리보기.bat` 더블클릭 → `http://localhost:5500/admin.html` 이 열림
- `localhost`는 Firebase 로그인 허용 목록에 처음부터 들어 있어서 바로 돼요.

## 3. GitHub Pages에 올리기
1. https://github.com 가입 → 오른쪽 위 **＋ → New repository** → 이름 예: `class` → **Public** → Create
2. 저장소 화면에서 **Add file → Upload files** → 이 `site` 폴더 **안의 파일·폴더 전부**를 끌어다 놓기 → **Commit changes**
   (`site` 폴더 자체가 아니라, 그 안의 `index.html`, `js`, `css` … 가 저장소 맨 위에 오도록)
3. 저장소 **Settings → Pages** → Branch: `main` / `/(root)` → **Save**
4. 1~2분 뒤 `https://내아이디.github.io/class/` 가 열려요.
5. Firebase 콘솔 → **Authentication → 설정 → 승인된 도메인 → 도메인 추가** → `내아이디.github.io`

## 4. 처음 로그인
- `https://내아이디.github.io/class/admin.html` → **구글 계정으로 로그인**
- **처음 로그인한 구글 계정이 선생님 계정**이 돼요. (다른 사람이 먼저 로그인하지 않도록 올리자마자 바로 로그인하세요)
- 다른 선생님을 추가하려면: 그 선생님이 한 번 로그인 시도 → Firebase 콘솔 Authentication 사용자 목록에서 그 사람의 **사용자 UID** 복사
  → Realtime Database 데이터에서 `teachers` 아래에 그 UID 이름으로 항목 추가

## 5. 수업 흐름
1. 관리: 반 개설 → 👥 학생 명단 등록 (한 줄에 `학번 이름`, 엑셀 두 열 붙여 넣기 가능)
2. 📅 수업: 날짜 + 교시 → **▶ 수업 열기** → 6자리 코드 + 수업 화면
3. 수업 화면 위쪽 노란 코드를 누르면 주소·코드·QR이 크게 보여요
4. 학생: 사이트 접속 → 코드 + 학번 + 이름 → 입장 (명단에 있는 학생만)
5. 출석 자동 판정: 수업을 연 뒤 10분 안 첫 입장 **출석**, 그 뒤 **지각**, 안 들어오면 **결석** (직접 바꾸기 가능, 조퇴 포함)
6. **⏹ 수업 종료** → 출석 마감. 📋 출석부 탭에서 모든 수업을 한눈에 + **엑셀(CSV)**

## 바뀐 점 (예전 PC 서버 버전과 비교)
- **PPT는 PDF로 저장해서 올리기** (PowerPoint: 파일 → 다른 이름으로 저장 → PDF). PDF·이미지는 브라우저에서 바로 슬라이드로 바뀌어요.
- 슬라이드 이미지는 Realtime Database에 저장돼요 (무료 용량 1GB). 다 쓴 자료는 지워 주세요.
- 화면 공유는 선생님 PC → 학생에게 직접 영상(WebRTC). 막히는 학생은 1초 남짓마다 사진으로 자동 우회.
  학생 쪽 망에서 영상이 자주 안 나오면 `js/firebase-config.js` 의 `iceServers` 에 TURN 서버를 넣으세요.
- 시청 시간·이탈 횟수는 **선생님 수업 화면이 열려 있는 동안** 기록돼요. (입장 시각 = 출석/지각 판정은 항상 기록)

## 무료 사용량 (Firebase Spark 요금제)
- 동시 접속 100명, 저장 1GB, 다운로드 월 10GB — 한 반 수업에는 충분해요.
- Firebase 콘솔 **사용량** 탭에서 확인할 수 있어요.

## 개인정보
학번·이름·출석 기록이 Google 클라우드(Firebase)에 저장돼요. 학교 개인정보 처리 규정을 한 번 확인해 주세요.
