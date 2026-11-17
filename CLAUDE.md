# 수업 화면 미러링 + 출석 — 인계 문서 (Claude Code용)

> 2026-11-17, 이전 PC의 Claude Code 세션에서 정리. 이 폴더(= GitHub 저장소 `geunzero1217/class`)를 열면 먼저 이 문서를 읽을 것.

## 사용자
- 한국 고등학교 선생님. **모든 답변은 한국어로.** 코드·명령·파일 이름만 그대로.
- 핵심 요구: ① 내 화면·콘텐츠 공유와 시연, ② 필기, ③ 학생 접속 상태(보는 중 🟢 / 이탈 🔴) 확인, ④ 출석 정리.
- 주로 **화면 실습 시연**(전체 화면 공유 + 다른 프로그램 조작)을 보여 줌.

## 수업 흐름 (사용자가 정한 방식 — 바꾸지 말 것)
1. 선생님이 반과 학생 명단(학번·이름)을 미리 등록
2. 반 수업을 **날짜 + 교시(1~7)** 로 연다 → 6자리 **수업 코드**
3. 학생은 사이트에서 **코드 + 학번 + 이름** 입력 → 그 수업에 입장 (명단에 있어야 함)
4. 출석 자동 판정: 수업을 연 뒤 `lateMin`(기본 10분) 안 첫 입장 = 출석, 이후 = 지각, 미입장 = 결석. 선생님이 출석/지각/결석/조퇴로 직접 변경 가능
5. 같은 날짜·교시를 다시 열면 같은 수업으로 이어짐. 한 반에 열린 수업은 하나
6. 반별 출석부(모든 수업 × 학생) + CSV 내보내기

## 구조 (서버 없음)
| 부분 | 내용 |
|---|---|
| 화면 | GitHub Pages: https://geunzero1217.github.io/class/ (저장소 `geunzero1217/class`, public, main 브랜치 루트) |
| 데이터·로그인 | Firebase 프로젝트 `ssaem-class-5726` (Spark 무료). Realtime Database `asia-southeast1`, Auth: Google(선생님) + 익명(학생) |
| 승인된 도메인 | localhost, ssaem-class-5726.firebaseapp.com, ssaem-class-5726.web.app, geunzero1217.github.io |
| 외부 라이브러리 | Firebase JS SDK 10.12.2 (gstatic), pdf.js 3.11.174, qrcodejs 1.0.0 (cdnjs) — 학교망에서 모두 접속 확인함 |

### 파일
- `index.html` 학생 입장 · `student.html` 학생 화면 · `admin.html` 선생님 관리(구글 로그인) · `teacher.html?l=수업ID` 수업 진행
- `js/firebase-config.js` Firebase 설정값, `iceServers`(STUN/TURN), `LATE_MINUTES`, `PERIODS`
- `js/fb.js` Firebase 초기화·수업 열기/닫기/삭제·출석 계산(`attRows`)·PDF/이미지→슬라이드(`uploadDeck`)·`SlideCache`
  - `r('')` = DB 루트 (여러 경로 한꺼번에 `update`). **`ref(db, '')`는 오류**라서 `r()`가 빈 문자열이면 `ref(db)`를 쓰게 고쳐 둠
- `js/common.js` 무대(Stage), 필기(Ink: 좌표 0~1, 저장은 `"x,y;x,y"` 0~10000 정수), `stateKey`, `renderView`
- `css/style.css`, `database.rules.json` (보안 규칙), `firebase.json` + `.firebaserc` (규칙 배포용)
- `미리보기.bat` (이 PC에서 `python -m http.server 5500`) — 저장소에는 안 올림

