
document.addEventListener('DOMContentLoaded', () => {
  // ─────────────────────────────────────────────────────────────
  // Elements
  // ─────────────────────────────────────────────────────────────
  const overlay   = document.getElementById('curtain-overlay');
  const cLeft     = document.getElementById('curtain-left');
  const cRight    = document.getElementById('curtain-right');
  const beginBtn  = document.getElementById('begin-button');

  const slides    = Array.from(document.querySelectorAll('.slide'));
  const prevBtn   = document.getElementById('prev');
  const nextBtn   = document.getElementById('next');
  const progress  = document.getElementById('progress');

  const turn       = document.getElementById('turn');
  const turnShadow = document.getElementById('turnShadow');

  const sheetFront = document.getElementById('sheetFront');
  const sheetBack  = document.getElementById('sheetBack');     // kept, always hidden
  const imgFront   = document.getElementById('turnFrontImg');
  const imgBack    = document.getElementById('turnBackImg');    // unused after fix

  const wall       = document.getElementById('textWall');
  const closeText  = document.getElementById('close-text');
  const openText   = document.getElementById('open-text');

  const volIcon   = document.getElementById('volume-icon');
  const music     = document.getElementById('bg-music');

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  const TOTAL = slides.length; // 4
  let started = false;

  let idx = 0;
  let flipping = false;

  // wall overlay behavior (index 2)
  let wallClosedByUser = false;

  // Volume (NO persistence allowed)
  let slider = null;

  // Audio pool
  const flipPool = Array.from({length: 10}, (_, i) => `gallery/sounds/flip${i+1}.mp3`);
  const glissSrc = 'gallery/sounds/glissando.mp3';

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function setDisabled(btn, disabled){
    btn.disabled = !!disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }

  function updateProgress(){
    progress.textContent = `Page ${idx + 1} of ${TOTAL}`;
  }

  function activeSlide(){
    return slides[idx];
  }

  function slideImageEl(slide){
    return slide ? slide.querySelector('img') : null;
  }

  function slideImageSrc(slide){
    const im = slideImageEl(slide);
    return im ? im.getAttribute('src') : '';
  }

  function setActiveIndex(newIdx){
    idx = clamp(newIdx, 0, TOTAL - 1);
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === idx);
      s.classList.remove('peek');
      s.classList.remove('ghost');
    });
    updateProgress();
    syncButtons();
    syncWallUI();
  }

  function syncButtons(){
    const atFirst = (idx === 0);
    const atLast  = (idx === TOTAL - 1);
    setDisabled(prevBtn, !started || flipping || atFirst);
    setDisabled(nextBtn, !started || flipping || atLast);
  }

  function isWallPage(){ return idx === 2; }

  function syncWallUI(){
    const onWall = isWallPage();
    closeText.style.display = onWall ? 'block' : 'none';

    if (!onWall){
      wall.style.display = 'none';
      openText.style.display = 'none';
      return;
    }

    if (!wallClosedByUser){
      wall.style.display = 'block';
      openText.style.display = 'none';
    } else {
      wall.style.display = 'none';
      openText.style.display = 'block';
    }
  }

  function playOneShot(src, volume01){
    try{
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = clamp(volume01, 0, 1);
      a.play().catch(()=>{});
    }catch(_){}
  }

  function playFlip(){
    const pick = flipPool[Math.floor(Math.random() * flipPool.length)];
    const vol = clamp(music.volume, 0, 1);
    playOneShot(pick, vol);
  }

  function ensureSlider(){
    if (slider) return slider;
    slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'volume-slider';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(loadVolume0to100()));
    slider.title = 'Volume';
    document.getElementById('volume-control').appendChild(slider);

    slider.addEventListener('input', () => {
      const v = clamp(parseInt(slider.value || '0', 10), 0, 100);
      setVolume0to100(v);
    });

    return slider;
  }

  // IMPORTANT: NO persistence. Always comes from injected INITIAL_VOLUME.
  function loadVolume0to100(){
    const v0 = (typeof INITIAL_VOLUME === 'number') ? INITIAL_VOLUME : 50;
    return clamp(Math.round(v0), 0, 100);
  }

  // IMPORTANT: NO persistence. Session-only changes.
  function setVolume0to100(v){
    const vv = clamp(Math.round(v), 0, 100);
    const vol01 = vv / 100;

    music.volume = vol01;
    music.muted = (vv === 0);

    volIcon.src = (vv === 0) ? 'gallery/controls/voloff.png' : 'gallery/controls/volon.png';
    if (slider) slider.value = String(vv);
  }

  function rectForActiveImage(){
    const s = activeSlide();
    const im = slideImageEl(s);
    if (!im) return null;
    const r = im.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return null;
    return r;
  }

  function placeTurnToRect(r){
    turn.style.left = `${r.left}px`;
    turn.style.top = `${r.top}px`;
    turn.style.width = `${r.width}px`;
    turn.style.height = `${r.height}px`;

    turnShadow.style.left = `${r.left}px`;
    turnShadow.style.top = `${r.top}px`;
    turnShadow.style.width = `${r.width}px`;
    turnShadow.style.height = `${r.height}px`;
  }

  function easeInOutCubic(t){
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
  }

  function setTurnVisible(on){
    turn.style.opacity = on ? '1' : '0';
    turnShadow.style.opacity = on ? '1' : '0';
  }

  function setTurnRotationDeg(deg){
    turn.style.transformOrigin = '0% 50%';
    turn.style.transform = `rotateY(${deg}deg)`;

    const a = Math.abs(deg);
    const t = clamp(a / 180, 0, 1);
    const edge = Math.pow(Math.sin(t * Math.PI), 1.2);
    const glint = Math.pow(Math.sin(t * Math.PI), 2.0);

    sheetFront.style.setProperty('--edgeA',  String(0.28 * edge));
    sheetFront.style.setProperty('--glintA', String(0.22 * glint));

    const dir = (deg < 0) ? 1 : -1;
    const sx = (dir > 0) ? 26 : 16;
    const sd = 0.14 + 0.22 * edge;
    const sb = 10 + 10 * edge;
    turnShadow.style.setProperty('--sx', `${sx}%`);
    turnShadow.style.setProperty('--sd', `${sd}`);
    turnShadow.style.setProperty('--sb', `${sb}px`);
  }

  function cleanupTransient(curSlide, tgtSlide){
    if (curSlide) curSlide.classList.remove('ghost');
    if (tgtSlide) tgtSlide.classList.remove('peek');
  }

  function flipTo(targetIdx){
    if (!started) return;
    if (flipping) return;

    const tIdx = clamp(targetIdx, 0, TOTAL - 1);
    if (tIdx === idx) return;

    const r = rectForActiveImage();
    if (!r){
      setActiveIndex(tIdx);
      return;
    }

    flipping = true;
    syncButtons();

    const goingNext = (tIdx > idx);

    const curSlide = slides[idx];
    const tgtSlide = slides[tIdx];

    const curSrc = slideImageSrc(curSlide);
    const tgtSrc = slideImageSrc(tgtSlide);

    placeTurnToRect(r);

    sheetBack.classList.add('hidden');
    sheetBack.classList.remove('visible');
    imgBack.src = '';

    sheetFront.classList.remove('hidden');
    sheetFront.classList.add('visible');

    if (goingNext){
      tgtSlide.classList.add('peek');
      curSlide.classList.add('ghost');
      imgFront.src = curSrc;
      setTurnVisible(true);
      setTurnRotationDeg(0);
    } else {
      imgFront.src = tgtSrc;
      setTurnVisible(true);
      setTurnRotationDeg(-180);
    }

    playFlip();

    const DURATION = 620;
    const t0 = performance.now();

    function step(now){
      const elapsed = now - t0;
      const raw = clamp(elapsed / DURATION, 0, 1);
      const e = easeInOutCubic(raw);

      const deg = goingNext
        ? (0 + (-180 - 0) * e)
        : (-180 + (0 - (-180)) * e);

      setTurnRotationDeg(deg);

      if (raw < 1){
        requestAnimationFrame(step);
        return;
      }

      cleanupTransient(curSlide, tgtSlide);
      setActiveIndex(tIdx);

      setTurnVisible(false);
      turn.style.width = '0px';
      turn.style.height = '0px';
      turnShadow.style.width = '0px';
      turnShadow.style.height = '0px';

      flipping = false;
      syncButtons();
    }

    requestAnimationFrame(step);
  }

  window.addEventListener('resize', () => {
    if (!flipping) return;
    const r = rectForActiveImage();
    if (r) placeTurnToRect(r);
  });

  function openCurtain(){
    if (started) return;
    started = true;
    syncButtons();

    // --- Gliss: play and THEN start music when it actually ends ---
    let musicStarted = false;

    function startMusicAfterGliss(){
      if (musicStarted) return;
      musicStarted = true;

      // ALWAYS initialize from injected INITIAL_VOLUME
      const v = loadVolume0to100();
      setVolume0to100(v);

      try{
        music.currentTime = 0;
        music.volume = 0;
        music.muted = (v === 0);
        music.play().catch(()=>{});
      }catch(_){}

      const target = clamp(v / 100, 0, 1);
      const fadeMs = 900;
      const start = performance.now();

      function fadeStep(now){
        const t = clamp((now - start) / fadeMs, 0, 1);
        const e = easeInOutCubic(t);
        music.volume = target * e;
        if (t < 1) requestAnimationFrame(fadeStep);
      }
      requestAnimationFrame(fadeStep);
    }

    try{
      const g = new Audio(glissSrc);
      g.preload = 'auto';
      g.volume = 0.10;

      g.addEventListener('ended', startMusicAfterGliss, { once: true });
      g.addEventListener('error', startMusicAfterGliss, { once: true });

      g.play().catch(() => {
        startMusicAfterGliss();
      });

      setTimeout(startMusicAfterGliss, 2500);
    } catch(_){
      startMusicAfterGliss();
    }

    // Curtains move
    cLeft.style.animation = 'curtainLeftOut 1100ms cubic-bezier(.2,.9,.1,1) forwards';
    cRight.style.animation = 'curtainRightOut 1100ms cubic-bezier(.2,.9,.1,1) forwards';
    overlay.style.animation = 'curtainOverlayFadeOut 1100ms cubic-bezier(.2,.9,.1,1) forwards';

    beginBtn.disabled = true;
    beginBtn.style.opacity = '0';
    beginBtn.style.pointerEvents = 'none';

    setTimeout(() => {
      overlay.style.pointerEvents = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      setTimeout(() => overlay.remove(), 250);
      syncButtons();
    }, 1250);
  }

  beginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openCurtain();
  });

  prevBtn.addEventListener('click', () => flipTo(idx - 1));
  nextBtn.addEventListener('click', () => flipTo(idx + 1));

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (flipping) return;

    if (e.key === 'ArrowLeft'){
      e.preventDefault();
      flipTo(idx - 1);
    } else if (e.key === 'ArrowRight'){
      e.preventDefault();
      flipTo(idx + 1);
    } else if (e.key === 'Escape'){
      if (isWallPage() && wall.style.display !== 'none'){
        wall.style.display = 'none';
        openText.style.display = 'block';
        wallClosedByUser = true;
      }
    }
  });

  closeText.addEventListener('click', () => {
    if (!isWallPage()) return;
    wall.style.display = 'none';
    openText.style.display = 'block';
    wallClosedByUser = true;
  });

  openText.addEventListener('click', () => {
    if (!isWallPage()) return;
    wall.style.display = 'block';
    openText.style.display = 'none';
    wallClosedByUser = false;
  });

  volIcon.addEventListener('click', () => {
    const s = ensureSlider();
    s.style.display = (s.style.display === 'none' || !s.style.display) ? 'block' : 'none';
  });

  ensureSlider().style.display = 'none';

  // Initialize immediately (still session-only)
  setVolume0to100(loadVolume0to100());

  setActiveIndex(0);
  syncButtons();
  syncWallUI();
  setTurnVisible(false);
});
