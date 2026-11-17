/* 공통: 무대(Stage), 필기(Ink), 작은 도우미들 */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; }
  // 전체 화면 중에는 전체 화면 요소 안에 있어야 보임
  const host = document.fullscreenElement || document.body;
  if (t.parentNode !== host) host.appendChild(t);
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
/* 이 사이트의 기본 주소 (GitHub Pages 의 /저장소이름/ 까지) */
const SITE_BASE = new URL('./', location.href).href.replace(/\/$/, '');

/* 무대: 비율 고정 상자 + 내용 레이어 + 필기 캔버스 + 레이저 */
const WEB_W = 1280, WEB_H = 720;
class Stage {
  constructor(wrap) {
    this.wrap = wrap;
    wrap.classList.add('stage-wrap');
    wrap.innerHTML = `
      <div class="stage">
        <div class="layer c-wait"><div class="wait-msg"><div class="big">⏸</div><div class="txt">수업 화면을 준비 중입니다</div></div></div>
        <img class="layer c-slide" alt="" draggable="false">
        <div class="layer c-web"><iframe referrerpolicy="no-referrer" allow="fullscreen; autoplay; clipboard-read; clipboard-write"></iframe></div>
        <video class="layer c-video" autoplay playsinline muted></video>
        <img class="layer c-relay" alt="" draggable="false">
        <div class="layer c-board"></div>
        <div class="layer c-msg"><div class="wait-msg"><div class="txt"></div></div></div>
        <canvas class="ink ink-base"></canvas>
        <canvas class="ink ink-live"></canvas>
        <div class="laser" hidden></div>
      </div>`;
    this.el = $('.stage', wrap);
    this.slide = $('.c-slide', wrap); this.iframe = $('iframe', wrap);
    this.video = $('.c-video', wrap); this.relayImg = $('.c-relay', wrap);
    this.msg = $('.c-msg', wrap); this.laser = $('.laser', wrap);
    this.ink = new Ink($('.ink-base', wrap), $('.ink-live', wrap));
    this.aspect = 16 / 9; this.layer = 'wait';
    new ResizeObserver(() => this.fit()).observe(wrap);
    this.show('wait');
  }
  setAspect(a) { if (a && isFinite(a) && Math.abs(a - this.aspect) > 0.001) { this.aspect = a; this.fit(); } }
  fit() {
    const W = this.wrap.clientWidth, H = this.wrap.clientHeight;
    if (!W || !H) return;
    let w = W, h = W / this.aspect;
    if (h > H) { h = H; w = H * this.aspect; }
    w = Math.floor(w); h = Math.floor(h);
    Object.assign(this.el.style, { width: w + 'px', height: h + 'px' });
    const s = Math.min(w / WEB_W, h / WEB_H);
    Object.assign(this.iframe.style, { width: WEB_W + 'px', height: WEB_H + 'px', transform: `scale(${s})` });
    this.ink.resize(w, h);
  }
  show(layer, text) {
    this.layer = layer;
    const map = { wait: 'c-wait', slide: 'c-slide', web: 'c-web', video: 'c-video', relay: 'c-relay', board: 'c-board', msg: 'c-msg' };
    for (const [k, cls] of Object.entries(map)) $('.' + cls, this.wrap).style.display = k === layer ? '' : 'none';
    if (layer === 'msg') $('.txt', this.msg).innerHTML = text || '';
  }
  setSlide(url) { if (this.slide.getAttribute('src') !== url) this.slide.src = url; }
  setUrl(url) { if (this.iframe.getAttribute('src') !== (url || 'about:blank')) this.iframe.src = url || 'about:blank'; }
  showLaser(p) {
    if (!p) { this.laser.hidden = true; return; }
    this.laser.hidden = false;
    this.laser.style.left = (p.x * 100) + '%'; this.laser.style.top = (p.y * 100) + '%';
  }
}

/* 필기: 좌표는 0~1 비율, 굵기는 무대 폭의 1/1000 단위
   저장 모양: { t: 'pen'|'hl', c: 색, s: 굵기, p: "x,y;x,y..." (0~10000 정수), done: true } */
