import { audio } from './audio.js';
import { Camera } from './camera.js';
import { Level } from './level.js';

(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const addBtn = document.getElementById('addBtn');
  const colorPicker = document.getElementById('colorPicker');
  const actionButtons = [...document.querySelectorAll('#toolbar [data-action], #dock [data-action]')];
  const powerBtn = actionButtons.find(b => b.dataset.action === 'power');
  const statusEl = document.getElementById('readoutText');
  const powerGlyph = document.getElementById('powerGlyph');
  const revokeBtn = document.getElementById('revokeBtn');
  const muteBtn = document.getElementById('muteBtn');
  const autonChk = document.getElementById('autonChk');
  const sceneSelect = document.getElementById('sceneSelect');
  const cinematicBtn = document.getElementById('cinematicBtn');
  const toolbar = document.getElementById('toolbar');
  const dock = document.getElementById('dock');
  const styleSelect = document.getElementById('styleSelect');
  let statusFlash = { text: '', until: 0 };
  function flashStatus(text, ms = 1800) {
    statusFlash = { text, until: performance.now() + ms };
  }

  let W = 0, H = 0, DPR = 1;
  const camera = new Camera();
  const level = new Level();
  let cinematicOn = true;
  try {
    if (localStorage.getItem('stickman.cinematic') === '0') cinematicOn = false;
  } catch (err) {}
  const cine = {
    introT: 0, introA: null, introB: null,
    koT: 0, koFig: null,
    blastT: 0, blastCaster: null, blastTarget: null
  };
  const CINE_INTRO = 1.0;
  const CINE_KO = 1.2;
  const CINE_BLAST = 1.1;
  const figures = [];
  let selected = null;
  let drag = null;
  let marquee = null;
  let fightPick = null;
  let lastPointer = null;
  const bg = '#f7f6f2';

  const STYLES = {
    brawler: 'Brawler',
    wingchun: 'Wing Chun',
    muaythai: 'Muay Thai'
  };
  let lastStyle = 'brawler';
  try {
    const savedStyle = localStorage.getItem('stickman.style');
    if (savedStyle && STYLES[savedStyle]) lastStyle = savedStyle;
  } catch (err) {}

  const STRIKES = {
    chainpunch: {
      total: 0.62, lungeEnd: 0.16, lungeSpeed: 110, range: 92,
      hits: [
        { at: 0.10, kbx: 45, kdChance: 0, freeze: 0.03, shake: 3, starScale: 0.7 },
        { at: 0.24, kbx: 55, kdChance: 0, freeze: 0.03, shake: 3, starScale: 0.72 },
        { at: 0.38, kbx: 120, kdChance: 0.12, freeze: 0.05, shake: 6, starScale: 1.05 }
      ],
      cd: 0.35, cdJitter: 0.15
    },
    lowkick: {
      total: 0.42, lungeEnd: 0.12, lungeSpeed: 70, range: 100,
      hits: [{ at: 0.18, kbx: 140, kdChance: 0.12, freeze: 0.05, shake: 6, starScale: 1.05 }],
      cd: 0.40, cdJitter: 0.15
    },
    teep: {
      total: 0.55, lungeEnd: 0.16, lungeSpeed: 80, range: 140,
      hits: [{ at: 0.22, kbx: 320, kdChance: 0.10, freeze: 0.06, shake: 8, starScale: 1.15 }],
      cd: 0.55, cdJitter: 0.15
    },
    roundhouse: {
      total: 0.62, lungeEnd: 0.20, lungeSpeed: 95, range: 120,
      hits: [{ at: 0.28, kbx: 240, kdChance: 0.35, freeze: 0.07, shake: 9, starScale: 1.25 }],
      cd: 0.60, cdJitter: 0.15
    },
    knee: {
      total: 0.40, lungeEnd: 0.12, lungeSpeed: 60, range: 72,
      hits: [{ at: 0.14, kbx: 160, kdChance: 0.12, freeze: 0.06, shake: 7, starScale: 1.0 }],
      cd: 0.40, cdJitter: 0.15
    },
    elbow: {
      total: 0.36, lungeEnd: 0.10, lungeSpeed: 55, range: 78,
      hits: [{ at: 0.13, kbx: 180, kdChance: 0.18, freeze: 0.06, shake: 7, starScale: 1.0 }],
      cd: 0.40, cdJitter: 0.15
    }
  };

  function startStrike(f, move) {
    const m = STRIKES[move];
    if (!m) return;
    f.combat.state = 'strike';
    f.combat.move = move;
    f.combat.t = m.total;
    f.combat.hitIndex = 0;
    f.combat.hitDone = false;
    f.combat.spin = 0;
  }

  const CHAT_OPEN = 2.4;
  const CHAT_REPLY = 2.4;
  const CHAT_GAP = 0.25;
  const CHAT_SCRIPT = [
    ['Nice day for standing around.', 'Beats falling down stairs.'],
    ["You ever wonder why we're all sticks?", 'Nope. Just happy to be drawn.'],
    ['Paper or wood?', 'Paper. Fewer splinters.'],
    ['Did you see that blast?', 'Felt it from here.'],
    ['Why is the camera always watching?', "Because we're the show."],
    ['I think the user is looking at us.', 'Wave. Look busy.'],
    ['I could go for a walk.', 'You walked here.'],
    ['Ever tried the stairs?', 'Once. My legs are still complaining.'],
    ['That was a nice kick.', "Thanks. I've been practicing on the air."],
    ['Do you ever win?', 'I prefer to think of it as dramatic losing.'],
    ["What's your style?", 'Mostly improvised.'],
    ["I'm bored.", "Try standing very still. It's free."],
    ['Is it always this quiet?', 'Until someone presses F.'],
    ['Nice guard.', "Thanks. It's mostly hope."],
    ['If I fall, do I make a sound?', 'Yes. A loud one.'],
    ['The floor is looking sturdy today.', "Don't jinx it."],
    ["Do you think we're in a game?", "I think we're in a drawing."],
    ["What's the plan?", 'Stand here until something happens.'],
    ['You blinked.', "I don't have eyelids."]
  ];
  const STYLE_CHAT = {
    wingchun: [
      ['Keep the centerline.', 'Always.'],
      ['Chain punches, not feelings.', 'Too late.'],
      ['Stay relaxed.', "I'm trying."]
    ],
    muaythai: [
      ['Elbows up.', 'Knees ready.'],
      ['The teep is underrated.', 'So is breathing.'],
      ["No clinch. We're sticks.", 'Fair.']
    ],
    brawler: [
      ['No style. Just vibes.', 'Vibes are a style.'],
      ['I just swing.', 'It shows.'],
      ['Keep it simple.', 'Simple is hard.']
    ]
  };
  let chat = null;
  let chatCd = 8 + Math.random() * 7;

  const SCENES = {
    paper: { label: 'Paper', src: null, veil: 0 },
    lake: { label: 'Lake', src: '/backgrounds/lake.jpg', veil: 0.32 },
    factory: { label: 'Factory', src: '/backgrounds/factory.jpg', veil: 0.34 },
    bridge: { label: 'Bridge', src: '/backgrounds/bridge.jpg', veil: 0.32 },
    highway: { label: 'Highway', src: '/backgrounds/highway.jpg', veil: 0.34 },
    island: { label: 'Floating Island', src: '/backgrounds/island.jpg', veil: 0.30 }
  };
  let sceneId = 'paper';
  try {
    const savedScene = localStorage.getItem('stickman.scene');
    if (savedScene && SCENES[savedScene]) sceneId = savedScene;
  } catch (err) {}
  let sceneDirty = true;
  let celestialStamp = Math.floor(Date.now() / 60000);
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d');
  const birds = [];
  let birdTimer = 8 + Math.random() * 7;
  const sceneImages = {};
  for (const [id, sc] of Object.entries(SCENES)) {
    if (!sc.src) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { sc.ready = true; sceneDirty = true; };
    img.src = sc.src;
    sceneImages[id] = img;
  }

  function setScene(id) {
    if (!SCENES[id]) return;
    sceneId = id;
    sceneDirty = true;
    if (sceneSelect) sceneSelect.value = id;
    document.body.dataset.scene = id;
    try { localStorage.setItem('stickman.scene', id); } catch (err) {}
  }

  function drawGround(c, photo) {
    const gy = level.groundY;
    c.save();
    if (photo) {
      c.strokeStyle = 'rgba(247, 246, 242, 0.62)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-10, gy);
      c.lineTo(W + 10, gy);
      c.stroke();
      c.strokeStyle = 'rgba(27, 26, 23, 0.30)';
      c.lineWidth = 1.2;
    } else {
      c.strokeStyle = '#d8d3c7';
      c.lineWidth = 1.5;
    }
    c.beginPath();
    c.moveTo(-10, gy);
    c.lineTo(W + 10, gy);
    c.stroke();
    c.restore();
  }

  function utcStamp() {
    return Math.floor(Date.now() / 60000);
  }

  function celestialTheta() {
    const now = new Date();
    const h = now.getUTCHours() + now.getUTCMinutes() / 60;
    return (h / 24) * Math.PI * 2 - Math.PI / 2;
  }

  function drawSun(c, x, y, r, alpha) {
    c.save();
    c.globalAlpha = alpha;
    const halo = c.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4);
    halo.addColorStop(0, 'rgba(242, 201, 76, 0.32)');
    halo.addColorStop(0.55, 'rgba(242, 201, 76, 0.12)');
    halo.addColorStop(1, 'rgba(242, 201, 76, 0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, r * 2.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f2c94c';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(168, 111, 0, 0.30)';
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  }

  function drawMoon(c, x, y, r, alpha) {
    c.save();
    c.globalAlpha = alpha;
    const halo = c.createRadialGradient(x, y, r * 0.6, x, y, r * 2.1);
    halo.addColorStop(0, 'rgba(244, 241, 232, 0.30)');
    halo.addColorStop(1, 'rgba(244, 241, 232, 0)');
    c.fillStyle = halo;
    c.beginPath();
    c.arc(x, y, r * 2.1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f4f1e8';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(27, 26, 23, 0.24)';
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = 'rgba(27, 26, 23, 0.10)';
    c.beginPath();
    c.arc(x - r * 0.28, y - r * 0.2, r * 0.18, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x + r * 0.22, y + r * 0.12, r * 0.13, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x - r * 0.05, y + r * 0.38, r * 0.10, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawCelestial(c, alpha) {
    const theta = celestialTheta();
    const r = clamp(Math.min(W, H) * 0.026, 14, 30);
    const sunA = smoothstep(0, 0.1, Math.sin(theta)) * alpha;
    const moonA = smoothstep(0, 0.1, Math.sin(theta + Math.PI)) * alpha;
    if (sunA > 0.01) {
      const x = W / 2 - Math.cos(theta) * W * 0.42;
      const y = H * 0.5 - Math.sin(theta) * H * 0.30;
      drawSun(c, x, y, r, sunA);
    }
    if (moonA > 0.01) {
      const mt = theta + Math.PI;
      const x = W / 2 - Math.cos(mt) * W * 0.42;
      const y = H * 0.5 - Math.sin(mt) * H * 0.30;
      drawMoon(c, x, y, r, moonA);
    }
  }

  function spawnBirdFlock() {
    const count = reduceMotion ? 2 : 2 + Math.floor(Math.random() * 4);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const baseY = H * (0.12 + Math.random() * 0.18);
    const speed = (20 + Math.random() * 20) * dir;
    for (let i = 0; i < count; i++) {
      birds.push({
        x: dir > 0 ? -24 - i * 18 - Math.random() * 36 : W + 24 + i * 18 + Math.random() * 36,
        baseY: baseY + (Math.random() - 0.5) * 34,
        y: baseY,
        vx: speed * (0.9 + Math.random() * 0.2),
        size: 4 + Math.random() * 4,
        flap: 4.5 + Math.random() * 4,
        wobble: 2 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        t: 0
      });
    }
  }

  function updateBirds(dt) {
    birdTimer -= dt;
    if (birdTimer <= 0) {
      spawnBirdFlock();
      const night = Math.sin(celestialTheta()) < -0.05;
      birdTimer = night ? 40 + Math.random() * 30 : 25 + Math.random() * 20;
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y = b.baseY + Math.sin(b.t * 0.9 + b.phase) * b.wobble;
      if (b.x < -80 || b.x > W + 80) birds.splice(i, 1);
    }
  }

  function drawBirds(c) {
    c.save();
    c.strokeStyle = 'rgba(27, 26, 23, 0.55)';
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    for (const b of birds) {
      const flap = reduceMotion ? 0.25 : Math.sin(b.t * b.flap + b.phase);
      const wy = b.size * (0.35 + flap * 0.45);
      c.beginPath();
      c.moveTo(b.x - b.size, b.y - wy);
      c.quadraticCurveTo(b.x - b.size * 0.42, b.y - wy * 0.2, b.x, b.y);
      c.quadraticCurveTo(b.x + b.size * 0.42, b.y - wy * 0.2, b.x + b.size, b.y - wy);
      c.stroke();
    }
    c.restore();
  }

  function renderScene() {
    sceneCanvas.width = Math.max(1, Math.floor(W * DPR));
    sceneCanvas.height = Math.max(1, Math.floor(H * DPR));
    sceneCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sc = SCENES[sceneId];
    const img = sceneImages[sceneId];
    if (sc && img && sc.ready) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(W / iw, H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      sceneCtx.save();
      sceneCtx.filter = 'saturate(0.78) contrast(0.96)';
      sceneCtx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      sceneCtx.restore();
      drawCelestial(sceneCtx, 0.5);
      sceneCtx.globalAlpha = sc.veil;
      sceneCtx.fillStyle = bg;
      sceneCtx.fillRect(0, 0, W, H);
      sceneCtx.globalAlpha = 1;
      level.draw(sceneCtx);
      drawGround(sceneCtx, true);
    } else {
      sceneCtx.fillStyle = bg;
      sceneCtx.fillRect(0, 0, W, H);
      drawCelestial(sceneCtx, 1);
      level.draw(sceneCtx);
      drawGround(sceneCtx, false);
    }
    sceneDirty = false;
  }

  const effects = [];
  const splats = [];
  let shakeAmt = 0;
  let freezeT = 0;
  let slowmoT = 0;
  let slowmoDur = 1;
  let slowmoScale = 1;
  let inkFlash = 0;
  let flashTint = '#f7f6f2';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function requestHitStop(sec) {
    freezeT = Math.max(freezeT, sec);
  }

  function requestSlowmo(scale = 0.35, dur = 0.45) {
    if (reduceMotion) return;
    slowmoScale = scale;
    slowmoDur = dur;
    slowmoT = dur;
  }

  function requestFlash(amt = 0.3, tint = '#f7f6f2') {
    if (reduceMotion) amt = Math.min(amt, 0.08);
    inkFlash = Math.max(inkFlash, amt);
    flashTint = tint;
  }

  function clearSplats() {
    splats.length = 0;
  }

  function syncToolbarHeight() {
    if (!toolbar) return;
    document.documentElement.style.setProperty('--toolbar-h', toolbar.offsetHeight + 'px');
  }

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    camera.resize(W, H);
    level.resize(W, H);
    sceneDirty = true;
    splats.length = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const f of figures) {
      const sy = level.surfaceAt(f.x, f.y + 8);
      if (f.y > sy) f.y = sy;
    }
    syncToolbarHeight();
  }
  window.addEventListener('resize', resize);
  if (toolbar && typeof ResizeObserver === 'function') {
    new ResizeObserver(syncToolbarHeight).observe(toolbar);
  }
  resize();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function syncCinematicUI() {
    document.body.dataset.cinematic = cinematicOn ? 'on' : 'off';
    if (dock) dock.inert = !selected;
    if (cinematicBtn) {
      cinematicBtn.setAttribute('aria-pressed', String(cinematicOn));
      cinematicBtn.title = cinematicOn
        ? 'Disable cinematic camera and letterbox (C)'
        : 'Enable cinematic camera and letterbox (C)';
    }
  }

  function setCinematic(on) {
    cinematicOn = !!on;
    try { localStorage.setItem('stickman.cinematic', cinematicOn ? '1' : '0'); } catch (err) {}
    if (!cinematicOn) {
      cine.introT = 0;
      cine.koT = 0;
      cine.blastT = 0;
      camera.setTarget(W / 2, H / 2, 1, 0);
    }
    syncCinematicUI();
  }

  function cineStartDuel(a, b) {
    if (!cinematicOn || reduceMotion) return;
    cine.introT = CINE_INTRO;
    cine.introA = a;
    cine.introB = b;
    cine.koT = 0;
    cine.koFig = null;
    cine.blastT = 0;
    cine.blastTarget = null;
  }

  function cineKO(f) {
    if (!cinematicOn || reduceMotion) return;
    cine.koT = CINE_KO;
    cine.koFig = f;
  }

  function cineBlast(caster, target) {
    if (!cinematicOn || reduceMotion) return;
    cine.blastT = CINE_BLAST;
    cine.blastCaster = caster;
    cine.blastTarget = target;
    cine.introT = 0;
    cine.koT = 0;
  }

  function cinematicGroupTarget(list, maxZoom = 1.06, pad = 520, tilt = 0, y = H * 0.53) {
    if (!list.length) return { x: W / 2, y: H / 2, zoom: 1, rotation: 0 };
    let minX = Infinity, maxX = -Infinity;
    for (const f of list) {
      if (f.x < minX) minX = f.x;
      if (f.x > maxX) maxX = f.x;
    }
    const mid = (minX + maxX) / 2;
    const span = maxX - minX + pad;
    const zoom = clamp(W / Math.max(1, span), 1, maxZoom);
    const rotation = tilt
      ? clamp(((mid - W / 2) / Math.max(1, W)) * tilt, -0.018, 0.018)
      : 0;
    return { x: mid, y, zoom, rotation };
  }

  function updateCinematic(dt) {
    if (drag || marquee) {
      camera.snap = false;
      camera.setTarget(camera.x, camera.y, camera.zoom, camera.rotation);
      return;
    }
    if (!cinematicOn || reduceMotion) {
      camera.snap = reduceMotion;
      camera.follow = 7;
      camera.setTarget(W / 2, H / 2, 1, 0);
      return;
    }
    camera.snap = false;
    if (cine.introT > 0) cine.introT = Math.max(0, cine.introT - dt);
    if (cine.koT > 0) cine.koT = Math.max(0, cine.koT - dt);
    if (cine.blastT > 0) cine.blastT = Math.max(0, cine.blastT - dt);

    if (cine.blastT > 0 && cine.blastTarget) {
      const target = cine.blastTarget;
      const p = clamp(1 - cine.blastT / CINE_BLAST, 0, 1);
      const zoom = 1.18 + 0.045 * Math.sin(Math.PI * p);
      const casterX = cine.blastCaster ? cine.blastCaster.x : target.x;
      const x = lerp(casterX, target.x, 0.72);
      const rotation = clamp(((x - W / 2) / Math.max(1, W)) * 0.06, -0.02, 0.02);
      camera.follow = 8;
      camera.setTarget(x, H * 0.56, zoom, rotation);
      return;
    }

    if (cine.koT > 0 && cine.koFig) {
      const f = cine.koFig;
      const p = clamp(1 - cine.koT / CINE_KO, 0, 1);
      const zoom = 1.18 + 0.05 * Math.sin(Math.PI * p);
      const rotation = clamp(((f.x - W / 2) / Math.max(1, W)) * 0.06, -0.02, 0.02);
      camera.follow = 8;
      camera.setTarget(f.x, H * 0.56, zoom, rotation);
      return;
    }

    if (cine.introT > 0 && cine.introA && cine.introB &&
        cine.introA.fighting && cine.introB.fighting) {
      const p = clamp(1 - cine.introT / CINE_INTRO, 0, 1);
      const t = cinematicGroupTarget([cine.introA, cine.introB], 1.2, 300, 0.05, H * 0.56);
      t.zoom = Math.min(t.zoom, lerp(1.2, 1.15, smoothstep(0.2, 1, p)));
      camera.follow = 6.5;
      camera.setTarget(t.x, t.y, t.zoom, t.rotation);
      return;
    }
    cine.introT = 0;

    if (fightPick) {
      const list = [fightPick, ...fightTargetsFor(fightPick)];
      const t = cinematicGroupTarget(list, 1.08, 520, 0, H * 0.55);
      camera.follow = 5;
      camera.setTarget(t.x, t.y, t.zoom, t.rotation);
      return;
    }

    const chaser = figures.find(f => f.pursuit && f.pursuit.target);
    if (chaser) {
      const t = cinematicGroupTarget([chaser, chaser.pursuit.target], 1.12, 420, 0, H * 0.55);
      camera.follow = 6;
      camera.setTarget(t.x, t.y, t.zoom, t.rotation);
      return;
    }

    const fighters = figures.filter(f => f.fighting && !f.dragging);
    if (fighters.length) {
      const t = cinematicGroupTarget(fighters, 1.16, 420, 0.05, H * 0.55);
      camera.follow = 6.5;
      camera.setTarget(t.x, t.y, t.zoom, t.rotation);
      return;
    }

    const focus = selectionList();
    const list = focus.length ? focus : figures;
    const t = cinematicGroupTarget(list, 1.06, 520, 0);
    camera.follow = 4.5;
    camera.setTarget(t.x, t.y, t.zoom, t.rotation);
  }

  const newSpring = () => ({ x: 0, y: 0, vx: 0, vy: 0 });
  function stepSpring(s, tx, ty, stiffness, damping, dt, max) {
    s.vx += ((tx - s.x) * stiffness - s.vx * damping) * dt;
    s.vy += ((ty - s.y) * stiffness - s.vy * damping) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.x > max) { s.x = max; if (s.vx > 0) s.vx *= 0.2; }
    else if (s.x < -max) { s.x = -max; if (s.vx < 0) s.vx *= 0.2; }
    if (s.y > max) { s.y = max; if (s.vy > 0) s.vy *= 0.2; }
    else if (s.y < -max) { s.y = -max; if (s.vy < 0) s.vy *= 0.2; }
  }

  const lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const lerpChain = (a, b, t) => a.map((p, i) => lerpPt(p, b[i], t));
  const panFor = x => {
    const sx = camera.worldToScreen(x, 0).x;
    return clamp(((sx / Math.max(1, W)) * 2 - 1) * 0.7, -0.7, 0.7);
  };
  function blendPose(a, b, t) {
    return {
      head: lerpPt(a.head, b.head, t),
      neck: lerpPt(a.neck, b.neck, t),
      chest: lerpPt(a.chest, b.chest, t),
      hip: lerpPt(a.hip, b.hip, t),
      armL: lerpChain(a.armL, b.armL, t),
      armR: lerpChain(a.armR, b.armR, t),
      legL: lerpChain(a.legL, b.legL, t),
      legR: lerpChain(a.legR, b.legR, t),
      handL: lerpPt(a.handL, b.handL, t),
      handR: lerpPt(a.handR, b.handR, t),
      toeL: lerpPt(a.toeL, b.toeL, t),
      toeR: lerpPt(a.toeR, b.toeR, t),
      headR: a.headR + (b.headR - a.headR) * t,
      s: a.s + (b.s - a.s) * t,
      f: b.f
    };
  }

  function rot(px, py, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: px * c - py * s, y: px * s + py * c };
  }

  function makeSprite(size, paint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    return c;
  }

  const dustSprites = Array.from({ length: 4 }, () => makeSprite(64, (g, s) => {
    const cx = s / 2, cy = s / 2;
    const grad = g.createRadialGradient(cx, cy, 1, cx, cy, s * 0.5);
    grad.addColorStop(0, 'rgba(146, 154, 164, 0.5)');
    grad.addColorStop(0.55, 'rgba(146, 154, 164, 0.24)');
    grad.addColorStop(1, 'rgba(146, 154, 164, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * s * 0.24;
      g.globalAlpha = 0.1 + Math.random() * 0.14;
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, s * (0.07 + Math.random() * 0.1), 0, Math.PI * 2);
      g.fill();
    }
  }));

  const inkSprites = Array.from({ length: 5 }, () => makeSprite(96, (g, s) => {
    g.translate(s / 2, s / 2);
    g.fillStyle = '#1b1a17';
    const blobs = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * s * 0.18;
      g.globalAlpha = 0.72 + Math.random() * 0.28;
      g.beginPath();
      g.ellipse(
        Math.cos(a) * d, Math.sin(a) * d,
        4 + Math.random() * 10, 3 + Math.random() * 8,
        Math.random() * Math.PI, 0, Math.PI * 2
      );
      g.fill();
    }
    g.globalAlpha = 0.8;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = s * (0.22 + Math.random() * 0.2);
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 1 + Math.random() * 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }));

  function spawnStar(x, y, scale = 1) {
    effects.push({ type: 'star', x, y, t: 0, life: 0.18, scale });
  }

  function spawnDust(x, y, n = 5) {
    for (let i = 0; i < n; i++) {
      effects.push({
        type: 'dust',
        x: x + (Math.random() - 0.5) * 22,
        y: y - Math.random() * 4,
        vx: (Math.random() - 0.5) * 50,
        vy: -20 - Math.random() * 45,
        t: 0, life: 0.3 + Math.random() * 0.25,
        r: 2 + Math.random() * 3.5,
        spr: Math.floor(Math.random() * dustSprites.length),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 2.2
      });
    }
  }

  function spawnSkid(x, y, dir) {
    for (let i = 0; i < 4; i++) {
      effects.push({
        type: 'dust',
        x: x - dir * (6 + Math.random() * 14),
        y: y - Math.random() * 3,
        vx: -dir * (40 + Math.random() * 70),
        vy: -12 - Math.random() * 30,
        t: 0, life: 0.22 + Math.random() * 0.18,
        r: 2 + Math.random() * 2.5,
        spr: Math.floor(Math.random() * dustSprites.length),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 2.2
      });
    }
  }

  function spawnStepDust(x, y, run, dir) {
    if (reduceMotion) return;
    const n = run ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const back = 4 + Math.random() * (run ? 14 : 8);
      effects.push({
        type: 'dust',
        x: x - dir * back,
        y: y - Math.random() * 2,
        vx: -dir * (18 + Math.random() * (run ? 42 : 24)),
        vy: -6 - Math.random() * (run ? 22 : 12),
        t: 0, life: 0.18 + Math.random() * 0.14,
        r: (run ? 1.7 : 1.4) + Math.random() * 1.3,
        spr: Math.floor(Math.random() * dustSprites.length),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 2
      });
    }
  }

  function spawnInk(x, y, n = 4) {
    if (reduceMotion) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 38;
      effects.push({
        type: 'ink',
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.8,
        vx: (Math.random() - 0.5) * 30,
        vy: 8 + Math.random() * 34,
        r: 2 + Math.random() * 6,
        drip: Math.random() < 0.35 ? 6 + Math.random() * 14 : 0,
        spr: Math.floor(Math.random() * inkSprites.length),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 1.6,
        t: 0, life: 0.28 + Math.random() * 0.2
      });
    }
  }

  function spawnRing(x, y, scale = 1) {
    effects.push({ type: 'ring', x, y, t: 0, life: 0.45, scale });
  }

  function spawnBurst(x, y, scale = 1) {
    effects.push({
      type: 'burst', x, y, t: 0, life: 0.16, scale,
      rot: Math.random() * Math.PI * 2
    });
  }

  function spawnWord(x, y, text, scale = 1, color = '#1b1a17') {
    const wx = clamp(x, 70 * scale, W - 70 * scale);
    const wy = clamp(y, 70, H - 50);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.type === 'word' && Math.abs(e.x - wx) < 230 * scale && Math.abs(e.y - wy) < 90) {
        effects.splice(i, 1);
      }
    }
    effects.push({
      type: 'word', x: wx, y: wy, text, t: 0, life: 0.62,
      scale, color, rot: (Math.random() - 0.5) * 0.16, vy: -26
    });
  }

  function spawnSplat(x, y, scale = 1) {
    const blobs = [];
    const drips = [];
    const specks = [];
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 18 * scale;
      blobs.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d * 0.28,
        rx: (7 + Math.random() * 13) * scale,
        ry: (2 + Math.random() * 3.4) * scale,
        rot: (Math.random() - 0.5) * 0.9
      });
    }
    for (let i = 0; i < 7; i++) {
      specks.push({
        x: (Math.random() - 0.5) * 76 * scale,
        y: (Math.random() - 0.5) * 9 * scale,
        r: (0.8 + Math.random() * 1.8) * scale
      });
    }
    const nd = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nd; i++) {
      drips.push({
        x: (Math.random() - 0.5) * 34 * scale,
        y: (2 + Math.random() * 4) * scale,
        r: (1 + Math.random() * 1.8) * scale,
        len: (4 + Math.random() * 9) * scale
      });
    }
    splats.push({
      x, y, scale, rot: (Math.random() - 0.5) * 0.22,
      blobs, drips, specks, t: 0, life: 24
    });
    if (splats.length > (reduceMotion ? 28 : 64)) splats.shift();
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.t += dt;
      if (e.t >= e.life) { effects.splice(i, 1); continue; }
      if (e.type === 'dust') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += 90 * dt;
      } else if (e.type === 'ink') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.vy += 30 * dt;
      } else if (e.type === 'word') {
        e.y += e.vy * dt;
        e.vy *= Math.pow(0.2, dt);
      }
    }
  }

  function updateSplats(dt) {
    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i];
      s.t += dt;
      if (s.t >= s.life) splats.splice(i, 1);
    }
  }

  function drawSplats() {
    for (const s of splats) {
      const fade = clamp((s.life - s.t) / 3.5, 0, 1);
      if (fade <= 0) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = '#1b1a17';
      ctx.globalAlpha = 0.38 * fade;
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.rx, b.ry, b.rot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.4 * fade;
      for (const p of s.specks) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.45 * fade;
      for (const d of s.drips) {
        ctx.beginPath();
        ctx.ellipse(d.x, d.y + d.len * 0.5, d.r, d.len * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawEffects() {
    for (const e of effects) {
      const k = e.t / e.life;
      if (e.type === 'star') {
        const r = (6 + 14 * easeOut(k)) * e.scale;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = k < 0.4 ? '#fff' : '#ffd54f';
        ctx.lineWidth = 2.5 * e.scale;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + k * 0.6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.stroke();
        }
        ctx.strokeStyle = '#ff8f00';
        ctx.lineWidth = 1.5 * e.scale;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
          ctx.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
          ctx.stroke();
        }
        ctx.restore();
      } else if (e.type === 'dust') {
        const spr = dustSprites[e.spr] || dustSprites[0];
        const size = e.r * 3.4 * (1 + k * 1.15);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot + e.vr * e.t);
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
        ctx.restore();
      } else if (e.type === 'ink') {
        const spr = inkSprites[e.spr] || inkSprites[0];
        const size = e.r * 3.6 * (1 + k * 0.3);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot + e.vr * e.t);
        ctx.globalAlpha = 0.82 * (1 - k);
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
        ctx.restore();
        if (e.drip) {
          ctx.save();
          ctx.globalAlpha = 0.6 * (1 - k);
          ctx.fillStyle = '#1b1a17';
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + e.r + e.drip * k * 0.6, Math.max(1, e.r * 0.3), e.drip * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (e.type === 'burst') {
        const r = (16 + 68 * easeOut(k)) * e.scale;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot + k * 0.18);
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        const points = 10;
        for (let i = 0; i < points * 2; i++) {
          const a = (i / (points * 2)) * Math.PI * 2;
          const rr = i % 2 ? r * 0.34 : r;
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = '#fffdf6';
        ctx.fill();
        ctx.strokeStyle = '#1b1a17';
        ctx.lineWidth = 2.2 * e.scale;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
          const a = (i / (points * 2)) * Math.PI * 2 + 0.08;
          const rr = i % 2 ? r * 0.24 : r * 0.62;
          if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = '#ffd54f';
        ctx.fill();
        ctx.restore();
      } else if (e.type === 'word') {
        const pop = Math.min(1, e.t / 0.09);
        const fade = e.t > e.life - 0.18 ? Math.max(0, (e.life - e.t) / 0.18) : 1;
        const sc = e.scale * (0.72 + 0.28 * easeOut(pop));
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot + (1 - pop) * 0.1);
        ctx.scale(sc, sc);
        ctx.font = '900 italic 44px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = fade * 0.35;
        ctx.fillStyle = '#a86f00';
        ctx.fillText(e.text, 3, 4);
        ctx.globalAlpha = fade;
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#f7f6f2';
        ctx.strokeText(e.text, 0, 0);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text, 0, 0);
        ctx.restore();
      } else if (e.type === 'ring') {
        const sc = e.scale || 1;
        const r = (12 + 130 * easeOut(k)) * sc;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.globalAlpha = 0.85 * (1 - k);
        ctx.strokeStyle = k < 0.35 ? '#ffffff' : '#ffc107';
        ctx.lineWidth = (5 * (1 - k) + 1) * sc;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.strokeStyle = '#ff8f00';
        ctx.lineWidth = 2 * sc;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function startDuel(a, b) {
    cancelChatFor(a);
    cancelChatFor(b);
    cancelPursuitsFor(a);
    cancelPursuitsFor(b);
    cancelFightPick();
    const floor = level.floorAt(a.x, a.y);
    a.combatFloor = floor;
    b.combatFloor = floor;
    const floorY = floor === 1 ? level.mezzY : level.groundY;
    a.y = floorY;
    b.y = floorY;
    a.vy = 0;
    b.vy = 0;
    a.startFight(b);
    b.startFight(a);
    a.trail.length = 0; b.trail.length = 0;
    cineStartDuel(a, b);
    audio.duel(panFor((a.x + b.x) / 2));
  }

  function endDuel(f) {
    const other = f.foe;
    f.foe = null;
    f.stopFight();
    if (other && other.foe === f) {
      other.foe = null;
      other.stopFight();
    }
    if (!figures.some(o => o.fighting)) {
      cine.introT = 0;
      cine.koT = 0;
      cine.blastT = 0;
    }
  }

  function blastFigure(caster, target, cd = 4) {
    cancelChatFor(caster);
    cancelChatFor(target);
    cancelPursuitsFor(caster);
    cancelPursuitsFor(target);
    cancelFightPick();
    const dir = target.x !== caster.x ? Math.sign(target.x - caster.x) : caster.facing;
    caster.powerCd = cd;
    caster.pushAnim = 0.45;
    caster.x = clamp(caster.x - dir * 8, 50, W - 50);
    spawnRing(caster.x + dir * 26, caster.y - 55);
    spawnBurst(caster.x + dir * 30, caster.y - 55, 1.7);
    spawnWord(caster.x + dir * 46, caster.y - 108, 'BOOM', 1.2, '#a86f00');
    requestSlowmo(0.42, 0.35);
    requestFlash(0.12, '#ffe082');
    audio.blast(panFor(caster.x));
    shakeAmt = Math.max(shakeAmt, 6);
    requestHitStop(0.04);
    target.resetCombat();
    target.blown = { vx: dir * 1250, vy: -260, phase: 'fly', t: 0 };
    target.vy = 0;
    target.bodyScale = 1;
    if (target.foe && target.foe.fighting && target.foe.foe === target) {
      const partner = target.foe;
      partner.combat.state = 'ready';
      partner.combat.t = 0;
      partner.combat.cd = Math.max(partner.combat.cd, 0.6);
      partner.combat.hitDone = false;
      partner.combat.spin = 0;
      partner.trail.length = 0;
    }
    cineBlast(caster, target);
    flashStatus('Blast!', 1000);
  }

  class StickFigure {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.style = lastStyle;
      this.behavior = 'idle';
      this.phase = Math.random() * Math.PI * 2;
      this.vy = 0;
      this.facing = Math.random() < 0.5 ? -1 : 1;
      this.dragging = false;
      this.selected = false;
      this.primary = false;
      this.think = 1 + Math.random() * 2.5;
      this.speedMul = 0.9 + Math.random() * 0.35;
      this.jumpMul = 0.92 + Math.random() * 0.2;
      this.jumpPrep = 0.24 + Math.random() * 0.12;
      this.jumpRest = 0.45 + Math.random() * 0.25;
      this.bodyScale = 1;
      this.jumpT = 0;
      this.jumpPhase = 'crouch';
      this.headR = 13;
      this.eyeR = 4.5;
      this.fighting = false;
      this.foe = null;
      this.combatFloor = null;
      this.pursuit = null;
      this.pursuedBy = null;
      this.fightTarget = false;
      this.chatting = false;
      this.chatPartner = null;
      this.chatCd = 0;
      this.bubble = null;
      this.trail = [];
      this.combat = {
        state: 'idle', t: 0, cd: 0.4 + Math.random() * 0.6,
        hitDone: false, kbx: 0, spin: 0, hits: 0, snap: false, react: null, landed: false,
        move: null, hitIndex: 0
      };
      this.hasPower = false;
      this.powerCd = 0;
      this.pushAnim = 0;
      this.blown = null;
      this.blinkTimer = 1.5 + Math.random() * 2;
      this.blinkT = 0;
      this.blendT = 1;
      this.blendDur = 0.14;
      this.prevPose = null;
      this._lastPose = null;
      this._poseKey = '';
      this._stepPhase = Math.floor(this.phase / Math.PI);
      this._lastCombatState = 'idle';
      this.velX = 0;
      this.velY = 0;
      this.accX = 0;
      this.accY = 0;
      this.landT = 0;
      this._sec = {
        upper: newSpring(),
        head: newSpring(),
        armL: newSpring(),
        armR: newSpring()
      };
    }

    isEnemy(o) {
      return o !== this && o.color.toLowerCase() !== this.color.toLowerCase();
    }

    resetCombat() {
      this.combat = {
        state: 'ready', t: 0, cd: 0.4 + Math.random() * 0.6,
        hitDone: false, kbx: 0, spin: 0, hits: 0, snap: false, react: null, landed: false,
        move: null, hitIndex: 0
      };
    }

    startFight(foe) {
      this.fighting = true;
      this.foe = foe || null;
      this.behavior = 'idle';
      this.phase = 0;
      this.vy = 0;
      this.bodyScale = 1;
      this.jumpT = 0;
      this.restT = 0;
      this.jumpPhase = 'crouch';
      this._lastCombatState = 'idle';
      this.resetCombat();
    }

    stopFight() {
      this.fighting = false;
      this.foe = null;
      this.combatFloor = null;
      this.trail.length = 0;
      this.combat = {
        state: 'idle', t: 0, cd: 0, hitDone: false, kbx: 0, spin: 0, hits: 0,
        snap: false, react: null, landed: false, move: null, hitIndex: 0
      };
    }

    setBehavior(b) {
      if (this.behavior === b) return;
      this.behavior = b;
      this.phase = 0;
      this._stepPhase = 0;
      if (b === 'jump') {
        this.jumpT = 0;
        this.restT = 0;
      }
    }

    randomizeBehavior(dt, groundY) {
      if (this.dragging) return;
      if (this.pursuit || this.pursuedBy) return;
      if (this.fighting) return;
      if (this.chatting) return;
      if (this.blown) return;
      if (!autonChk.checked) return;
      if (this.y < groundY - 2) return;
      this.think -= dt;
      if (this.think > 0) return;
      this.think = 1.5 + Math.random() * 3;
      const r = Math.random();
      if (r < 0.12) this.setBehavior('idle');
      else if (r < 0.42) this.setBehavior('walk');
      else if (r < 0.68) this.setBehavior('run');
      else if (r < 0.85) this.setBehavior('crawl');
      else this.setBehavior('jump');
      if (this.behavior !== 'idle' && Math.random() < 0.5) {
        this.facing = Math.random() < 0.5 ? -1 : 1;
      }
    }

    update(dt, level) {
      if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
      const px = this.x;
      const py = this.y;
      this._update(dt, level);
      this._tickBlend(dt);
      this._trackMotion(dt, px, py);
      this._tickSecondary(dt);
    }

    _surfaceY(level) {
      if (this.fighting && this.combatFloor !== null && !this.blown) {
        return this.combatFloor === 1 ? level.mezzY : level.groundY;
      }
      return level.surfaceAt(this.x, this.y);
    }

    _waitForChallenger(dt, level) {
      const sy = pursuitSurfaceY(level, this.x, this.y);
      if (this.y < sy) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        if (this.y >= sy) {
          this.y = sy;
          this.vy = 0;
        }
      } else {
        this.y = sy;
        this.vy = 0;
      }
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      this.behavior = 'idle';
      this.facing = this.pursuedBy.x < this.x ? -1 : 1;
      this.phase += dt * 1.6;
    }

    _chatIdle(dt, level) {
      const sy = this._surfaceY(level);
      if (this.y < sy) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        if (this.y >= sy) {
          this.y = sy;
          this.vy = 0;
        }
      } else {
        this.y = sy;
        this.vy = 0;
      }
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      this.behavior = 'idle';
      this.vy = 0;
      if (this.chatPartner) this.facing = this.chatPartner.x < this.x ? -1 : 1;
      this.phase += dt * 1.6;
    }

    updatePursuit(dt, level) {
      const p = this.pursuit;
      if (!p) return;
      const target = p.target;
      if (!target || target.pursuedBy !== this || target.blown || target.dragging || target.fighting) {
        cancelPursuit(this);
        return;
      }
      p.t += dt;
      if (p.t > Math.max(10, W / 200)) {
        cancelPursuit(this);
        flashStatus("Can't reach", 1600);
        return;
      }
      const myFloor = pursuitFloor(level, this.x, this.y);
      const targetFloor = pursuitFloor(level, target.x, target.y);
      if (targetFloor < 0) {
        cancelPursuit(this);
        flashStatus('Target on stairs', 1400);
        return;
      }
      if (p.drop) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        const gy = level.surfaceAt(this.x, this.y + 8);
        if (this.y >= gy) {
          this.y = gy;
          this.vy = 0;
          p.drop = false;
          this.landT = 0.4;
          spawnDust(this.x, this.y, reduceMotion ? 3 : 6);
          audio.land(panFor(this.x), false);
        }
        this.behavior = 'run';
        this.phase += dt * 6;
        return;
      }
      if (myFloor >= 0 && myFloor === targetFloor && Math.abs(target.x - this.x) <= 90) {
        startDuel(this, target);
        return;
      }
      let goalX;
      if (myFloor === 1 && targetFloor === 0 && target.x >= level.mezzX0) {
        goalX = level.mezzX1 + 24;
      } else if (myFloor < 0) {
        goalX = targetFloor === 1 ? level.stairX1 + 4 : level.stairX0 - 4;
      } else if (myFloor !== targetFloor) {
        goalX = myFloor === 0 ? level.stairX0 + 4 : level.stairX1 - 4;
      } else {
        goalX = target.x;
      }
      const dir = Math.sign(goalX - this.x) || this.facing;
      this.facing = dir;
      this.behavior = 'run';
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      this.x += dir * 200 * this.speedMul * dt;
      this.x = clamp(this.x, 50, W - 50);
      if (myFloor === 1 && targetFloor === 0 && target.x >= level.mezzX0 &&
          (this.x >= level.mezzX1 || this.x >= W - 50 - 0.5)) {
        this.x = Math.max(this.x, level.mezzX1 + 2);
        p.drop = true;
        this.vy = 0;
        this.y = level.mezzY;
        return;
      }
      this.y = pursuitSurfaceY(level, this.x, this.y);
      this.vy = 0;
      this.phase += dt * 200 * 0.085 * this.speedMul;
      const stride = Math.PI * 2;
      const stepIdx = Math.floor(this.phase / stride);
      if (stepIdx !== this._stepPhase) {
        this._stepPhase = stepIdx;
        audio.step(panFor(this.x), true);
        spawnStepDust(this.x, this.y, true, this.facing);
      }
    }

    _trackMotion(dt, px, py) {
      if (dt <= 0) return;
      if (this.dragging) {
        this.velX = 0;
        this.velY = 0;
        this.accX = 0;
        this.accY = 0;
        return;
      }
      const rawVX = clamp((this.x - px) / dt, -1400, 1400);
      const rawVY = clamp((this.y - py) / dt, -2400, 2400);
      const k = 1 - Math.exp(-dt * 16);
      const prevVX = this.velX;
      const prevVY = this.velY;
      this.velX += (rawVX - this.velX) * k;
      this.velY += (rawVY - this.velY) * k;
      const ak = 1 - Math.exp(-dt * 9);
      this.accX += (clamp((this.velX - prevVX) / dt, -8000, 8000) - this.accX) * ak;
      this.accY += (clamp((this.velY - prevVY) / dt, -14000, 14000) - this.accY) * ak;
    }

    _tickSecondary(dt) {
      const step = Math.min(dt, 0.033);
      if (reduceMotion) {
        for (const s of Object.values(this._sec)) {
          s.x = 0; s.y = 0; s.vx = 0; s.vy = 0;
        }
        return;
      }
      if (step <= 0) return;
      const cs = this.fighting ? this.combat.state : '';
      const attacking = /punch|kick|combo|sweep|uppercut|strike/.test(cs);
      const armScale = attacking ? 0.16 : 1;
      const upperX = clamp(-this.accX * 0.005, -5.5, 5.5);
      const upperY = clamp(-this.accY * 0.0018 - this.velY * 0.003, -4, 4);
      const headX = clamp(-this.accX * 0.0034, -3.4, 3.4);
      const headY = clamp(-this.accY * 0.0012 - this.velY * 0.002, -2.8, 2.8);
      const armX = clamp((-this.accX * 0.0034 - this.velX * 0.006) * armScale, -5, 5);
      const armY = clamp((-this.accY * 0.001 - this.velY * 0.003) * armScale, -4, 4);
      const swing = Math.sin(this.phase) * 0.9 * armScale;
      stepSpring(this._sec.upper, upperX, upperY, 135, 17, step, 6);
      stepSpring(this._sec.head, headX, headY, 190, 19, step, 4);
      stepSpring(this._sec.armL, armX + swing, armY, 95, 14, step, 6);
      stepSpring(this._sec.armR, armX - swing, armY, 95, 14, step, 6);
    }

    _applySecondary(pose) {
      if (reduceMotion || this.dragging) return pose;
      const upper = this._sec.upper;
      const headS = this._sec.head;
      const armL = this._sec.armL;
      const armR = this._sec.armR;
      const dx = upper.x;
      const dy = upper.y;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(headS.x) + Math.abs(headS.y) +
          Math.abs(armL.x) + Math.abs(armL.y) + Math.abs(armR.x) + Math.abs(armR.y) < 0.02) {
        return pose;
      }
      const chest = { x: pose.chest.x + dx, y: pose.chest.y + dy };
      const neck = { x: pose.neck.x + dx, y: pose.neck.y + dy };
      const head = { x: pose.head.x + dx + headS.x, y: pose.head.y + dy + headS.y };
      const shiftArm = (pts, a) => [
        { x: pts[0].x + dx, y: pts[0].y + dy },
        { x: pts[1].x + dx + a.x * 0.5, y: pts[1].y + dy + a.y * 0.5 },
        { x: pts[2].x + dx + a.x, y: pts[2].y + dy + a.y }
      ];
      return {
        ...pose,
        chest,
        neck,
        head,
        armL: shiftArm(pose.armL, armL),
        armR: shiftArm(pose.armR, armR),
        handL: { x: pose.handL.x + dx + armL.x, y: pose.handL.y + dy + armL.y },
        handR: { x: pose.handR.x + dx + armR.x, y: pose.handR.y + dy + armR.y }
      };
    }

    _update(dt, level) {
      const groundY = this._surfaceY(level);
      this._tickFace(dt);
      this.randomizeBehavior(dt, groundY);
      const speed = this.speedMul;
      if (this.powerCd > 0) this.powerCd -= dt;
      if (this.pushAnim > 0) this.pushAnim -= dt;

      if (this.dragging) {
        this.vy = 0;
        this.phase += dt * 2;
        return;
      }

      if (this.chatting) {
        this._chatIdle(dt, level);
        return;
      }

      if (this.blown) {
        const b = this.blown;
        this.phase += dt * 6;
        if (b.phase === 'fly') {
          this.x += b.vx * dt;
          b.vy += 180 * dt;
          this.y += b.vy * dt;
          const margin = 50;
          const atWall = (b.vx < 0 && this.x <= margin) || (b.vx > 0 && this.x >= W - margin);
          if (atWall) {
            this.x = b.vx < 0 ? margin : W - margin;
            b.vx = 0;
            b.phase = 'fall';
            spawnStar(this.x, this.y - 45, 1.6);
            spawnDust(this.x, Math.min(this.y + 8, groundY), 8);
            spawnInk(this.x, this.y - 45, 6);
            spawnBurst(this.x, this.y - 45, 1.6);
            spawnWord(this.x, this.y - 112, pick(['BAM', 'WHAM', 'SLAM']), 1.2);
            spawnSplat(this.x, groundY, 1.5);
            requestFlash(0.22, '#ffd54f');
            shakeAmt = Math.max(shakeAmt, 14);
            requestHitStop(0.07);
            audio.wallHit(panFor(this.x));
          } else if (this.y >= groundY) {
            this.y = groundY;
            b.phase = 'down';
            b.t = 0.9;
            this.landT = 0.4;
            spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
            spawnInk(this.x, this.y - 24, 3);
            spawnSplat(this.x, this.y, 1.1);
            shakeAmt = Math.max(shakeAmt, 8);
            audio.land(panFor(this.x), true);
          }
        } else if (b.phase === 'fall') {
          b.vy += 1500 * dt;
          this.y += b.vy * dt;
          if (this.y >= groundY) {
            this.y = groundY;
            b.vy = 0;
            b.phase = 'down';
            b.t = 0.9;
            this.landT = 0.4;
            spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
            spawnSplat(this.x, this.y, 1.1);
            shakeAmt = Math.max(shakeAmt, 8);
            audio.land(panFor(this.x), true);
          }
        } else if (b.phase === 'down') {
          b.t -= dt;
          if (b.t <= 0) {
            b.phase = 'getup';
            b.t = 0.4;
          }
        } else if (b.phase === 'getup') {
          b.t -= dt;
          if (b.t <= 0) {
            this.blown = null;
            this.vy = 0;
            if (this.behavior === 'jump') {
              this.jumpT = 0;
              this.restT = 0;
              this.jumpPhase = 'crouch';
            }
          }
        }
        return;
      }

      if (this.pursuit) {
        this.updatePursuit(dt, level);
        return;
      }
      if (this.pursuedBy) {
        this._waitForChallenger(dt, level);
        return;
      }

      if (this.behavior === 'jump' && !this.fighting) {
        const onGround = this.y >= groundY - 0.5 && this.vy === 0;
        this.phase += dt * 3;
        if (onGround) {
          if (this.restT > 0) {
            this.restT -= dt;
            this.jumpT = 0;
            this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 12));
            this.jumpPhase = 'rest';
          } else if (this.jumpT < this.jumpPrep) {
            this.jumpPhase = 'crouch';
            this.jumpT += dt;
            this.bodyScale = lerp(1, 0.84, this.jumpT / this.jumpPrep);
          } else {
            this.jumpPhase = 'air';
            this.bodyScale = 1.08;
            this.vy = -540 * this.jumpMul;
            this.jumpT = 0;
            spawnDust(this.x, this.y, 4);
            audio.jump(panFor(this.x));
          }
        } else {
          this.jumpPhase = 'air';
          this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
          this.vy += 1500 * dt;
          this.y += this.vy * dt;
          if (this.y >= groundY) {
            this.y = groundY;
            this.vy = 0;
            this.bodyScale = 0.88;
            this.landT = 0.4;
            this.restT = this.jumpRest;
            this.jumpT = 0;
            spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
            spawnSkid(this.x, this.y, this.facing);
            audio.land(panFor(this.x), false);
          }
        }
        this.x += this.facing * 40 * speed * dt * (this.y < groundY - 2 ? 1 : 0);
        const margin = 50;
        if (this.x < margin) { this.x = margin; this.facing = 1; }
        if (this.x > W - margin) { this.x = W - margin; this.facing = -1; }
        return;
      }

      if (!this.fighting && this.vy === 0 && this.behavior !== 'jump' &&
          Math.abs(groundY - this.y) <= 16) {
        this.y = groundY;
      }
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      if (this.y < groundY || this.vy < 0) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        if (this.y >= groundY) {
          this.y = groundY;
          this.vy = 0;
        }
      } else {
        this.y = groundY;
        this.vy = 0;
      }

      if (this.fighting) {
        this.updateFight(dt, level);
        return;
      }

      let moveSpeed = 0;
      if (this.behavior === 'walk') moveSpeed = 90;
      else if (this.behavior === 'run') moveSpeed = 200;
      else if (this.behavior === 'crawl') moveSpeed = 45;

      if (moveSpeed > 0) {
        this.x += this.facing * moveSpeed * speed * dt;
        let phaseRate = 0.09;
        if (this.behavior === 'walk') phaseRate = 0.11;
        else if (this.behavior === 'run') phaseRate = 0.085;
        this.phase += dt * moveSpeed * phaseRate * speed;
        const stride = this.behavior === 'run' ? Math.PI * 2 : Math.PI;
        const stepIdx = Math.floor(this.phase / stride);
        if (stepIdx !== this._stepPhase) {
          this._stepPhase = stepIdx;
          const running = this.behavior === 'run';
          audio.step(panFor(this.x), running);
          spawnStepDust(this.x, this.y, running, this.facing);
        }
        const margin = 50;
        if (this.x < margin) { this.x = margin; this.facing = 1; }
        if (this.x > W - margin) { this.x = W - margin; this.facing = -1; }
        if (Math.random() < 0.002) this.facing *= -1;
      } else {
        this.phase += dt * 1.6;
      }
    }

    poseKey() {
      const combat = this.fighting
        ? `${this.combat.state}${this.combat.move ? ':' + this.combat.move : ''}`
        : '-';
      const blasted = this.blown ? this.blown.phase : '-';
      return `${this.style}|${this.behavior}|${combat}|${blasted}|${this.dragging ? 'drag' : ''}`;
    }

    _tickBlend(dt) {
      if (this.dragging) {
        this._poseKey = this.poseKey();
        this.blendT = 1;
        this.prevPose = null;
        return;
      }
      const key = this.poseKey();
      if (key !== this._poseKey) {
        this.prevPose = this._lastPose;
        this._poseKey = key;
        this.blendT = 0;
        const snap = this.combat.snap;
        this.combat.snap = false;
        this.blendDur = snap ? 0.045 : 0.14;
        if (!snap) {
          if (/knockdown|getup|launched/.test(key)) this.blendDur = 0.18;
          else if (/punch|kick|combo|sweep|uppercut|strike/.test(key)) this.blendDur = 0.09;
        }
        if (!this.prevPose) this.blendT = 1;
      }
      if (this.blendT < 1) {
        this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
        if (this.blendT >= 1) this.prevPose = null;
      }
    }

    landHit(enemy, opts) {
      const { range, kbx, kdChance = 0, freeze = 0.05, shake = 5, starScale = 1 } = opts;
      const dist = Math.abs(enemy.x - this.x);
      if (dist > range) return;
      const es = enemy.combat.state;
      if (es === 'block') {
        this.x -= this.facing * 10;
        spawnStar((this.x + enemy.x) / 2, this.y - 60, 0.6);
        spawnRing((this.x + enemy.x) / 2, this.y - 60, 0.45);
        audio.block(panFor((this.x + enemy.x) / 2));
        return;
      }
      if (es === 'dodge' && enemy.combat.t > 0.14) return;
      if (es === 'stagger' || es === 'knockdown' || es === 'getup' || es === 'launched') return;      if (Math.random() < 0.25 && !opts.guaranteedKd) {
        enemy.combat.state = 'dodge';
        enemy.combat.t = 0.3;
        audio.whoosh(panFor(enemy.x), 0.6);
        return;
      }
      const dir = enemy.x >= this.x ? 1 : -1;
      const midX = (this.x + enemy.x) / 2;
      const hitY = this.y - 55;
      const knocked = opts.guaranteedKd || Math.random() < kdChance;
      const reactStrength = clamp(0.5 + kbx / 320, 0.5, 1.3);
      const reactKind = knocked || kbx >= 240 ? 'heavy' : kbx >= 150 || starScale >= 1.2 ? 'kick' : 'punch';
      if (knocked) {
        enemy.combat.state = 'knockdown';
        enemy.combat.t = 0.85;
        enemy.combat.reactDur = 0.85;
        enemy.combat.react = { kind: reactKind, strength: reactStrength + 0.15, dir };
        enemy.combat.snap = true;
        enemy.combat.spin = 0;
        enemy.combat.kbx = dir * Math.max(160, kbx);
        enemy.combat.landed = false;
        enemy.facing = dir > 0 ? -1 : 1;
        spawnDust(enemy.x, enemy.y, 7);
        spawnStar(midX, hitY, starScale * 1.3);
        shakeAmt = Math.max(shakeAmt, Math.max(shake, 9));
        requestHitStop(0.07);
      } else {
        enemy.combat.state = 'stagger';
        enemy.combat.t = 0.35;
        enemy.combat.reactDur = 0.35;
        enemy.combat.react = { kind: reactKind, strength: reactStrength, dir };
        enemy.combat.snap = true;
        enemy.combat.spin = 0;
        enemy.combat.kbx = dir * kbx;
        spawnStar(midX, hitY, starScale);
        shakeAmt = Math.max(shakeAmt, shake);
        requestHitStop(freeze);
      }
      spawnInk(midX, hitY, knocked ? 6 : 3);
      spawnRing(midX, hitY, clamp(0.7 + kbx / 300, 0.7, 1.7));
      if (knocked) {
        requestSlowmo(0.38, 0.5);
        spawnBurst(midX, hitY, starScale * 1.6);
        spawnWord(enemy.x, enemy.y - 104, 'K.O.', 1.5, '#a86f00');
      } else if (kbx >= 240) {
        spawnBurst(midX, hitY, 1.15);
        spawnWord(midX, hitY - 42, pick(['BAM', 'WHAM']), 1.1);
      } else if (kbx >= 150) {
        spawnWord(midX, hitY - 36, pick(['POW', 'WHACK']), 0.95);
      }
      if (knocked || kbx >= 150) {
        spawnSplat(midX + dir * 8, enemy._surfaceY(level), clamp(0.85 + kbx / 500, 0.85, 1.5));
      }
      if (knocked || kbx >= 150) requestFlash(knocked ? 0.22 : 0.16, '#ffd54f');
      audio.hit(reactKind, clamp(0.75 + kbx / 420, 0.75, 1.35), panFor(midX));
      if (knocked && kbx >= 240) audio.ko(panFor(enemy.x));
      if (knocked) cineKO(enemy);
    }

    updateFight(dt, level) {
      const groundY = this._surfaceY(level);
      const fb = level.floorBounds(this.combatFloor === 1 ? 1 : 0);
      const xMin = fb.x0;
      const xMax = fb.x1;
      const c = this.combat;
      c.t -= dt;
      this.phase += dt * 8;
      const stateKey = c.state === 'strike' ? `strike:${c.move}` : c.state;
      if (stateKey !== this._lastCombatState) {
        this._lastCombatState = stateKey;
        if (/punch|kick|combo|spinkick|sweep|uppercut|flyingkick|strike/.test(c.state)) {
          const power = c.state === 'strike'
            ? (c.move === 'roundhouse' ? 1.1 : c.move === 'teep' ? 1.0 : 0.8)
            : (/spinkick|flyingkick/.test(c.state) ? 1.2 : 0.8);
          audio.whoosh(panFor(this.x), power);
        }
      }

      if (c.state === 'getup') {
        c.kbx = 0;
      } else if (Math.abs(c.kbx) > 1) {
        this.x += c.kbx * dt;
        c.kbx *= Math.pow(0.001, dt);
      } else c.kbx = 0;

      if (this.foe && (!this.foe.fighting || this.foe.foe !== this)) {
        this.stopFight();
        return;
      }
      const enemy = this.foe;
      if (!enemy) {
        c.state = 'wander';
        this.x += this.facing * 50 * this.speedMul * dt;
        this.x = clamp(this.x, xMin, xMax);
        if (this.x <= 50) this.facing = 1;
        if (this.x >= W - 50) this.facing = -1;
        return;
      }

      const dx = enemy.x - this.x;
      const dist = Math.abs(dx);
      const facingFrozen = c.state === 'knockdown' || c.state === 'getup' || c.state === 'launched';
      if (dist > 4 && !facingFrozen) this.facing = dx > 0 ? 1 : -1;

      const downStates = ['knockdown', 'getup', 'launched', 'stagger'];
      if (dist < 26 && !downStates.includes(c.state) && !downStates.includes(enemy.combat.state)) {
        this.x -= this.facing * (26 - dist) * 0.5;
        this.x = clamp(this.x, xMin, xMax);
      }

      if (enemy.blown) {
        c.state = 'ready';
        c.t = 0;
        c.cd = Math.max(c.cd, 0.2);
        c.hitDone = false;
        c.spin = 0;
        c.move = null;
        c.hitIndex = 0;
        this.trail.length = 0;
        return;
      }

      const airborne = this.y < groundY - 2;
      const trailStates = ['flyingkick', 'spinkick', 'punch', 'kick', 'combo', 'uppercut', 'strike'];
      if (trailStates.includes(c.state)) {
        this.trail.push({ x: this.x, y: this.y, spin: c.spin, snap: this.pose() });
        if (this.trail.length > 6) this.trail.shift();
      } else {
        this.trail.length = 0;
      }
      if (c.state !== 'spinkick' && c.spin) c.spin = 0;

      if (c.state === 'stagger') {
        if (c.t <= 0) { c.state = 'ready'; c.cd = 0.45 + Math.random() * 0.5; }
        return;
      }

      if (c.state === 'launched') {
        if (!airborne && c.t < 0.35) {
          this.landT = 0.4;
          spawnDust(this.x, this.y, reduceMotion ? 3 : 6);
          c.state = 'stagger';
          c.t = 0.25;
          c.reactDur = 0.25;
        }
        return;
      }

      if (c.state === 'knockdown') {
        if (airborne) return;
        const elapsed = 0.85 - c.t;
        if (!c.landed && elapsed >= 0.24) {
          c.landed = true;
          c.kbx *= 0.18;
          this.landT = 0.4;
          spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
          spawnInk(this.x, this.y - 12, 3);
          spawnSplat(this.x + this.facing * 8, this.y, 1.25);
          audio.land(panFor(this.x), true);
          shakeAmt = Math.max(shakeAmt, 3);
        }
        if (c.t <= 0) {
          c.state = 'getup';
          c.t = 0.45;
        }
        return;
      }

      if (c.state === 'getup') {
        if (c.t <= 0) { c.state = 'ready'; c.cd = 0.35 + Math.random() * 0.4; }
        return;
      }

      if (c.state === 'approach') {
        if (dist > 78) {
          this.x += this.facing * 95 * this.speedMul * dt;
        } else {
          c.state = 'ready';
          c.cd = 0.2 + Math.random() * 0.4;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'dodge') {
        this.x += this.facing * -95 * dt;
        if (c.t <= 0) { c.state = 'ready'; c.cd = 0.45 + Math.random() * 0.45; }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'block') {
        if (c.t <= 0) {
          c.state = 'ready';
          c.cd = this.style === 'wingchun'
            ? 0.16 + Math.random() * 0.18
            : 0.35 + Math.random() * 0.35;
        }
        return;
      }

      if (c.state === 'flyingkick') {
        const total = 0.85;
        const elapsed = total - c.t;
        if (elapsed < 0.18) {
          this.bodyScale = lerp(1, 0.82, elapsed / 0.18);
        } else if (!c.hitDone && elapsed >= 0.18) {
          c.hitDone = true;
          this.bodyScale = 1;
          this.vy = -400;
          const gap = Math.max(0, dist - 90);
          c.lungeV = this.facing * clamp(gap / 0.35, 240, 620);
          spawnDust(this.x, this.y, 4);
        }
        if (c.hitDone && airborne) {
          this.x += c.lungeV * dt;
          this.x = clamp(this.x, xMin, xMax);
          if (!c.kickDone && elapsed > 0.24 && Math.abs(enemy.x - this.x) <= 130) {
            c.kickDone = true;
            this.landHit(enemy, { range: 130, kbx: 280, kdChance: 0.4, freeze: 0.07, shake: 10, starScale: 1.4 });
            c.lungeV *= 0.3;
          }
        }
        if (c.hitDone && !airborne && elapsed > 0.3) {
          this.landT = 0.4;
          spawnDust(this.x, this.y, reduceMotion ? 3 : 6);
          c.state = 'ready';
          c.cd = 0.5 + Math.random() * 0.4;
          c.hitDone = false;
          c.kickDone = false;
        }
        if (c.t <= -0.4) {
          this.y = groundY; this.vy = 0;
          c.state = 'ready'; c.cd = 0.4;
          c.hitDone = false; c.kickDone = false;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'spinkick') {
        const total = 0.55;
        const elapsed = total - c.t;
        c.spin = easeOut(clamp(elapsed / 0.5, 0, 1)) * Math.PI * 2 * this.facing;
        this.x += this.facing * 60 * dt;
        if (!c.hitDone && elapsed > 0.18) {
          c.hitDone = true;
          this.landHit(enemy, { range: 105, kbx: 210, kdChance: 0.2, freeze: 0.05, shake: 7, starScale: 1.15 });
        }
        if (c.t <= 0) {
          c.spin = 0;
          c.state = 'ready';
          c.hitDone = false;
          c.cd = 0.5 + Math.random() * 0.4;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'sweep') {
        const total = 0.5;
        const elapsed = total - c.t;
        this.bodyScale = elapsed < 0.15 ? lerp(1, 0.72, elapsed / 0.15) : 0.72;
        this.x += this.facing * 45 * dt * (elapsed > 0.15 && elapsed < 0.35 ? 1 : 0);
        if (!c.hitDone && elapsed > 0.16) {
          c.hitDone = true;
          this.landHit(enemy, { range: 95, kbx: 170, guaranteedKd: true, freeze: 0.06, shake: 8, starScale: 1.1 });
        }
        if (c.t <= 0) {
          this.bodyScale = 1;
          c.state = 'ready';
          c.hitDone = false;
          c.cd = 0.55 + Math.random() * 0.4;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'uppercut') {
        const total = 0.48;
        const elapsed = total - c.t;
        if (elapsed < 0.16) {
          this.bodyScale = lerp(1, 0.85, elapsed / 0.16);
        } else if (elapsed < 0.26) {
          this.bodyScale = lerp(0.85, 1.08, (elapsed - 0.16) / 0.1);
          if (!c.hitDone) {
            c.hitDone = true;
            this.landHit(enemy, { range: 90, kbx: 100, freeze: 0.08, shake: 10, starScale: 1.5 });
            if (enemy.combat.state === 'stagger') {
              enemy.combat.state = 'launched';
              enemy.combat.t = 0.6;
              enemy.combat.react = { kind: 'heavy', strength: 1.35, dir: enemy.x >= this.x ? 1 : -1 };
              enemy.combat.snap = true;
              enemy.facing = enemy.x >= this.x ? -1 : 1;
              enemy.vy = -300;
            }
          }
        }
        if (c.t <= 0) {
          this.bodyScale = 1;
          c.state = 'ready';
          c.hitDone = false;
          c.cd = 0.55 + Math.random() * 0.4;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'punch' || c.state === 'kick') {
        const total = c.state === 'punch' ? 0.35 : 0.45;
        const elapsed = total - c.t;
        const lungeEnd = c.state === 'punch' ? 0.15 : 0.12;
        if (elapsed < lungeEnd) this.x += this.facing * (c.state === 'punch' ? 130 : 85) * dt;
        const hitAt = c.state === 'punch' ? 0.18 : 0.25;
        const hitRange = c.state === 'punch' ? 95 : 105;
        if (!c.hitDone && elapsed >= hitAt) {
          c.hitDone = true;
          this.landHit(enemy, {
            range: hitRange,
            kbx: c.state === 'punch' ? 150 : 190,
            kdChance: c.state === 'kick' ? 0.1 : 0,
            starScale: c.state === 'punch' ? 0.9 : 1.1
          });
        }
        if (c.t <= 0) {
          c.state = 'ready';
          c.hitDone = false;
          c.cd = 0.45 + Math.random() * 0.5;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'combo') {
        const total = 0.95;
        const elapsed = total - c.t;
        c.comboStep = elapsed < 0.3 ? 0 : elapsed < 0.58 ? 1 : 2;
        if (elapsed < 0.3) this.x += this.facing * 70 * dt;
        else if (elapsed > 0.6) this.x += this.facing * 100 * dt;
        if (!(c.hits & 1) && elapsed >= 0.14) {
          c.hits |= 1;
          this.landHit(enemy, { range: 92, kbx: 50, starScale: 0.75, freeze: 0.03, shake: 3 });
        }
        if (!(c.hits & 2) && elapsed >= 0.4) {
          c.hits |= 2;
          this.landHit(enemy, { range: 92, kbx: 60, starScale: 0.8, freeze: 0.03, shake: 4 });
        }
        if (!(c.hits & 4) && elapsed >= 0.66) {
          c.hits |= 4;
          this.landHit(enemy, { range: 108, kbx: 200, kdChance: 0.18, starScale: 1.25, freeze: 0.06, shake: 8 });
        }
        if (c.t <= 0) {
          c.state = 'ready';
          c.hits = 0;
          c.cd = 0.6 + Math.random() * 0.5;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'strike') {
        const m = STRIKES[c.move];
        if (!m) {
          c.state = 'ready';
          c.t = 0;
          c.cd = 0.4;
          c.move = null;
          c.hitIndex = 0;
          return;
        }
        const elapsed = m.total - c.t;
        if (elapsed < m.lungeEnd) this.x += this.facing * m.lungeSpeed * dt;
        while (c.hitIndex < m.hits.length && elapsed >= m.hits[c.hitIndex].at) {
          const h = m.hits[c.hitIndex++];
          this.landHit(enemy, { ...m, ...h });
        }
        if (c.t <= 0) {
          c.state = 'ready';
          c.cd = m.cd + Math.random() * m.cdJitter;
          c.move = null;
          c.hitIndex = 0;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      // ready
      c.cd -= dt;
      if (airborne) return;
      const eState = enemy.combat.state;
      const downStates2 = ['knockdown', 'getup', 'launched', 'stagger'];
      if (downStates2.includes(eState)) {
        c.cd = 0.12;
        if (dist > 120) c.state = 'approach';
        return;
      }
      const enemyAttacking = ['punch', 'kick', 'flyingkick', 'spinkick', 'sweep', 'uppercut', 'combo', 'strike'].includes(eState);
      const defendChance = this.style === 'wingchun' ? 0.085 : 0.06;
      if (enemyAttacking && dist < 125 && Math.random() < defendChance) {
        const blockChance = this.style === 'wingchun' ? 0.72 : this.style === 'muaythai' ? 0.52 : 0.45;
        if (Math.random() < blockChance) {
          c.state = 'block';
          c.t = this.style === 'wingchun' ? 0.3 : 0.45;
        } else {
          c.state = 'dodge';
          c.t = 0.3;
        }
        return;
      }
      if (this.hasPower && this.powerCd <= 0 && dist < 240 && Math.random() < 0.2) {
        blastFigure(this, enemy, 5 + Math.random() * 3);
        c.state = 'ready';
        c.t = 0;
        c.cd = 1.1;
        c.hitDone = false;
        c.spin = 0;
        this.trail.length = 0;
        return;
      }
      if (c.cd <= 0) {
        if (this.style === 'wingchun') {
          if (dist > 96) {
            c.state = 'approach';
          } else {
            const r = Math.random();
            if (r < 0.58) startStrike(this, 'chainpunch');
            else if (r < 0.78) startStrike(this, 'lowkick');
            else if (r < 0.92) { c.state = 'block'; c.t = 0.32; }
            else { c.state = 'dodge'; c.t = 0.3; }
          }
        } else if (this.style === 'muaythai') {
          if (dist > 150) {
            c.state = 'approach';
          } else if (dist > 100) {
            const r = Math.random();
            if (dist > 135) {
              if (r < 0.75) startStrike(this, 'teep');
              else c.state = 'approach';
            } else if (r < 0.45) startStrike(this, 'teep');
            else if (r < 0.8) startStrike(this, 'roundhouse');
            else c.state = 'approach';
          } else {
            const r = Math.random();
            if (r < 0.3) startStrike(this, 'knee');
            else if (r < 0.6) startStrike(this, 'elbow');
            else if (r < 0.8) startStrike(this, 'roundhouse');
            else if (r < 0.9) startStrike(this, 'teep');
            else if (r < 0.96) { c.state = 'block'; c.t = 0.4; }
            else { c.state = 'dodge'; c.t = 0.3; }
          }
        } else {
          const r = Math.random();
          if (dist > 200) {
            if (r < 0.7) c.state = 'approach';
            else { c.state = 'flyingkick'; c.t = 0.85; c.hitDone = false; c.kickDone = false; }
          } else if (dist > 100) {
            if (r < 0.3) c.state = 'approach';
            else if (r < 0.55) { c.state = 'flyingkick'; c.t = 0.85; c.hitDone = false; c.kickDone = false; }
            else if (r < 0.7) { c.state = 'spinkick'; c.t = 0.55; c.hitDone = false; c.spin = 0; }
            else if (r < 0.85) { c.state = 'punch'; c.t = 0.35; c.hitDone = false; }
            else { c.state = 'kick'; c.t = 0.45; c.hitDone = false; }
          } else {
            if (r < 0.16) { c.state = 'punch'; c.t = 0.35; c.hitDone = false; }
            else if (r < 0.28) { c.state = 'kick'; c.t = 0.45; c.hitDone = false; }
            else if (r < 0.4) { c.state = 'combo'; c.t = 0.95; c.hits = 0; }
            else if (r < 0.52) { c.state = 'spinkick'; c.t = 0.55; c.hitDone = false; c.spin = 0; }
            else if (r < 0.63) { c.state = 'sweep'; c.t = 0.5; c.hitDone = false; }
            else if (r < 0.73) { c.state = 'uppercut'; c.t = 0.48; c.hitDone = false; }
            else if (r < 0.85) { c.state = 'block'; c.t = 0.4; }
            else { c.state = 'dodge'; c.t = 0.3; }
          }
        }
      }
    }

    pose() {
      const target = this.computePose();
      this._lastPose = target;
      let result = target;
      if (this.prevPose && this.blendT < 1) {
        const t = this.blendT * this.blendT * (3 - 2 * this.blendT);
        result = blendPose(this.prevPose, target, t);
      }
      return this._applySecondary(result);
    }

    computePose() {
      const landElapsed = this.landT > 0 ? 0.4 - this.landT : 0;
      const landWave = this.landT > 0
        ? -0.045 * Math.exp(-landElapsed * 10) * Math.cos(landElapsed * 24)
        : 0;
      const s = this.bodyScale * (1 + landWave);
      const p = this.phase;
      const headR = this.headR * s;
      const f = this.facing;
      const b = this.behavior;
      const crawling = b === 'crawl' && !this.dragging && !this.fighting;
      const hipY = (crawling ? -14 : -39.5) * s;

      let lean = 0;
      let reactHold = 0, reactSettle = 0, reactWobble = 0;
      if (b === 'run') {
        const speedK = clamp((this.speedMul - 0.9) / 0.35, 0, 1);
        lean = (0.34 + speedK * 0.08) * f;
      }
      else if (b === 'walk') lean = 0.06 * f;
      else if (b === 'crawl') lean = 1.4 * f;
      else if (b === 'jump') lean = 0.1 * f;
      if (this.dragging) lean = 0.05 * f;
      else if (this.pushAnim > 0) lean = 0.32 * f;
      else if (this.fighting) {
        const cs = this.combat.state;
        if (cs === 'punch') lean = 0.2 * f;
        else if (cs === 'kick') lean = -0.12 * f;
        else if (cs === 'block') lean = -0.06 * f;
        else if (cs === 'stagger') {
          const dur = this.combat.reactDur || 0.35;
          const rt = clamp(1 - this.combat.t / dur, 0, 1);
          const strength = this.combat.react ? this.combat.react.strength : 1;
          reactHold = smoothstep(0, 0.2, rt) * (1 - smoothstep(0.6, 1, rt));
          reactSettle = smoothstep(0.6, 1, rt);
          reactWobble = reduceMotion ? 0 : Math.sin(rt * 26) * 0.07 * (1 - rt);
          lean = -(0.2 + 0.17 * strength) * reactHold * f;
        }
        else if (cs === 'knockdown') {
          const dur = this.combat.reactDur || 0.85;
          const rt = clamp(1 - this.combat.t / dur, 0, 1);
          const strength = this.combat.react ? this.combat.react.strength : 1;
          reactHold = 1 - smoothstep(0.15, 0.45, rt);
          lean = -(0.2 + 0.17 * strength) * reactHold * f;
        }
        else if (cs === 'dodge') lean = -0.18 * f;
        else if (cs === 'flyingkick') lean = 0.45 * f;
        else if (cs === 'spinkick') lean = 0.15 * f;
        else if (cs === 'sweep') lean = 0.5 * f;
        else if (cs === 'uppercut') lean = 0.08 * f;
        else if (cs === 'combo') lean = 0.18 * f;
        else if (cs === 'strike') {
          const move = this.combat.move;
          if (move === 'teep') lean = -0.18 * f;
          else if (move === 'roundhouse') lean = -0.06 * f;
          else if (move === 'lowkick') lean = 0.08 * f;
          else if (move === 'chainpunch' || move === 'elbow') lean = 0.2 * f;
          else if (move === 'knee') lean = 0.12 * f;
          else lean = 0.1 * f;
        }
        else if (cs === 'launched') lean = -0.35 * f;
        else if (cs === 'getup') lean = 0.1 * f;
        else lean = 0.1 * f;
      }

      let bounce = 0;
      if (!this.dragging && !crawling) {
        if (b === 'run') bounce = Math.abs(Math.cos(p)) * 5 * s;
        else if (b === 'walk') bounce = Math.abs(Math.cos(p)) * 1.5 * s;
      }

      let hip, chest, neck, head;
      const fightingPose = this.fighting && !this.dragging;
      const combatState = fightingPose ? this.combat.state : '';
      let spineBend = clamp(-lean * 0.16, -0.09, 0.09);
      if (combatState === 'punch' || combatState === 'combo' ||
          (combatState === 'strike' && /chainpunch|elbow/.test(this.combat.move))) spineBend += 0.04 * f;
      else if (combatState === 'block') spineBend += 0.03 * f;
      else if (combatState === 'kick' || combatState === 'sweep' || combatState === 'flyingkick' ||
          (combatState === 'strike' && /lowkick|teep|roundhouse/.test(this.combat.move))) spineBend -= 0.04 * f;
      if (this.landT > 0 && !crawling) {
        spineBend += f * 0.05 * clamp(this.landT / 0.4, 0, 1);
      }
      let down = 0;
      let downElapsed = 0;
      let settle = 0;

      if (this.blown) {
        if (this.blown.phase === 'down') down = 1;
        else if (this.blown.phase === 'getup') {
          downElapsed = clamp((0.4 - this.blown.t) / 0.4, 0, 1);
          down = 1 - smoothstep(0.12, 0.92, downElapsed);
        }
      } else if (combatState === 'knockdown') {
        downElapsed = clamp(0.85 - this.combat.t, 0, 0.85);
        down = smoothstep(0.02, 0.24, downElapsed);
        if (downElapsed > 0.24) {
          settle = Math.exp(-(downElapsed - 0.24) * 9) * Math.sin((downElapsed - 0.24) * 34) * 1.6;
        }
      } else if (combatState === 'getup') {
        downElapsed = clamp(0.45 - this.combat.t, 0, 0.45);
        down = 1 - smoothstep(0.10, 0.44, downElapsed);
      }

      const breath = combatState === 'knockdown' && down > 0.9
        ? Math.sin(downElapsed * 7) * 0.6 : 0;

      hip = { x: 0, y: hipY - bounce };
      if (reactHold > 0) {
        hip.x -= f * (2 + 6 * reactHold);
        hip.y += 1 + 4 * reactHold;
      }
      const torsoLen = 37 * s;
      const chestLocal = rot(0, -torsoLen * 0.55, lean + spineBend * 0.35);
      chest = { x: hip.x + chestLocal.x, y: hip.y + chestLocal.y };
      const neckLocal = rot(0, -torsoLen * 0.45, lean + spineBend);
      neck = { x: chest.x + neckLocal.x, y: chest.y + neckLocal.y };
      head = crawling
        ? { x: neck.x + f * (headR + 5), y: neck.y - 3 * s }
        : { x: neck.x + spineBend * 7 * s, y: neck.y - headR - 6 };
      if (reactHold > 0) {
        head.x -= f * (2 + 5 * reactHold);
        head.y += 1.5 * reactHold + 1.5 * reactSettle;
      }

      if (down > 0) {
        const lieAngle = -1.5 * f;
        const lieHip = { x: -6 * f, y: -10 * s + breath };
        const lieNeckLocal = rot(0, -torsoLen, lieAngle);
        const lieNeck = { x: lieHip.x + lieNeckLocal.x, y: lieHip.y + lieNeckLocal.y };
        const lieChest = lerpPt(lieHip, lieNeck, 0.55);
        const lieHeadLocal = rot(0, -(headR + 6), lieAngle);
        const lieHead = { x: lieNeck.x + lieHeadLocal.x, y: lieNeck.y + lieHeadLocal.y };
        hip = lerpPt(hip, lieHip, down);
        chest = lerpPt(chest, lieChest, down);
        neck = lerpPt(neck, lieNeck, down);
        head = lerpPt(head, lieHead, down);
        hip.y += settle * down;
        chest.y += settle * 0.85 * down;
        head.y += settle * 0.6 * down;
      }

      let la, ra, la2, ra2, lHip, rHip, lKnee, rKnee;

      if (this.blown && (this.blown.phase === 'fly' || this.blown.phase === 'fall')) {
        const w = Math.sin(p * 16);
        la = -1.2 + w * 0.5; la2 = 0.55;
        ra = -1.0 - w * 0.5; ra2 = 0.5;
        lHip = 0.7 + w * 0.2; rHip = 0.1 - w * 0.25;
        lKnee = -0.9; rKnee = -0.5;
      } else if (this.blown && this.blown.phase === 'getup') {
        const prog = clamp((0.4 - this.blown.t) / 0.4, 0, 1);
        la = lerp(0.7, 0.15, prog); la2 = lerp(0.55, 0.3, prog);
        ra = lerp(0.75, 0.2, prog); ra2 = lerp(0.5, 0.3, prog);
        lHip = lerp(0.95, 0.1, prog); rHip = lerp(0.9, 0.05, prog);
        lKnee = lerp(-0.4, -0.2, prog); rKnee = lerp(-0.4, -0.15, prog);
      } else if (fightingPose) {
        const cs = this.combat.state;
        const bob = Math.sin(p * 2) * 0.025;
        lHip = 0.55 + bob; rHip = -0.42;
        lKnee = -0.8; rKnee = -0.12;
        la = -0.1; la2 = 2.3;
        ra = 0.6; ra2 = 1.5;
        if (this.style === 'wingchun') {
          lHip = 0.36 + bob; rHip = -0.28;
          lKnee = -0.52; rKnee = -0.2;
          la = 0.34; la2 = 1.85;
          ra = 0.42; ra2 = 1.75;
        } else if (this.style === 'muaythai') {
          lHip = 0.52 + bob; rHip = -0.38;
          lKnee = -0.62; rKnee = -0.22;
          la = 0.58; la2 = 2.05;
          ra = 0.5; ra2 = 1.95;
        }

        if (cs === 'punch') {
          const e = 0.35 - this.combat.t;
          const prog = Math.min(clamp(e / 0.18, 0, 1), 1 - clamp((e - 0.18) / 0.12, 0, 1));
          ra = lerp(0.6, 1.35, prog); ra2 = lerp(1.5, 0, prog);
          la = -0.1; la2 = 2.3;
        } else if (cs === 'kick') {
          const e = 0.45 - this.combat.t;
          const extend = smoothstep(0.10, 0.24, e) * (1 - smoothstep(0.30, 0.44, e));
          const windup = 1 - smoothstep(0, 0.12, e);
          lHip = lerp(0.52, 1.38, extend) - windup * 0.08;
          lKnee = lerp(-1.25, -0.05, extend) - windup * 0.3;
          rHip = -0.32; rKnee = -0.5;
          la = lerp(-0.1, -0.9, extend); la2 = lerp(2.3, 0.5, extend);
          ra = lerp(0.6, 0.95, extend); ra2 = lerp(1.5, 1.15, extend);
        } else if (cs === 'combo') {
          const step = this.combat.comboStep || 0;
          const e = 0.95 - this.combat.t;
          if (step === 0) {
            const prog = Math.min(clamp(e / 0.10, 0, 1), 1 - clamp((e - 0.14) / 0.10, 0, 1));
            ra = lerp(0.6, 1.35, prog); ra2 = lerp(1.5, 0, prog);
            la = -0.1; la2 = 2.3;
          } else if (step === 1) {
            const e2 = e - 0.3;
            const prog = Math.min(clamp(e2 / 0.08, 0, 1), 1 - clamp((e2 - 0.12) / 0.10, 0, 1));
            la = lerp(-0.1, 1.2, prog); la2 = lerp(2.3, 0.05, prog);
            ra = lerp(1.35, 0.6, prog); ra2 = lerp(0, 1.5, prog);
          } else {
            const e3 = e - 0.58;
            const prog = Math.min(clamp(e3 / 0.12, 0, 1), 1 - clamp((e3 - 0.16) / 0.14, 0, 1));
            lHip = lerp(0.55, 1.38, prog); lKnee = lerp(-1.25, -0.05, prog);
            rHip = -0.32; rKnee = -0.5;
            la = lerp(-0.1, -0.9, prog); la2 = lerp(2.3, 0.5, prog);
            ra = lerp(0.6, 0.95, prog); ra2 = lerp(1.5, 1.15, prog);
          }
        } else if (cs === 'flyingkick') {
          const elapsed = 0.85 - this.combat.t;
          if (elapsed < 0.18) {
            la = 0.6; la2 = 0.5;
            ra = 0.65; ra2 = 0.45;
            lHip = 0.85; rHip = 0.85;
            lKnee = 0.55 - lHip; rKnee = 0.55 - rHip;
          } else {
            lHip = 1.45; lKnee = -0.05;
            rHip = -0.75; rKnee = 1.35;
            la = -0.9; la2 = 0.35;
            ra = -1.15; ra2 = 0.5;
          }
        } else if (cs === 'spinkick') {
          lHip = 1.5; lKnee = -0.08;
          rHip = -0.3; rKnee = -0.4;
          la = -0.7 + Math.sin(p * 10) * 0.2; la2 = 0.4;
          ra = -0.85; ra2 = 0.3;
        } else if (cs === 'sweep') {
          lHip = 1.55; lKnee = -0.05;
          rHip = -0.2; rKnee = -1.2;
          la = -0.7; la2 = 0.6;
          ra = 0.7; ra2 = 0.9;
        } else if (cs === 'uppercut') {
          const elapsed = 0.48 - this.combat.t;
          if (elapsed < 0.16) {
            la = -0.1; la2 = 2.3;
            ra = 0.6; ra2 = 1.5;
            lHip = 0.6; rHip = -0.1;
            lKnee = -0.9; rKnee = -0.7;
          } else {
            const prog = Math.min(clamp((elapsed - 0.16) / 0.1, 0, 1), 1 - clamp((elapsed - 0.26) / 0.14, 0, 1));
            la = -0.1; la2 = 2.3;
            ra = lerp(0.6, 2.2, prog); ra2 = lerp(1.5, 0.35, prog);
            lHip = lerp(0.6, 0.2, prog); rHip = lerp(-0.1, -0.2, prog);
            lKnee = lerp(-0.9, -0.1, prog); rKnee = lerp(-0.7, -0.1, prog);
          }
        } else if (cs === 'block') {
          if (this.style === 'wingchun') {
            lHip = 0.32; lKnee = -0.62;
            rHip = -0.3; rKnee = -0.25;
            la = 0.75; la2 = 2.5;
            ra = 0.55; ra2 = 2.55;
          } else if (this.style === 'muaythai') {
            lHip = 0.42; lKnee = -0.7;
            rHip = -0.36; rKnee = -0.3;
            la = 0.85; la2 = 2.4;
            ra = 0.78; ra2 = 2.5;
          } else {
            lHip = 0.4; lKnee = -0.9;
            rHip = -0.35; rKnee = -0.3;
            la = 0.9; la2 = 2.35;
            ra = 0.8; ra2 = 2.45;
          }
        } else if (cs === 'strike') {
          const move = this.combat.move;
          const m = STRIKES[move];
          if (m) {
            const e = m.total - this.combat.t;
            if (move === 'chainpunch') {
              const step = Math.min(2, Math.floor(e / 0.14));
              const local = clamp((e - step * 0.14) / 0.14, 0, 1);
              const punch = Math.sin(Math.PI * local);
              if (step === 0 || step === 2) {
                ra = lerp(0.42, 1.35, punch); ra2 = lerp(1.75, 0.02, punch);
                la = 0.34; la2 = 1.85;
              } else {
                la = lerp(0.34, 1.3, punch); la2 = lerp(1.85, 0.02, punch);
                ra = 0.42; ra2 = 1.75;
              }
              lHip = 0.36 + punch * 0.1; rHip = -0.28;
              lKnee = -0.52; rKnee = -0.2;
            } else if (move === 'lowkick') {
              const kick = smoothstep(0.08, 0.18, e) * (1 - smoothstep(0.26, 0.4, e));
              lHip = lerp(0.36, 1.05, kick);
              lKnee = lerp(-0.6, -0.05, kick);
              rHip = -0.3; rKnee = -0.3;
              la = lerp(0.34, -0.5, kick); la2 = lerp(1.85, 0.6, kick);
              ra = lerp(0.42, 0.9, kick); ra2 = lerp(1.75, 1.1, kick);
            } else if (move === 'teep') {
              const kick = smoothstep(0.1, 0.22, e) * (1 - smoothstep(0.3, 0.52, e));
              lHip = lerp(0.36, 1.45, kick);
              lKnee = lerp(-0.6, -0.02, kick);
              rHip = -0.3; rKnee = -0.25;
              la = lerp(0.34, -0.7, kick); la2 = lerp(1.85, 0.4, kick);
              ra = lerp(0.42, -0.5, kick); ra2 = lerp(1.75, 0.5, kick);
            } else if (move === 'roundhouse') {
              const kick = smoothstep(0.12, 0.28, e) * (1 - smoothstep(0.36, 0.58, e));
              lHip = lerp(0.36, 1.55, kick);
              lKnee = lerp(-0.6, -0.02, kick);
              rHip = -0.3; rKnee = -0.35;
              la = lerp(0.34, -0.9, kick); la2 = lerp(1.85, 0.35, kick);
              ra = lerp(0.42, 0.95, kick); ra2 = lerp(1.75, 1.15, kick);
            } else if (move === 'knee') {
              const knee = smoothstep(0.04, 0.14, e) * (1 - smoothstep(0.2, 0.36, e));
              lHip = lerp(0.36, 1.35, knee);
              lKnee = lerp(-0.6, 1.05, knee);
              rHip = -0.3; rKnee = -0.2;
              la = lerp(0.34, 1.1, knee); la2 = lerp(1.85, 0.5, knee);
              ra = lerp(0.42, 1.2, knee); ra2 = lerp(1.75, 0.4, knee);
            } else if (move === 'elbow') {
              const elbow = smoothstep(0.04, 0.13, e) * (1 - smoothstep(0.18, 0.32, e));
              ra = lerp(0.42, 1.5, elbow); ra2 = lerp(1.75, 0.7, elbow);
              la = lerp(0.34, 0.9, elbow); la2 = lerp(1.85, 1.6, elbow);
              lHip = 0.36; rHip = -0.28;
              lKnee = -0.52; rKnee = -0.2;
            }
          }
        } else if (cs === 'stagger') {
          const dur = this.combat.reactDur || 0.35;
          const rt = clamp(1 - this.combat.t / dur, 0, 1);
          const stepLift = Math.sin(Math.PI * clamp(rt / 0.55, 0, 1)) * reactHold;
          la = lerp(-0.1, 1.2, reactHold) + reactWobble;
          la2 = lerp(2.3, 0.6, reactHold);
          ra = lerp(0.6, -0.8, reactHold) - reactWobble;
          ra2 = lerp(1.5, 0.7, reactHold);
          lHip = lerp(0.55, 0.65, reactHold);
          rHip = lerp(-0.42, -0.9, reactHold) - 0.1 * stepLift;
          lKnee = lerp(-0.8, -0.5, reactHold);
          rKnee = lerp(-0.12, -0.45, reactHold) - 0.35 * stepLift;
        } else if (cs === 'launched') {
          const w = Math.sin(p * 16) * 0.3;
          la = -0.95 + w; la2 = 0.85;
          ra = -0.7 - w; ra2 = 0.65;
          lHip = 0.45 + w * 0.2; rHip = -0.25 - w * 0.2;
          lKnee = -0.75; rKnee = 0.85;
        } else if (cs === 'getup') {
          const elapsed = 0.45 - this.combat.t;
          if (elapsed < 0.16) {
            la = 0.5; la2 = 0.25;
            ra = 0.55; ra2 = 0.2;
            lHip = 1.0; rHip = 0.9;
            lKnee = 0.6 - lHip; rKnee = 0.5 - rHip;
          } else if (elapsed < 0.3) {
            const k = smoothstep(0.16, 0.3, elapsed);
            la = lerp(0.5, 0.18, k); la2 = lerp(0.25, 0.45, k);
            ra = lerp(0.55, 0.2, k); ra2 = lerp(0.2, 0.4, k);
            lHip = lerp(1.0, 0.45, k); rHip = lerp(0.9, 0.3, k);
            lKnee = lerp(0.6 - 1.0, -0.35, k); rKnee = lerp(0.5 - 0.9, -0.25, k);
          } else {
            la = 0.18; la2 = 0.45;
            ra = 0.2; ra2 = 0.4;
            lHip = 0.3; rHip = 0.18;
            lKnee = -0.3; rKnee = -0.22;
          }
        } else if (this.style === 'brawler') {
          la = -0.1 + bob; la2 = 2.3;
          ra = 0.6 - bob; ra2 = 1.5;
        }
      } else if (b === 'walk') {
        const sw = Math.sin(p);
        const liftL = Math.max(0, Math.cos(p - 0.4));
        const liftR = Math.max(0, Math.cos(p + Math.PI - 0.4));
        lHip = sw * 0.72; rHip = -sw * 0.72;
        lKnee = -(0.12 + 1.05 * liftL);
        rKnee = -(0.12 + 1.05 * liftR);
        la = 0.1 - sw * 0.55;
        ra = 0.1 + sw * 0.55;
        la2 = 0.32 + Math.max(0, -sw) * 0.2;
        ra2 = 0.32 + Math.max(0, sw) * 0.2;
      } else if (b === 'run') {
        const sw = Math.sin(p);
        const liftL = Math.max(0, Math.cos(p - 0.3));
        const liftR = Math.max(0, Math.cos(p + Math.PI - 0.3));
        lHip = sw * 1.05; rHip = -sw * 1.05;
        lKnee = -(0.4 + 1.55 * liftL);
        rKnee = -(0.4 + 1.55 * liftR);
        la = 0.35 - sw * 0.82;
        ra = 0.35 + sw * 0.82;
        la2 = 1.15 + Math.max(0, -sw) * 0.24;
        ra2 = 1.15 + Math.max(0, sw) * 0.24;
      } else if (b === 'crawl') {
        la = 1.15 + Math.sin(p) * 0.45;
        ra = 1.15 + Math.sin(p + Math.PI) * 0.45;
        la2 = 0; ra2 = 0;
        lHip = -(1.0 + Math.sin(p) * 0.35);
        rHip = -(1.0 + Math.sin(p + Math.PI) * 0.35);
        lKnee = -(clamp(Math.sin(p + Math.PI) * 0.5 + 0.35, 0, 0.9) - lHip);
        rKnee = -(clamp(Math.sin(p) * 0.5 + 0.35, 0, 0.9) - rHip);
      } else if (b === 'jump') {
        const airborne = this.y < H - 72 - 2;
        if (airborne || this.vy !== 0) {
          if (this.vy < -120) {
            la = 2.65; ra = 2.45;
            la2 = -0.45; ra2 = -0.4;
            lHip = 0.4; rHip = -0.3;
            lKnee = -0.55; rKnee = -0.45;
          } else if (this.vy > 120) {
            la = -0.75; ra = 0.55;
            la2 = 0.5; ra2 = 0.45;
            lHip = 0.25; rHip = -0.15;
            lKnee = -0.3; rKnee = -0.25;
          } else {
            la = 1.7; ra = 1.55;
            la2 = -0.6; ra2 = -0.5;
            lHip = 1.25; rHip = 1.0;
            lKnee = -1.5; rKnee = -1.35;
          }
        } else if (this.bodyScale < 0.95) {
          la = -0.85; ra = -0.7;
          la2 = 0.55; ra2 = 0.5;
          lHip = 0.85; rHip = 0.7;
          lKnee = 0.15 - lHip; rKnee = 0.1 - rHip;
        } else {
          la = 0.12 + Math.sin(p) * 0.12;
          ra = 0.12 - Math.sin(p) * 0.12;
          la2 = 0.28; ra2 = 0.28;
          lHip = 0; rHip = 0; lKnee = 0; rKnee = 0;
        }
      } else {
        const motion = reduceMotion ? 0.35 : 1;
        const idle = Math.sin(p * 0.75);
        const sway = Math.sin(p * 0.37);
        la = -0.2 + idle * 0.05 * motion;
        ra = 0.22 - idle * 0.05 * motion;
        la2 = 0.22 + idle * 0.03 * motion;
        ra2 = 0.24 - idle * 0.03 * motion;
        lHip = -0.02 + sway * 0.02 * motion;
        rHip = 0.04 - sway * 0.02 * motion;
        lKnee = -(0.18 + (0.5 + sway * 0.5) * 0.12 * motion);
        rKnee = -(0.06 + (0.5 - sway * 0.5) * 0.08 * motion);
        head.y += idle * 0.9 * motion;
      }

      if (this.dragging) {
        la = -0.55 + Math.sin(p * 3) * 0.2;
        ra = -0.55 - Math.sin(p * 3) * 0.2;
        la2 = 0.3; ra2 = 0.3;
        lHip = 0.35; rHip = 0.2;
        lKnee = 0.2 - lHip; rKnee = 0.15 - rHip;
        head.y += Math.sin(p * 4) * 2;
      } else if (this.pushAnim > 0) {
        la = 1.5; la2 = 0.05;
        ra = 1.4; ra2 = 0.1;
        lHip = 0.5; rHip = -0.25;
        lKnee = -0.25; rKnee = -0.15;
      }

      if (down > 0) {
        const lieLa = -1.35, lieLa2 = -0.1;
        const lieRa = -1.5, lieRa2 = 0.35;
        const lieLHip = 1.55, lieLKnee = -0.05;
        const lieRHip = 1.25, lieRKnee = 0.95;
        la = lerp(la, lieLa, down);
        la2 = lerp(la2, lieLa2, down);
        ra = lerp(ra, lieRa, down);
        ra2 = lerp(ra2, lieRa2, down);
        lHip = lerp(lHip, lieLHip, down);
        lKnee = lerp(lKnee, lieLKnee, down);
        rHip = lerp(rHip, lieRHip, down);
        rKnee = lerp(rKnee, lieRKnee, down);
        if (combatState === 'knockdown') {
          const flail = Math.sin(downElapsed * 26) * 0.35 * down * (1 - down);
          la += flail; ra -= flail;
        }
      }

      const upperArm = 21 * s, lowerArm = 19 * s;
      const upperLeg = 22 * s, lowerLeg = 22 * s;

      function limb(origin, a1, a2, l1, l2) {
        const j = { x: origin.x + Math.sin(a1) * l1, y: origin.y + Math.cos(a1) * l1 };
        const e = { x: j.x + Math.sin(a1 + a2) * l2, y: j.y + Math.cos(a1 + a2) * l2 };
        return [origin, j, e];
      }

      const shoulder = lerpPt(chest, neck, 0.35);
      const shoulderF = { x: shoulder.x + f * 2.4 * s, y: shoulder.y + 0.6 * s };
      const shoulderB = { x: shoulder.x - f * 2.4 * s, y: shoulder.y - 0.6 * s };
      const hipF = { x: hip.x + f * 2.2 * s, y: hip.y };
      const hipB = { x: hip.x - f * 2.2 * s, y: hip.y - 0.4 * s };

      let armL, armR, legL, legR;

      if (crawling) {
        const a = Math.sin(p);
        const b2 = Math.sin(p + Math.PI);
        armL = [shoulderB,
          { x: shoulderB.x + f * (13 + a * 8) * s, y: -9 * s },
          { x: shoulderB.x + f * (28 + a * 17) * s, y: -4 * s }];
        armR = [shoulderF,
          { x: shoulderF.x + f * (13 + b2 * 8) * s, y: -9 * s },
          { x: shoulderF.x + f * (28 + b2 * 17) * s, y: -4 * s }];
        legL = [hipB,
          { x: -f * (17 + b2 * 7) * s, y: (-11 - Math.max(0, b2) * 4) * s },
          { x: -f * (33 + b2 * 11) * s, y: (-4 - Math.max(0, b2) * 8) * s }];
        legR = [hipF,
          { x: -f * (17 + a * 7) * s, y: (-11 - Math.max(0, a) * 4) * s },
          { x: -f * (33 + a * 11) * s, y: (-4 - Math.max(0, a) * 8) * s }];
      } else {
        armL = limb(shoulderB, la * f, la2 * f, upperArm, lowerArm);
        armR = limb(shoulderF, ra * f, ra2 * f, upperArm, lowerArm);
        legL = limb(hipB, lHip * f, lKnee * f, upperLeg, lowerLeg);
        legR = limb(hipF, rHip * f, rKnee * f, upperLeg, lowerLeg);
      }

      let footStyleL = 'flat', footStyleR = 'flat';
      if (crawling) {
        footStyleL = footStyleR = 'back';
      } else if (this.blown) {
        footStyleL = footStyleR = this.blown.phase === 'getup' ? 'flat' : 'point';
      } else if (fightingPose) {
        const cs = this.combat.state;
        if (cs === 'kick' || (cs === 'combo' && (this.combat.comboStep || 0) === 2)) footStyleL = 'point';
        if (cs === 'flyingkick' || cs === 'spinkick' || cs === 'sweep') footStyleL = footStyleR = 'point';
        if (cs === 'launched' || cs === 'knockdown') footStyleL = footStyleR = 'point';
        if (cs === 'strike' && /lowkick|teep|roundhouse/.test(this.combat.move)) footStyleL = 'point';
      } else if (b === 'run') {
        if (lKnee < -0.9) footStyleL = 'point';
        if (rKnee < -0.9) footStyleR = 'point';
      } else if (b === 'walk') {
        if (lKnee < -0.65) footStyleL = 'point';
        if (rKnee < -0.65) footStyleR = 'point';
      } else if (b === 'jump') {
        const airborne = this.y < H - 72 - 2;
        if (airborne) footStyleL = footStyleR = 'point';
      }

      const footLen = 7.5 * s;
      function toeFor(ankle, style) {
        let ang = f * Math.PI * 0.5;
        if (style === 'point') ang = f * (Math.PI * 0.5 - 0.55);
        else if (style === 'flex') ang = f * (Math.PI * 0.5 + 0.3);
        else if (style === 'back') ang = f * Math.PI * 1.5;
        return { x: ankle.x + Math.sin(ang) * footLen, y: ankle.y + Math.cos(ang) * footLen };
      }
      const extendHand = pts => ({
        x: pts[2].x + (pts[2].x - pts[1].x) * 0.05,
        y: pts[2].y + (pts[2].y - pts[1].y) * 0.05
      });
      const handL = extendHand(armL);
      const handR = extendHand(armR);
      const toeL = toeFor(legL[2], footStyleL);
      const toeR = toeFor(legR[2], footStyleR);

      return { head, neck, chest, hip, armL, armR, legL, legR, handL, handR, toeL, toeR, headR, s, f };
    }

    _tickFace(dt) {
      const busy = this.fighting || (this.blown && this.blown.phase !== 'down');
      if (busy) {
        this.blinkT = 0;
        return;
      }
      this.blinkT = Math.max(0, this.blinkT - dt);
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkT = 0.11;
        this.blinkTimer = 2 + Math.random() * 3;
      }
    }

    faceMood() {
      if (this.blown && (this.blown.phase === 'down' || this.blown.phase === 'getup')) return 'dizzy';
      if (this.fighting) {
        const cs = this.combat.state;
        if (cs === 'knockdown' || cs === 'launched' || cs === 'getup') return 'dizzy';
        if (cs === 'stagger') return this.combat.t > 0.08 ? 'hurt' : 'focused';
        return 'focused';
      }
      if (this.behavior === 'run') return 'determined';
      if (this.behavior === 'jump') {
        if (this.jumpPhase === 'air' || this.jumpPhase === 'rest') return 'surprised';
        if (this.jumpPhase === 'crouch') return 'braced';
      }
      return 'neutral';
    }

    faceDir(head) {
      let tx, ty;
      if (this.chatting && this.chatPartner) {
        const cp = this.chatPartner._renderPose || this.chatPartner.pose();
        tx = this.chatPartner.x + cp.head.x;
        ty = this.chatPartner.y + cp.head.y;
      } else if (this.fighting && this.foe) {
        const fp = this.foe._renderPose || this.foe.pose();
        tx = this.foe.x + fp.head.x;
        ty = this.foe.y + fp.head.y;
      } else if (lastPointer) {
        tx = lastPointer.x;
        ty = lastPointer.y;
      } else {
        tx = this.x + this.facing * 260;
        ty = this.y - 70;
      }
      const dx = tx - (this.x + head.x);
      const dy = ty - (this.y + head.y);
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    }

    drawFace(ctx, pose, headR) {
      const { head } = pose;
      const s = this.bodyScale;
      const f = this.facing;
      const eyeR = this.eyeR * Math.min(1, s + 0.1);
      const mood = this.faceMood();
      const ink = 'rgba(27, 26, 23, 0.88)';
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.1, 1.5 * s);

      if (mood === 'dizzy') {
        const r = eyeR * 0.7;
        ctx.beginPath();
        ctx.moveTo(head.x - r, head.y - r);
        ctx.lineTo(head.x + r, head.y + r);
        ctx.moveTo(head.x + r, head.y - r);
        ctx.lineTo(head.x - r, head.y + r);
        ctx.stroke();
      } else if (mood === 'hurt') {
        ctx.beginPath();
        ctx.moveTo(head.x - eyeR, head.y - eyeR * 0.55);
        ctx.lineTo(head.x + eyeR * 0.45, head.y);
        ctx.lineTo(head.x - eyeR, head.y + eyeR * 0.55);
        ctx.stroke();
      } else if (this.blinkT > 0) {
        ctx.beginPath();
        ctx.moveTo(head.x - eyeR, head.y);
        ctx.lineTo(head.x + eyeR, head.y);
        ctx.stroke();
      } else {
        const dir = this.faceDir(head);
        const pr = Math.max(1.3, eyeR * 0.4);
        const off = eyeR * 0.5;
        ctx.beginPath();
        ctx.arc(head.x + dir.x * off, head.y + dir.y * off, pr, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
      }

      const bx = head.x;
      const by = head.y - eyeR - 3.5 * s;
      ctx.beginPath();
      if (mood === 'focused') {
        ctx.moveTo(bx - 5 * s * f, by - 1.5 * s);
        ctx.lineTo(bx + 5 * s * f, by + 2 * s);
      } else if (mood === 'determined') {
        ctx.moveTo(bx - 5 * s * f, by + 1.5 * s);
        ctx.lineTo(bx + 5 * s * f, by - 1 * s);
      } else if (mood === 'surprised') {
        ctx.moveTo(bx - 4 * s * f, by - 2 * s);
        ctx.lineTo(bx + 4 * s * f, by - 2 * s);
      } else if (mood === 'dizzy') {
        ctx.moveTo(bx - 4 * s * f, by);
        ctx.lineTo(bx + 4 * s * f, by + 1.5 * s);
      } else if (mood === 'hurt') {
        ctx.moveTo(bx - 5 * s * f, by + 1.8 * s);
        ctx.lineTo(bx + 5 * s * f, by - 2.2 * s);
      }
      ctx.stroke();

      const mx = head.x + f * headR * 0.52;
      const my = head.y + headR * 0.42;
      ctx.beginPath();
      if (mood === 'surprised') {
        ctx.arc(mx, my, 2.1 * s, 0, Math.PI * 2);
      } else if (mood === 'focused') {
        ctx.moveTo(mx - 2.5 * s * f, my - 0.8 * s);
        ctx.lineTo(mx + 2.5 * s * f, my + 0.8 * s);
      } else if (mood === 'determined') {
        ctx.moveTo(mx - 3 * s * f, my);
        ctx.lineTo(mx + 3 * s * f, my - 0.6 * s);
      } else if (mood === 'dizzy') {
        ctx.moveTo(mx - 3 * s * f, my);
        ctx.quadraticCurveTo(mx, my + 2.5 * s, mx + 3 * s * f, my);
      } else if (mood === 'hurt') {
        ctx.arc(mx, my + 0.4 * s, 2.2 * s, 0, Math.PI * 2);
      } else if (mood === 'braced') {
        ctx.moveTo(mx - 2 * s * f, my);
        ctx.lineTo(mx + 2 * s * f, my);
      } else {
        ctx.moveTo(mx - 2.4 * s * f, my);
        ctx.lineTo(mx + 2.4 * s * f, my - 0.4 * s);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawShadow(ctx, level) {
      const groundY = this._surfaceY(level);
      const pose = this._renderPose || this.pose();
      const { head, neck, chest, hip, armL, armR, legL, legR, handL, handR, toeL, toeR } = pose;
      const pts = [head, neck, chest, hip, ...armL, ...armR, handL, handR, ...legL, ...legR, toeL, toeR];
      let minX = Infinity, maxX = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }
      const s = this.bodyScale;
      const air = Math.max(0, groundY - this.y);
      const fade = clamp(1 - air / 400, 0, 1);
      const alpha = 0.25 * fade * (this.blown ? 0.45 : 1);
      if (alpha <= 0.01) return;
      const rx = Math.max(16, (maxX - minX + 26 * s) * 0.55) * (1 - Math.min(air / 900, 0.28));
      const ry = Math.max(3, 5.5 * s * (1 - Math.min(air / 700, 0.45)));
      ctx.save();
      ctx.translate(this.x, groundY + 1);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(27, 26, 23, ${alpha * 0.55})`;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(27, 26, 23, ${alpha})`;
      ctx.fill();
      ctx.restore();
    }

    drawSpeedLines(ctx, pose) {
      const f = this.facing;
      const cs = this.fighting ? this.combat.state : '';
      const attacking = cs === 'punch' || cs === 'kick' || cs === 'combo' || cs === 'sweep' ||
        cs === 'uppercut' || cs === 'flyingkick' || cs === 'spinkick' || cs === 'strike';
      const running = !this.fighting && this.behavior === 'run' && !this.dragging;
      if (!running && !attacking) return;

      const p = this.phase;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(27, 26, 23, 0.38)';

      if (running) {
        const speedK = clamp((this.speedMul - 0.9) / 0.35, 0, 1);
        const lineScale = 0.8 + speedK * 0.45;
        ctx.lineWidth = 1.2 + speedK * 0.3;
        for (let i = 0; i < 4; i++) {
          const yy = pose.hip.y - 8 - i * 9 + Math.sin(p * 2 + i) * 3;
          const len = (14 + (i % 2) * 10 + Math.abs(Math.cos(p + i)) * 14) * lineScale;
          ctx.globalAlpha = (0.35 - i * 0.05) * (0.85 + speedK * 0.3);
          ctx.beginPath();
          ctx.moveTo(-f * (22 + i * 4), yy);
          ctx.lineTo(-f * (22 + len + i * 4), yy);
          ctx.stroke();
        }
      } else if (cs === 'spinkick') {
        const a0 = this.combat.spin || 0;
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 6; i++) {
          const a = a0 + (i / 6) * Math.PI * 2;
          const r0 = 26 + (i % 2) * 7;
          const r1 = r0 + 18 + (i % 3) * 8;
          ctx.globalAlpha = 0.34;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, pose.hip.y + Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a) * r1, pose.hip.y + Math.sin(a) * r1);
          ctx.stroke();
        }
      } else {
        const y = pose.hip.y - 10;
        const len = cs === 'flyingkick' ? 70 : 34;
        const n = cs === 'flyingkick' ? 5 : 3;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < n; i++) {
          const yy = y - i * 8 + Math.sin(p * 4 + i) * 2;
          ctx.globalAlpha = 0.32 - i * 0.04;
          ctx.beginPath();
          ctx.moveTo(-f * (30 + i * 5), yy);
          ctx.lineTo(-f * (30 + len + i * 5), yy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawAttackArc(ctx, pose) {
      if (reduceMotion) return;
      const cs = this.fighting ? this.combat.state : '';
      const totals = {
        punch: 0.35, kick: 0.45, combo: 0.95,
        sweep: 0.5, uppercut: 0.48, flyingkick: 0.85, spinkick: 0.55
      };
      const total = cs === 'strike' ? (STRIKES[this.combat.move]?.total || 0) : totals[cs];
      if (!total) return;
      const elapsed = total - this.combat.t;
      let start, end, limb, tip;
      if (cs === 'combo') {
        const step = this.combat.comboStep || 0;
        if (step === 0) { start = 0.04; end = 0.22; limb = pose.armR; tip = pose.handR; }
        else if (step === 1) { start = 0.3; end = 0.46; limb = pose.armL; tip = pose.handL; }
        else { start = 0.58; end = 0.8; limb = pose.legL; tip = pose.toeL; }
      } else if (cs === 'punch') {
        start = 0.08; end = 0.23; limb = pose.armR; tip = pose.handR;
      } else if (cs === 'kick') {
        start = 0.16; end = 0.32; limb = pose.legL; tip = pose.toeL;
      } else if (cs === 'uppercut') {
        start = 0.14; end = 0.3; limb = pose.armR; tip = pose.handR;
      } else if (cs === 'sweep') {
        start = 0.12; end = 0.28; limb = pose.legL; tip = pose.toeL;
      } else if (cs === 'flyingkick') {
        start = 0.16; end = 0.5; limb = pose.legL; tip = pose.toeL;
      } else if (cs === 'strike') {
        const m = STRIKES[this.combat.move];
        if (!m || !m.hits.length) return;
        const hit = m.hits[0];
        start = hit.at - 0.06;
        end = hit.at + 0.1;
        if (this.combat.move === 'chainpunch' || this.combat.move === 'elbow') {
          limb = pose.armR; tip = pose.handR;
        } else {
          limb = pose.legL; tip = pose.toeL;
        }
      } else {
        start = 0.12; end = 0.4; limb = pose.legL; tip = pose.toeL;
      }
      const k = Math.sin(Math.PI * clamp((elapsed - start) / (end - start), 0, 1));
      if (k <= 0.04) return;
      const joint = limb[1];
      const len = Math.hypot(tip.x - joint.x, tip.y - joint.y);
      if (len < 8) return;
      const base = Math.atan2(tip.y - joint.y, tip.x - joint.x);
      const sweep = 0.9 * k;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.color;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = (0.07 + i * 0.035) * k;
        ctx.lineWidth = 11 - i * 3.5;
        ctx.beginPath();
        ctx.arc(
          joint.x, joint.y, Math.max(6, len - i * 2),
          base - sweep * 0.5 - i * 0.03,
          base + sweep * 0.5 + i * 0.03
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    draw(ctx) {
      const pose = this._renderPose || this.pose();
      const { head, neck, chest, hip, armL, armR, legL, legR, handL, handR, toeL, toeR, headR } = pose;

      if (this.trail.length) {
        for (let i = 0; i < this.trail.length; i++) {
          const g = this.trail[i];
          const a = ((i + 1) / this.trail.length) * 0.28;
          const gp = g.snap;
          ctx.save();
          ctx.translate(g.x, g.y);
          if (g.spin) {
            ctx.translate(0, gp.hip.y);
            ctx.rotate(g.spin);
            ctx.translate(0, -gp.hip.y);
          }
          ctx.globalAlpha = a;
          ctx.strokeStyle = this.color;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          function ghostLimb(pts) {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1].x, pts[1].y);
            ctx.lineTo(pts[2].x, pts[2].y);
            ctx.stroke();
          }
          function ghostSegment(a, b) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          ghostLimb(gp.legL); ghostLimb(gp.legR);
          ghostLimb(gp.armL); ghostLimb(gp.armR);
          if (gp.handL) ghostSegment(gp.armL[2], gp.handL);
          if (gp.handR) ghostSegment(gp.armR[2], gp.handR);
          if (gp.toeL) ghostSegment(gp.legL[2], gp.toeL);
          if (gp.toeR) ghostSegment(gp.legR[2], gp.toeR);
          ctx.beginPath();
          ctx.moveTo(gp.hip.x, gp.hip.y);
          if (gp.chest) ctx.lineTo(gp.chest.x, gp.chest.y);
          ctx.lineTo(gp.neck.x, gp.neck.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(gp.head.x, gp.head.y, gp.headR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.save();
      ctx.translate(this.x, this.y);
      this.drawSpeedLines(ctx, pose);

      if (this.fighting && this.combat.spin) {
        ctx.translate(0, hip.y);
        ctx.rotate(this.combat.spin);
        ctx.translate(0, -hip.y);
      }

      this.drawAttackArc(ctx, pose);

      if (this.selected) {
        const rr = headR + 12;
        const ry = head.y - headR - 8;
        ctx.save();
        ctx.beginPath();
        ctx.arc(head.x, ry, rr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(247, 246, 242, 0.68)';
        ctx.lineWidth = this.primary ? 5 : 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(head.x, ry, rr, 0, Math.PI * 2);
        ctx.strokeStyle = this.primary ? 'rgba(27, 26, 23, 0.75)' : 'rgba(27, 26, 23, 0.32)';
        ctx.lineWidth = this.primary ? 2 : 1.5;
        ctx.setLineDash(this.primary ? [4, 3] : [3, 4]);
        ctx.stroke();
        ctx.restore();
      }

      if (this.fightTarget) {
        const rr = headR + 19;
        const ry = head.y - headR - 8;
        const pulse = reduceMotion ? 0.8 : 0.55 + Math.sin(performance.now() / 170) * 0.2;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.beginPath();
        ctx.arc(head.x, ry, rr, 0, Math.PI * 2);
        ctx.strokeStyle = '#a86f00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3.5;

      function strokeLimb(pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[2].x, pts[2].y);
        ctx.stroke();
      }
      function strokeSegment(a, b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      function fist(pt) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1.4, 2.1 * pose.s), 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }

      strokeLimb(legL);
      strokeLimb(legR);
      strokeLimb(armL);
      strokeLimb(armR);
      strokeSegment(legL[2], toeL);
      strokeSegment(legR[2], toeR);
      strokeSegment(armL[2], handL);
      strokeSegment(armR[2], handR);
      fist(handL);
      fist(handR);

      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(chest.x, chest.y);
      ctx.lineTo(neck.x, neck.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
      ctx.arc(head.x, head.y, this.eyeR, 0, Math.PI * 2, true);
      ctx.fillStyle = this.color;
      ctx.fill('evenodd');

      this.drawFace(ctx, pose, headR);

      if (this.hasPower) {
        const pulse = 1 + Math.sin(performance.now() / 300) * 0.08;
        const by = head.y - headR - (this.selected ? 45 : 22);
        ctx.save();
        ctx.translate(head.x, by);
        ctx.scale(pulse, pulse);
        ctx.globalAlpha = this.powerCd > 0 ? 0.35 : 1;
        ctx.beginPath();
        ctx.moveTo(3, -9);
        ctx.lineTo(-4, 1);
        ctx.lineTo(-0.5, 1);
        ctx.lineTo(-3, 9);
        ctx.lineTo(4, -1);
        ctx.lineTo(0.5, -1);
        ctx.closePath();
        ctx.fillStyle = '#ffc107';
        ctx.fill();
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }

    hit(px, py) {
      const dx = px - this.x;
      const dy = py - this.y;
      const pose = this.pose();
      const hx = this.x + pose.head.x;
      const hy = this.y + pose.head.y;
      const headHit = Math.hypot(px - hx, py - hy) < pose.headR + 8;
      if (headHit) return true;
      const crawling = this.behavior === 'crawl' && !this.dragging && !this.fighting;
      if (crawling) {
        const df = dx * this.facing;
        if (df > -45 && df < 72 && dy > -45 && dy < 8) return true;
      } else if (Math.abs(dx) < 28 && dy > -100 && dy < 8) return true;
      const fl = pose.legL[2], fr = pose.legR[2];
      if (Math.hypot(px - (this.x + fl.x), py - (this.y + fl.y)) < 14) return true;
      if (Math.hypot(px - (this.x + fr.x), py - (this.y + fr.y)) < 14) return true;
      if (Math.hypot(px - (this.x + pose.toeL.x), py - (this.y + pose.toeL.y)) < 11) return true;
      if (Math.hypot(px - (this.x + pose.toeR.x), py - (this.y + pose.toeR.y)) < 11) return true;
      if (Math.hypot(px - (this.x + pose.handL.x), py - (this.y + pose.handL.y)) < 10) return true;
      if (Math.hypot(px - (this.x + pose.handR.x), py - (this.y + pose.handR.y)) < 10) return true;
      return false;
    }

    bounds() {
      const p = this.pose();
      const pts = [p.head, p.neck, p.chest, p.hip, ...p.armL, ...p.armR, p.handL, p.handR, ...p.legL, ...p.legR, p.toeL, p.toeR];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const pt of pts) {
        if (pt.x < x0) x0 = pt.x;
        if (pt.x > x1) x1 = pt.x;
        if (pt.y < y0) y0 = pt.y;
        if (pt.y > y1) y1 = pt.y;
      }
      const pad = 10;
      return {
        x0: this.x + x0 - pad, x1: this.x + x1 + pad,
        y0: this.y + y0 - pad, y1: this.y + y1 + pad,
      };
    }
  }

  function makeBubble(text, life = 2.6) {
    return { text, age: 0, life };
  }

  function cancelChat() {
    if (!chat) return;
    const a = chat.a;
    const b = chat.b;
    for (const f of [a, b]) {
      if (!f) continue;
      f.chatting = false;
      f.chatPartner = null;
      f.bubble = null;
      f.think = 2 + Math.random() * 3;
    }
    chat = null;
    chatCd = 15 + Math.random() * 10;
  }

  function cancelChatFor(f) {
    if (chat && (chat.a === f || chat.b === f)) cancelChat();
  }

  function findChatPair() {
    if (!autonChk.checked || fightPick) return null;
    const eligible = figures.filter(f =>
      !f.chatting && !f.fighting && !f.pursuit && !f.pursuedBy &&
      !f.blown && !f.dragging && f.behavior !== 'jump' &&
      f.chatCd <= 0 && f.vy === 0 &&
      level.floorAt(f.x, f.y) >= 0 && !level.isOnStairs(f.x) &&
      Math.abs(f.y - level.surfaceAt(f.x, f.y)) <= 18
    );
    const pairs = [];
    for (let i = 0; i < eligible.length; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        const a = eligible[i];
        const b = eligible[j];
        if (level.floorAt(a.x, a.y) !== level.floorAt(b.x, b.y)) continue;
        const d = Math.abs(a.x - b.x);
        if (d >= 80 && d <= 260) pairs.push([a, b]);
      }
    }
    return pairs.length ? pick(pairs) : null;
  }

  function startChat(a, b) {
    if (chat || !a || !b) return;
    const sameStyle = a.style === b.style && STYLE_CHAT[a.style];
    const line = sameStyle && Math.random() < 0.35
      ? pick(STYLE_CHAT[a.style])
      : pick(CHAT_SCRIPT);
    chat = { a, b, phase: 'open', t: CHAT_OPEN, opener: line[0], reply: line[1] };
    for (const f of [a, b]) {
      f.chatting = true;
      f.chatPartner = f === a ? b : a;
      f.chatCd = 25 + Math.random() * 20;
      f.bubble = null;
      f.setBehavior('idle');
      f.think = 999;
      f.vy = 0;
    }
    a.facing = b.x < a.x ? -1 : 1;
    b.facing = a.x < b.x ? -1 : 1;
    a.bubble = makeBubble(line[0], CHAT_OPEN + 0.2);
  }

  function updateChat(dt) {
    if (!autonChk.checked) {
      cancelChat();
      return;
    }
    if (chatCd > 0) chatCd -= dt;
    for (const f of figures) if (f.chatCd > 0) f.chatCd -= dt;

    if (chat) {
      const { a, b } = chat;
      const floorA = a ? level.floorAt(a.x, a.y) : -1;
      const floorB = b ? level.floorAt(b.x, b.y) : -1;
      if (!a || !b || a.chatPartner !== b || b.chatPartner !== a ||
          a.fighting || b.fighting || a.blown || b.blown ||
          a.dragging || b.dragging || a.pursuit || b.pursuit ||
          a.pursuedBy || b.pursuedBy ||
          floorA < 0 || floorA !== floorB) {
        cancelChat();
        return;
      }
      for (const f of [a, b]) {
        if (f.bubble) {
          f.bubble.age += dt;
          if (f.bubble.age >= f.bubble.life) f.bubble = null;
        }
      }
      if (chat.phase === 'open') {
        chat.t -= dt;
        if (chat.t <= 0) {
          a.bubble = null;
          chat.phase = 'gap';
          chat.t = CHAT_GAP;
        }
      } else if (chat.phase === 'gap') {
        chat.t -= dt;
        if (chat.t <= 0) {
          chat.phase = 'reply';
          chat.t = CHAT_REPLY;
          b.bubble = makeBubble(chat.reply, CHAT_REPLY + 0.2);
        }
      } else {
        chat.t -= dt;
        if (chat.t <= 0) cancelChat();
      }
      return;
    }

    if (chatCd > 0) return;
    const pair = findChatPair();
    if (pair) startChat(pair[0], pair[1]);
    else chatCd = 2 + Math.random() * 2;
  }

  function wrapBubbleText(text, maxWidth) {
    ctx.save();
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
      if (lines.length === 3) break;
    }
    if (line && lines.length < 3) lines.push(line);
    if (lines.length === 3 && words.join(' ') !== lines.join(' ')) {
      let last = lines[2];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[2] = last + '…';
    }
    ctx.restore();
    return lines.length ? lines : [text];
  }

  function drawBubbles() {
    const lb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--letterbox-h')) || 0;
    const topSafe = (toolbar ? toolbar.offsetHeight : 48) + (cinematicOn ? lb + 8 : 8);
    const bottomSafe = H - (cinematicOn ? lb + 8 : 60);
    for (const f of figures) {
      const bubble = f.bubble;
      if (!bubble) continue;
      const pose = f._renderPose || f.pose();
      const head = pose.head;
      const anchor = camera.worldToScreen(
        f.x + head.x,
        f.y + head.y - pose.headR - 10
      );
      const lines = wrapBubbleText(bubble.text, 170);
      const lineH = 15;
      const padX = 10;
      const padY = 8;
      const textW = lines.reduce((max, line) => {
        ctx.save();
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        const w = ctx.measureText(line).width;
        ctx.restore();
        return Math.max(max, w);
      }, 0);
      const w = Math.min(190, Math.max(54, textW + padX * 2));
      const h = lines.length * lineH + padY * 2;
      const age = bubble.age;
      const pop = easeOut(Math.min(1, age / 0.12));
      const fade = age > bubble.life - 0.2
        ? clamp((bubble.life - age) / 0.2, 0, 1)
        : 1;
      const alpha = Math.min(1, age / 0.08) * fade;
      if (alpha <= 0.01) continue;

      let below = false;
      let boxTop = anchor.y - h - 8;
      if (boxTop < topSafe) {
        below = true;
        boxTop = anchor.y + 14;
      }
      boxTop = clamp(boxTop, topSafe, bottomSafe - h);
      const boxLeft = clamp(anchor.x - w / 2, 8, W - w - 8);
      const cx = boxLeft + w / 2;
      const cy = boxTop + h / 2;
      const tailX = clamp(anchor.x, boxLeft + 12, boxLeft + w - 12);
      const tailY = below ? boxTop : boxTop + h;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate((f.facing || 1) * 0.012);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -cy);

      ctx.shadowColor = 'rgba(27, 26, 23, 0.16)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.moveTo(tailX - 5, tailY);
      ctx.lineTo(anchor.x, anchor.y);
      ctx.lineTo(tailX + 5, tailY);
      ctx.closePath();
      ctx.fillStyle = '#fffdf6';
      ctx.fill();
      ctx.strokeStyle = '#1b1a17';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const rr = 7;
      ctx.beginPath();
      ctx.moveTo(boxLeft + rr, boxTop);
      ctx.lineTo(boxLeft + w - rr, boxTop);
      ctx.quadraticCurveTo(boxLeft + w, boxTop, boxLeft + w, boxTop + rr);
      ctx.lineTo(boxLeft + w, boxTop + h - rr);
      ctx.quadraticCurveTo(boxLeft + w, boxTop + h, boxLeft + w - rr, boxTop + h);
      ctx.lineTo(boxLeft + rr, boxTop + h);
      ctx.quadraticCurveTo(boxLeft, boxTop + h, boxLeft, boxTop + h - rr);
      ctx.lineTo(boxLeft, boxTop + rr);
      ctx.quadraticCurveTo(boxLeft, boxTop, boxLeft + rr, boxTop);
      ctx.closePath();
      ctx.fillStyle = '#fffdf6';
      ctx.fill();
      ctx.strokeStyle = '#1b1a17';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#1b1a17';
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        ctx.fillText(line, boxLeft + padX, boxTop + padY + i * lineH);
      });
      ctx.restore();
    }
  }

  function addFigure(x, y, color) {
    const f = new StickFigure(x, y, color);
    figures.push(f);
    select(f);
    return f;
  }

  function groundSpawnX() {
    const margin = 60;
    for (let i = 0; i < 8; i++) {
      const x = margin + Math.random() * Math.max(1, W - margin * 2);
      if (x < level.stairX0 - 30 || x > level.stairX1 + 30) return x;
    }
    return Math.max(margin, level.stairX0 - 80);
  }

  function selectionList() {
    return figures.filter(f => f.selected);
  }

  function floorOf(f) {
    return level.floorAt(f.x, f.y);
  }

  function pursuitSurfaceY(level, x, y) {
    if (level.isOnStairs(x)) {
      const rampY = level.stairsYAt(x);
      if (Math.abs(rampY - y) <= 22) return rampY;
    }
    return level.surfaceAt(x, y + 8);
  }

  function pursuitFloor(level, x, y) {
    if (level.isOnStairs(x) && Math.abs(y - level.stairsYAt(x)) <= 22) return -1;
    if (x >= level.mezzX0 && x <= level.mezzX1 && Math.abs(y - level.mezzY) <= 10) return 1;
    if (Math.abs(y - level.groundY) <= 10) return 0;
    return -1;
  }

  function fightTargetsFor(f) {
    const floor = floorOf(f);
    if (floor < 0) return [];
    return figures.filter(o =>
      o !== f &&
      f.isEnemy(o) &&
      !o.fighting && !o.blown && !o.dragging &&
      !o.pursuit && !o.pursuedBy &&
      floorOf(o) >= 0
    );
  }

  function stairsEnemiesFor(f) {
    if (floorOf(f) < 0) return [];
    return figures.filter(o =>
      o !== f &&
      f.isEnemy(o) &&
      !o.fighting && !o.blown && !o.dragging &&
      !o.pursuit && !o.pursuedBy &&
      level.isOnStairs(o.x)
    );
  }

  function fightTargetError(attacker, target) {
    if (!attacker.isEnemy(target)) return 'Pick another color';
    if (target.fighting) return 'Already fighting';
    if (target.blown || target.dragging) return 'Unavailable';
    if (target.pursuit || target.pursuedBy) return 'Already busy';
    if (level.isOnStairs(target.x)) return 'Target on stairs';
    return 'Pick another target';
  }

  function cancelPursuit(attacker) {
    const p = attacker.pursuit;
    if (!p) return;
    attacker.pursuit = null;
    if (attacker.behavior === 'run') attacker.setBehavior('idle');
    const target = p.target;
    if (target && target.pursuedBy === attacker) {
      target.pursuedBy = null;
      target.think = 1 + Math.random() * 2.5;
    }
  }

  function cancelPursuitsFor(f) {
    if (f.pursuit) cancelPursuit(f);
    if (f.pursuedBy) cancelPursuit(f.pursuedBy);
  }

  function beginPursuit(attacker, target) {
    cancelChatFor(attacker);
    cancelChatFor(target);
    for (const f of figures) if (f.pursuit) cancelPursuit(f);
    if (fightPick) {
      fightPick = null;
      if (canvas.style.cursor === 'crosshair') canvas.style.cursor = 'default';
    }
    attacker.pursuit = { target, t: 0, drop: false };
    target.pursuedBy = attacker;
    target.setBehavior('idle');
    target.think = 999;
    attacker.setBehavior('run');
    updateUI();
  }

  function beginFightPick(attacker) {
    for (const f of figures) if (f.pursuit) cancelPursuit(f);
    fightPick = attacker;
    if (canvas) canvas.style.cursor = 'crosshair';
    updateUI();
  }

  function cancelFightPick() {
    if (!fightPick) return;
    fightPick = null;
    if (canvas && canvas.style.cursor === 'crosshair') canvas.style.cursor = 'default';
    updateUI();
  }

  function refreshPrimary() {
    for (const o of figures) o.primary = o === selected;
  }

  function select(f) {
    for (const o of figures) o.selected = o === f;
    selected = f || null;
    refreshPrimary();
    updateUI();
  }

  function toggleSelect(f) {
    f.selected = !f.selected;
    if (f.selected) selected = f;
    else if (selected === f) selected = selectionList()[0] || null;
    refreshPrimary();
    updateUI();
  }

  function selectMany(list, additive) {
    if (!additive) for (const o of figures) o.selected = false;
    for (const f of list) f.selected = true;
    if (list.length) selected = list[list.length - 1];
    else if (!additive) selected = null;
    refreshPrimary();
    updateUI();
  }

  function updateUI() {
    const sel = selectionList();
    if (selected && !selected.selected) selected = sel.length ? sel[sel.length - 1] : null;
    if (!selected && sel.length) selected = sel[sel.length - 1];
    const has = !!selected;
    const multi = sel.length > 1;
    const styles = new Set(sel.map(f => f.style));
    const styleMixed = styles.size > 1;
    const compact = window.innerWidth <= 520;
    const narrow = window.innerWidth <= 360;
    if (fightPick && (
      fightPick !== selected ||
      fightPick.fighting || fightPick.blown || fightPick.dragging ||
      level.floorAt(fightPick.x, fightPick.y) < 0 ||
      fightTargetsFor(fightPick).length === 0
    )) {
      fightPick = null;
      if (canvas.style.cursor === 'crosshair') canvas.style.cursor = 'default';
    }
    const chaser = figures.find(f => f.pursuit);
    if (chaser && chaser !== selected) cancelPursuit(chaser);
    document.body.dataset.selection = has ? 'some' : 'none';
    document.body.dataset.fightPick = fightPick ? 'on' : 'off';
    document.body.dataset.pursuit = figures.some(f => f.pursuit) ? 'on' : 'off';
    if (dock) dock.inert = !has;
    for (const btn of actionButtons) {
      btn.disabled = !has;
      let on = false;
      if (btn.dataset.action === 'fight') {
        const armed = fightPick === selected;
        const chasing = has && !!selected.pursuit;
        on = has && (selected.fighting || armed || chasing);
        btn.disabled = !has || selected.blown;
        btn.title = armed
          ? 'Cancel target picking (Esc)'
          : chasing
            ? 'Cancel chase (Esc)'
            : selected && selected.fighting
              ? 'End duel (F)'
              : 'Fight nearest enemy or pick one (F)';
      } else if (btn.dataset.action === 'power') {
        const holder = has && selected.hasPower;
        btn.disabled = !has || selected.blown || (holder && selected.powerCd > 0);
        on = holder;
        btn.textContent = holder
          ? (narrow ? 'Power' : 'Superpower')
          : (narrow ? 'Power' : 'Give Power');
        btn.title = holder
          ? 'Blast the nearest figure or your chase target (4s cooldown)'
          : 'Grant this figure the superpower';
      } else {
        on = has && sel.every(f => !f.fighting && f.behavior === btn.dataset.action);
      }
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    if (powerBtn) {
      const cd = has && selected.hasPower && selected.powerCd > 0
        ? Math.min(1, selected.powerCd / 4) : 0;
      powerBtn.style.setProperty('--cd', cd.toFixed(3));
    }

    powerGlyph.className = '';
    if (has && selected.hasPower) {
      powerGlyph.className = selected.powerCd > 0 ? 'recharging' : 'charged';
      powerGlyph.title = selected.powerCd > 0 ? 'Superpower recharging' : 'Superpower ready';
    } else {
      powerGlyph.title = '';
    }
    revokeBtn.hidden = !(has && selected.hasPower);

    const flashing = performance.now() < statusFlash.until;
    colorPicker.disabled = !has;
    if (has) colorPicker.value = rgbToHex(selected.color);

    if (styleSelect) {
      styleSelect.value = has ? (styleMixed ? 'mixed' : sel[0].style) : lastStyle;
      const locked = has && sel.some(f => f.fighting);
      styleSelect.disabled = !has || locked;
      styleSelect.title = !has
        ? 'Fighting style'
        : locked
          ? 'Style is locked during a duel'
          : 'Fighting style';
    }

    if (flashing) {
      statusEl.textContent = statusFlash.text;
      statusEl.title = statusFlash.text;
    } else if (fightPick) {
      statusEl.textContent = compact ? 'Pick a target' : 'Pick an opponent';
      statusEl.title = 'Pick an opponent · Esc to cancel';
    } else if (has && selected.pursuit) {
      const climbing = !selected.pursuit.drop && pursuitFloor(level, selected.x, selected.y) < 0;
      statusEl.textContent = climbing
        ? (compact ? 'Climbing' : 'Climbing…')
        : (compact ? 'Chasing' : 'Chasing…');
      statusEl.title = 'Chasing target · Esc to cancel';
    } else if (!has) {
      const text = figures.length
        ? (compact ? 'Click a figure' : 'Click a figure to select')
        : (compact ? 'Add a figure' : 'Add a figure to start');
      statusEl.textContent = text;
      statusEl.title = text;
    } else {
      let mode;
      if (sel.some(f => f.fighting)) {
        mode = sel.every(f => f.fighting) ? 'dueling' : 'mixed';
      } else {
        const behaviors = new Set(sel.map(f => f.behavior));
        mode = behaviors.size === 1 ? sel[0].behavior : 'mixed';
      }
      const suffix = sel.some(f => f.dragging) ? ' · drag' : '';
      const fullText = multi
        ? `${sel.length} selected · ${mode}${suffix}`
        : `Selected · ${mode}${suffix}`;
      statusEl.textContent = compact
        ? (multi ? `${sel.length} selected` : `${mode}${suffix}`)
        : fullText;
      statusEl.title = fullText;
    }
  }

  function rgbToHex(c) {
    if (c.startsWith('#')) {
      if (c.length === 4) return '#' + [...c.slice(1)].map(ch => ch + ch).join('');
      return c;
    }
    const m = c.match(/\d+/g);
    if (!m) return '#e53935';
    return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
  }

  addBtn.addEventListener('click', () => {
    addFigure(groundSpawnX(), level.groundY, colorPicker.value);
  });

  if (autonChk) {
    autonChk.addEventListener('change', () => {
      if (!autonChk.checked) {
        cancelChat();
      } else {
        chatCd = 8 + Math.random() * 7;
      }
    });
  }

  colorPicker.addEventListener('input', () => {
    for (const f of selectionList()) f.color = colorPicker.value;
  });

  if (styleSelect) {
    styleSelect.addEventListener('change', () => {
      const style = styleSelect.value;
      if (!STYLES[style]) {
        updateUI();
        return;
      }
      lastStyle = style;
      try { localStorage.setItem('stickman.style', style); } catch (err) {}
      for (const f of selectionList()) {
        if (!f.fighting) f.style = style;
      }
      updateUI();
    });
  }

  if (sceneSelect) {
    sceneSelect.value = sceneId;
    sceneSelect.addEventListener('change', () => {
      setScene(sceneSelect.value);
      clearSplats();
    });
  }
  document.body.dataset.scene = sceneId;

  syncCinematicUI();
  if (cinematicBtn) {
    cinematicBtn.addEventListener('click', () => setCinematic(!cinematicOn));
  }

  function syncMuteUI() {
    if (!muteBtn) return;
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
    muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
    muteBtn.title = audio.muted ? 'Unmute sound (M)' : 'Mute sound (M)';
  }
  if (muteBtn) {
    syncMuteUI();
    muteBtn.addEventListener('click', () => {
      audio.unlock();
      audio.toggleMute();
      syncMuteUI();
    });
  }

  for (const btn of actionButtons) {
    btn.addEventListener('click', () => {
      if (!selected) return;
      cancelChatFor(selected);
      if (btn.dataset.action === 'power') {
        if (selected.blown) return;
        if (fightPick) cancelFightPick();
        if (!selected.hasPower) {
          selected.hasPower = true;
          audio.charge(panFor(selected.x));
          flashStatus('Power on', 2200);
        } else if (selected.powerCd > 0) {
          flashStatus('Recharging');
        } else {
          let target = null;
          if (selected.pursuit) {
            const ct = selected.pursuit.target;
            if (ct && !ct.blown && !ct.dragging) target = ct;
            else cancelPursuit(selected);
          }
          if (!target) {
            let best = Infinity;
            for (const f of figures) {
              if (f === selected || f.selected || f.dragging || f.blown) continue;
              const d = Math.abs(f.x - selected.x);
              if (d < best) { best = d; target = f; }
            }
          }
          if (!target) {
            flashStatus('No target');
          } else {
            blastFigure(selected, target, 4);
          }
        }
      } else if (btn.dataset.action === 'fight') {
        if (fightPick) {
          cancelFightPick();
          return;
        }
        if (selected.pursuit) {
          cancelPursuit(selected);
          updateUI();
          return;
        }
        if (selected.fighting) {
          endDuel(selected);
        } else {
          const selectedFloor = level.floorAt(selected.x, selected.y);
          if (selectedFloor < 0) {
            flashStatus('Pick a floor', 1800);
            return;
          }
          const enemies = fightTargetsFor(selected);
          if (!enemies.length) {
            if (stairsEnemiesFor(selected).length) flashStatus('Target on stairs', 1800);
            else flashStatus('No enemy', 2200);
            return;
          }
          if (enemies.length === 1) {
            const target = enemies[0];
            if (level.floorAt(target.x, target.y) === selectedFloor) startDuel(selected, target);
            else beginPursuit(selected, target);
            return;
          }
          beginFightPick(selected);
          return;
        }
      } else {
        if (fightPick) cancelFightPick();
        for (const f of selectionList()) {
          cancelChatFor(f);
          if (f.pursuedBy) cancelPursuit(f.pursuedBy);
          if (f.pursuit) cancelPursuit(f);
          if (f.fighting) endDuel(f);
          f.setBehavior(btn.dataset.action);
          f.think = 4 + Math.random() * 4;
        }
      }
      updateUI();
    });
  }

  revokeBtn.addEventListener('click', () => {
    if (!selected || !selected.hasPower) return;
    selected.hasPower = false;
    selected.powerCd = 0;
    flashStatus('Power off', 1600);
    updateUI();
  });

  const KEY_ACTIONS = {
    '1': 'idle', '2': 'crawl', '3': 'walk', '4': 'run', '5': 'jump',
    f: 'fight', p: 'power',
  };
  document.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      if (fightPick) {
        e.preventDefault();
        cancelFightPick();
        return;
      }
      const chaser = figures.find(f => f.pursuit);
      if (chaser) {
        e.preventDefault();
        cancelPursuit(chaser);
        updateUI();
        return;
      }
    }
    if (key === 'm') {
      e.preventDefault();
      audio.unlock();
      audio.toggleMute();
      syncMuteUI();
      return;
    }
    if (key === 'c') {
      e.preventDefault();
      setCinematic(!cinematicOn);
      flashStatus(cinematicOn ? 'Cinema on' : 'Cinema off', 1100);
      return;
    }
    if (key === 'a') {
      e.preventDefault();
      addBtn.click();
      return;
    }
    if (key === 'r') {
      if (!revokeBtn.hidden) {
        e.preventDefault();
        revokeBtn.click();
      }
      return;
    }
    const action = KEY_ACTIONS[key];
    if (!action) return;
    const btn = actionButtons.find(b => b.dataset.action === action);
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  });

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  }

  canvas.addEventListener('pointerdown', e => {
    const { x, y } = pointerPos(e);
    lastPointer = { x, y };
    if (fightPick) {
      let hitTarget = null;
      for (let i = figures.length - 1; i >= 0; i--) {
        if (figures[i].hit(x, y)) { hitTarget = figures[i]; break; }
      }
      if (!hitTarget || hitTarget === fightPick) {
        cancelFightPick();
        return;
      }
      const attacker = fightPick;
      if (fightTargetsFor(attacker).includes(hitTarget)) {
        const af = level.floorAt(attacker.x, attacker.y);
        if (af < 0) {
          cancelFightPick();
          flashStatus('Pick a floor', 1600);
          return;
        }
        cancelFightPick();
        if (level.floorAt(hitTarget.x, hitTarget.y) === af) startDuel(attacker, hitTarget);
        else beginPursuit(attacker, hitTarget);
      } else {
        flashStatus(fightTargetError(attacker, hitTarget), 1600);
      }
      return;
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let hitFig = null;
    for (let i = figures.length - 1; i >= 0; i--) {
      if (figures[i].hit(x, y)) { hitFig = figures[i]; break; }
    }
    if (hitFig) {
      if (hitFig.blown) {
        hitFig.blown = null;
        hitFig.vy = 0;
        hitFig.bodyScale = 1;
      }
      if (additive) {
        toggleSelect(hitFig);
        return;
      }
      if (!hitFig.selected) select(hitFig);
      else {
        selected = hitFig;
        refreshPrimary();
        updateUI();
      }
      const group = selectionList();
      for (const f of group) {
        cancelChatFor(f);
        if (f.pursuit) cancelPursuit(f);
        if (f.pursuedBy) cancelPursuit(f.pursuedBy);
      }
      for (const f of group) f.dragging = true;
      drag = { moved: false, sx: x, sy: y, items: group.map(f => ({ f, x: f.x, y: f.y })) };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      updateUI();
    } else {
      marquee = { x0: x, y0: y, x1: x, y1: y, add: additive, moved: false };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'crosshair';
    }
  });

  canvas.addEventListener('pointermove', e => {
    const { x, y } = pointerPos(e);
    lastPointer = { x, y };
    if (drag) {
      const dx = x - drag.sx;
      const dy = y - drag.sy;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      for (const it of drag.items) {
        it.f.x = clamp(it.x + dx, 30, W - 30);
        it.f.y = clamp(it.y + dy, 20, H - 10);
        it.f.vy = 0;
      }
      return;
    }
    if (marquee) {
      marquee.x1 = x;
      marquee.y1 = y;
      if (Math.abs(x - marquee.x0) > 3 || Math.abs(y - marquee.y0) > 3) marquee.moved = true;
      return;
    }
    if (fightPick) {
      canvas.style.cursor = 'crosshair';
      return;
    }
    let hovering = false;
    for (const f of figures) {
      if (f.hit(x, y)) { hovering = true; break; }
    }
    canvas.style.cursor = hovering ? 'grab' : 'default';
  });

  function endDrag(e) {
    if (drag) {
      for (const it of drag.items) {
        it.f.dragging = false;
        it.f.vy = 0;
      }
      drag = null;
      canvas.style.cursor = 'default';
      updateUI();
      return;
    }
    if (marquee) {
      const m = marquee;
      marquee = null;
      canvas.style.cursor = 'default';
      const x0 = Math.min(m.x0, m.x1);
      const x1 = Math.max(m.x0, m.x1);
      const y0 = Math.min(m.y0, m.y1);
      const y1 = Math.max(m.y0, m.y1);
      if (m.moved && x1 - x0 > 6 && y1 - y0 > 6) {
        const picked = figures.filter(f => {
          const b = f.bounds();
          return !(x1 < b.x0 || x0 > b.x1 || y1 < b.y0 || y0 > b.y1);
        });
        selectMany(picked, m.add);
      } else if (!m.add) {
        select(null);
      }
      updateUI();
    }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  addFigure(Math.max(80, level.stairX0 - 120), level.groundY, '#e53935');

  let last = performance.now();
  let lastUITime = 0;

  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000);
    last = now;

    let dt = rdt;
    if (freezeT > 0) {
      freezeT -= rdt;
      dt = 0;
    } else if (slowmoT > 0) {
      slowmoT = Math.max(0, slowmoT - rdt);
      const k = 1 - slowmoT / slowmoDur;
      const eased = k * k * (3 - 2 * k);
      dt = rdt * lerp(slowmoScale, 1, eased);
    }

    if (dt > 0) {
      for (const f of figures) f.update(dt, level);
      updateChat(dt);
      updateBirds(dt);
      updateEffects(dt);
      updateSplats(dt);
    }

    for (const f of figures) f._renderPose = f.pose();
    const pickTargets = fightPick ? new Set(fightTargetsFor(fightPick)) : null;
    for (const f of figures) {
      f.fightTarget = !!(f.pursuedBy || (pickTargets && pickTargets.has(f)));
    }

    updateCinematic(rdt);
    camera.update(rdt);

    const stamp = utcStamp();
    if (stamp !== celestialStamp) {
      celestialStamp = stamp;
      sceneDirty = true;
    }
    if (sceneDirty) renderScene();

    ctx.save();
    if (shakeAmt > 0.4) {
      ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
    }
    camera.apply(ctx);
    ctx.drawImage(sceneCanvas, 0, 0, W, H);

    drawBirds(ctx);
    drawSplats();
    for (const f of figures) f.drawShadow(ctx, level);
    for (const f of figures) f.draw(ctx);

    if (marquee && marquee.moved) {
      const mx0 = Math.min(marquee.x0, marquee.x1);
      const my0 = Math.min(marquee.y0, marquee.y1);
      const mw = Math.abs(marquee.x1 - marquee.x0);
      const mh = Math.abs(marquee.y1 - marquee.y0);
      ctx.save();
      ctx.fillStyle = 'rgba(27, 26, 23, 0.05)';
      ctx.fillRect(mx0, my0, mw, mh);
      ctx.strokeStyle = 'rgba(27, 26, 23, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(mx0 + 0.5, my0 + 0.5, mw, mh);
      ctx.restore();
    }

    drawEffects();

    ctx.restore();

    drawBubbles();

    if (shakeAmt > 0.4) {
      shakeAmt *= Math.pow(0.0005, rdt);
    } else {
      shakeAmt = 0;
    }

    if (inkFlash > 0) {
      ctx.save();
      ctx.globalAlpha = inkFlash;
      ctx.fillStyle = flashTint;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      inkFlash = Math.max(0, inkFlash - rdt * 8);
    }

    if (selected && selected.hasPower && selected.powerCd > 0) {
      powerBtn.style.setProperty('--cd', Math.min(1, selected.powerCd / 4).toFixed(3));
    }
    if (now - lastUITime >= 100) {
      updateUI();
      lastUITime = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
