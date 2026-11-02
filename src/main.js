import { audio } from './audio.js';

(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const addBtn = document.getElementById('addBtn');
  const colorPicker = document.getElementById('colorPicker');
  const actionButtons = [...document.querySelectorAll('#toolbar [data-action]')];
  const powerBtn = actionButtons.find(b => b.dataset.action === 'power');
  const statusEl = document.getElementById('readoutText');
  const selSwatch = document.getElementById('selSwatch');
  const powerGlyph = document.getElementById('powerGlyph');
  const revokeBtn = document.getElementById('revokeBtn');
  const muteBtn = document.getElementById('muteBtn');
  const autonChk = document.getElementById('autonChk');
  const sceneSelect = document.getElementById('sceneSelect');
  let statusFlash = { text: '', until: 0 };
  function flashStatus(text, ms = 1800) {
    statusFlash = { text, until: performance.now() + ms };
  }

  let W = 0, H = 0, DPR = 1;
  const figures = [];
  let selected = null;
  let drag = null;
  let marquee = null;
  let lastPointer = null;
  const bg = '#f7f6f2';

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
  const sceneCanvas = document.createElement('canvas');
  const sceneCtx = sceneCanvas.getContext('2d');
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
    const gy = H - 70;
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
      sceneCtx.globalAlpha = sc.veil;
      sceneCtx.fillStyle = bg;
      sceneCtx.fillRect(0, 0, W, H);
      sceneCtx.globalAlpha = 1;
      drawGround(sceneCtx, true);
    } else {
      sceneCtx.fillStyle = bg;
      sceneCtx.fillRect(0, 0, W, H);
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

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    sceneDirty = true;
    splats.length = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const groundY = H - 70;
    for (const f of figures) {
      if (f.y > groundY) f.y = groundY;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  const lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const lerpChain = (a, b, t) => a.map((p, i) => lerpPt(p, b[i], t));
  const panFor = x => clamp(((x / Math.max(1, W)) * 2 - 1) * 0.7, -0.7, 0.7);
  function blendPose(a, b, t) {
    return {
      head: lerpPt(a.head, b.head, t),
      neck: lerpPt(a.neck, b.neck, t),
      hip: lerpPt(a.hip, b.hip, t),
      armL: lerpChain(a.armL, b.armL, t),
      armR: lerpChain(a.armR, b.armR, t),
      legL: lerpChain(a.legL, b.legL, t),
      legR: lerpChain(a.legR, b.legR, t),
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
    a.startFight(b);
    b.startFight(a);
    a.trail.length = 0; b.trail.length = 0;
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
  }

  function blastFigure(caster, target, cd = 4) {
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
    flashStatus('Blast!', 1000);
  }

  class StickFigure {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
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
      this.trail = [];
      this.combat = {
        state: 'idle', t: 0, cd: 0.4 + Math.random() * 0.6,
        hitDone: false, kbx: 0, spin: 0, hits: 0, snap: false, react: null, landed: false
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
    }

    isEnemy(o) {
      return o !== this && o.color.toLowerCase() !== this.color.toLowerCase();
    }

    resetCombat() {
      this.combat = {
        state: 'ready', t: 0, cd: 0.4 + Math.random() * 0.6,
        hitDone: false, kbx: 0, spin: 0, hits: 0, snap: false, react: null, landed: false
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
      this.trail.length = 0;
      this.combat = { state: 'idle', t: 0, cd: 0, hitDone: false, kbx: 0, spin: 0, hits: 0, snap: false, react: null, landed: false };
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

    randomizeBehavior(dt) {
      if (this.dragging) return;
      if (this.fighting) return;
      if (this.blown) return;
      if (!autonChk.checked) return;
      if (this.y < H - 72) return;
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

    update(dt, groundY) {
      this._update(dt, groundY);
      this._tickBlend(dt);
    }

    _update(dt, groundY) {
      this._tickFace(dt);
      this.randomizeBehavior(dt);
      const speed = this.speedMul;
      if (this.powerCd > 0) this.powerCd -= dt;
      if (this.pushAnim > 0) this.pushAnim -= dt;

      if (this.dragging) {
        this.vy = 0;
        this.phase += dt * 2;
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
            spawnDust(this.x, this.y, 6);
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
            spawnDust(this.x, this.y, 6);
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
            this.restT = this.jumpRest;
            this.jumpT = 0;
            spawnDust(this.x, this.y, 6);
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
        this.updateFight(dt, groundY);
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
          audio.step(panFor(this.x), this.behavior === 'run');
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
      const combat = this.fighting ? this.combat.state : '-';
      const blasted = this.blown ? this.blown.phase : '-';
      return `${this.behavior}|${combat}|${blasted}|${this.dragging ? 'drag' : ''}`;
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
          else if (/punch|kick|combo|sweep|uppercut/.test(key)) this.blendDur = 0.09;
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
        spawnSplat(midX + dir * 8, H - 70, clamp(0.85 + kbx / 500, 0.85, 1.5));
      }
      if (knocked || kbx >= 150) requestFlash(knocked ? 0.22 : 0.16, '#ffd54f');
      audio.hit(reactKind, clamp(0.75 + kbx / 420, 0.75, 1.35), panFor(midX));
      if (knocked && kbx >= 240) audio.ko(panFor(enemy.x));
    }

    updateFight(dt, groundY) {
      const c = this.combat;
      c.t -= dt;
      this.phase += dt * 8;
      if (c.state !== this._lastCombatState) {
        this._lastCombatState = c.state;
        if (/punch|kick|combo|spinkick|sweep|uppercut|flyingkick/.test(c.state)) {
          audio.whoosh(panFor(this.x), /spinkick|flyingkick/.test(c.state) ? 1.2 : 0.8);
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
        this.x = clamp(this.x, 50, W - 50);
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
        this.x = clamp(this.x, 50, W - 50);
      }

      if (enemy.blown) {
        c.state = 'ready';
        c.t = 0;
        c.cd = Math.max(c.cd, 0.2);
        c.hitDone = false;
        c.spin = 0;
        this.trail.length = 0;
        return;
      }

      const airborne = this.y < groundY - 2;
      const trailStates = ['flyingkick', 'spinkick', 'punch', 'kick', 'combo', 'uppercut'];
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
          spawnDust(this.x, this.y, 4);
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
          spawnDust(this.x, this.y, 6);
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
        this.x = clamp(this.x, 50, W - 50);
        return;
      }

      if (c.state === 'dodge') {
        this.x += this.facing * -95 * dt;
        if (c.t <= 0) { c.state = 'ready'; c.cd = 0.45 + Math.random() * 0.45; }
        this.x = clamp(this.x, 50, W - 50);
        return;
      }

      if (c.state === 'block') {
        if (c.t <= 0) { c.state = 'ready'; c.cd = 0.35 + Math.random() * 0.35; }
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
          this.x = clamp(this.x, 50, W - 50);
          if (!c.kickDone && elapsed > 0.24 && Math.abs(enemy.x - this.x) <= 130) {
            c.kickDone = true;
            this.landHit(enemy, { range: 130, kbx: 280, kdChance: 0.4, freeze: 0.07, shake: 10, starScale: 1.4 });
            c.lungeV *= 0.3;
          }
        }
        if (c.hitDone && !airborne && elapsed > 0.3) {
          spawnDust(this.x, this.y, 5);
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
        this.x = clamp(this.x, 50, W - 50);
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
        this.x = clamp(this.x, 50, W - 50);
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
        this.x = clamp(this.x, 50, W - 50);
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
        this.x = clamp(this.x, 50, W - 50);
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
        this.x = clamp(this.x, 50, W - 50);
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
        this.x = clamp(this.x, 50, W - 50);
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
      const enemyAttacking = ['punch', 'kick', 'flyingkick', 'spinkick', 'sweep', 'uppercut', 'combo'].includes(eState);
      if (enemyAttacking && dist < 125 && Math.random() < 0.06) {
        if (Math.random() < 0.45) {
          c.state = 'block';
          c.t = 0.45;
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

    pose() {
      const target = this.computePose();
      this._lastPose = target;
      if (!this.prevPose || this.blendT >= 1) return target;
      const t = this.blendT * this.blendT * (3 - 2 * this.blendT);
      return blendPose(this.prevPose, target, t);
    }

    computePose() {
      const s = this.bodyScale;
      const p = this.phase;
      const headR = this.headR * s;
      const f = this.facing;
      const b = this.behavior;
      const crawling = b === 'crawl' && !this.dragging && !this.fighting;
      const hipY = (crawling ? -14 : -38) * s;

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
        else if (cs === 'launched') lean = -0.35 * f;
        else if (cs === 'getup') lean = 0.1 * f;
        else lean = 0.1 * f;
      }

      let bounce = 0;
      if (!this.dragging && !crawling) {
        if (b === 'run') bounce = Math.abs(Math.cos(p)) * 5 * s;
        else if (b === 'walk') bounce = Math.abs(Math.cos(p)) * 1.5 * s;
      }

      let hip, neck, head;
      const fightingPose = this.fighting && !this.dragging;
      const combatState = fightingPose ? this.combat.state : '';
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
      const neckLocal = rot(0, -34 * s, lean);
      neck = { x: hip.x + neckLocal.x, y: hip.y + neckLocal.y };
      head = crawling
        ? { x: neck.x + f * (headR + 5), y: neck.y - 3 * s }
        : { x: neck.x, y: neck.y - headR - 6 };
      if (reactHold > 0) {
        head.x -= f * (2 + 5 * reactHold);
        head.y += 1.5 * reactHold + 1.5 * reactSettle;
      }

      if (down > 0) {
        const lieAngle = -1.5 * f;
        const lieHip = { x: -6 * f, y: -10 * s + breath };
        const lieNeckLocal = rot(0, -34 * s, lieAngle);
        const lieNeck = { x: lieHip.x + lieNeckLocal.x, y: lieHip.y + lieNeckLocal.y };
        const lieHeadLocal = rot(0, -(headR + 6), lieAngle);
        const lieHead = { x: lieNeck.x + lieHeadLocal.x, y: lieNeck.y + lieHeadLocal.y };
        hip = lerpPt(hip, lieHip, down);
        neck = lerpPt(neck, lieNeck, down);
        head = lerpPt(head, lieHead, down);
        hip.y += settle * down;
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
        const bob = Math.sin(p * 2) * 0.04;
        lHip = 0.45 + bob; rHip = -0.35;
        lKnee = -0.55; rKnee = -0.25;
        la = 0.9; la2 = -0.5;
        ra = -0.4; ra2 = 1.5;

        if (cs === 'punch') {
          const e = 0.35 - this.combat.t;
          const prog = Math.min(clamp(e / 0.18, 0, 1), 1 - clamp((e - 0.18) / 0.12, 0, 1));
          la = lerp(0.9, 0.35, prog); la2 = lerp(-0.5, 1.2, prog);
          ra = lerp(-0.4, 1.5, prog); ra2 = lerp(1.5, 0, prog);
        } else if (cs === 'kick') {
          const e = 0.45 - this.combat.t;
          const prog = Math.min(clamp(e / 0.25, 0, 1), 1 - clamp((e - 0.25) / 0.14, 0, 1));
          lHip = lerp(0.45, 1.3, prog); lKnee = lerp(-0.55, -0.12, prog);
          rHip = -0.25; rKnee = -0.35;
          la = lerp(0.9, -0.8, prog); la2 = lerp(-0.5, 0.3, prog);
          ra = lerp(-0.4, 0.9, prog); ra2 = lerp(1.5, 0.35, prog);
        } else if (cs === 'combo') {
          const step = this.combat.comboStep || 0;
          const e = 0.95 - this.combat.t;
          if (step === 0) {
            const prog = Math.min(clamp(e / 0.10, 0, 1), 1 - clamp((e - 0.14) / 0.10, 0, 1));
            ra = lerp(-0.4, 1.5, prog); ra2 = lerp(1.5, 0, prog);
            la = 0.85; la2 = -0.4;
          } else if (step === 1) {
            const e2 = e - 0.3;
            const prog = Math.min(clamp(e2 / 0.08, 0, 1), 1 - clamp((e2 - 0.12) / 0.10, 0, 1));
            la = lerp(0.9, 1.5, prog); la2 = lerp(-0.5, 0, prog);
            ra = lerp(1.5, -0.35, prog); ra2 = lerp(0, 1.4, prog);
          } else {
            const e3 = e - 0.58;
            const prog = Math.min(clamp(e3 / 0.12, 0, 1), 1 - clamp((e3 - 0.16) / 0.14, 0, 1));
            lHip = lerp(0.45, 1.35, prog); lKnee = lerp(-0.55, -0.1, prog);
            la = lerp(0.9, -0.85, prog); la2 = lerp(-0.5, 0.35, prog);
            ra = lerp(-0.35, 0.95, prog); ra2 = lerp(1.4, 0.3, prog);
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
          rHip = -0.5; rKnee = 0.9;
          la = -0.6; la2 = 0.9;
          ra = 0.4; ra2 = 1.1;
        } else if (cs === 'uppercut') {
          const elapsed = 0.48 - this.combat.t;
          if (elapsed < 0.16) {
            la = 0.75; la2 = 0.6;
            ra = 0.4; ra2 = 0.9;
            lHip = 0.7; rHip = 0.55;
            lKnee = 0.4 - lHip; rKnee = 0.35 - rHip;
          } else {
            const prog = Math.min(clamp((elapsed - 0.16) / 0.1, 0, 1), 1 - clamp((elapsed - 0.26) / 0.14, 0, 1));
            la = lerp(0.75, 0.5, prog); la2 = lerp(0.6, 0.5, prog);
            ra = lerp(0.4, -1.35, prog); ra2 = lerp(0.9, 0.15, prog);
            lHip = lerp(0.7, 0.15, prog); rHip = lerp(0.55, -0.1, prog);
            lKnee = lerp(0.4 - 0.7, -0.2, prog); rKnee = lerp(0.35 - 0.55, -0.15, prog);
          }
        } else if (cs === 'block') {
          lHip = 0.35; lKnee = -0.6;
          la = 0.65; la2 = 1.45;
          ra = 0.75; ra2 = 1.4;
        } else if (cs === 'stagger') {
          const dur = this.combat.reactDur || 0.35;
          const rt = clamp(1 - this.combat.t / dur, 0, 1);
          const stepLift = Math.sin(Math.PI * clamp(rt / 0.55, 0, 1)) * reactHold;
          la = lerp(0.9, 1.45, reactHold) + reactWobble;
          la2 = lerp(-0.5, 1.25, reactHold);
          ra = lerp(-0.4, -0.88, reactHold) - reactWobble;
          ra2 = lerp(1.5, 0.5, reactHold);
          lHip = lerp(0.45, 0.6, reactHold);
          rHip = lerp(-0.35, -0.85, reactHold) - 0.1 * stepLift;
          lKnee = lerp(-0.55, -0.45, reactHold);
          rKnee = lerp(-0.25, -0.35, reactHold) - 0.35 * stepLift;
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
        } else {
          la = 0.9 + bob; la2 = -0.5;
          ra = -0.4 - bob; ra2 = 1.5;
        }
      } else if (b === 'walk') {
        const sw = Math.sin(p);
        lHip = sw * 0.7; rHip = -sw * 0.7;
        lKnee = -(0.1 + 0.95 * Math.max(0, Math.cos(p - 0.5)));
        rKnee = -(0.1 + 0.95 * Math.max(0, Math.cos(p + Math.PI - 0.5)));
        la = 0.08 - sw * 0.45;
        ra = 0.08 + sw * 0.45;
        la2 = 0.3; ra2 = 0.3;
      } else if (b === 'run') {
        const sw = Math.sin(p);
        lHip = sw; rHip = -sw;
        lKnee = -(0.35 + 1.65 * Math.max(0, Math.cos(p - 0.3)));
        rKnee = -(0.35 + 1.65 * Math.max(0, Math.cos(p + Math.PI - 0.3)));
        la = 0.35 - sw * 0.7;
        ra = 0.35 + sw * 0.7;
        la2 = 1.1; ra2 = 1.1;
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
        const idle = Math.sin(p * 0.9);
        la = 0.12 + idle * 0.08;
        ra = 0.12 - idle * 0.08;
        la2 = 0.28; ra2 = 0.28;
        lHip = 0; rHip = 0; lKnee = 0; rKnee = 0;
        head.y += idle * 1.2;
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

      const upperArm = 24 * s, lowerArm = 22 * s;
      const upperLeg = 22 * s, lowerLeg = 22 * s;

      function limb(origin, a1, a2, l1, l2) {
        const j = { x: origin.x + Math.sin(a1) * l1, y: origin.y + Math.cos(a1) * l1 };
        const e = { x: j.x + Math.sin(a1 + a2) * l2, y: j.y + Math.cos(a1 + a2) * l2 };
        return [origin, j, e];
      }

      let armL, armR, legL, legR;

      if (crawling) {
        const a = Math.sin(p);
        const b2 = Math.sin(p + Math.PI);
        armL = [neck,
          { x: neck.x + f * (13 + a * 8) * s, y: -9 * s },
          { x: neck.x + f * (28 + a * 17) * s, y: -4 * s }];
        armR = [neck,
          { x: neck.x + f * (13 + b2 * 8) * s, y: -9 * s },
          { x: neck.x + f * (28 + b2 * 17) * s, y: -4 * s }];
        legL = [hip,
          { x: -f * (17 + b2 * 7) * s, y: (-11 - Math.max(0, b2) * 4) * s },
          { x: -f * (33 + b2 * 11) * s, y: (-4 - Math.max(0, b2) * 8) * s }];
        legR = [hip,
          { x: -f * (17 + a * 7) * s, y: (-11 - Math.max(0, a) * 4) * s },
          { x: -f * (33 + a * 11) * s, y: (-4 - Math.max(0, a) * 8) * s }];
      } else {
        armL = limb(neck, la * f, la2 * f, upperArm, lowerArm);
        armR = limb(neck, ra * f, ra2 * f, upperArm, lowerArm);
        legL = limb(hip, lHip * f, lKnee * f, upperLeg, lowerLeg);
        legR = limb(hip, rHip * f, rKnee * f, upperLeg, lowerLeg);
      }

      return { head, neck, hip, armL, armR, legL, legR, headR, s, f };
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
      if (this.fighting && this.foe) {
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

    drawShadow(ctx, groundY) {
      const pose = this._renderPose || this.pose();
      const { head, neck, hip, armL, armR, legL, legR } = pose;
      const pts = [head, neck, hip, ...armL, ...armR, ...legL, ...legR];
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
        cs === 'uppercut' || cs === 'flyingkick' || cs === 'spinkick';
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

    draw(ctx) {
      const pose = this._renderPose || this.pose();
      const { head, neck, hip, armL, armR, legL, legR, headR } = pose;

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
          ghostLimb(gp.legL); ghostLimb(gp.legR);
          ghostLimb(gp.armL); ghostLimb(gp.armR);
          ctx.beginPath();
          ctx.moveTo(gp.hip.x, gp.hip.y);
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

      strokeLimb(legL);
      strokeLimb(legR);
      strokeLimb(armL);
      strokeLimb(armR);

      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
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
      return false;
    }

    bounds() {
      const p = this.pose();
      const pts = [p.head, p.neck, p.hip, ...p.armL, ...p.armR, ...p.legL, ...p.legR];
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

  function addFigure(x, y, color) {
    const f = new StickFigure(x, y, color);
    figures.push(f);
    select(f);
    return f;
  }

  function selectionList() {
    return figures.filter(f => f.selected);
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
    for (const btn of actionButtons) {
      btn.disabled = !has;
      let on = false;
      if (btn.dataset.action === 'fight') {
        on = has && selected.fighting;
        btn.disabled = !has || selected.blown;
      } else if (btn.dataset.action === 'power') {
        const holder = has && selected.hasPower;
        btn.disabled = !has || selected.blown || (holder && selected.powerCd > 0);
        on = holder;
        btn.textContent = holder ? 'Superpower' : 'Give Power';
        btn.title = holder
          ? 'Blast the nearest figure into the wall (4s cooldown)'
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

    selSwatch.hidden = !has;
    if (has) selSwatch.style.background = selected.color;
    powerGlyph.className = '';
    if (has && selected.hasPower) {
      powerGlyph.className = selected.powerCd > 0 ? 'recharging' : 'charged';
      powerGlyph.title = selected.powerCd > 0 ? 'Superpower recharging' : 'Superpower ready';
    } else {
      powerGlyph.title = '';
    }
    revokeBtn.hidden = !(has && selected.hasPower);

    const flashing = performance.now() < statusFlash.until;
    if (!has) {
      if (flashing) {
        statusEl.textContent = statusFlash.text;
      } else {
        statusEl.textContent = figures.length
          ? 'Click a figure to select'
          : 'Add a figure to start';
      }
      colorPicker.disabled = true;
    } else {
      if (flashing) {
        statusEl.textContent = statusFlash.text;
      } else {
        let mode;
        if (sel.some(f => f.fighting)) {
          mode = sel.every(f => f.fighting) ? 'dueling' : 'mixed';
        } else {
          const behaviors = new Set(sel.map(f => f.behavior));
          mode = behaviors.size === 1 ? sel[0].behavior : 'mixed';
        }
        const suffix = sel.some(f => f.dragging) ? ' · drag' : '';
        statusEl.textContent = multi
          ? `${sel.length} selected · ${mode}${suffix}`
          : `Selected · ${mode}${suffix}`;
      }
      colorPicker.disabled = false;
      colorPicker.value = rgbToHex(selected.color);
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
    const margin = 60;
    const x = margin + Math.random() * Math.max(1, W - margin * 2);
    addFigure(x, H - 70, colorPicker.value);
  });

  colorPicker.addEventListener('input', () => {
    for (const f of selectionList()) f.color = colorPicker.value;
  });

  if (sceneSelect) {
    sceneSelect.value = sceneId;
    sceneSelect.addEventListener('change', () => {
      setScene(sceneSelect.value);
      clearSplats();
    });
  }
  document.body.dataset.scene = sceneId;

  function syncMuteUI() {
    if (!muteBtn) return;
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
    muteBtn.textContent = audio.muted ? 'Muted' : 'Sound';
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
      if (btn.dataset.action === 'power') {
        if (selected.blown) return;
        if (!selected.hasPower) {
          selected.hasPower = true;
          audio.charge(panFor(selected.x));
          flashStatus('Superpower granted! Click again to blast', 2200);
        } else if (selected.powerCd > 0) {
          flashStatus('Superpower recharging…');
        } else {
          let target = null, best = Infinity;
          for (const f of figures) {
            if (f === selected || f.selected || f.dragging || f.blown) continue;
            const d = Math.abs(f.x - selected.x);
            if (d < best) { best = d; target = f; }
          }
          if (!target) {
            flashStatus('No one to blast');
          } else {
            blastFigure(selected, target, 4);
          }
        }
      } else if (btn.dataset.action === 'fight') {
        if (selected.fighting) {
          endDuel(selected);
        } else {
          const enemies = figures.filter(f =>
            f !== selected && selected.isEnemy(f) && !f.fighting && !f.blown && !f.dragging);
          if (!enemies.length) {
            flashStatus('No enemy to fight — add a figure of another color', 1800);
            return;
          }
          let nearest = enemies[0];
          let best = Math.abs(nearest.x - selected.x);
          for (const e of enemies) {
            const d = Math.abs(e.x - selected.x);
            if (d < best) { best = d; nearest = e; }
          }
          startDuel(selected, nearest);
        }
      } else {
        for (const f of selectionList()) {
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
    flashStatus('Superpower removed', 1600);
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
    if (key === 'm') {
      e.preventDefault();
      audio.unlock();
      audio.toggleMute();
      syncMuteUI();
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
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointerdown', e => {
    const { x, y } = pointerPos(e);
    lastPointer = { x, y };
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

  addFigure(W / 2, H - 70, '#e53935');

  let last = performance.now();
  let lastUITime = 0;

  function frame(now) {
    const rdt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const groundY = H - 70;

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
      for (const f of figures) f.update(dt, groundY);
      updateEffects(dt);
      updateSplats(dt);
    }

    for (const f of figures) f._renderPose = f.pose();

    if (sceneDirty) renderScene();
    ctx.drawImage(sceneCanvas, 0, 0, W, H);

    if (shakeAmt > 0.4) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);
    }

    drawSplats();
    for (const f of figures) f.drawShadow(ctx, groundY);
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

    if (shakeAmt > 0.4) {
      ctx.restore();
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
