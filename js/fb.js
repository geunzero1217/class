// Firebase 공통: 초기화, 로그인, 수업·출석·자료 처리
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getDatabase, ref, get, set, update, remove, push, onValue, onChildAdded, onChildChanged, onChildRemoved,
  onDisconnect, serverTimestamp, query, orderByChild, equalTo, off,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig, iceServers, LATE_MINUTES, PERIODS } from './firebase-config.js';

export const CONFIGURED = !String(firebaseConfig.apiKey || '').includes('PASTE');
if (!CONFIGURED) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = `<div class="center-page"><div class="card login"><h1>설정이 필요해요</h1>
      <p>js/firebase-config.js 파일에 Firebase 설정(firebaseConfig)을 붙여 넣어 주세요.</p></div></div>`;
  });
  throw new Error('firebase-config.js 를 먼저 채워 주세요');
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const r = (p) => (p ? ref(db, p) : ref(db));   // r('') = 데이터베이스 맨 위 (여러 곳을 한꺼번에 바꿀 때)
export {
  get, set, update, remove, push, onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect,
  serverTimestamp, query, orderByChild, equalTo, off, signOut, signInAnonymously, iceServers, LATE_MINUTES, PERIODS,
};

let offset = 0;
onValue(r('.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
export const now = () => Date.now() + offset;   // 서버 시각 기준

export function waitAuth() {
  return new Promise((res) => { const u = onAuthStateChanged(auth, (user) => { u(); res(user); }); });
}
export const normName = (s) => String(s || '').replace(/\s+/g, '');
export const skey = (sid) => 's' + sid;          // 학번을 키로 쓸 때 앞에 s (숫자 키가 배열로 바뀌는 것 방지)

/* ───────── 선생님 로그인 ───────── */
export async function googleLogin() {
  const res = await signInWithPopup(auth, new GoogleAuthProvider());
  return res.user;
}
/** 선생님 계정인지 확인. 아직 선생님이 아무도 없으면 처음 로그인한 구글 계정이 선생님이 됨 */
export async function ensureTeacher(user) {
  if (!user || user.isAnonymous) return false;
  try { if ((await get(r('teachers/' + user.uid))).exists()) return true; } catch (_) { /* */ }
  try {
    await set(r('teachers/' + user.uid), { email: user.email || '', name: user.displayName || '', at: serverTimestamp() });
    return true;
  } catch (_) { return false; }
}

/* ───────── 수업 ───────── */
function randCode() { return String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); }
async function freeCode() {
  for (let i = 0; i < 20; i++) { const c = randCode(); if (!(await get(r('codes/' + c))).exists()) return c; }
  throw new Error('수업 코드를 만들지 못했어요. 다시 시도해 주세요.');
}
export async function classLessons(cid) {
  const v = (await get(query(r('lessons'), orderByChild('cid'), equalTo(cid)))).val() || {};
  return Object.entries(v).map(([id, l]) => ({ id, ...l }));
}
/** 수업 열기. 같은 날짜·교시가 있으면 다시 연다(출석 이어짐). 이 반의 다른 열린 수업은 닫는다. */
export async function openLesson(cid, className, date, period) {
  const list = await classLessons(cid);
  for (const l of list) if (l.status === 'open' && !(l.date === date && l.period === period)) await closeLesson(l.id);
  const ex = list.find((l) => l.date === date && l.period === period);
  const code = ex && ex.status === 'open' ? ex.code : await freeCode();
  if (ex) {
    await update(r(''), { [`lessons/${ex.id}/status`]: 'open', [`lessons/${ex.id}/code`]: code, [`lessons/${ex.id}/closedAt`]: null, [`codes/${code}`]: ex.id,
      current: { lid: ex.id, cid, className, period } });
    return ex.id;
  }
  const lid = push(r('lessons')).key;
  await update(r(''), {
    [`lessons/${lid}`]: { cid, className, date, period, code, status: 'open', openedAt: serverTimestamp(), lateMin: LATE_MINUTES },
    [`codes/${code}`]: lid,
    current: { lid, cid, className, period },
  });
  return lid;
}
/* 자리 모니터가 따라갈 '지금 수업' (가장 최근에 열었거나 수업 화면을 연 수업) */
export function setCurrent(lid, les) {
  return set(r('current'), { lid, cid: les.cid, className: les.className || '', period: les.period || null }).catch(() => {});
}
async function clearCurrentIf(lid, u) {
  try { if ((await get(r('current/lid'))).val() === lid) u.current = null; } catch (_) { /* */ }
}
/* 자리 모니터 주소 열쇠 (새로 만들면 예전 주소는 더 이상 안 열림) */
export async function newDisplayKey() {
  const a = new Uint8Array(12); crypto.getRandomValues(a);
  const k = [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
  await set(r('displayKey'), k);
  return k;
}
export async function closeLesson(lid) {
  const l = (await get(r('lessons/' + lid))).val();
  if (!l) return;
  const u = {
    [`lessons/${lid}/status`]: 'closed', [`lessons/${lid}/closedAt`]: serverTimestamp(),
    [`live/${lid}`]: null, [`ink/${lid}`]: null, [`pointer/${lid}`]: null, [`rtc/${lid}`]: null, [`relay/${lid}`]: null, [`presence/${lid}`]: null, [`displays/${lid}`]: null,
  };
  if (l.code) u[`codes/${l.code}`] = null;
  await clearCurrentIf(lid, u);
  await update(r(''), u);
}
export async function deleteLesson(lid) {
  const l = (await get(r('lessons/' + lid))).val();
  const u = { [`lessons/${lid}`]: null, [`members/${lid}`]: null, [`att/${lid}`]: null, [`live/${lid}`]: null, [`ink/${lid}`]: null,
    [`pointer/${lid}`]: null, [`rtc/${lid}`]: null, [`relay/${lid}`]: null, [`presence/${lid}`]: null, [`displays/${lid}`]: null };
  if (l && l.code && l.status === 'open') u[`codes/${l.code}`] = null;
  await clearCurrentIf(lid, u);
  await update(r(''), u);
}
export async function deleteClass(cid) {
  const lessons = await classLessons(cid);
  for (const l of lessons) await deleteLesson(l.id);
  const decks = (await get(r('decks/' + cid))).val() || {};
  const u = { [`classes/${cid}`]: null, [`rosters/${cid}`]: null, [`decks/${cid}`]: null };
  for (const did of Object.keys(decks)) u[`slides/${did}`] = null;
  await update(r(''), u);
}

/* ───────── 출석 계산 ───────── */
export const STATUS = { present: '출석', late: '지각', absent: '결석', early: '조퇴' };
/** 학생별 출석: 처음 접속(members.at)으로 출석/지각/결석 자동 판정, att 에 직접 바꾼 값·시청 시간·이탈 횟수 */
export function attRows(les, roster, members, att) {
  const first = {};
  for (const m of Object.values(members || {})) if (m && m.sid && (!first[m.sid] || m.at < first[m.sid])) first[m.sid] = m.at;
  const end = les.status === 'closed' && les.closedAt ? les.closedAt : now();
  return Object.values(roster || {}).sort((a, b) => String(a.sid).localeCompare(String(b.sid))).map((s) => {
    const a = (att || {})[skey(s.sid)] || {};
    const f = first[s.sid];
    const auto = !f ? 'absent' : (f - les.openedAt > (les.lateMin ?? LATE_MINUTES) * 60000 ? 'late' : 'present');
    const span = f ? Math.max(1, end - f) : 0;
    return { id: s.sid, name: s.name, first: f || null, auto, manual: a.manual || null, status: a.manual || auto,
      activeMs: a.activeMs || 0, ratio: f ? Math.min(1, (a.activeMs || 0) / span) : null, away: a.away || 0 };
  });
}

/* ───────── 자료 (PDF·이미지 → 슬라이드 이미지) ───────── */
const SLIDE_W = 1600, SLIDE_Q = 0.75;
function canvasToJpeg(c) { return c.toDataURL('image/jpeg', SLIDE_Q); }
async function pdfPages(file, onProgress) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error('PDF 프로그램(pdf.js)을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: SLIDE_W / v1.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ w: c.width, h: c.height, d: canvasToJpeg(c) });
    onProgress && onProgress(`변환 중 ${i}/${doc.numPages}`);
  }
  return out;
}
async function imagePage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const s = Math.min(1, SLIDE_W / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return { w: c.width, h: c.height, d: canvasToJpeg(c) };
  } finally { URL.revokeObjectURL(url); }
}
/** 파일 하나 → 자료(deck). 이미지는 여러 장 한꺼번에 골라도 하나의 자료로 묶음 */
export async function uploadDeck(cid, files, onProgress) {
  files = [...files];
  if (!files.length) throw new Error('파일이 없어요.');
  if (files.some((f) => /\.(pptx?|ppsx?|key|odp)$/i.test(f.name))) {
    throw new Error('PPT는 바로 올릴 수 없어요. PowerPoint에서 [파일 → 다른 이름으로 저장 → PDF]로 저장한 뒤 PDF를 올려 주세요.');
  }
  let pages = [];
  for (const f of files) {
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') pages = pages.concat(await pdfPages(f, onProgress));
    else if (f.type.startsWith('image/')) { pages.push(await imagePage(f)); onProgress && onProgress(`변환 중 ${pages.length}장`); }
    else throw new Error(`${f.name}: PDF나 이미지만 올릴 수 있어요.`);
  }
  if (!pages.length) throw new Error('슬라이드가 없어요.');
  const did = push(r('decks/' + cid)).key;
  for (let i = 0; i < pages.length; i++) {
    await set(r(`slides/${did}/p${i}`), pages[i].d);
    onProgress && onProgress(`올리는 중 ${i + 1}/${pages.length}`);
  }
  const name = files[0].name.replace(/\.[^.]+$/, '') + (files.length > 1 ? ` 외 ${files.length - 1}개` : '');
  const deck = { name, pages: pages.map((p) => ({ w: p.w, h: p.h })), created: serverTimestamp() };
  await set(r(`decks/${cid}/${did}`), deck);
  return { id: did, ...deck };
}
export async function deleteDeck(cid, did) {
  await update(r(''), { [`decks/${cid}/${did}`]: null, [`slides/${did}`]: null });
}

/** 슬라이드 이미지 캐시 (필요할 때 한 장씩 받아 옴) */
export class SlideCache {
  constructor(onLoad) { this.map = new Map(); this.onLoad = onLoad; }
  url(did, i) {
    const k = did + ':' + i;
    const v = this.map.get(k);
    if (typeof v === 'string') return v;
    if (!v) {
      this.map.set(k, get(r(`slides/${did}/p${i}`)).then((s) => {
        this.map.set(k, s.val() || ''); this.onLoad && this.onLoad(did, i);
      }).catch(() => this.map.delete(k)));
    }
    return null;
  }
  prefetch(did, i, n) { for (let j = Math.max(0, i - 1); j < i + n; j++) if (j >= 0) this.url(did, j); }
}