### 데이터 모양 (Realtime Database)
```
teachers/{uid}                 선생님 (구글). 아무도 없을 때 처음 로그인한 계정이 자동 등록
classes/{cid}                  {name, created}
rosters/{cid}/s{학번}          {sid, name, n(공백 뺀 이름)}   ← 키 앞에 's' (숫자 키가 배열로 바뀌는 것 방지)
decks/{cid}/{did}              {name, pages:[{w,h}], created}
slides/{did}/p{i}              JPEG dataURL (1600px, q0.75)
lessons/{lid}                  {cid, className, date, period, code, status:'open'|'closed', openedAt, closedAt, lateMin}
codes/{code}                   lid (열린 수업만)
members/{lid}/{uid}            학생 입장 {sid, n, name, at(서버시각)} — 규칙이 명단(n)과 대조
presence/{lid}/{uid}           {s:'active'|'away', t} (onDisconnect 로 삭제)
att/{lid}/s{학번}              {activeMs, away, manual} — 선생님 수업 화면이 열려 있을 때 기록
live/{lid}                     화면 상태 {mode, deckId, page, url, board, boardCount, aspect, sharing, shareId}
ink/{lid}/{key}/{strokeId}     필기 {t, c, s, p, done}
pointer/{lid}                  레이저 {k, x, y}
rtc/{lid}/{uid}                WebRTC 신호 {req, offer, answer, tc/*, sc/*}
relay/{lid}/want/{uid}, frame  우회 전송 (WebRTC 실패 학생에게 1.2초마다 960px JPEG)
```
보안 규칙은 실제로 시험함: 학생은 명단·출석·다른 수업·선생님 목록을 못 읽고, 화면 상태·명단을 못 씀. 코드(`codes/{code}`) 확인만 가능.

## 수정 → 올리기
- 이전 PC에는 git이 없어서 `gh api -X PUT repos/geunzero1217/class/contents/<경로>`로 파일을 올렸음. 새 PC에 git이 있으면 그냥 `git add / commit / push`.
- GitHub Pages는 푸시 후 1분 안에 반영됨.
- 보안 규칙 바꾼 뒤: `firebase deploy --only database` (Windows PowerShell에서 실행 정책 때문에 `firebase`가 막히면 `firebase.cmd`)
- 내 PC에서 미리 보기: 이 폴더에서 `python -m http.server 5500` → http://localhost:5500/admin.html (localhost는 승인된 도메인)
- 시험할 때: **사용자의 실제 반(예: 1학년 1반)에 수업을 열거나 데이터를 쓰지 말 것.** `zzTest` 같은 시험용 반·수업을 CLI(`firebase database:update / 파일.json --force`)로 만들고 끝나면 지울 것.
- 같은 브라우저에서 선생님(구글)과 학생(익명)을 동시에 못 씀 → 학생은 시크릿 창·다른 기기. (index.html은 선생님 로그인 상태면 안내만 하고 막음)

## 확인된 것 (실제 Firebase + GitHub Pages)
학생 입장/명단 대조, 칠판·필기 실시간, 시청 상태 🟢/🔴·탭 제목 `🔴N`·이탈 횟수·시청 시간 기록, 수업 종료(코드·실시간 데이터 정리), 출석 판정, PDF 업로드(3쪽 0.7초), 같은 PC 안 화면 공유(1920×1080 WebRTC 연결 1명). 사용자가 휴대폰으로 실제 입장해 출석·이탈 기록이 남은 것도 확인.