const encPts = (pts) => pts.map(([x, y]) => Math.round(x * 10000) + ',' + Math.round(y * 10000)).join(';');
const decPts = (s) => (s ? s.split(';').map((q) => { const [x, y] = q.split(','); return [x / 10000, y / 10000]; }) : []);
class Ink {
  constructor(base, live) {
    this.base = base; this.live = live;
    this.bctx = base.getContext('2d'); this.lctx = live.getContext('2d');
    this.strokes = new Map(); this.w = 1; this.h = 1;
    this.dpr = window.devicePixelRatio || 1;
  }
  resize(w, h) {
    this.w = w; this.h = h; this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.base, this.live]) { c.width = Math.round(w * this.dpr); c.height = Math.round(h * this.dpr); }
    this.renderAll();
  }
  clear() { this.strokes.clear(); this.renderAll(); }
  /* 획 추가·갱신. done 이 아니면 위쪽(live) 캔버스에만 그려서 빠르게 */
  upsert(id, s) {
    const prev = this.strokes.get(id);
    this.strokes.set(id, s);
    if (s.done && (!prev || !prev.done)) this.renderAll();
    else if (!s.done) this.renderLive();
    else this.renderAll();
  }
  remove(id) { if (this.strokes.delete(id)) this.renderAll(); }
  renderAll() {
    const c = this.bctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
    for (const s of this.strokes.values()) if (s.done) this.draw(c, s);
    this.renderLive();
  }
  renderLive() {
    const c = this.lctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
    for (const s of this.strokes.values()) if (!s.done) this.draw(c, s);
  }
  draw(c, s) {
    const p = s.pts; if (!p || !p.length) return;
    const W = this.w, H = this.h;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = s.c || '#e11d48'; c.fillStyle = c.strokeStyle;
    const hl = s.t === 'hl';
    c.globalAlpha = hl ? 0.35 : 1;
    c.lineWidth = Math.max(1, (s.s || 4) * W / 1000 * (hl ? 4 : 1));
    if (p.length === 1) {
      c.beginPath(); c.arc(p[0][0] * W, p[0][1] * H, c.lineWidth / 2, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.moveTo(p[0][0] * W, p[0][1] * H);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
        c.quadraticCurveTo(p[i][0] * W, p[i][1] * H, mx * W, my * H);
      }
      const l = p[p.length - 1]; c.lineTo(l[0] * W, l[1] * H); c.stroke();
    }
    c.restore();
  }
  /* 지우개: (x,y) 근처를 지나가는 획 id 목록 */
  hit(x, y, r) {
    const W = this.w, H = this.h, px = x * W, py = y * H, out = [];
    for (const [id, s] of this.strokes) {
      const lw = (s.s || 4) * W / 1000 * (s.t === 'hl' ? 4 : 1) / 2 + r;
      const p = s.pts || [];
      for (let i = 0; i < p.length; i++) {
        const ax = p[i][0] * W, ay = p[i][1] * H;
        const b = p[i + 1] || p[i], bx = b[0] * W, by = b[1] * H;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx - px, qy = ay + t * dy - py;
        if (qx * qx + qy * qy <= lw * lw) { out.push(id); break; }
      }
    }
    return out;
  }
}
/* 저장된 획 → 그리기용 */
const strokeFromDb = (v) => ({ t: v.t, c: v.c, s: v.s, done: !!v.done, pts: decPts(v.p) });

/* 상태 → 필기 저장 단위(쪽) 키 (Firebase 키로 쓸 수 있는 글자만) */
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function stateKey(st) {
  if (!st) return null;
  if (st.mode === 'slides' && st.deckId) return `d_${st.deckId}_${st.page || 0}`;
  if (st.mode === 'board') return `b_${st.board || 0}`;
  if (st.mode === 'web' && st.url) return 'w_' + hashStr(st.url);
  if (st.mode === 'screen') return 'screen';
  return null;
}

/* 상태에 맞게 무대 표시 (교사/학생 공통). deck = {pages:[{w,h}]}, extra.slide = 이미지 주소(아직이면 null) */
function renderView(stage, st, deck, isTeacher, extra = {}) {
  const m = st.mode;
  if (m !== 'web') stage.setUrl('');
  if (m === 'slides') {
    const p = deck && deck.pages && deck.pages[st.page || 0];
    if (p) {
      stage.setAspect(p.w / p.h);
      if (extra.slide) { stage.setSlide(extra.slide); stage.show('slide'); } else stage.show('msg', '슬라이드를 불러오는 중…');
    } else { stage.setAspect(16 / 9); stage.show('msg', isTeacher ? '📄 위의 <b>[자료 올리기]</b>로 PDF·이미지를 올리거나<br>목록에서 자료를 고르세요' : '수업 자료를 준비 중입니다'); }
  } else if (m === 'web') {
    stage.setAspect(16 / 9);
    if (st.url) { stage.setUrl(st.url); stage.show('web'); }
    else stage.show('msg', isTeacher ? '🌐 위에 웹페이지 주소를 입력하세요' : '웹페이지를 준비 중입니다');
  } else if (m === 'screen') {
    stage.setAspect(st.aspect || 16 / 9);
    if (!st.sharing) stage.show('msg', isTeacher ? '🖥 위의 <b>[화면 공유 시작]</b>을 누르세요<br><span class="small">공유할 창이나 탭을 고르면 학생에게 바로 보여요</span>' : '선생님 화면 공유를 기다리는 중입니다');
    else if (extra.relay) stage.show('relay');
    else if (isTeacher || extra.videoReady) stage.show('video');
    else stage.show('msg', '화면에 연결하는 중…');
  } else if (m === 'board') { stage.setAspect(16 / 9); stage.show('board'); }
  else { stage.setAspect(16 / 9); stage.show('wait'); }
}

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + '초';
  if (s < 3600) return Math.floor(s / 60) + '분';
  return Math.floor(s / 3600) + '시간';
}
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (d) => { const t = new Date(d + 'T00:00:00'); return `${d.slice(5).replace('-', '/')}(${DOW[t.getDay()]})`; };
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '');
const fmtDur = (ms) => { const m = Math.round((ms || 0) / 60000); return m < 60 ? m + '분' : Math.floor(m / 60) + '시간 ' + (m % 60) + '분'; };
const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
