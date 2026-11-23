// 선생님 화면 받기 — 학생 화면(student.html)과 자리 모니터(view.html)가 같이 씀
// 화면 상태(live) + 슬라이드 + 필기 + 레이저 + 화면 공유(WebRTC 영상, 안 되면 다시 시도 / 선생님이 켜 두면 사진)
import {
  r, set, remove, onValue, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, serverTimestamp, iceServers, SlideCache,
} from './fb.js';

/**
 * lid 수업의 선생님 화면을 stage 에 보여 줌.
 * onStatus({ sharing, relay, relayGot, videoReady, rtcFail }) — 화면 공유 받는 상태가 바뀔 때마다
 * 반환: { stop() }  (다른 수업으로 바꿀 때)
 */
export function mountViewer({ lid, cid, uid, stage, onStatus = () => {} }) {
  let stopped = false;
  let st = { mode: 'wait' }, deck = null, deckId = null, key = null;
  let videoReady = false, relay = false, relayGot = false, rtcFail = false;
  const slides = new SlideCache(() => render());

  function render() {
    if (stopped) return;
    let slide = null;
    if (st.mode === 'slides' && st.deckId && deck) {
      slide = slides.url(st.deckId, st.page || 0);
      for (let j = (st.page || 0) + 1; j < Math.min(deck.pages.length, (st.page || 0) + 3); j++) slides.url(st.deckId, j);
    }
    renderView(stage, st, deck, false, { videoReady, relay, slide });
    const sharing = st.mode === 'screen' && !!st.sharing;
    if (sharing && relay && !relayGot) stage.show('msg', '선생님 화면 사진을 받는 중…<br><span class="small">영상 연결이 안 돼서 사진으로 보여 드려요</span>');
    else if (sharing && !relay && !videoReady && rtcFail) stage.show('msg', '선생님 화면에 연결하지 못했어요<br><b>학교 와이파이</b>에 연결했는지 확인해 주세요<br><span class="small">자동으로 계속 다시 시도하고 있어요</span>');
    onStatus({ sharing, relay, relayGot, videoReady, rtcFail });
  }

  /* 슬라이드 자료 */
  let deckUnsub = null;
  function watchDeck() {
    if (st.deckId === deckId) return;
    deckId = st.deckId; deck = null;
    if (deckUnsub) deckUnsub();
    deckUnsub = deckId ? onValue(r(`decks/${cid}/${deckId}`), (s) => { deck = s.val(); render(); }) : null;
  }
  /* 필기 */
  let inkUnsubs = [];
  function watchInk() {
    const k = stateKey(st);
    if (k === key) return;
    key = k; inkUnsubs.forEach((u) => u()); inkUnsubs = []; stage.ink.clear(); stage.showLaser(null);
    if (!k) return;
    const ref = r(`ink/${lid}/${k}`);
    inkUnsubs.push(onChildAdded(ref, (s) => stage.ink.upsert(s.key, strokeFromDb(s.val()))));
    inkUnsubs.push(onChildChanged(ref, (s) => stage.ink.upsert(s.key, strokeFromDb(s.val()))));
    inkUnsubs.push(onChildRemoved(ref, (s) => stage.ink.remove(s.key)));
  }

  /* 화면 공유 받기: WebRTC(영상) → 10초 안에 안 되면 안내를 띄우고 8초 뒤 다시 시도 (계속 반복)
     선생님이 '사진 보내기'를 켜 두었으면 그동안 사진(우회 전송)으로 보여 줌 */
  const rtcRef = r(`rtc/${lid}/${uid}`);
  let tryAt = 0, pc = null, shareId = null, rtcTimer = null, offerUnsub = null, tcUnsub = null, frameUnsub = null, attempt = 0, discTimer = null;
  function closePc() {
    if (pc) { pc.close(); pc = null; }
    if (offerUnsub) { offerUnsub(); offerUnsub = null; }
    if (tcUnsub) { tcUnsub(); tcUnsub = null; }
    videoReady = false; stage.video.srcObject = null;
  }
  function setRelay(on) {
    if (on === relay) return;
    relay = on; relayGot = false;
    const wantRef = r(`relay/${lid}/want/${uid}`);
    if (on) {
      set(wantRef, true).catch(() => {}); onDisconnect(wantRef).remove();
      frameUnsub = onValue(r(`relay/${lid}/frame`), (s) => {
        const f = s.val(); if (!f || !f.d) return;
        stage.relayImg.src = f.d;
        if (!relayGot) { relayGot = true; render(); }
      });
    } else {
      remove(wantRef).catch(() => {});
      if (frameUnsub) { frameUnsub(); frameUnsub = null; }
      stage.relayImg.removeAttribute('src');
    }
    render();
  }
  function syncShare() {
    const want = st.mode === 'screen' && st.sharing;
    if (!want) { clearTimeout(rtcTimer); closePc(); setRelay(false); rtcFail = false; if (shareId) remove(rtcRef).catch(() => {}); shareId = null; return; }
    if (st.shareId !== shareId) { shareId = st.shareId; attempt = 0; rtcFail = false; closePc(); setRelay(false); requestRtc(); }
    else setRelay(rtcFail && !!st.relay);   // 선생님이 '사진 보내기'를 켜거나 끈 경우
  }
  // 데이터(LTE)·핫스팟처럼 느린 망은 연결에 10초 넘게 걸릴 수 있음 → 아직 연결 시도 중이면 최대 30초까지 기다림
  function onRtcFail(myShare, myN, force) {
    if (stopped || shareId !== myShare || attempt !== myN) return;
    if (pc && pc.connectionState === 'connected') return;
    if (!force && pc && (pc.connectionState === 'connecting' || pc.connectionState === 'new') && Date.now() - tryAt < 30000) {
      clearTimeout(rtcTimer); rtcTimer = setTimeout(() => onRtcFail(myShare, myN), 4000); return;
    }
    rtcFail = true; videoReady = false;
    setRelay(!!st.relay); render();
    clearTimeout(rtcTimer);
    rtcTimer = setTimeout(() => { if (!stopped && shareId === myShare && attempt === myN) requestRtc(); }, 8000);
  }
  async function requestRtc() {
    const myShare = shareId, myN = ++attempt; tryAt = Date.now();
    closePc(); render();
    await remove(rtcRef).catch(() => {});
    if (stopped || shareId !== myShare || attempt !== myN) return;
    await set(rtcRef, { req: shareId, n: myN, t: serverTimestamp() }).catch(() => {});
    onDisconnect(rtcRef).remove();
    clearTimeout(rtcTimer);
    rtcTimer = setTimeout(() => onRtcFail(myShare, myN), 10000);
    offerUnsub = onValue(r(`rtc/${lid}/${uid}/offer`), async (s) => {
      const o = s.val();
      if (stopped || !o || o.shareId !== myShare || (o.n || 0) !== myN || pc) return;
      const my = pc = new RTCPeerConnection({ iceServers });
      my.ontrack = (e) => { stage.video.srcObject = e.streams[0] || new MediaStream([e.track]); stage.video.play().catch(() => {}); if (my.connectionState === 'connected') { videoReady = true; render(); } };
      my.onicecandidate = (e) => { if (e.candidate) set(r(`rtc/${lid}/${uid}/sc/${Date.now()}${Math.random().toString(36).slice(2, 6)}`), e.candidate.toJSON()).catch(() => {}); };
      my.onconnectionstatechange = () => {
        if (pc !== my) return;
        const cs = my.connectionState;
        clearTimeout(discTimer);
        if (cs === 'connected') { clearTimeout(rtcTimer); rtcFail = false; videoReady = !!stage.video.srcObject; setRelay(false); render(); }
        else if (cs === 'failed') onRtcFail(myShare, myN, true);
        else if (cs === 'disconnected') discTimer = setTimeout(() => { if (pc === my && my.connectionState !== 'connected') onRtcFail(myShare, myN, true); }, 15000);
      };
      await my.setRemoteDescription({ type: o.type, sdp: o.sdp });
      const ans = await my.createAnswer();
      await my.setLocalDescription(ans);
      await set(r(`rtc/${lid}/${uid}/answer`), { type: ans.type, sdp: ans.sdp, shareId: myShare, n: myN });
      const seen = new Set();
      tcUnsub = onValue(r(`rtc/${lid}/${uid}/tc`), (cs) => {
        cs.forEach((c) => { if (!seen.has(c.key)) { seen.add(c.key); my.addIceCandidate(c.val()).catch(() => {}); } });
      });
    });
  }

  const unsubs = [
    onValue(r(`live/${lid}`), (s) => { st = s.val() || { mode: 'wait' }; watchDeck(); watchInk(); syncShare(); render(); }),
    onValue(r(`pointer/${lid}`), (s) => { const p = s.val(); stage.showLaser(p && p.k === key ? p : null); }),
  ];
  render();

  return {
    /** 그만 보기 (연결·구독을 모두 정리) */
    stop() {
      if (stopped) return;
      setRelay(false);
      stopped = true;
      unsubs.forEach((u) => u()); inkUnsubs.forEach((u) => u()); if (deckUnsub) deckUnsub();
      clearTimeout(rtcTimer); clearTimeout(discTimer); closePc();
      if (shareId) remove(rtcRef).catch(() => {});
      stage.ink.clear(); stage.showLaser(null);
    },
  };
}