## 2026-11-17 새 PC에서 고친 것
- 우회 전송: `ImageCapture.grabFrame()` 대신 `MediaStreamTrackProcessor`(트랙 복제본)로 최신 프레임을 계속 받아 둠. 화면이 멈춰 있으면 grabFrame이 끝나지 않아 전송이 멈추던 문제 해결(브라우저에서 확인: 정지 화면은 프레임 1장만 옴). 화면이 바뀔 때만 전송. 선생님 화면에 `📷 사진 전송 N명 (약 xMB)` 표시
- 학생 화면 위쪽에 `🎥 실시간 영상 / ⏳ 영상 연결 중 / 📷 사진으로 보는 중` 표시. `videoReady`는 연결(connected) 뒤에만 true
- 화면 공유 시작하면 깜빡이는 `📌 학생 현황 창 띄우기` 안내(전체 화면 공유 시 작은 창도 찍힌다는 경고 포함). 작은 창은 인원 수 + 이탈 학생 이름 크게
- `모두 지우기`는 확인 창 없이 지우고 Ctrl+Z로 복구. `toast()`는 전체 화면 요소 안에 붙음
- 사진 전송 한 수업 300MB 한도(`RELAY_LIMIT`)
- **방향 결정(사용자)**: 학생은 학교 와이파이, 선생님 PC도 무선 랜으로 같은 학생망 → 영상(WebRTC) 직접 연결이 기본. TURN·PC 서버 방식은 보류
- 사진 전송은 **기본 꺼짐** (`live.relay`, 선생님 화면 `📷 영상 안 되는 학생에게 사진 보내기` 체크). 학생은 10초 안에 연결 안 되면 안내 + 8초마다 재시도 (`rtc/{lid}/{uid}.n` = 시도 번호, offer/answer에도 n)
- `🔧 영상 연결 돕기` = 마이크 권한만 받아 둠 (크롬이 mDNS 대신 진짜 내부 IP를 쓰게) — 효과는 미확인
- [화면 공유 시작] 한 번에 getDisplayMedia → documentPictureInPicture 를 await 없이 차례로 호출해 현황 창 자동으로 띄움. 안 되면 깜빡이는 안내. 현황 창에 모든 학생 이름(이탈 크게, 보는 중·미접속은 작은 칩). **실제 크롬에서 자동 열림 미확인** (앱 브라우저 창은 Document PiP 없음)
- 현황 창 디자인(사용자 요청): 출석 전광판처럼 학번 순 이름 칩만. 보는 중 = 초록, 그 외 전부 = 빨강. 이모지 없음(점은 CSS). 폰트 Pretendard(cdnjs) — 토스 프로덕트 산스는 공개 라이선스가 아니라 대신 씀. 창 340×210
- 아직 실제 수업(구글 로그인 + 학생 와이파이 휴대폰 여러 대)으로는 시험 안 함

## 하다 만 일 (우선순위 순)
1. **화면 공유가 학생 휴대폰(다른 망)에서 안 보임** — 사용자 보고. 같은 PC 안에서는 WebRTC 정상 → 학교망↔이동통신망 사이 P2P 연결 실패로 추정. 확인할 것:
   - 우회 전송(relay)이 실제로 오는지 — 특히 선생님 탭이 **뒤로 가 있을 때**(다른 프로그램 시연 중) `ImageCapture.grabFrame()`/video 캡처가 계속 되는지. 시험 중 사용자가 중단시킴.
   - 근본 해결: `iceServers`에 **TURN 서버** 추가 (Cloudflare Realtime TURN, metered.ca 등 — 계정 필요, 사용자와 상의)
   - 학생 화면에 "영상 연결 중 / 사진으로 보는 중" 상태 표시 추가
2. **전체 화면 공유 중 학생 현황을 볼 수 없음** — 다른 프로그램을 쓰면 오른쪽 목록이 안 보임. `📌 학생 목록 띄우기`(Document Picture-in-Picture)는 있으나 사용자가 모르는 듯. 공유 시작 후 크게 깜빡이는 "📌 현황 창 띄우기" 안내, 작은 창은 인원 수 + 이탈 학생 이름 위주로 크게. (PiP 창도 전체 화면 공유에 찍혀 학생에게 보임 — 사용자에게 알릴 것)
3. **전체 화면에서 '모두 지우기'를 누르면 전체 화면이 풀림** — `confirm()` 대화상자 때문. 확인 창 없이 지우고 되돌리기(Ctrl+Z)로 복구되게 바꾸거나, 화면 안 확인 상자로 교체. `toast()`도 전체 화면 요소(`document.fullscreenElement`) 안에 붙여야 보임.

## 이전 PC에서 만든 옛 버전 (참고만)
같은 폴더 상위에 PC 서버 버전(`server.py`, aiohttp + cloudflared)이 있었음. 학교 교사망이 `api.trycloudflare.com`을 막아서 GitHub Pages + Firebase로 바꿈. 더 이상 쓰지 않음.

## 새 PC 준비
```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install GitHub.cli
npm install -g firebase-tools @google/clasp
gh auth login --web          (GitHub 계정 geunzero1217)
firebase login               (Firebase 프로젝트 ssaem-class-5726 이 있는 구글 계정)
clasp login                  (Apps Script 쓸 때. script.google.com/home/usersettings 에서 API 켜기)
gh repo clone geunzero1217/class
```
