import { audio } from './audio.js';
import { Camera } from './camera.js';
import { Level } from './level.js';
import {
  GRAVITY, WALK_SPEED, RUN_SPEED, EDGE_MARGIN,
  STRIDE_WALK, STRIDE_RUN,
  clamp, lerp, smoothstep, easeOut, pick
} from './constants.js';
import { readStorage, writeStorage } from './storage.js';

(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const addBtn = document.getElementById('addBtn');
  const colorPicker = document.getElementById('colorPicker');
  const paletteBtn = document.getElementById('paletteBtn');
  const palettePanel = document.getElementById('palettePanel');
  const paletteSwatches = [...document.querySelectorAll('.palette-swatch')];
  const actionButtons = [...document.querySelectorAll('#toolbar [data-action], #dock [data-action]')];
  const blastBtn = actionButtons.find(b => b.dataset.action === 'blast');
  const statusEl = document.getElementById('readoutText');
  const powerGlyph = document.getElementById('powerGlyph');
  const revokeBtn = document.getElementById('revokeBtn');
  const removeBtn = document.getElementById('removeBtn');
  const muteBtn = document.getElementById('muteBtn');
  const autonChk = document.getElementById('autonChk');
  const chaosBtn = document.getElementById('chaosBtn');
  const sceneSelect = document.getElementById('sceneSelect');
  const cinematicBtn = document.getElementById('cinematicBtn');
  const toolbar = document.getElementById('toolbar');
  const dock = document.getElementById('dock');
  const styleSelect = document.getElementById('styleSelect');
  let statusFlash = { text: '', until: 0 };
  function flashStatus(text, ms = 1800) {
    statusFlash = { text, until: performance.now() + ms };
  }
  let lastStatusText = '';
  let lastStatusTitle = '';
  let lastBlastCd = '';
  function setStatus(text, title = text) {
    if (text !== lastStatusText) {
      statusEl.textContent = text;
      lastStatusText = text;
    }
    if (title !== lastStatusTitle) {
      statusEl.title = title;
      lastStatusTitle = title;
    }
  }

  let W = 0, H = 0, DPR = 1;
  const camera = new Camera();
  const level = new Level();
  let cinematicOn = true;
  if (readStorage('stickman.cinematic') === '0') cinematicOn = false;
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
  let chaosOn = false;
  let chaosCd = 0;
  let chaosResultT = 0;
  let chaosHadMultipleTeams = false;
  let chaosAutoEnded = false;
  let chaosAlliance = null;
  let chaosAllianceCd = 0;

  const bg = '#f7f6f2';

  const STYLES = {
    brawler: 'Brawler',
    wingchun: 'Wing Chun',
    muaythai: 'Muay Thai',
    mma: 'MMA',
    shaolin: 'Shaolin'
  };
  const CHAOS_RATIO = 1;
  const CHAOS_STYLES = Object.keys(STYLES);
  const CHAOS_TEAM_NAMES = {
    '#e53935': 'Crimson',
    '#fb8c00': 'Orange',
    '#fdd835': 'Amber',
    '#43a047': 'Green',
    '#00897b': 'Teal',
    '#00acc1': 'Cyan',
    '#1e88e5': 'Blue',
    '#8e24aa': 'Purple',
    '#d81b60': 'Pink',
    '#6d4c41': 'Brown'
  };
  function chaosTeamName(color) {
    const hex = rgbToHex(color).toLowerCase();
    return CHAOS_TEAM_NAMES[hex] || hex.toUpperCase();
  }
  const STYLE_COMBAT = {
    wingchun: { defend: 0.085, block: 0.72, blockT: 0.3, recoverMin: 0.16, recoverJitter: 0.18 },
    muaythai: { defend: 0.06, block: 0.52, blockT: 0.45, recoverMin: 0.35, recoverJitter: 0.35 },
    mma: { defend: 0.07, block: 0.6, blockT: 0.4, recoverMin: 0.28, recoverJitter: 0.3 },
    shaolin: { defend: 0.075, block: 0.6, blockT: 0.38, recoverMin: 0.28, recoverJitter: 0.3 },
    brawler: { defend: 0.06, block: 0.45, blockT: 0.45, recoverMin: 0.35, recoverJitter: 0.35 }
  };
  let lastStyle = 'brawler';
  const savedStyle = readStorage('stickman.style');
  if (savedStyle === 'jkd') lastStyle = 'mma';
  else if (savedStyle && STYLES[savedStyle]) lastStyle = savedStyle;

  const STRIKES = {
    chainpunch: {
      total: 0.62, lungeEnd: 0.16, lungeSpeed: 110, range: 92,
      hits: [
        { at: 0.10, kbx: 45, damage: 3, kdChance: 0, freeze: 0.03, shake: 3, starScale: 0.7 },
        { at: 0.24, kbx: 55, damage: 3, kdChance: 0, freeze: 0.03, shake: 3, starScale: 0.72 },
        { at: 0.38, kbx: 120, damage: 6, kdChance: 0.12, freeze: 0.05, shake: 6, starScale: 1.05 }
      ],
      cd: 0.35, cdJitter: 0.15
    },
    lowkick: {
      total: 0.42, lungeEnd: 0.12, lungeSpeed: 70, range: 100,
      hits: [{ at: 0.18, kbx: 140, damage: 9, kdChance: 0.12, freeze: 0.05, shake: 6, starScale: 1.05 }],
      cd: 0.40, cdJitter: 0.15
    },
    highkick: {
      total: 0.78, lungeEnd: 0.20, lungeSpeed: 460, range: 170,
      aim: 'head',
      leap: { at: 0.14, vy: -300, min: 120, max: 260, gap: 40 },
      hits: [{ at: 0.33, kbx: 300, damage: 18, kdChance: 0.45, freeze: 0.09, shake: 12, starScale: 1.5 }],
      cd: 1.10, cdJitter: 0.2
    },
    burst: {
      total: 0.72, lungeEnd: 0.14, lungeSpeed: 0, range: 125,
      aim: 'head',
      hop: { dur: 0.14, dist: 14 },
      dash: { from: 0.14, to: 0.34, speed: 520, stopGap: 58 },
      hits: [{ at: 0.36, kbx: 180, damage: 14.5, kdChance: 0.22, freeze: 0.08, shake: 10, starScale: 1.3 }],
      cd: 1.20, cdJitter: 0.2
    },
    teep: {
      total: 0.55, lungeEnd: 0.16, lungeSpeed: 80, range: 140,
      hits: [{ at: 0.22, kbx: 320, damage: 7, kdChance: 0.10, freeze: 0.06, shake: 8, starScale: 1.15 }],
      cd: 0.55, cdJitter: 0.15
    },
    roundhouse: {
      total: 0.62, lungeEnd: 0.20, lungeSpeed: 95, range: 120,
      hits: [{ at: 0.28, kbx: 240, damage: 13, kdChance: 0.35, freeze: 0.07, shake: 9, starScale: 1.25 }],
      cd: 0.60, cdJitter: 0.15
    },
    knee: {
      total: 0.40, lungeEnd: 0.12, lungeSpeed: 60, range: 72,
      hits: [{ at: 0.14, kbx: 160, damage: 10, kdChance: 0.12, freeze: 0.06, shake: 7, starScale: 1.0 }],
      cd: 0.40, cdJitter: 0.15
    },
    elbow: {
      total: 0.36, lungeEnd: 0.10, lungeSpeed: 55, range: 78,
      hits: [{ at: 0.13, kbx: 180, damage: 12, kdChance: 0.18, freeze: 0.06, shake: 7, starScale: 1.0 }],
      cd: 0.40, cdJitter: 0.15
    },
    superman: {
      total: 0.70, lungeEnd: 0.08, lungeSpeed: 80, range: 175,
      leap: { at: 0.12, vy: -200, min: 70, max: 200 },
      fx: 'superman',
      hits: [{ at: 0.30, kbx: 250, damage: 15, kdChance: 0.35, freeze: 0.08, shake: 10, starScale: 1.3 }],
      cd: 1.40, cdJitter: 0.2
    },
    flyknee: {
      total: 0.8, lungeEnd: 0.12, lungeSpeed: 100, range: 140,
      leap: { at: 0.10, vy: -420, min: 190, max: 560 },
      hits: [{ at: 0.27, kbx: 280, damage: 17, kdChance: 0.4, freeze: 0.08, shake: 11, starScale: 1.4 }],
      cd: 1.05, cdJitter: 0.2
    },
    overhand: {
      total: 0.55, lungeEnd: 0.18, lungeSpeed: 120, range: 110,
      hits: [{ at: 0.20, kbx: 240, damage: 13, kdChance: 0.28, freeze: 0.07, shake: 9, starScale: 1.25 }],
      cd: 0.65, cdJitter: 0.15
    }
  };

  const FLURRY_MOVES = [
    { kind: 'jab', side: 'lead', at: 0.08, damage: 2.2, kbx: 8, aim: 'head' },
    { kind: 'cross', side: 'rear', at: 0.20, damage: 2.8, kbx: 10, aim: 'body' },
    { kind: 'hook', side: 'lead', at: 0.32, damage: 2.8, kbx: 10, aim: 'head' },
    { kind: 'body', side: 'rear', at: 0.44, damage: 3.2, kbx: 9, aim: 'body' },
    { kind: 'uppercut', side: 'lead', at: 0.56, damage: 3.4, kbx: 11, aim: 'head' },
    { kind: 'uppercut', side: 'rear', at: 0.68, damage: 3.4, kbx: 11, aim: 'body' },
    { kind: 'jab', side: 'lead', at: 0.80, damage: 2.2, kbx: 8, aim: 'head' },
    { kind: 'cross', side: 'rear', at: 0.92, damage: 2.8, kbx: 10, aim: 'body' },
    { kind: 'hook', side: 'lead', at: 1.04, damage: 2.8, kbx: 10, aim: 'head' },
    { kind: 'body', side: 'rear', at: 1.16, damage: 3.2, kbx: 9, aim: 'body' },
    { kind: 'uppercut', side: 'lead', at: 1.28, damage: 3.4, kbx: 11, aim: 'head' },
    { kind: 'overhand', side: 'rear', at: 1.42, damage: 10, kbx: 280, finisher: true, aim: 'head' }
  ];
  const FLURRY_TOTAL = 1.66;

  function startStrike(f, move) {
    const m = STRIKES[move];
    if (!m) return;
    f.combat.state = 'strike';
    f.combat.move = move;
    f.combat.t = m.total;
    f.combat.hitIndex = 0;
    f.combat.hitDone = false;
    f.combat.spin = 0;
    f.combat.leaped = false;
    f.combat.leapLanded = false;
    f.combat.burstDashed = false;
  }

  function startFlurry(f) {
    f.combat.state = 'flurry';
    f.combat.t = FLURRY_TOTAL;
    f.combat.hitIndex = 0;
    f.combat.hitDone = false;
    f.combat.move = null;
    f.combat.spin = 0;
    f.combat.hits = 0;
    f.flurryCd = 8.5;
    f.trail.length = 0;
  }

  const MAX_HP = 100;
  const DEATH_FALL = 0.45;
  const DEATH_DOWN = 2.0;
  const DEATH_ASCEND = 1.4;
  const CINE_DEATH = DEATH_FALL + DEATH_DOWN + DEATH_ASCEND;
  const WORD_LIFE = 0.42;
  const WORD_LIFE_DOWN = 0.8;
  const WORD_LIFE_KO = 1.2;
  const DIZZY_TIME = 1.6;
  const DIZZY_DEATH = 2.5;
  const DIZZY_FADE = 0.5;
  const CHAT_OPEN = 2.4;
  const CHAT_REPLY = 2.4;
  const CHAT_GAP = 0.25;
  const CHAT_APPROACH = 8;
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
    mma: [
      ['Superman punch?', 'Only on Tuesdays.'],
      ['Check the low kick.', 'I felt it.'],
      ['Flying knee incoming.', 'I regret asking.']
    ],
    shaolin: [
      ['Temple rules.', 'Which temple?'],
      ['Palm, not fist.', 'Noted.'],
      ['Breathe.', 'I am breathing.']
    ],
    brawler: [
      ['No style. Just vibes.', 'Vibes are a style.'],
      ['I just swing.', 'It shows.'],
      ['Keep it simple.', 'Simple is hard.']
    ]
  };
  const SPECTATOR_CHAT = [
    "Ooh, that's gonna hurt.",
    'Nice kick.',
    'Keep your guard up!',
    "He's wide open.",
    "I'm not getting in there.",
    "Somebody's going down.",
    'Did you see that?',
    'My money is on the one in blue.',
    "That's a lot of spinning.",
    'I could do that. Probably.',
    'This is the best part.',
    'Get him!'
  ];
  const SPECTATOR_STYLE_CHAT = {
    wingchun: 'Keep the centerline!',
    muaythai: 'Elbows up!',
    mma: 'Flying knee!',
    shaolin: 'Shaolin palm!',
    brawler: 'Swing harder!'
  };
  let chat = null;
  let chatCd = 8 + Math.random() * 7;
  let spectatorCommentCd = 0;
  const pendingRemovals = [];

  const SCENES = {
    paper: { label: 'Paper', src: null, veil: 0 },
    lake: { label: 'Lake', src: '/backgrounds/lake.jpg', veil: 0.32 },
    factory: { label: 'Factory', src: '/backgrounds/factory.jpg', veil: 0.34 },
    bridge: { label: 'Bridge', src: '/backgrounds/bridge.jpg', veil: 0.32 },
    highway: { label: 'Highway', src: '/backgrounds/highway.jpg', veil: 0.34 },
    island: { label: 'Floating Island', src: '/backgrounds/island.jpg', veil: 0.30 }
  };
  let sceneId = 'paper';
  const savedScene = readStorage('stickman.scene');
  if (savedScene && SCENES[savedScene]) sceneId = savedScene;
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
    writeStorage('stickman.scene', id);
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

  function clockStamp() {
    return Math.floor(Date.now() / 60000);
  }

  function celestialTheta() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    return (h / 24) * Math.PI * 2 - Math.PI / 2;
  }

  function isNight() {
    return Math.sin(celestialTheta()) < -0.05;
  }

  const SKY_KEYS = [
    { h: 0, top: [18, 18, 48], bottom: [60, 52, 96], alpha: 0.94 },
    { h: 5, top: [60, 56, 102], bottom: [160, 142, 172], alpha: 0.74 },
    { h: 7, top: [231, 226, 217], bottom: [248, 218, 192], alpha: 0.20 },
    { h: 12, top: [228, 237, 240], bottom: [251, 247, 237], alpha: 0.14 },
    { h: 17, top: [239, 228, 211], bottom: [248, 220, 193], alpha: 0.22 },
    { h: 19, top: [58, 54, 100], bottom: [172, 144, 166], alpha: 0.72 },
    { h: 24, top: [18, 18, 48], bottom: [60, 52, 96], alpha: 0.94 }
  ];

  function mixSkyColor(a, b, t) {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  function skyRgba(c, a) {
    return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
  }

  function skyPalette() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    let a = SKY_KEYS[0];
    let b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (h >= SKY_KEYS[i].h && h <= SKY_KEYS[i + 1].h) {
        a = SKY_KEYS[i];
        b = SKY_KEYS[i + 1];
        break;
      }
    }
    const t = (h - a.h) / Math.max(0.0001, b.h - a.h);
    return {
      top: mixSkyColor(a.top, b.top, t),
      bottom: mixSkyColor(a.bottom, b.bottom, t),
      alpha: a.alpha + (b.alpha - a.alpha) * t
    };
  }

  function drawSkyGradient(c, strength) {
    const pal = skyPalette();
    const horizon = Math.max(1, level.groundY);
    const mid = mixSkyColor(pal.top, pal.bottom, 0.55);
    const grad = c.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, skyRgba(pal.top, pal.alpha * strength));
    grad.addColorStop(0.68, skyRgba(mid, pal.alpha * 0.9 * strength));
    grad.addColorStop(1, skyRgba(pal.bottom, pal.alpha * 0.65 * strength));
    c.save();
    c.fillStyle = grad;
    c.fillRect(0, 0, W, horizon);
    c.restore();
  }

  function drawSkyGlow(c, x, y, radius, color, alpha) {
    if (alpha <= 0.001) return;
    c.save();
    c.beginPath();
    c.rect(0, 0, W, level.groundY);
    c.clip();
    const glow = c.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, skyRgba(color, alpha));
    glow.addColorStop(0.55, skyRgba(color, alpha * 0.35));
    glow.addColorStop(1, skyRgba(color, 0));
    c.fillStyle = glow;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
    c.restore();
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
      drawSkyGlow(c, x, y, Math.max(W, H) * 0.48, [242, 201, 76], 0.11 * alpha);
      drawSun(c, x, y, r, sunA);
    }
    if (moonA > 0.01) {
      const mt = theta + Math.PI;
      const x = W / 2 - Math.cos(mt) * W * 0.42;
      const y = H * 0.5 - Math.sin(mt) * H * 0.30;
      drawSkyGlow(c, x, y, Math.max(W, H) * 0.48, [210, 225, 245], 0.07 * alpha);
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
      birdTimer = isNight() ? 40 + Math.random() * 30 : 25 + Math.random() * 20;
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
    c.strokeStyle = isNight() ? 'rgba(247, 246, 242, 0.66)' : 'rgba(27, 26, 23, 0.55)';
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
    const cw = Math.max(1, Math.floor(W * DPR));
    const ch = Math.max(1, Math.floor(H * DPR));
    if (sceneCanvas.width !== cw || sceneCanvas.height !== ch) {
      sceneCanvas.width = cw;
      sceneCanvas.height = ch;
    }
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
      drawSkyGradient(sceneCtx, 0.55);
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
      drawSkyGradient(sceneCtx, 1);
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
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = motionQuery.matches;
  const onMotionChange = e => {
    reduceMotion = e.matches;
    if (reduceMotion) {
      slowmoT = 0;
      freezeT = 0;
      shakeAmt = 0;
    }
  };
  if (typeof motionQuery.addEventListener === 'function') {
    motionQuery.addEventListener('change', onMotionChange);
  } else if (typeof motionQuery.addListener === 'function') {
    motionQuery.addListener(onMotionChange);
  }

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

  let toolbarHeight = 48;
  let letterboxHeight = 0;

  function syncToolbarHeight() {
    if (!toolbar) return;
    toolbarHeight = toolbar.offsetHeight || 48;
    document.documentElement.style.setProperty('--toolbar-h', toolbarHeight + 'px');
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
    letterboxHeight = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--letterbox-h')
    ) || 0;
  }
  window.addEventListener('resize', resize);
  if (toolbar && typeof ResizeObserver === 'function') {
    new ResizeObserver(syncToolbarHeight).observe(toolbar);
  }
  resize();

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
    writeStorage('stickman.cinematic', cinematicOn ? '1' : '0');
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
    if (chaosOn && figures.some(f => f.fighting && f !== a && f !== b)) return;
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
    if (chaosOn && figures.some(o => o.fighting && o !== f && !o.dying)) return;
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
      const dur = cine.koDur || CINE_KO;
      const p = clamp(1 - cine.koT / dur, 0, 1);
      const zoom = 1.18 + 0.05 * Math.sin(Math.PI * p);
      const rotation = clamp(((f.x - W / 2) / Math.max(1, W)) * 0.06, -0.02, 0.02);
      camera.follow = 8;
      camera.setTarget(f.x, H * 0.56 - (f.dying ? f.dying.rise * 0.45 : 0), zoom, rotation);
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

  function starPath(ctx, x, y, outer, inner, rotation = 0, points = 5) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = rotation + (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

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

  function spawnWord(x, y, text, scale = 1, color = '#1b1a17', life = WORD_LIFE) {
    const wx = clamp(x, 70 * scale, W - 70 * scale);
    const wy = clamp(y, 70, H - 50);
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.type === 'word' && Math.abs(e.x - wx) < 230 * scale && Math.abs(e.y - wy) < 90) {
        effects.splice(i, 1);
      }
    }
    effects.push({
      type: 'word', x: wx, y: wy, text, t: 0, life,
      scale, color, rot: (Math.random() - 0.5) * 0.16, vy: -30,
      fade: life > 0.6 ? 0.42 : 0.35
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
        const fade = 1 - smoothstep(e.fade, 1, k);
        if (fade <= 0) continue;
        const sc = e.scale * (0.72 + 0.28 * easeOut(pop));
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot + (1 - pop) * 0.1);
        ctx.scale(sc, sc);
        ctx.font = '900 italic 40px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = fade * 0.3;
        ctx.fillStyle = '#a86f00';
        ctx.fillText(e.text, 3, 4);
        ctx.globalAlpha = fade * 0.92;
        ctx.lineWidth = 6;
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

  function clearDuelIntro(f) {
    const intro = f && f.duelIntro;
    if (!intro) return;
    for (const g of [intro.kicker, intro.kicked]) {
      if (g.duelIntro === intro) g.duelIntro = null;
      g.introRunning = false;
      g._introStep = 0;
      if (g.behavior === 'run' && g.fighting) g.behavior = 'idle';
      if (g.combat.introKick) g.combat.introKick = false;
    }
  }

  function startDuel(a, b, opts = {}) {
    if (!opts.chaos && chaosAlliance && chaosAlliedColors(a.color, b.color)) {
      breakChaosAlliance('manual');
    }
    clearChaosStairExit(a);
    clearChaosStairExit(b);
    cancelChatFor(a);
    cancelChatFor(b);
    cancelPursuitsFor(a);
    cancelPursuitsFor(b);
    cancelSpectating(a);
    cancelSpectating(b);
    cancelFightPick();
    const floor = level.floorAt(a.x, a.y);
    a.combatFloor = floor;
    b.combatFloor = floor;
    const floorY = level.floorY(floor);
    a.y = floorY;
    b.y = floorY;
    a.vy = 0;
    b.vy = 0;
    a.startFight(b);
    b.startFight(a);
    const chaosFight = !!opts.chaos;
    a.chaosFight = chaosFight;
    b.chaosFight = chaosFight;
    a.trail.length = 0; b.trail.length = 0;
    const kicker = Math.random() < 0.5 ? a : b;
    const intro = {
      t: 0,
      kicker,
      kicked: kicker === a ? b : a,
      phase: 'charge'
    };
    a.duelIntro = intro;
    b.duelIntro = intro;
    a.introRunning = true;
    b.introRunning = true;
    a.facing = b.x >= a.x ? 1 : -1;
    b.facing = a.x >= b.x ? 1 : -1;
    assignSpectators(a, b);
    cineStartDuel(a, b);
    audio.duel(panFor((a.x + b.x) / 2));
  }

  function releaseSpectators(a, b) {
    for (const f of figures) {
      if (f.spectating && f.spectating.a === a && f.spectating.b === b) {
        f.spectating.leaving = 1.4;
      }
    }
  }

  function endDuel(f) {
    const other = f.foe;
    clearDuelIntro(f);
    clearDuelIntro(other);
    releaseSpectators(f, other);
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

  function clearChaosStairExit(f) {
    if (!f || !f.chaosStairExit) return;
    f.chaosStairExit = false;
    if (f.think === 999) f.think = 0.6 + Math.random() * 1.6;
    if (f.behavior === 'walk' && !f.fighting && !f.pursuit && !f.pursuedBy && !f.dragging) {
      f.setBehavior('idle');
    }
  }

  function updateChaosStairExit() {
    for (const f of figures) {
      if (f.chaosStairExit) {
        const offStairs = !level.isOnAnyStairPath(f.x, f.y);
        if (offStairs || f.fighting || f.support || f.dying || f.dragging || f.blown ||
            f.pursuit || f.pursuedBy || f.chatting || f.spectating) {
          clearChaosStairExit(f);
          continue;
        }
      }
      if (!chaosOn || f.fighting || f.support || f.dying || f.dragging || f.blown ||
          f.pursuit || f.pursuedBy || f.chatting || f.spectating) continue;
      if (f.behavior === 'jump' || f.vy !== 0) continue;
      if (!level.isOnAnyStairPath(f.x, f.y)) continue;
      const targetX = level.stairExitTarget(f.x, f.y);
      if (targetX == null) continue;
      f.chaosStairExit = true;
      f.think = 999;
      f.setBehavior('walk');
      f.facing = targetX < f.x ? -1 : 1;
    }
  }

  function updateChaosWatchdog(dt) {
    for (const f of figures) {
      if (!f || f.dying) continue;
      if (!f.fighting && !f.dragging && !f.blown) {
        f.bodyScale = lerp(f.bodyScale, 1, Math.min(1, dt * 12));
        if (f.bodyScale > 0.995) f.bodyScale = 1;
        if (f.landT > 0) f.landT = Math.max(0, f.landT - dt);
      }
      const moved = f._chaosLastX == null
        ? 0
        : Math.hypot(f.x - f._chaosLastX, f.y - f._chaosLastY);
      f._chaosLastX = f.x;
      f._chaosLastY = f.y;

      if (f.pursuedBy) {
        const chaser = f.pursuedBy;
        const pursuit = chaser.pursuit;
        if (!pursuit || pursuit.target !== f) {
          f.pursuedBy = null;
        } else if (pursuit.stallX == null ||
                   Math.hypot(chaser.x - pursuit.stallX, chaser.y - pursuit.stallY) >= 1) {
          pursuit.stallX = chaser.x;
          pursuit.stallY = chaser.y;
          pursuit.stallT = 0;
        } else {
          pursuit.stallT = (pursuit.stallT || 0) + dt;
          if (pursuit.stallT > 0.7) cancelPursuit(chaser);
        }
      }

      const onStairs = level.isOnAnyStairPath(f.x, f.y);
      if (onStairs) {
        f.chaosIdleT = 0;
        if (f.fighting || f.support || f.dragging || f.blown || f.chatting || f.spectating) {
          f.chaosStairT = 0;
          continue;
        }
        if (moved < 1) f.chaosStairT += dt;
        else f.chaosStairT = 0;
        if (f.chaosStairT < 2) continue;
        f.chaosStairT = 0;
        if (f.pursuit) cancelPursuit(f);
        if (f.pursuedBy) {
          if (f.pursuedBy.pursuit) cancelPursuit(f.pursuedBy);
          else f.pursuedBy = null;
        }
        const targetX = level.stairExitTarget(f.x, f.y);
        if (targetX != null) {
          f.chaosStairExit = true;
          f.think = 999;
          f.setBehavior('walk');
          f.facing = targetX < f.x ? -1 : 1;
        }
        continue;
      }

      f.chaosStairT = 0;
      if (f.chaosStairExit) clearChaosStairExit(f);
      if (f.fighting || f.support || f.dragging || f.blown || f.chatting || f.spectating ||
          f.pursuit || f.pursuedBy || f.vy !== 0 || f.behavior === 'jump') {
        f.chaosIdleT = 0;
        continue;
      }
      const floor = level.floorAt(f.x, f.y);
      if (floor < 0) {
        f.chaosIdleT = 0;
        continue;
      }
      if (moved < 1) f.chaosIdleT += dt;
      else f.chaosIdleT = 0;
      if (f.chaosIdleT < 1.5) continue;
      f.chaosIdleT = 0;

      const hc = f.color.toLowerCase();
      let best = null;
      let bestScore = Infinity;
      for (const enemy of figures) {
        if (enemy === f || enemy.dying || enemy.dragging || enemy.blown) continue;
        if (enemy.color.toLowerCase() === hc) continue;
        if (chaosAlliedColors(f.color, enemy.color)) continue;
        const enemyFloor = level.floorAt(enemy.x, enemy.y);
        if (enemyFloor < 0) continue;
        const score = (enemyFloor === floor ? 0 : 10000) +
          Math.abs(enemy.x - f.x);
        if (score < bestScore) {
          bestScore = score;
          best = enemy;
        }
      }
      if (best) {
        beginPursuit(f, best, {
          hunt: true,
          chaos: true,
          auto: true,
          allowBlown: true,
          waitForLanding: true
        });
      }
    }
  }

  function chaosEligible(f) {
    if (!f || f.fighting || f.support || f.dying || f.dragging || f.blown) return false;
    if (f.pursuit || f.pursuedBy || f.chatting || f.spectating) return false;
    if (f.vy !== 0) return false;
    if (level.isOnAnyStairPath(f.x, f.y)) return false;
    return level.floorAt(f.x, f.y) >= 0;
  }

  function startChaosPair(a, b) {
    if (!chaosEligible(a) || !chaosEligible(b)) return false;
    if (a.color.toLowerCase() === b.color.toLowerCase()) return false;
    if (chaosAlliedColors(a.color, b.color)) return false;
    const aFloor = level.floorAt(a.x, a.y);
    const bFloor = level.floorAt(b.x, b.y);
    if (aFloor < 0 || bFloor < 0) return false;
    a.style = pick(CHAOS_STYLES);
    const altStyles = CHAOS_STYLES.filter(style => style !== a.style);
    b.style = pick(altStyles.length ? altStyles : CHAOS_STYLES);
    if (aFloor === bFloor) {
      startDuel(a, b, { chaos: true });
    } else {
      beginPursuit(a, b, { hunt: true, chaos: true, auto: true, allowBlown: true, waitForLanding: true });
      beginPursuit(b, a, { hunt: true, chaos: true, auto: true, allowBlown: true, waitForLanding: true });
    }
    return true;
  }

  function chaosTeamDistance(a, b) {
    let best = Infinity;
    for (const fa of a.members) {
      const af = level.floorAt(fa.x, fa.y);
      for (const fb of b.members) {
        const bf = level.floorAt(fb.x, fb.y);
        const dist = (af === bf ? 0 : 1000) + Math.abs(fa.x - fb.x);
        if (dist < best) best = dist;
      }
    }
    return best;
  }

  function chaosTeamInfo() {
    const teams = new Map();
    for (const f of figures) {
      if (f.dying) continue;
      const key = f.color.toLowerCase();
      let team = teams.get(key);
      if (!team) {
        team = {
          key,
          color: f.color,
          members: [],
          hp: 0,
          engaged: new Map(),
          focusOrder: []
        };
        teams.set(key, team);
      }
      team.members.push(f);
      team.hp += f.hp;
    }
    for (const team of teams.values()) {
      for (const f of team.members) {
        if (!f.fighting || !f.foe || f.foe.dying) continue;
        const enemyKey = f.foe.color.toLowerCase();
        if (enemyKey === team.key) continue;
        team.engaged.set(enemyKey, (team.engaged.get(enemyKey) || 0) + 1);
      }
    }
    return teams;
  }

  function chaosAlliedColors(c1, c2) {
    if (!chaosAlliance) return false;
    const a = c1.toLowerCase();
    const b = c2.toLowerCase();
    return (chaosAlliance.a === a && chaosAlliance.b === b) ||
      (chaosAlliance.a === b && chaosAlliance.b === a);
  }

  function breakChaosAlliance(reason) {
    if (!chaosAlliance) return;
    chaosAlliance = null;
    chaosAllianceCd = Math.max(chaosAllianceCd, 6);
  }

  function updateChaosAlliance(teams, dt) {
    if (chaosAllianceCd > 0) chaosAllianceCd = Math.max(0, chaosAllianceCd - dt);
    if (!chaosOn || teams.size < 3) {
      chaosAlliance = null;
      return;
    }
    if (chaosAlliance) {
      const a = teams.get(chaosAlliance.a);
      const b = teams.get(chaosAlliance.b);
      const target = teams.get(chaosAlliance.target);
      chaosAlliance.ttl -= dt;
      if (!a || !b || !target || chaosAlliance.ttl <= 0) {
        chaosAlliance = null;
        chaosAllianceCd = Math.max(chaosAllianceCd, 6);
      }
      return;
    }
    if (chaosAllianceCd > 0) return;
    let dominant = null;
    let living = 0;
    for (const team of teams.values()) {
      living += team.members.length;
      if (!dominant || team.members.length > dominant.members.length) dominant = team;
    }
    if (!dominant || dominant.members.length < living * 0.5) return;
    const others = [...teams.values()].filter(t => t !== dominant);
    if (others.length < 2) return;
    others.sort((a, b) => a.members.length - b.members.length ||
      a.hp - b.hp ||
      chaosTeamDistance(dominant, a) - chaosTeamDistance(dominant, b));
    const [a, b] = others;
    chaosAlliance = { a: a.key, b: b.key, target: dominant.key, ttl: 18 };
    flashStatus(`${chaosTeamName(a.color)} + ${chaosTeamName(b.color)} alliance vs ${chaosTeamName(dominant.color)}`, 2600);
    for (const f of figures) {
      if (f.fighting && f.foe && chaosAlliedColors(f.color, f.foe.color)) endDuel(f);
      if (f.pursuit && chaosAlliedColors(f.color, f.pursuit.target.color)) cancelPursuit(f);
      if (f.pursuedBy && chaosAlliedColors(f.color, f.pursuedBy.color)) {
        if (f.pursuedBy.pursuit) cancelPursuit(f.pursuedBy);
        else f.pursuedBy = null;
      }
    }
  }

  function chaosFocusMap(teams) {
    const focusMap = new Map();
    for (const team of teams.values()) {
      let candidates = [...teams.values()].filter(t => t.key !== team.key);
      if (chaosAlliance && (team.key === chaosAlliance.a || team.key === chaosAlliance.b)) {
        const allyKey = team.key === chaosAlliance.a ? chaosAlliance.b : chaosAlliance.a;
        candidates = candidates.filter(t => t.key !== allyKey);
      }
      candidates.sort((a, b) => {
        const ea = team.engaged.get(a.key) || 0;
        const eb = team.engaged.get(b.key) || 0;
        if (ea !== eb) return eb - ea;
        if (a.members.length !== b.members.length) return a.members.length - b.members.length;
        if (a.hp !== b.hp) return a.hp - b.hp;
        return chaosTeamDistance(team, a) - chaosTeamDistance(team, b);
      });
      if (chaosAlliance && (team.key === chaosAlliance.a || team.key === chaosAlliance.b)) {
        const targetIndex = candidates.findIndex(t => t.key === chaosAlliance.target);
        if (targetIndex > 0) {
          const [target] = candidates.splice(targetIndex, 1);
          candidates.unshift(target);
        }
      }
      team.focusOrder = candidates.map(t => t.key);
      focusMap.set(team.key, team.focusOrder[0] || null);
    }
    return focusMap;
  }

  function chaosHelperCoverage(helper, target) {
    const hc = helper.color.toLowerCase();
    let count = 0;
    for (const f of figures) {
      if (f === helper || f.color.toLowerCase() !== hc) continue;
      if (f.foe === target || (f.pursuit && f.pursuit.target === target)) count++;
    }
    return count;
  }

  function nearestChaosEnemy(f) {
    const hc = f.color.toLowerCase();
    const ownFloor = level.floorAt(f.x, f.y);
    let best = null;
    let bestScore = Infinity;
    for (const enemy of figures) {
      if (enemy === f || enemy.dying || enemy.dragging || enemy.blown) continue;
      if (enemy.color.toLowerCase() === hc) continue;
      if (chaosAlliedColors(f.color, enemy.color)) continue;
      const enemyFloor = level.floorAt(enemy.x, enemy.y);
      if (enemyFloor < 0) continue;
      const score = (enemyFloor === ownFloor ? 0 : 10000) + Math.abs(enemy.x - f.x);
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  function forceChaosEngage(f) {
    if (!chaosOn || f.dying || f.dragging || f.blown || f.fighting || f.support ||
        f.pursuit || f.pursuedBy) return false;
    if (level.floorAt(f.x, f.y) < 0) return false;
    const enemy = nearestChaosEnemy(f);
    if (!enemy) return false;
    const ff = level.floorAt(f.x, f.y);
    const ef = level.floorAt(enemy.x, enemy.y);
    if (ff >= 0 && ff === ef && !enemy.fighting && !enemy.support) {
      startDuel(f, enemy, { chaos: true });
    } else {
      beginPursuit(f, enemy, {
        hunt: true,
        chaos: true,
        auto: true,
        allowBlown: true,
        waitForLanding: true
      });
    }
    return true;
  }

  function updateChaosNoWait(dt) {
    for (const f of figures) {
      if (!f || f.dying || f.dragging || f.blown || f.chatting || f.spectating) continue;
      if (f.combat && DOWN_STATES.has(f.combat.state)) continue;
      const ff = level.floorAt(f.x, f.y);
      if (ff < 0) continue;
      const near = nearestChaosEnemy(f);
      if (f.support) {
        const t = f.support.target;
        if (!t || t.dying || t.blown) {
          cancelSupport(f);
          forceChaosEngage(f);
          continue;
        }
        if (near && near !== t && level.floorAt(near.x, near.y) === ff &&
            Math.abs(near.x - f.x) + 40 < Math.abs(t.x - f.x)) {
          cancelSupport(f);
          forceChaosEngage(f);
        }
        continue;
      }
      if (f.fighting) {
        if (!f.chaosFight) continue;
        const t = f.foe;
        if (!t || t.dying || t.blown) {
          endDuel(f);
          forceChaosEngage(f);
          continue;
        }
        if (near && near !== t && level.floorAt(near.x, near.y) === ff &&
            Math.abs(near.x - f.x) + 80 < Math.abs(t.x - f.x)) {
          endDuel(f);
          forceChaosEngage(f);
        }
        continue;
      }
      if (f.pursuit) {
        const t = f.pursuit.target;
        if (!t || t.dying || t.blown) {
          cancelPursuit(f);
          forceChaosEngage(f);
        }
        continue;
      }
      if (f.pursuedBy) continue;
      forceChaosEngage(f);
    }
  }

  function assignChaosHelpers(teams, focusMap) {
    if (!chaosOn) return;
    const duels = [];
    const seen = new Set();
    for (const f of figures) {
      if (!f.fighting || !f.foe || !f.chaosFight || f.dying || f.support) continue;
      const other = f.foe;
      if (!other.fighting || other.foe !== f || other.dying || other.support) continue;
      if (seen.has(f) || seen.has(other)) continue;
      seen.add(f);
      seen.add(other);
      duels.push([f, other]);
    }

    const helpers = figures.filter(f => chaosEligible(f));
    if (!helpers.length) return;
    const helperSet = new Set(helpers);
    const enemies = figures.filter(f =>
      !f.dying && !f.dragging && !f.blown && !helperSet.has(f)
    );

    for (const helper of helpers) {
      const hc = helper.color.toLowerCase();
      const helperFloor = level.floorAt(helper.x, helper.y);
      const team = teams.get(hc);
      const order = team && team.focusOrder.length
        ? team.focusOrder
        : [...teams.keys()].filter(key => key !== hc);
      let assigned = false;

      // If a same-color teammate is already in a real duel, help immediately.
      const nearEnemy = nearestChaosEnemy(helper);
      if (nearEnemy && level.floorAt(nearEnemy.x, nearEnemy.y) === helperFloor) {
        const mate = figures.find(g =>
          g !== helper &&
          g.color.toLowerCase() === hc &&
          g.fighting && !g.support &&
          g.foe === nearEnemy && nearEnemy.foe === g
        );
        beginPursuit(helper, nearEnemy, mate ? {
          assist: true,
          teammate: mate,
          auto: true,
          allowBlown: true,
          waitForLanding: true
        } : {
          hunt: true,
          chaos: true,
          auto: true,
          allowBlown: true,
          waitForLanding: true
        });
        continue;
      }

      const assistMate = figures.find(g =>
        g !== helper &&
        g.color.toLowerCase() === hc &&
        g.fighting && !g.support && g.foe &&
        g.foe.fighting && g.foe.foe === g &&
        !chaosAlliedColors(helper.color, g.foe.color) &&
        chaosHelperCoverage(helper, g.foe) === 0
      );
      if (assistMate) {
        beginPursuit(helper, assistMate.foe, {
          assist: true,
          teammate: assistMate,
          auto: true,
          allowBlown: true,
          waitForLanding: true
        });
        continue;
      }

      // Work through the team's focus order: finish the chosen team first.
      for (const enemyKey of order) {
        let best = null;
        let bestScore = Infinity;

        // Join a same-color teammate who is already fighting this enemy team.
        for (const [a, b] of duels) {
          const ac = a.color.toLowerCase();
          const bc = b.color.toLowerCase();
          let teammate = null;
          let target = null;
          if (ac === hc && bc === enemyKey) {
            teammate = a;
            target = b;
          } else if (bc === hc && ac === enemyKey) {
            teammate = b;
            target = a;
          }
          if (!teammate || !target) continue;
          if (chaosHelperCoverage(helper, target) > 0) continue;
          const targetFloor = level.floorAt(target.x, target.y);
          if (targetFloor < 0) continue;
          const score = (targetFloor === helperFloor ? 0 : 10000) +
            target.hp * 0.25 + Math.abs(target.x - helper.x) * 0.01;
          if (score < bestScore) {
            bestScore = score;
            best = { teammate, target };
          }
        }
        if (best) {
          beginPursuit(helper, best.target, {
            assist: true,
            teammate: best.teammate,
            auto: true,
            allowBlown: true,
            waitForLanding: true
          });
          assigned = true;
          break;
        }

        // Otherwise hunt the weakest reachable member of that team.
        best = null;
        bestScore = Infinity;
        for (const enemy of enemies) {
          if (enemy.color.toLowerCase() !== enemyKey) continue;
          if (chaosAlliedColors(helper.color, enemy.color)) continue;
          const enemyFloor = level.floorAt(enemy.x, enemy.y);
          if (enemyFloor < 0) continue;
          const score = (enemyFloor === helperFloor ? 0 : 10000) +
            enemy.hp * 0.25 + Math.abs(enemy.x - helper.x) * 0.01 +
            chaosHelperCoverage(helper, enemy) * 2500 + (enemy.support ? 2000 : 0);
          if (score < bestScore) {
            bestScore = score;
            best = { target: enemy };
          }
        }
        if (best) {
          const target = best.target;
          const mate = target.fighting && target.foe && target.foe.foe === target &&
            target.foe.color.toLowerCase() === hc ? target.foe : null;
          beginPursuit(helper, target, mate ? {
            assist: true,
            teammate: mate,
            auto: true,
            allowBlown: true,
            waitForLanding: true
          } : {
            hunt: true,
            chaos: true,
            auto: true,
            allowBlown: true,
            waitForLanding: true
          });
          assigned = true;
          break;
        }
      }
      if (assigned) continue;

      // Safety fallback: any reachable enemy on any floor.
      let best = null;
      let bestScore = Infinity;
      for (const enemy of enemies) {
        if (enemy.color.toLowerCase() === hc) continue;
        if (chaosAlliedColors(helper.color, enemy.color)) continue;
        const enemyFloor = level.floorAt(enemy.x, enemy.y);
        if (enemyFloor < 0) continue;
        const score = (enemyFloor === helperFloor ? 0 : 10000) +
          enemy.hp * 0.25 + Math.abs(enemy.x - helper.x) * 0.01 +
          chaosHelperCoverage(helper, enemy) * 2500 + (enemy.support ? 2000 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { target: enemy };
        }
      }
      if (!best) continue;
      const target = best.target;
      const mate = target.fighting && target.foe &&
        target.foe.color.toLowerCase() === hc ? target.foe : null;
      beginPursuit(helper, target, mate ? {
        assist: true,
        teammate: mate,
        auto: true,
        allowBlown: true,
        waitForLanding: true
      } : {
        hunt: true,
        chaos: true,
        auto: true,
        allowBlown: true,
        waitForLanding: true
      });
    }
  }

  function updateChaos(dt) {
    if (!chaosOn) return;
    if (chaosResultT > 0) {
      const colors = new Set(figures.filter(f => !f.dying).map(f => f.color.toLowerCase()));
      if (colors.size > 1) {
        chaosResultT = 0;
        chaosHadMultipleTeams = true;
      } else {
        chaosResultT -= dt;
        if (chaosResultT <= 0) setChaos(false, true);
        return;
      }
    }
    updateChaosStairExit();
    updateChaosWatchdog(dt);
    const living = figures.filter(f => !f.dying);
    const teamInfo = chaosTeamInfo();
    if (teamInfo.size > 1) chaosHadMultipleTeams = true;
    if (!living.length) {
      setChaos(false, true);
      flashStatus('Nothing left.', 3800);
      return;
    }
    if (teamInfo.size === 1 && chaosHadMultipleTeams) {
      const color = teamInfo.values().next().value.color;
      setChaos(false, true);
      flashStatus(`${chaosTeamName(color)} team survives!`, 3800);
      return;
    }
    if (living.length < 2) return;
    updateChaosAlliance(teamInfo, dt);
    const focusMap = chaosFocusMap(teamInfo);
    const target = Math.max(2, 2 * Math.floor((living.length * CHAOS_RATIO) / 2));
    const active = figures.filter(f => f.fighting && f.foe && !f.dying && !f.support).length;

    const byFloor = new Map();
    for (const f of figures) {
      if (!chaosEligible(f)) continue;
      const floor = level.floorAt(f.x, f.y);
      if (!byFloor.has(floor)) byFloor.set(floor, []);
      byFloor.get(floor).push(f);
    }
    const sameFloorPairs = [];
    const crossFloorPairs = [];
    const eligible = [];
    for (const list of byFloor.values()) {
      eligible.push(...list);
      for (let i = 0; i < list.length - 1; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (list[i].color.toLowerCase() !== list[j].color.toLowerCase() &&
              !chaosAlliedColors(list[i].color, list[j].color)) {
            sameFloorPairs.push([list[i], list[j]]);
          }
        }
      }
    }
    for (let i = 0; i < eligible.length - 1; i++) {
      for (let j = i + 1; j < eligible.length; j++) {
        if (level.floorAt(eligible[i].x, eligible[i].y) === level.floorAt(eligible[j].x, eligible[j].y)) {
          continue;
        }
        if (eligible[i].color.toLowerCase() !== eligible[j].color.toLowerCase() &&
            !chaosAlliedColors(eligible[i].color, eligible[j].color)) {
          crossFloorPairs.push([eligible[i], eligible[j]]);
        }
      }
    }
    const isFocusPair = ([a, b]) => {
      const ka = a.color.toLowerCase();
      const kb = b.color.toLowerCase();
      return focusMap.get(ka) === kb || focusMap.get(kb) === ka;
    };
    const sameFocusPairs = sameFloorPairs.filter(isFocusPair);
    const crossFocusPairs = crossFloorPairs.filter(isFocusPair);
    const pairPool = sameFocusPairs.length
      ? sameFocusPairs
      : sameFloorPairs.length
        ? sameFloorPairs
        : crossFocusPairs.length
          ? crossFocusPairs
          : crossFloorPairs;
    if (active < target && pairPool.length) {
      chaosCd -= dt;
      if (chaosCd <= 0) {
        chaosCd = 0.12 + Math.random() * 0.18;
        pairPool.sort((p, q) => {
          const pSame = level.floorAt(p[0].x, p[0].y) === level.floorAt(p[1].x, p[1].y);
          const qSame = level.floorAt(q[0].x, q[0].y) === level.floorAt(q[1].x, q[1].y);
          return ((pSame ? 0 : 10000) + Math.abs(p[0].x - p[1].x)) -
            ((qSame ? 0 : 10000) + Math.abs(q[0].x - q[1].x));
        });
        const [a, b] = pairPool[0];
        startChaosPair(a, b);
      }
    }
    assignChaosHelpers(teamInfo, focusMap);
    updateChaosNoWait(dt);
  }

  function syncChaosUI() {
    if (chaosBtn) {
      chaosBtn.setAttribute('aria-pressed', chaosOn ? 'true' : 'false');
      chaosBtn.title = chaosOn
        ? 'Chaos mode is on — click to restore order'
        : 'Chaos mode: cross-color pairs fight; leftovers hunt enemies; last team survives';
    }
    document.body.dataset.chaos = chaosOn ? 'on' : 'off';
  }

  function setChaos(on, quiet = false) {
    const next = !!on;
    if (next === chaosOn) return;
    chaosOn = next;
    chaosCd = 0;
    chaosAlliance = null;
    chaosAllianceCd = 0;
    if (chaosOn) {
      chaosAutoEnded = false;
      cancelFightPick();
      cancelChat();
      for (const f of figures) {
        cancelSpectating(f);
        if (f.support) cancelSupport(f);
        if (f.pursuit) cancelPursuit(f);
        clearChaosStairExit(f);
      }
      for (const f of figures) {
        if (f.pursuedBy && (!f.pursuedBy.pursuit || f.pursuedBy.pursuit.target !== f)) {
          f.pursuedBy = null;
        }
        if (f.fighting && (!f.foe || f.foe.dying || f.foe.foe !== f)) {
          f.stopFight();
        }
        f.chaosIdleT = 0;
        f.chaosStairT = 0;
        f._chaosLastX = null;
        f._chaosLastY = null;
      }
      chaosResultT = 0;
      const colors = new Set(figures.filter(f => !f.dying).map(f => f.color.toLowerCase()));
      chaosHadMultipleTeams = colors.size > 1;
      flashStatus('CHAOS!', 1400);
      updateChaos(0);
    } else {
      chaosAutoEnded = !!quiet;
      chaosResultT = 0;
      chaosHadMultipleTeams = false;
      for (const f of [...figures]) {
        clearChaosStairExit(f);
        if (f.pursuit && (f.pursuit.chaos || f.pursuit.assist || f.pursuit.hunt)) {
          cancelPursuit(f);
        }
        if (f.support) cancelSupport(f);
        if (f.chaosFight && f.fighting) endDuel(f);
      }
      chatCd = 8 + Math.random() * 7;
      if (!quiet) flashStatus('Order restored', 1500);
    }
    syncChaosUI();
  }

  function beginDeath(f, killer) {
    if (!f || f.dying) return;
    cancelChatFor(f);
    cancelSpectating(f);
    cancelPursuitsFor(f);
    if (f.support) cancelSupport(f);
    f.rearAttacker = null;
    f.rearT = 0;
    f.rearCd = 0;
    f.rearCounterTarget = null;
    f.faceHoldT = 0;
    if (f.foe) endDuel(f);
    f.fighting = false;
    f.foe = null;
    f.combatFloor = null;
    f.trail.length = 0;
    f.blown = null;
    f.chatting = false;
    f.chatPartner = null;
    f.bubble = null;
    f.hp = 0;
    f.behavior = 'idle';
    f.vy = 0;
    f.think = 999;
    f.dizzyT = DIZZY_DEATH;
    f.dying = {
      phase: 'fall', t: 0, rise: 0, alpha: 1,
      dir: killer && killer.x < f.x ? 1 : -1
    };
    if (fightPick === f) clearFightPick();
    deselectFigure(f);
    cineDeath(f);
  }

  function flushDeaths() {
    if (!pendingRemovals.length) return;
    for (const f of pendingRemovals.splice(0)) {
      if (figures.includes(f)) removeFigure(f, true);
    }
  }

  function cancelSpectating(f) {
    if (!f || !f.spectating) return;
    f.spectating = null;
    f.bubble = null;
    f.think = 1 + Math.random() * 2;
  }

  function assignSpectators(a, b) {
    if (chaosOn || !autonChk.checked) return;
    const floor = level.floorAt(a.x, a.y);
    if (floor < 0 || level.floorAt(b.x, b.y) !== floor) return;
    const mid = (a.x + b.x) / 2;
    const bounds = level.floorBounds(floor);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const leftRoom = minX - bounds.x0;
    const rightRoom = bounds.x1 - maxX;
    const roomier = leftRoom >= rightRoom ? -1 : 1;
    const floorY = level.floorY(floor);
    const baseFor = side => side < 0 ? minX - 95 : maxX + 95;
    const clampSpot = x => clamp(x, bounds.x0 + 24, bounds.x1 - 24);
    const validSpot = (x, side) => {
      if (x < bounds.x0 + 16 || x > bounds.x1 - 16) return false;
      if (level.isOnAnyStairPath(x, floorY)) return false;
      if (floor === 0 && x >= level.stairX0 - 8 && x <= level.stairX1 + 8) return false;
      if (side < 0 && x > minX - 30) return false;
      if (side > 0 && x < maxX + 30) return false;
      return level.floorAt(x, floorY) === floor;
    };
    const chooseSpot = f => {
      let side = f.x <= minX - 8 ? -1 : f.x >= maxX + 8 ? 1 : roomier;
      let spot = clampSpot(baseFor(side));
      if (!validSpot(spot, side)) {
        side = -side;
        spot = clampSpot(baseFor(side));
        if (!validSpot(spot, side)) return null;
      }
      return { side, spot };
    };
    let watching = 0;
    let count = 0;
    const used = [];
    for (const f of figures) {
      if (!f.spectating) continue;
      watching++;
      if (f.spectating.floor === floor) used.push(f.spectating.x);
    }
    const candidates = figures.filter(f => {
      if (f === a || f === b) return false;
      if (f.dying || f.fighting || f.pursuit || f.pursuedBy || f.blown || f.dragging || f.chatting || f.spectating) return false;
      if (f.behavior === 'jump' || f.vy !== 0) return false;
      if (level.floorAt(f.x, f.y) !== floor || level.isOnAnyStairPath(f.x, f.y)) return false;
      const dist = Math.abs(f.x - mid);
      if (dist < 120 || dist > 450) return false;
      if (floor === 0) {
        if (mid < level.stairX0 && f.x >= level.stairX0) return false;
        if (mid > level.stairX1 && f.x <= level.stairX1) return false;
      }
      return true;
    });
    for (const f of candidates) {
      if (watching >= 3 || count >= 2) break;
      if (Math.random() > 0.6) continue;
      const choice = chooseSpot(f);
      if (!choice) continue;
      let { side, spot } = choice;
      let tries = 0;
      while (used.some(x => Math.abs(x - spot) < 24) && tries < 8) {
        spot = clampSpot(spot + side * 30);
        tries++;
      }
      if (used.some(x => Math.abs(x - spot) < 20) || !validSpot(spot, side)) continue;
      f.spectating = { a, b, floor, x: spot, commentT: 1.5 + Math.random() * 1.5, leaving: 0 };
      f.setBehavior('idle');
      f.think = 999;
      f.vy = 0;
      f.facing = mid > f.x ? 1 : -1;
      used.push(spot);
      watching++;
      count++;
    }
  }

  function deselectFigure(f) {
    f.selected = false;
    f.primary = false;
    if (selected === f) selected = selectionList()[0] || null;
    refreshPrimary();
    updateUI();
  }

  function cineDeath(f) {
    cine.koT = CINE_DEATH;
    cine.koDur = CINE_DEATH;
    cine.koFig = f;
    cine.introT = 0;
    cine.blastT = 0;
  }

  function removeSelectedFigures() {
    const list = selectionList().slice();
    if (!list.length) return;
    for (const f of list) removeFigure(f, true);
    flashStatus(list.length === 1 ? 'Figure removed' : `${list.length} figures removed`);
  }

  function removeFigure(f, silent = false) {
    const index = figures.indexOf(f);
    if (index < 0) return;
    cancelChatFor(f);
    cancelSpectating(f);
    cancelPursuitsFor(f);
    if (f.foe) endDuel(f);
    for (const o of figures) {
      if (o.spectating && (o.spectating.a === f || o.spectating.b === f)) {
        o.spectating.leaving = 1.4;
      }
    }
    if (fightPick === f) cancelFightPick();
    if (drag) {
      drag.items = drag.items.filter(item => item.f !== f);
      if (!drag.items.length) drag = null;
    }
    f.dragging = false;
    f.selected = false;
    f.primary = false;
    if (selected === f) selected = selectionList().find(o => o !== f) || null;
    if (cine.koFig === f) cine.koT = 0;
    if (cine.introA === f || cine.introB === f) cine.introT = 0;
    if (cine.blastCaster === f || cine.blastTarget === f) cine.blastT = 0;
    figures.splice(index, 1);
    refreshPrimary();
    updateUI();
    if (!silent) flashStatus('Figure removed');
  }

  function blastFigure(caster, target, cd = 4) {
    cancelChatFor(caster);
    cancelChatFor(target);
    cancelPursuitsFor(caster);
    cancelPursuitsFor(target);
    cancelSpectating(caster);
    cancelSpectating(target);
    cancelFightPick();
    clearDuelIntro(caster);
    clearDuelIntro(target);
    if (target.support) cancelSupport(target);
    const dir = target.x !== caster.x ? Math.sign(target.x - caster.x) : caster.facing;
    let lethal = false;
    if (target.fighting) {
      target.hp = Math.max(0, target.hp - 20);
      lethal = target.hp <= 0;
    }
    caster.powerCd = cd;
    caster.pushAnim = 0.45;
    caster.x = clamp(caster.x - dir * 8, EDGE_MARGIN, W - EDGE_MARGIN);
    spawnRing(caster.x + dir * 26, caster.y - 55);
    spawnBurst(caster.x + dir * 30, caster.y - 55, 1.7);
    spawnWord(
      caster.x + dir * 46, caster.y - 150,
      lethal ? 'K.O.' : 'BOOM', 1.2, '#a86f00',
      lethal ? WORD_LIFE_KO : WORD_LIFE
    );
    requestSlowmo(0.42, 0.35);
    requestFlash(0.12, '#ffe082');
    audio.blast(panFor(caster.x));
    shakeAmt = Math.max(shakeAmt, 6);
    requestHitStop(0.04);
    if (lethal) {
      beginDeath(target, caster);
      flashStatus('Blast!', 1000);
      return;
    }
    const partner = target.foe && target.foe.fighting && target.foe.foe === target ? target.foe : null;
    const combatFloor = target.combatFloor;
    const wallX = dir < 0 ? EDGE_MARGIN : W - EDGE_MARGIN;
    const ringOut = target.fighting && combatFloor !== null &&
      level.floorAt(wallX, level.floorY(combatFloor)) !== combatFloor;
    if (ringOut) {
      endDuel(target);
      if (partner) {
        beginPursuit(partner, target, { auto: true, allowBlown: true, waitForLanding: true });
      }
    }
    target.resetCombat();
    target.dizzyT = DIZZY_TIME;
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

  function revokePower(f) {
    if (!f || !f.hasPower) return;
    f.hasPower = false;
    f.powerCd = 0;
    flashStatus('Power off', 1600);
    updateUI();
  }

  function togglePower(f) {
    if (!f || f.blown || f.dying) return;
    if (f.hasPower) {
      revokePower(f);
      return;
    }
    f.hasPower = true;
    audio.charge(panFor(f.x));
    flashStatus('Power on', 2200);
    updateUI();
  }

  function usePower(f) {
    if (!f || f.blown || f.dying || !f.hasPower) return;
    if (f.powerCd > 0) {
      flashStatus('Recharging');
      return;
    }
    if (fightPick) cancelFightPick();
    let target = null;
    if (f.pursuit) {
      const ct = f.pursuit.target;
      if (ct && !ct.blown && !ct.dragging && !ct.dying) target = ct;
      else cancelPursuit(f);
    }
    if (!target) {
      let best = Infinity;
      for (const o of figures) {
        if (o === f || o.selected || o.dragging || o.blown || o.dying) continue;
        const d = Math.abs(o.x - f.x);
        if (d < best) { best = d; target = o; }
      }
    }
    if (!target) {
      flashStatus('No target');
    } else {
      blastFigure(f, target, 4);
    }
  }

  function createCombatState(state = 'idle', cd = 0.4 + Math.random() * 0.6) {
    return {
      state, t: 0, cd,
      hitDone: false, kbx: 0, spin: 0, hits: 0, snap: false, react: null, landed: false,
      move: null, hitIndex: 0, leaped: false, leapLanded: false
    };
  }

  const DOWN_STATES = new Set(['knockdown', 'getup', 'launched', 'stagger']);
  const ATTACK_STATES = new Set(['punch', 'kick', 'combo', 'flurry', 'sweep', 'uppercut', 'flyingkick', 'strike']);
  const TRAIL_STATES = new Set(['flyingkick', 'punch', 'kick', 'combo', 'flurry', 'uppercut', 'strike']);
  const ATTACK_RE = /punch|kick|combo|flurry|sweep|uppercut|strike/;
  const ATTACK_FULL_RE = /punch|kick|combo|flurry|sweep|uppercut|flyingkick|strike/;
  const HEAVY_KICK_RE = /flyingkick/;
  const DOWN_BLEND_RE = /knockdown|getup|launched/;
  const KICK_MOVE_RE = /lowkick|highkick|teep|roundhouse|flyknee/;
  const ARM_STRIKE_RE = /chainpunch|elbow|superman|overhand|burst/;

  function limb(origin, a1, a2, l1, l2) {
    const j = { x: origin.x + Math.sin(a1) * l1, y: origin.y + Math.cos(a1) * l1 };
    const e = { x: j.x + Math.sin(a1 + a2) * l2, y: j.y + Math.cos(a1 + a2) * l2 };
    return [origin, j, e];
  }

  function toeFor(ankle, style, f, footLen) {
    let ang = f * Math.PI * 0.5;
    if (style === 'point') ang = f * (Math.PI * 0.5 - 0.55);
    else if (style === 'flex') ang = f * (Math.PI * 0.5 + 0.3);
    else if (style === 'back') ang = f * Math.PI * 1.5;
    return { x: ankle.x + Math.sin(ang) * footLen, y: ankle.y + Math.cos(ang) * footLen };
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
      this.heightScale = pick([0.9, 1.0, 1.1]);
      this.visualScale = 1;
      this.jumpPrep = 0.24 + Math.random() * 0.12;
      this.jumpRest = 0.45 + Math.random() * 0.25;
      this.bodyScale = 1;
      this.jumpT = 0;
      this.jumpPhase = 'crouch';
      this.headR = 13;
      this.eyeR = 4.5;
      this.fighting = false;
      this.foe = null;
      this.chaosFight = false;
      this.duelIntro = null;
      this.introRunning = false;
      this._introStep = 0;
      this.combatFloor = null;
      this.hp = MAX_HP;
      this.maxHp = MAX_HP;
      this.dying = null;
      this.spectating = null;
      this.pursuit = null;
      this.pursuedBy = null;
      this.support = null;
      this.chaosStairExit = false;
      this.chaosIdleT = 0;
      this.chaosStairT = 0;
      this._chaosLastX = null;
      this._chaosLastY = null;
      this.rearAttacker = null;
      this.rearT = 0;
      this.rearCd = 0;
      this.rearCounterTarget = null;
      this.faceHoldT = 0;
      this.fightTarget = false;
      this.chatting = false;
      this.chatPartner = null;
      this.chatCd = 0;
      this.bubble = null;
      this.trail = [];
      this.combat = createCombatState();
      this.flurryCd = 0;
      this.dizzyT = 0;
      this.dizzyPhase = Math.random() * Math.PI * 2;
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
      this.restT = 0;
      this.surfaceY = y;
      this._renderPose = null;
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
      this.combat = createCombatState('ready');
      this.flurryCd = 2.5;
      this.dizzyT = 0;
      this.rearAttacker = null;
      this.rearT = 0;
      this.rearCd = 0;
      this.rearCounterTarget = null;
      this.faceHoldT = 0;
    }

    startFight(foe) {
      this.fighting = true;
      this.foe = foe || null;
      if (chaosOn) {
        this.hp = clamp(this.hp, 1, MAX_HP);
        this.maxHp = MAX_HP;
      } else {
        this.hp = MAX_HP;
        this.maxHp = MAX_HP;
      }
      this.dying = null;
      this.spectating = null;
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
      clearDuelIntro(this);
      this.fighting = false;
      this.foe = null;
      this.support = null;
      this.chaosFight = false;
      this.combatFloor = null;
      this.trail.length = 0;
      this.combat = createCombatState('idle', 0);
      this.flurryCd = 0;
      this.dizzyT = 0;
      this.rearAttacker = null;
      this.rearT = 0;
      this.rearCd = 0;
      this.rearCounterTarget = null;
      this.faceHoldT = 0;
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
      if (this.dying || this.spectating) return;
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
      else if (r < 0.75) this.setBehavior('run');
      else this.setBehavior('jump');
      if (this.behavior !== 'idle' && Math.random() < 0.5) {
        this.facing = Math.random() < 0.5 ? -1 : 1;
      }
    }

    update(dt, level) {
      if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
      if (this.dizzyT > 0) {
        this.dizzyT = Math.max(0, this.dizzyT - dt);
        if (!reduceMotion) this.dizzyPhase += dt * 5.5;
      }
      const px = this.x;
      const py = this.y;
      this._update(dt, level);
      this._tickBlend(dt);
      this._trackMotion(dt, px, py);
      this._tickSecondary(dt);
    }

    _surfaceY(level) {
      if (this.fighting && this.combatFloor !== null && !this.blown) {
        return level.floorY(this.combatFloor);
      }
      return level.surfaceAt(this.x, this.y);
    }

    _settleOnSurface(dt, sy) {
      if (this.y < sy) {
        this.vy += GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y >= sy) {
          this.y = sy;
          this.vy = 0;
        }
      } else {
        this.y = sy;
        this.vy = 0;
      }
    }

    _waitForChallenger(dt, level) {
      const sy = pursuitSurfaceY(level, this.x, this.y);
      this._settleOnSurface(dt, sy);
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      this.behavior = 'idle';
      this.facing = this.pursuedBy.x < this.x ? -1 : 1;
      this.phase += dt * 1.6;
    }

    _walkStep(dt, targetX, speed = WALK_SPEED) {
      const dir = Math.sign(targetX - this.x) || this.facing;
      this.facing = dir;
      this.behavior = 'walk';
      const prevX = this.x;
      this.x += dir * speed * this.speedMul * dt;
      this.x = clamp(this.x, EDGE_MARGIN, W - EDGE_MARGIN);
      this.phase += (Math.abs(this.x - prevX) / STRIDE_WALK) * Math.PI * 2;
      const stepIdx = Math.floor(this.phase / Math.PI);
      if (stepIdx !== this._stepPhase) {
        this._stepPhase = stepIdx;
        audio.step(panFor(this.x), false);
        spawnStepDust(this.x, this.y, false, this.facing);
      }
    }

    _chatIdle(dt, level) {
      const sy = this._surfaceY(level);
      this._settleOnSurface(dt, sy);
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      if (chat && chat.phase === 'approach' && chat.a === this &&
          Math.abs(chat.walkX - this.x) > 4) {
        this._walkStep(dt, chat.walkX, WALK_SPEED);
      } else {
        this.behavior = 'idle';
      }
      this.vy = 0;
      if (this.chatPartner) this.facing = this.chatPartner.x < this.x ? -1 : 1;
      this.phase += this.behavior === 'walk' ? 0 : dt * 1.6;
    }

    _spectate(dt, level) {
      const s = this.spectating;
      if (!s) return;
      if (chaosOn) {
        cancelSpectating(this);
        return;
      }
      if (!autonChk.checked) {
        cancelSpectating(this);
        return;
      }
      const a = s.a;
      const b = s.b;
      const live = a && b && a.fighting && b.fighting && a.foe === b && b.foe === a;
      if (!live && !s.leaving) {
        s.leaving = 1.4;
        this.bubble = makeBubble(pick(['Good fight.', 'That was quick.', 'Ouch.']), 1.5);
      }
      const sy = this._surfaceY(level);
      this._settleOnSurface(dt, sy);
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      if (s.leaving > 0) {
        s.leaving -= dt;
        this.behavior = 'idle';
        if (a && b) this.facing = (a.x + b.x) / 2 < this.x ? -1 : 1;
        this.phase += dt * 1.6;
        if (s.leaving <= 0) {
          this.spectating = null;
          this.think = 1 + Math.random() * 2;
        }
        return;
      }
      const mid = (a.x + b.x) / 2;
      if (Math.abs(s.x - this.x) > 4) {
        this._walkStep(dt, s.x, WALK_SPEED);
        this.facing = mid < this.x ? -1 : 1;
        return;
      }
      this.behavior = 'idle';
      this.vy = 0;
      this.facing = mid < this.x ? -1 : 1;
      this.phase += dt * 1.6;
      s.commentT -= dt;
      if (s.commentT <= 0 && spectatorCommentCd <= 0) {
        const style = Math.random() < 0.3
          ? (Math.random() < 0.5 ? a.style : b.style)
          : null;
        const line = style && SPECTATOR_STYLE_CHAT[style]
          ? SPECTATOR_STYLE_CHAT[style]
          : pick(SPECTATOR_CHAT);
        this.bubble = makeBubble(line, 2.2);
        s.commentT = 4 + Math.random() * 3;
        spectatorCommentCd = 2.5 + Math.random() * 1.5;
      }
    }

    updateDying(dt, level) {
      const d = this.dying;
      if (!d) return;
      d.t += dt;
      this.behavior = 'idle';
      this.vy = 0;
      this.phase += dt * 2;
      const sy = this._surfaceY(level);
      this._settleOnSurface(dt, sy);
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      if (d.phase === 'fall') {
        if (d.t >= DEATH_FALL) {
          d.phase = 'down';
          d.t = 0;
          this.landT = 0.4;
          spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
          audio.land(panFor(this.x), true);
        }
      } else if (d.phase === 'down') {
        if (d.t >= DEATH_DOWN) {
          d.phase = 'ascend';
          d.t = 0;
          d.rise = 0;
          d.alpha = 1;
          this.dizzyT = 0;
          spawnRing(this.x, this.y - 30, 1.1);
          spawnStar(this.x, this.y - 55, 1.2);
          audio.whoosh(panFor(this.x), 1.1);
        }
      } else {
        d.rise += (30 + d.t * 160) * dt;
        d.alpha = 1 - smoothstep(0.15, DEATH_ASCEND, d.t);
        if (d.t >= DEATH_ASCEND && !d.done) {
          d.done = true;
          pendingRemovals.push(this);
        }
      }
    }

    updatePursuit(dt, level) {
      const p = this.pursuit;
      if (!p) return;
      const target = p.target;
      if (!target || target.dragging ||
          ((p.chaos || p.assist || p.hunt) && (target.dying || target.blown)) ||
          (p.assist
            ? (!target.fighting || !p.teammate ||
               target.foe !== p.teammate ||
               !p.teammate.fighting || p.teammate.dying ||
               p.teammate.foe !== target)
            : p.hunt
              ? (target.dying || target.support ||
                 target.color.toLowerCase() === this.color.toLowerCase())
              : (target.pursuedBy !== this || target.fighting)) ||
          (target.blown && !p.allowBlown)) {
        cancelPursuit(this);
        return;
      }
      if (target.blown && p.waitForLanding &&
          (target.blown.phase === 'fly' || target.blown.phase === 'fall')) {
        this.behavior = 'idle';
        this.facing = target.x < this.x ? -1 : 1;
        this.vy = 0;
        this.y = pursuitSurfaceY(level, this.x, this.y);
        this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
        this.phase += dt * 1.6;
        return;
      }
      p.t += dt;
      const chaseLimit = p.assist
        ? Math.max(16, W / 150)
        : p.hunt
          ? Math.max(20, W / 120)
          : Math.max(10, W / 200);
      if (p.t > chaseLimit) {
        cancelPursuit(this);
        if (!p.assist && !p.hunt) flashStatus("Can't reach", 1600);
        return;
      }
      let myFloor = pursuitFloor(level, this.x, this.y);
      const targetFloor = pursuitFloor(level, target.x, target.y);
      if (targetFloor === 0 && Math.abs(this.y - level.groundY) <= 2) myFloor = 0;
      const groundRoute = myFloor === 0 && targetFloor === 0;
      if (targetFloor < 0) {
        cancelPursuit(this);
        if (!p.assist && !p.hunt) flashStatus('Target on stairs', 1400);
        return;
      }
      if (p.drop) {
        this.vy += GRAVITY * dt;
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
      if (target.blown && myFloor >= 0 && myFloor === targetFloor &&
          Math.abs(target.x - this.x) <= 90) {
        this.behavior = 'idle';
        this.facing = target.x < this.x ? -1 : 1;
        this.vy = 0;
        this.y = pursuitSurfaceY(level, this.x, this.y);
        this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
        this.phase += dt * 1.6;
        return;
      }
      if (myFloor >= 0 && myFloor === targetFloor && Math.abs(target.x - this.x) <= 90 && !target.blown) {
        if (p.assist) {
          if (!beginSupport(this, target, p.teammate)) cancelPursuit(this);
        } else if (p.hunt) {
          const mate = target.fighting && target.foe &&
            target.foe.color.toLowerCase() === this.color.toLowerCase() ? target.foe : null;
          if (target.fighting) {
            if (!beginSupport(this, target, mate)) cancelPursuit(this);
          } else {
            startDuel(this, target, { chaos: true });
          }
        } else {
          startDuel(this, target, { chaos: !!p.chaos });
        }
        return;
      }
      let goalX;
      let useUpper = null;
      if (myFloor < 0) {
        const lowerDist = level.isOnStairs(this.x)
          ? Math.abs(this.y - level.stairsYAt(this.x))
          : Infinity;
        const upperDist = level.isOnUpperStairs(this.x)
          ? Math.abs(this.y - level.upperStairsYAt(this.x))
          : Infinity;
        const onLower = lowerDist <= 22;
        const onUpper = upperDist <= 22;
        if (p.stair === 'lower' && !onLower) p.stair = null;
        if (p.stair === 'upper' && !onUpper) p.stair = null;
        if (!p.stair) {
          if (onUpper && onLower) {
            p.stair = targetFloor >= 2 ? 'upper'
              : targetFloor <= 0 ? 'lower'
                : (upperDist <= lowerDist ? 'upper' : 'lower');
          } else if (onUpper) {
            p.stair = 'upper';
          } else if (onLower) {
            p.stair = 'lower';
          }
        }
        useUpper = p.stair === 'upper';
        if (useUpper) {
          goalX = targetFloor >= 2 ? level.upperStairX0 - 4 : level.upperStairX1 + 4;
        } else {
          goalX = targetFloor >= 1 ? level.stairX1 + 4 : level.stairX0 - 4;
        }
      } else {
        p.stair = null;
        if (myFloor === 1 && targetFloor === 0 && target.x >= level.mezzX0) {
          goalX = level.mezzX1 + 24;
        } else if (myFloor !== targetFloor) {
          if (myFloor === 0) {
            goalX = this.x <= level.stairX0 + 2
              ? level.stairX1 + 4
              : level.stairX0 - 4;
          } else if (myFloor === 1) {
            goalX = targetFloor === 2 ? level.upperStairX1 - 4 : level.stairX1 - 4;
          } else {
            goalX = level.upperStairX0 + 4;
          }
        } else {
          goalX = target.x;
        }
      }
      const dir = Math.sign(goalX - this.x) || this.facing;
      this.facing = dir;
      this.behavior = 'run';
      this.bodyScale = lerp(this.bodyScale, 1, Math.min(1, dt * 10));
      const prevX = this.x;
      this.x += dir * RUN_SPEED * this.speedMul * dt;
      this.x = clamp(this.x, EDGE_MARGIN, W - EDGE_MARGIN);
      this.phase += (Math.abs(this.x - prevX) / STRIDE_RUN) * Math.PI * 2;
      if (myFloor === 1 && targetFloor === 0 && target.x >= level.mezzX0 &&
          (this.x >= level.mezzX1 || this.x >= W - EDGE_MARGIN - 0.5)) {
        this.x = Math.max(this.x, level.mezzX1 + 2);
        p.drop = true;
        this.vy = 0;
        this.y = level.mezzY;
        return;
      }
      this.y = groundRoute ? level.groundY : pursuitSurfaceY(level, this.x, this.y, useUpper);
      this.vy = 0;
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
      const attacking = ATTACK_RE.test(cs);
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
      this.surfaceY = groundY;
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

      if (this.dying) {
        this.updateDying(dt, level);
        return;
      }

      if (this.chatting) {
        this._chatIdle(dt, level);
        return;
      }

      if (this.spectating) {
        this._spectate(dt, level);
        return;
      }

      if (this.blown) {
        const b = this.blown;
        this.phase += dt * 6;
        if (b.phase === 'fly') {
          this.x += b.vx * dt;
          b.vy += 180 * dt;
          this.y += b.vy * dt;
          const margin = EDGE_MARGIN;
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
          b.vy += GRAVITY * dt;
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

      if (this.fighting) {
        this.updateFight(dt, level);
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
          this.vy += GRAVITY * dt;
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
        const margin = EDGE_MARGIN;
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
        this.vy += GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y >= groundY) {
          this.y = groundY;
          this.vy = 0;
        }
      } else {
        this.y = groundY;
        this.vy = 0;
      }

      let moveSpeed = 0;
      if (this.behavior === 'walk') moveSpeed = WALK_SPEED;
      else if (this.behavior === 'run') moveSpeed = RUN_SPEED;

      if (moveSpeed > 0) {
        const prevX = this.x;
        this.x += this.facing * moveSpeed * speed * dt;
        const margin = EDGE_MARGIN;
        if (this.x < margin) { this.x = margin; this.facing = 1; }
        if (this.x > W - margin) { this.x = W - margin; this.facing = -1; }
        const stridePx = this.behavior === 'walk' ? STRIDE_WALK : STRIDE_RUN;
        this.phase += (Math.abs(this.x - prevX) / stridePx) * Math.PI * 2;
        const stride = this.behavior === 'run' ? Math.PI * 2 : Math.PI;
        const stepIdx = Math.floor(this.phase / stride);
        if (stepIdx !== this._stepPhase) {
          this._stepPhase = stepIdx;
          const running = this.behavior === 'run';
          audio.step(panFor(this.x), running);
          spawnStepDust(this.x, this.y, running, this.facing);
        }
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
      const dying = this.dying ? this.dying.phase : '-';
      return `${this.style}|${this.behavior}|${combat}|${blasted}|${dying}|${this.dragging ? 'drag' : ''}`;
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
          if (DOWN_BLEND_RE.test(key)) this.blendDur = 0.18;
          else if (ATTACK_RE.test(key)) this.blendDur = 0.09;
        }
        if (!this.prevPose) this.blendT = 1;
      }
      if (this.blendT < 1) {
        this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
        if (this.blendT >= 1) this.prevPose = null;
      }
    }

    landHit(enemy, opts) {
      let {
        range, kbx, kdChance = 0, freeze = 0.05, shake = 5, starScale = 1,
        damage = 0, fx = null, flurry = false, finisher = false, pitch = null, aim = null
      } = opts;
      if (this.support) {
        damage = Math.max(1, Math.round(damage * 0.75));
        kbx = Math.round(kbx * 0.75);
        kdChance *= 0.5;
      }
      const dist = Math.abs(enemy.x - this.x);
      if (dist > range) return;
      if (enemy.dying || !enemy.fighting) return;
      const es = enemy.combat.state;
      const aimPose = enemy._renderPose;
      const headY = aim === 'head' && aimPose ? enemy.y + aimPose.head.y : null;
      const bodyY = aim === 'body' && aimPose ? enemy.y + aimPose.chest.y : null;
      const aimY = headY ?? bodyY ?? this.y - 55;
      if (es === 'block') {
        this.x -= this.facing * 10;
        spawnStar((this.x + enemy.x) / 2, aimY, 0.6);
        spawnRing((this.x + enemy.x) / 2, aimY, 0.45);
        audio.block(panFor((this.x + enemy.x) / 2));
        return;
      }
      if (es === 'dodge' && enemy.combat.t > 0.14) return;
      if ((es === 'stagger' && !flurry) || es === 'knockdown' || es === 'getup' || es === 'launched') return;
      if (!flurry && Math.random() < (fx === 'superman' ? 0.1 : 0.25) && !opts.guaranteedKd) {
        enemy.combat.state = 'dodge';
        enemy.combat.t = 0.3;
        audio.whoosh(panFor(enemy.x), 0.6);
        return;
      }
      enemy.hp = Math.max(0, enemy.hp - damage);
      const lethal = enemy.hp <= 0;
      const dir = enemy.x >= this.x ? 1 : -1;
      const midX = (this.x + enemy.x) / 2;
      const hitY = aimY;
      const knocked = lethal || opts.guaranteedKd || Math.random() < kdChance;
      if (enemy.foe && (enemy.foe !== this || enemy.rearAttacker)) {
        enemy.rearAttacker = this;
        enemy.rearT = knocked ? 5 : 3.2;
        enemy.rearCd = 0;
        enemy.facing = this.x >= enemy.x ? 1 : -1;
        enemy.faceHoldT = knocked ? 0.6 : 0.4;
      }
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
        enemy.dizzyT = DIZZY_TIME;
        spawnDust(enemy.x, enemy.y, 7);
        spawnStar(midX, hitY, starScale * 1.3);
        shakeAmt = Math.max(shakeAmt, Math.max(shake, 9));
        requestHitStop(0.07);
      } else {
        enemy.combat.state = 'stagger';
        enemy.combat.t = flurry ? 0.12 : 0.35;
        enemy.combat.reactDur = flurry ? 0.12 : 0.35;
        enemy.combat.react = {
          kind: reactKind,
          strength: flurry ? 0.55 : reactStrength,
          dir
        };
        enemy.combat.snap = true;
        enemy.combat.spin = 0;
        enemy.combat.kbx = dir * kbx;
        spawnStar(midX, hitY, starScale);
        shakeAmt = Math.max(shakeAmt, shake);
        if (!flurry) requestHitStop(freeze);
      }
      if (flurry) {
        spawnInk(midX, hitY, 1);
        spawnRing(midX, hitY, 0.45);
      } else {
        spawnInk(midX, hitY, knocked ? 6 : 3);
        spawnRing(midX, hitY, clamp(0.7 + kbx / 300, 0.7, 1.7));
      }
      if (knocked) {
        requestSlowmo(0.38, 0.5);
        spawnBurst(midX, hitY, starScale * 1.6);
        spawnWord(
          enemy.x, enemy.y - 158,
          finisher ? (lethal ? 'K.O.' : '12 HIT COMBO!') : (lethal ? 'K.O.' : 'DOWN!'),
          finisher ? 1.15 : 1.5, '#a86f00',
          finisher ? WORD_LIFE_KO : (lethal ? WORD_LIFE_KO : WORD_LIFE_DOWN)
        );
      } else if (kbx >= 240) {
        spawnBurst(midX, hitY, 1.15);
        spawnWord(midX, hitY - 64, pick(['BAM', 'WHAM']), 1.1);
      } else if (kbx >= 150) {
        spawnWord(midX, hitY - 58, pick(['POW', 'WHACK']), 0.95);
      }
      if (fx === 'superman' && !lethal) {
        audio.supermanHit(panFor(midX));
        if (!knocked) requestSlowmo(0.34, 0.4);
      }
      if (knocked || kbx >= 150) {
        spawnSplat(midX + dir * 8, enemy._surfaceY(level), clamp(0.85 + kbx / 500, 0.85, 1.5));
      }
      if (knocked || kbx >= 150) requestFlash(knocked ? 0.22 : 0.16, '#ffd54f');
      audio.hit(reactKind, pitch !== null ? pitch : clamp(0.75 + kbx / 420, 0.75, 1.35), panFor(midX));
      if (knocked && kbx >= 240) audio.ko(panFor(enemy.x));
      if (lethal) beginDeath(enemy, this);
      else if (knocked) cineKO(enemy);
    }

    updateFight(dt, level) {
      const groundY = this._surfaceY(level);
      const fb = level.floorBounds(this.combatFloor ?? 0);
      const xMin = fb.x0;
      const xMax = fb.x1;
      const c = this.combat;
      c.t -= dt;
      if (this.flurryCd > 0) this.flurryCd = Math.max(0, this.flurryCd - dt);
      this.phase += dt * 8;
      const stateKey = c.state === 'strike' ? `strike:${c.move}` : c.state;
      if (stateKey !== this._lastCombatState) {
        this._lastCombatState = stateKey;
        if (ATTACK_FULL_RE.test(c.state)) {
          const power = c.state === 'strike'
            ? (c.move === 'superman' ? 1.5 : c.move === 'highkick' ? 1.35 : c.move === 'burst' ? 1.2 : c.move === 'flyknee' ? 1.25 : c.move === 'roundhouse' ? 1.1 : c.move === 'teep' ? 1.0 : 0.8)
            : (HEAVY_KICK_RE.test(c.state) ? 1.2 : 0.8);
          audio.whoosh(panFor(this.x), power);
        }
      }

      if (c.state === 'getup') {
        c.kbx = 0;
      } else if (Math.abs(c.kbx) > 1) {
        this.x += c.kbx * dt;
        c.kbx *= Math.pow(0.001, dt);
      } else c.kbx = 0;

      if (this.foe && (
        !this.foe.fighting ||
        (this.support
          ? this.foe !== this.support.target ||
            (this.support.teammate && (
              this.support.teammate.foe !== this.foe ||
              this.foe.foe !== this.support.teammate ||
              !this.support.teammate.fighting ||
              this.support.teammate.dying
            ))
          : this.foe.foe !== this)
      )) {
        this.stopFight();
        return;
      }
      const foe = this.foe;
      if (!foe) {
        this.rearAttacker = null;
        this.rearT = 0;
        this.rearCounterTarget = null;
        c.state = 'wander';
        this.x += this.facing * 50 * this.speedMul * dt;
        this.x = clamp(this.x, xMin, xMax);
        if (this.x <= EDGE_MARGIN) this.facing = 1;
        if (this.x >= W - EDGE_MARGIN) this.facing = -1;
        return;
      }

      if (this.rearT > 0) {
        this.rearT = Math.max(0, this.rearT - dt);
        const rearAttacker = this.rearAttacker;
        if (!rearAttacker || !rearAttacker.fighting || rearAttacker.dying ||
            rearAttacker.blown || rearAttacker === foe) {
          this.rearAttacker = null;
          this.rearT = 0;
          this.rearCounterTarget = null;
        } else if (Math.abs(rearAttacker.x - this.x) <= 150) {
          this.rearT = Math.max(this.rearT, 0.7);
        }
        if (this.rearT <= 0) {
          this.rearAttacker = null;
          this.rearCounterTarget = null;
        }
      }
      const rear = this.rearAttacker && this.rearT > 0 ? this.rearAttacker : null;
      const enemy = rear || foe;
      const dx = enemy.x - this.x;
      const dist = Math.abs(dx);
      if (this.faceHoldT > 0) this.faceHoldT = Math.max(0, this.faceHoldT - dt);
      const faceTarget = enemy;
      const faceDx = faceTarget.x - this.x;
      const faceDist = Math.abs(faceDx);
      const facingFrozen = c.state === 'knockdown' || c.state === 'getup' || c.state === 'launched' ||
        (c.state === 'strike' && c.leaped);
      if (faceDist > 4 && !facingFrozen && this.faceHoldT <= 0) this.facing = faceDx > 0 ? 1 : -1;

      if (this.support && this.support.flankSide != null) {
        const target = this.support.target;
        const gap = this.support.flankDist || 68;
        this.support.flankX = clamp(target.x + this.support.flankSide * gap, xMin + 4, xMax - 4);
        if (!rear) {
          const flankDist = Math.abs(this.support.flankX - this.x);
          if (flankDist <= 8) {
            this.support.flankT = 0;
            this.support.flankLastDist = flankDist;
          } else {
            const lastDist = this.support.flankLastDist;
            if (lastDist == null || lastDist - flankDist >= 1) {
              this.support.flankT = 0;
            } else {
              this.support.flankT = (this.support.flankT || 0) + dt;
            }
            this.support.flankLastDist = flankDist;
            if (this.support.flankT > 0.7) {
              this.support.flankSide = null;
              this.support.flankX = null;
              this.support.flankT = 0;
              this.support.flankLastDist = null;
            }
          }
        }
      }

      const flanking = !!(this.support && this.support.flankSide != null &&
        this.support.flankX != null && !rear &&
        Math.abs(this.support.flankX - this.x) > 8);
      if (!flanking && dist < 26 && !DOWN_STATES.has(c.state) && !DOWN_STATES.has(enemy.combat.state)) {
        this.x -= this.facing * (26 - dist) * 0.5;
        this.x = clamp(this.x, xMin, xMax);
      }

      if (enemy.blown) {
        if (this.support) {
          cancelSupport(this);
          return;
        }
        if (this.chaosFight) {
          endDuel(this);
          return;
        }
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

      const intro = this.duelIntro;
      if (intro) {
        this.facing = dx > 0 ? 1 : -1;
        if (intro.phase === 'charge') {
          this.introRunning = true;
          if (this.behavior !== 'run') {
            this.behavior = 'run';
            this.phase = 0;
            this._stepPhase = 0;
          }
          if (this === intro.kicker) {
            intro.t += dt;
            if (dist <= 302 || intro.t >= 0.7) {
              intro.phase = 'kick';
              this.introRunning = false;
              c.introKick = true;
              c.state = 'flyingkick';
              c.t = 0.85;
              c.hitDone = false;
              c.kickDone = false;
              c.lungeV = 0;
              intro.kicked.introRunning = false;
              const dr = Math.random();
              if (dr < 0.34) {
                intro.kicked.combat.state = 'block';
                intro.kicked.combat.t = 0.75;
              } else if (dr < 0.62) {
                intro.kicked.combat.state = 'dodge';
                intro.kicked.combat.t = 0.5;
              } else {
                intro.kicked.combat.state = 'ready';
                intro.kicked.combat.t = 0;
              }
              return;
            }
          }
          if (dist > 302) {
            this.x += this.facing * RUN_SPEED * dt;
            this.x = clamp(this.x, xMin, xMax);
            this._introStep += Math.abs(RUN_SPEED * dt);
            if (this._introStep >= 34) {
              this._introStep = 0;
              spawnStepDust(this.x, this.y, true, this.facing);
              audio.step(panFor(this.x), true);
            }
          }
          return;
        }
        if (intro.phase === 'kick' && this === intro.kicked) {
          this.introRunning = false;
          if (c.state === 'dodge') this.x += this.facing * -95 * dt;
          else if (c.state === 'block' && c.t <= 0) c.state = 'ready';
          this.x = clamp(this.x, xMin, xMax);
          return;
        }
      }

      const airborne = this.y < groundY - 2;
      if (TRAIL_STATES.has(c.state)) {
        this.trail.push({ x: this.x, y: this.y, spin: c.spin, snap: this._renderPose || this.pose() });
        if (this.trail.length > 6) this.trail.shift();
      } else {
        this.trail.length = 0;
      }

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
        if (this.support && this.support.flankSide != null && !rear) {
          const flankX = this.support.flankX;
          if (flankX != null) {
            const toFlank = flankX - this.x;
            if (Math.abs(toFlank) > 8) {
              this.facing = Math.sign(toFlank) || this.facing;
              this.x += this.facing * 110 * this.speedMul * dt;
              this.x = clamp(this.x, xMin, xMax);
              return;
            }
            c.state = 'ready';
            c.cd = 0.05;
            return;
          }
        }
        const stopAt = this.style === 'mma' ? 185 : 78;
        if (dist > stopAt) {
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
          const profile = STYLE_COMBAT[this.style] || STYLE_COMBAT.brawler;
          c.cd = profile.recoverMin + Math.random() * profile.recoverJitter;
        }
        return;
      }

      if (c.state === 'flyingkick') {
        const total = 0.85;
        const elapsed = total - c.t;
        const longKick = !!c.introKick;
        if (elapsed < 0.18) {
          this.bodyScale = lerp(1, 0.82, elapsed / 0.18);
        } else if (!c.hitDone && elapsed >= 0.18) {
          c.hitDone = true;
          this.bodyScale = 1;
          this.vy = longKick ? -520 : -400;
          const gap = Math.max(0, dist - (longKick ? 50 : 90));
          c.lungeV = this.facing * (longKick
            ? clamp(gap / 0.30, 320, 1100)
            : clamp(gap / 0.35, 240, 620));
          spawnDust(this.x, this.y, 4);
          if (longKick) audio.whoosh(panFor(this.x), 1.35);
        }
        if (c.hitDone && airborne) {
          this.x += c.lungeV * dt;
          this.x = clamp(this.x, xMin, xMax);
          const hitAt = longKick ? 0.30 : 0.24;
          const hitRange = longKick ? 285 : 130;
          if (!c.kickDone && elapsed > hitAt && Math.abs(enemy.x - this.x) <= hitRange) {
            c.kickDone = true;
            this.landHit(enemy, longKick
              ? { range: 285, kbx: 320, kdChance: 0.5, freeze: 0.09, shake: 12, starScale: 1.6, damage: 20 }
              : { range: 130, kbx: 280, kdChance: 0.4, freeze: 0.07, shake: 10, starScale: 1.4, damage: 18 });
            c.lungeV *= 0.3;
            if (longKick) {
              clearDuelIntro(this);
              c.introKick = false;
            }
          }
          if (longKick && !c.kickDone && elapsed > 0.64) {
            c.kickDone = true;
            clearDuelIntro(this);
            c.introKick = false;
          }
        }
        if (c.hitDone && !airborne && elapsed > 0.3) {
          this.landT = 0.4;
          spawnDust(this.x, this.y, reduceMotion ? 3 : 6);
          if (c.introKick) {
            clearDuelIntro(this);
            c.introKick = false;
          }
          c.state = 'ready';
          c.cd = 0.5 + Math.random() * 0.4;
          c.hitDone = false;
          c.kickDone = false;
        }
        if (c.t <= -0.4) {
          this.y = groundY; this.vy = 0;
          if (c.introKick) {
            clearDuelIntro(this);
            c.introKick = false;
          }
          c.state = 'ready'; c.cd = 0.4;
          c.hitDone = false; c.kickDone = false;
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
          this.landHit(enemy, { range: 95, kbx: 170, guaranteedKd: true, freeze: 0.06, shake: 8, starScale: 1.1, damage: 9 });
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
            this.landHit(enemy, { range: 90, kbx: 100, freeze: 0.08, shake: 10, starScale: 1.5, damage: 13 });
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
            starScale: c.state === 'punch' ? 0.9 : 1.1,
            damage: c.state === 'punch' ? 7 : 11
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
          this.landHit(enemy, { range: 92, kbx: 50, starScale: 0.75, freeze: 0.03, shake: 3, damage: 5 });
        }
        if (!(c.hits & 2) && elapsed >= 0.4) {
          c.hits |= 2;
          this.landHit(enemy, { range: 92, kbx: 60, starScale: 0.8, freeze: 0.03, shake: 4, damage: 5 });
        }
        if (!(c.hits & 4) && elapsed >= 0.66) {
          c.hits |= 4;
          this.landHit(enemy, { range: 108, kbx: 200, kdChance: 0.18, starScale: 1.25, freeze: 0.06, shake: 8, damage: 11 });
        }
        if (c.t <= 0) {
          c.state = 'ready';
          c.hits = 0;
          c.cd = 0.6 + Math.random() * 0.5;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      if (c.state === 'flurry') {
        const elapsed = FLURRY_TOTAL - c.t;
        if (elapsed < 0.24) this.x += this.facing * 55 * this.speedMul * dt;
        const eState = enemy.combat.state;
        const hardDown = eState === 'knockdown' || eState === 'getup' || eState === 'launched';
        const done = c.hitIndex >= FLURRY_MOVES.length;
        if (enemy.dying || !enemy.fighting || (!done && hardDown) ||
            eState === 'block' || eState === 'dodge' || dist > 122) {
          c.state = 'ready';
          c.hitIndex = 0;
          c.cd = 0.55 + Math.random() * 0.35;
          this.trail.length = 0;
          this.x = clamp(this.x, xMin, xMax);
          return;
        }
        while (c.hitIndex < FLURRY_MOVES.length && elapsed >= FLURRY_MOVES[c.hitIndex].at) {
          const h = FLURRY_MOVES[c.hitIndex];
          if (!h.finisher && (enemy.combat.state === 'knockdown' ||
              enemy.combat.state === 'getup' || enemy.combat.state === 'launched')) break;
          c.hitIndex++;
          this.landHit(enemy, {
            range: h.finisher ? 118 : 108,
            kbx: h.kbx,
            damage: h.damage,
            freeze: h.finisher ? 0.09 : 0,
            shake: h.finisher ? 14 : 2.5,
            starScale: h.finisher ? 1.55 : 0.55,
            kdChance: 0,
            guaranteedKd: !!h.finisher,
            flurry: true,
            finisher: !!h.finisher,
            aim: h.aim,
            pitch: 0.92 + c.hitIndex * 0.025 - (h.aim === 'body' ? 0.12 : 0)
          });
          if (enemy.combat.state === 'block' || enemy.combat.state === 'dodge') break;
          if (h.finisher) break;
        }
        if (c.t <= 0) {
          c.state = 'ready';
          c.hitIndex = 0;
          c.cd = 1.1 + Math.random() * 0.5;
          this.trail.length = 0;
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
        if (c.move === 'burst') {
          if (elapsed < m.hop.dur) {
            this.x -= this.facing * (m.hop.dist / m.hop.dur) * dt;
          } else if (elapsed < m.dash.to) {
            if (!c.burstDashed) {
              c.burstDashed = true;
              spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
              spawnSkid(this.x, this.y, this.facing);
              audio.whoosh(panFor(this.x), 1.2);
            }
            const stopX = enemy.x - this.facing * m.dash.stopGap;
            const dir = Math.sign(stopX - this.x) || this.facing;
            this.x += dir * Math.min(m.dash.speed * dt, Math.abs(stopX - this.x));
          }
          while (c.hitIndex < m.hits.length && elapsed >= m.hits[c.hitIndex].at) {
            const h = m.hits[c.hitIndex++];
            this.landHit(enemy, { ...m, ...h });
          }
          if (c.t <= 0) {
            c.state = 'ready';
            c.cd = m.cd + Math.random() * m.cdJitter;
            c.move = null;
            c.hitIndex = 0;
            c.burstDashed = false;
          }
          this.x = clamp(this.x, xMin, xMax);
          return;
        }
        if (m.leap) {
          if (!c.leaped && elapsed >= m.leap.at) {
            c.leaped = true;
            this.vy = m.leap.vy;
            this.bodyScale = 1.06;
            const flight = (2 * Math.abs(m.leap.vy)) / GRAVITY;
            const gap = m.leap.gap ?? 78;
            const targetGap = Math.max(0, dist - gap);
            c.lungeV = this.facing * clamp(targetGap / flight, m.leap.min, m.leap.max);
            spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
            if (c.move === 'superman') audio.supermanLaunch(panFor(this.x));
            else audio.leap(panFor(this.x), 1.1);
          }
          if (c.leaped) {
            if (!c.leapLanded) this.x += c.lungeV * dt;
            if (!c.leapLanded && !airborne && elapsed > m.leap.at + 0.06) {
              c.leapLanded = true;
              this.landT = 0.4;
              this.bodyScale = 0.88;
              spawnDust(this.x, this.y, reduceMotion ? 4 : 8);
              spawnSkid(this.x, this.y, this.facing);
              audio.land(panFor(this.x), true);
              if (c.t > 0.22) c.t = 0.22;
            }
          } else if (elapsed < m.lungeEnd) {
            this.x += this.facing * m.lungeSpeed * dt;
          }
        } else if (elapsed < m.lungeEnd) {
          this.x += this.facing * m.lungeSpeed * dt;
        }
        while (c.hitIndex < m.hits.length && elapsed >= m.hits[c.hitIndex].at) {
          const h = m.hits[c.hitIndex++];
          this.landHit(enemy, { ...m, ...h });
        }
        if (c.t <= 0) {
          c.state = 'ready';
          c.cd = m.cd + Math.random() * m.cdJitter;
          c.move = null;
          c.hitIndex = 0;
          c.leaped = false;
          c.leapLanded = false;
        }
        this.x = clamp(this.x, xMin, xMax);
        return;
      }

      // ready
      c.cd -= dt;
      if (airborne) return;
      if (this.support && this.support.flankSide != null && !rear) {
        const flankX = this.support.flankX;
        if (flankX != null && Math.abs(flankX - this.x) > 8) {
          c.state = 'approach';
          c.cd = 0.05;
          return;
        }
      }
      const eState = enemy.combat.state;
      if (DOWN_STATES.has(eState)) {
        c.cd = 0.12;
        if (dist > 120) c.state = 'approach';
        return;
      }
      const enemyAttacking = ATTACK_STATES.has(eState);
      const profile = STYLE_COMBAT[this.style] || STYLE_COMBAT.brawler;
      const defendChance = profile.defend;
      if (enemyAttacking && dist < 125 && Math.random() < defendChance) {
        if (Math.random() < profile.block) {
          c.state = 'block';
          c.t = profile.blockT;
        } else {
          c.state = 'dodge';
          c.t = 0.3;
        }
        return;
      }
      if (this.hasPower && this.powerCd <= 0 && !this.support && !rear && dist < 240 && Math.random() < 0.2) {
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
          if (dist > 130) {
            c.state = 'approach';
          } else if (dist > 96) {
            if (Math.random() < 0.5) startStrike(this, 'burst');
            else c.state = 'approach';
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
        } else if (this.style === 'mma') {
          const r = Math.random();
          if (dist > 240) {
            c.state = 'approach';
          } else if (dist > 170) {
            if (dist < 205 && r < 0.4) startStrike(this, 'superman');
            else if (dist < 195 && r < 0.55) startStrike(this, 'highkick');
            else if (r < 0.7) startStrike(this, 'flyknee');
            else if (r < 0.82) c.state = 'approach';
            else if (r < 0.94) { c.state = 'block'; c.t = 0.32; }
            else { c.state = 'dodge'; c.t = 0.3; }
          } else if (dist > 110) {
            if (r < 0.28) startStrike(this, 'highkick');
            else if (r < 0.44 && dist < 150) startStrike(this, 'burst');
            else if (r < 0.6) startStrike(this, 'flyknee');
            else if (r < 0.76) startStrike(this, 'overhand');
            else if (r < 0.88) startStrike(this, 'lowkick');
            else if (r < 0.94) { c.state = 'block'; c.t = 0.36; }
            else { c.state = 'dodge'; c.t = 0.3; }
          } else {
            if (this.flurryCd <= 0 && dist < 108 &&
                eState !== 'block' && eState !== 'dodge' && r < 0.4) {
              startFlurry(this);
            } else if (r < 0.64) startStrike(this, 'overhand');
            else if (r < 0.84) startStrike(this, 'lowkick');
            else if (r < 0.92) { c.state = 'block'; c.t = 0.36; }
            else { c.state = 'dodge'; c.t = 0.3; }
          }
        } else if (this.style === 'shaolin') {
          if (dist > 170) {
            c.state = 'approach';
          } else {
            const r = Math.random();
            if (dist > 120) {
              if (r < 0.4) startStrike(this, 'highkick');
              else if (r < 0.7) startStrike(this, 'roundhouse');
              else if (r < 0.88) startStrike(this, 'teep');
              else c.state = 'approach';
            } else if (dist > 96) {
              if (r < 0.35) startStrike(this, 'overhand');
              else if (r < 0.6) startStrike(this, 'roundhouse');
              else if (r < 0.78) startStrike(this, 'teep');
              else if (r < 0.9) { c.state = 'block'; c.t = 0.38; }
              else { c.state = 'dodge'; c.t = 0.3; }
            } else {
              const r = Math.random();
              if (r < 0.28) startStrike(this, 'knee');
              else if (r < 0.55) startStrike(this, 'elbow');
              else if (r < 0.75) startStrike(this, 'overhand');
              else if (r < 0.9) { c.state = 'block'; c.t = 0.42; }
              else { c.state = 'dodge'; c.t = 0.3; }
            }
          }
        } else {
          const r = Math.random();
          if (dist > 200) {
            if (r < 0.7) c.state = 'approach';
            else { c.state = 'flyingkick'; c.t = 0.85; c.hitDone = false; c.kickDone = false; }
          } else if (dist > 100) {
            if (r < 0.3) c.state = 'approach';
            else if (r < 0.55) { c.state = 'flyingkick'; c.t = 0.85; c.hitDone = false; c.kickDone = false; }
            else if (r < 0.7) { c.state = 'kick'; c.t = 0.45; c.hitDone = false; }
            else if (r < 0.85) { c.state = 'punch'; c.t = 0.35; c.hitDone = false; }
            else { c.state = 'kick'; c.t = 0.45; c.hitDone = false; }
          } else {
            if (r < 0.16) { c.state = 'punch'; c.t = 0.35; c.hitDone = false; }
            else if (r < 0.28) { c.state = 'kick'; c.t = 0.45; c.hitDone = false; }
            else if (r < 0.4) { c.state = 'combo'; c.t = 0.95; c.hits = 0; }
            else if (r < 0.52) { c.state = 'kick'; c.t = 0.45; c.hitDone = false; }
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
      const baseScale = this.fighting
      ? Math.max(1, this.bodyScale)
      : (this.style === 'brawler' ? Math.max(0.9, this.bodyScale) : this.bodyScale);
    const rawScale = baseScale * (1 + landWave);
    const squashScale = this.fighting ? Math.max(1, rawScale) : rawScale;
    const s = squashScale * this.heightScale;
    this.visualScale = s;
      const p = this.phase;
      const headR = this.headR * s;
      const f = this.facing;
      const b = this.behavior;
      const hipY = -39.5 * s;

      let lean = 0;
      let reactHold = 0, reactSettle = 0, reactWobble = 0;
      if (b === 'run') {
        const speedK = clamp((this.speedMul - 0.9) / 0.35, 0, 1);
        lean = (0.34 + speedK * 0.08) * f;
      }
      else if (b === 'walk') lean = 0.06 * f;
      else if (b === 'jump') lean = 0.1 * f;
      if (this.dragging) lean = 0.05 * f;
      else if (this.pushAnim > 0) lean = 0.32 * f;
      else if (this.fighting && !this.introRunning) {
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
        else if (cs === 'sweep') lean = 0.5 * f;
        else if (cs === 'uppercut') lean = 0.08 * f;
        else if (cs === 'combo') lean = 0.18 * f;
        else if (cs === 'flurry') {
          const e = FLURRY_TOTAL - this.combat.t;
          const fin = FLURRY_MOVES[FLURRY_MOVES.length - 1];
          const fp = smoothstep(fin.at - 0.10, fin.at + 0.04, e);
          lean = (0.1 + fp * 0.22 + Math.sin(e * 24) * 0.015) * f;
        }
        else if (cs === 'strike') {
          const move = this.combat.move;
          if (move === 'teep') lean = -0.18 * f;
          else if (move === 'roundhouse') lean = -0.06 * f;
          else if (move === 'lowkick') lean = 0.08 * f;
          else if (move === 'highkick') {
            const e = STRIKES.highkick.total - this.combat.t;
            const hk = smoothstep(0.12, 0.30, e) * (1 - smoothstep(0.40, 0.60, e));
            lean = -(0.06 + hk * 0.30) * f;
          }
          else if (move === 'burst') {
            const e = STRIKES.burst.total - this.combat.t;
            lean = (0.04 - smoothstep(0.02, 0.12, e) * 0.16 + smoothstep(0.16, 0.28, e) * 0.28) * f;
          }
          else if (move === 'chainpunch' || move === 'elbow') lean = 0.2 * f;
          else if (move === 'knee') lean = 0.12 * f;
          else if (move === 'superman') {
            const e = STRIKES.superman.total - this.combat.t;
            lean = (0.04 + smoothstep(0.10, 0.20, e) * 0.16 - smoothstep(0.34, 0.48, e) * 0.06) * f;
          }
          else if (move === 'flyknee') lean = 0.2 * f;
          else if (move === 'overhand') lean = 0.3 * f;
          else lean = 0.1 * f;
        }
        else if (cs === 'launched') lean = -0.35 * f;
        else if (cs === 'getup') lean = 0.1 * f;
        else lean = 0.1 * f;
      }

      let bounce = 0;
      if (!this.dragging) {
        if (b === 'run') bounce = Math.abs(Math.cos(p)) * 5 * s;
        else if (b === 'walk') bounce = Math.abs(Math.cos(p)) * 1.5 * s;
      }

      let hip, chest, neck, head;
      const fightingPose = (this.fighting || this.dying) && !this.dragging && !this.introRunning;
      const combatState = this.dying ? 'knockdown' : (fightingPose ? this.combat.state : '');
      let spineBend = clamp(-lean * 0.16, -0.09, 0.09);
      if (combatState === 'punch' || combatState === 'combo' || combatState === 'flurry' ||
          (combatState === 'strike' && ARM_STRIKE_RE.test(this.combat.move))) spineBend += 0.04 * f;
      else if (combatState === 'block') spineBend += 0.03 * f;
      else if (combatState === 'kick' || combatState === 'sweep' || combatState === 'flyingkick' ||
          (combatState === 'strike' && KICK_MOVE_RE.test(this.combat.move))) spineBend -= 0.04 * f;
      if (this.landT > 0) {
        spineBend += f * 0.05 * clamp(this.landT / 0.4, 0, 1);
      }
      let down = 0;
      let downElapsed = 0;
      let settle = 0;

      if (this.dying) {
        if (this.dying.phase === 'fall') {
          down = smoothstep(0, DEATH_FALL, this.dying.t);
        } else if (this.dying.phase === 'down') {
          down = 1;
        } else {
          down = 1 - smoothstep(0, DEATH_ASCEND, this.dying.t);
        }
      } else if (this.blown) {
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
      head = { x: neck.x + spineBend * 7 * s, y: neck.y - headR - 6 };
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
        } else if (this.style === 'mma') {
          lHip = 0.46 + bob; rHip = -0.34;
          lKnee = -0.58; rKnee = -0.18;
          la = 0.62; la2 = 2.12;
          ra = 0.56; ra2 = 2.02;
        } else if (this.style === 'shaolin') {
          lHip = 0.64 + bob; rHip = -0.5;
          lKnee = -0.9; rKnee = -0.28;
          la = 0.28; la2 = 2.25;
          ra = 0.6; ra2 = 2.0;
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
        } else if (cs === 'flurry') {
          const e = FLURRY_TOTAL - this.combat.t;
          let idx = -1;
          for (let i = 0; i < FLURRY_MOVES.length; i++) {
            if (e >= FLURRY_MOVES[i].at - 0.055) idx = i;
          }
          if (idx >= 0) {
            const hit = FLURRY_MOVES[idx];
            const punch = Math.sin(Math.PI * clamp((e - hit.at + 0.055) / 0.11, 0, 1));
            const lead = hit.side === 'lead';
            const bodyShot = hit.aim === 'body';
            if (hit.kind === 'jab' || hit.kind === 'cross') {
              const armA = bodyShot ? 1.25 : 2.30;
              if (lead) {
                la = lerp(0.62, armA, punch); la2 = lerp(2.12, 0.03, punch);
                ra = lerp(0.56, 0.62, punch); ra2 = lerp(2.02, 2.2, punch);
              } else {
                ra = lerp(0.56, armA, punch); ra2 = lerp(2.02, 0.03, punch);
                la = lerp(0.62, 0.7, punch); la2 = lerp(2.12, 2.3, punch);
              }
              if (bodyShot) {
                lHip = lerp(0.46, 0.58, punch);
                lKnee = lerp(-0.58, -0.74, punch);
                rKnee = lerp(-0.18, -0.34, punch);
              }
            } else if (hit.kind === 'hook') {
              if (lead) {
                la = lerp(0.62, 1.98, punch); la2 = lerp(2.12, 1.35, punch);
                ra = 0.56; ra2 = 2.02;
              } else {
                ra = lerp(0.56, 1.96, punch); ra2 = lerp(2.02, 1.36, punch);
                la = 0.62; la2 = 2.12;
              }
              lHip = lerp(0.46, 0.52, punch);
            } else if (hit.kind === 'body') {
              ra = lerp(0.56, 1.0, punch); ra2 = lerp(2.02, 0.95, punch);
              la = 0.62; la2 = 2.12;
              lHip = lerp(0.46, 0.5, punch);
              lKnee = lerp(-0.58, -0.8, punch);
              rKnee = lerp(-0.18, -0.34, punch);
            } else if (hit.kind === 'uppercut') {
              const armA = bodyShot ? 1.15 : (lead ? 2.15 : 2.2);
              const elbowA = bodyShot ? 0.5 : 0.35;
              if (lead) {
                la = lerp(0.62, armA, punch); la2 = lerp(2.12, elbowA, punch);
                ra = 0.56; ra2 = 2.02;
              } else {
                ra = lerp(0.56, armA, punch); ra2 = lerp(2.02, elbowA, punch);
                la = 0.62; la2 = 2.12;
              }
              if (bodyShot) {
                lHip = lerp(0.46, 0.58, punch);
                rHip = lerp(-0.34, -0.30, punch);
                lKnee = lerp(-0.58, -0.72, punch);
                rKnee = lerp(-0.18, -0.30, punch);
              } else {
                lHip = lerp(0.46, 0.3, punch);
                rHip = lerp(-0.34, -0.22, punch);
                lKnee = lerp(-0.58, -0.35, punch);
              }
            } else if (hit.kind === 'overhand') {
              ra = lerp(0.56, 2.35, punch); ra2 = lerp(2.02, -0.35, punch);
              la = 0.62; la2 = 2.12;
              lHip = lerp(0.46, 0.36, punch);
              lKnee = lerp(-0.58, -0.68, punch);
              rKnee = lerp(-0.18, -0.32, punch);
            }
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
          } else if (this.style === 'shaolin') {
            lHip = 0.58; lKnee = -0.8;
            rHip = -0.44; rKnee = -0.26;
            la = 0.8; la2 = 2.45;
            ra = 0.72; ra2 = 2.5;
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
            if (move === 'burst') {
              const coil = smoothstep(0, 0.10, e) * (1 - smoothstep(0.12, 0.20, e));
              const dash = smoothstep(0.16, 0.28, e) * (1 - smoothstep(0.42, 0.60, e));
              const punch = smoothstep(0.28, 0.36, e) * (1 - smoothstep(0.38, 0.54, e));
              la = lerp(0.34, 2.30, punch); la2 = lerp(1.85, 0.03, punch);
              ra = 0.42; ra2 = 1.75;
              lHip = 0.36 + coil * 0.18 + dash * 0.10;
              lKnee = -0.52 - coil * 0.30 - dash * 0.10;
              rHip = -0.28 - coil * 0.10;
              rKnee = -0.20 - coil * 0.25;
            } else if (move === 'chainpunch') {
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
            } else if (move === 'highkick') {
              const chamber = smoothstep(0.04, 0.15, e) * (1 - smoothstep(0.34, 0.56, e));
              const kick = smoothstep(0.15, 0.30, e) * (1 - smoothstep(0.40, 0.62, e));
              rHip = lerp(-0.30, 1.05, chamber);
              rKnee = lerp(-0.30, -1.55, chamber);
              rHip = lerp(rHip, 2.30, kick);
              rKnee = lerp(rKnee, -0.12, kick);
              lHip = lerp(0.36, 0.28, kick);
              lKnee = lerp(-0.52, -0.62, kick);
              la = lerp(0.34, -0.55, kick); la2 = lerp(1.85, 0.55, kick);
              ra = lerp(0.42, 0.95, kick); ra2 = lerp(1.75, 1.15, kick);
            } else if (move === 'knee') {
              const knee = smoothstep(0.04, 0.14, e) * (1 - smoothstep(0.2, 0.36, e));
              lHip = lerp(0.36, 1.35, knee);
              lKnee = lerp(-0.6, -1.55, knee);
              rHip = -0.3; rKnee = -0.2;
              la = lerp(0.34, 1.1, knee); la2 = lerp(1.85, 0.5, knee);
              ra = lerp(0.42, 1.2, knee); ra2 = lerp(1.75, 0.4, knee);
            } else if (move === 'elbow') {
              const elbow = smoothstep(0.04, 0.13, e) * (1 - smoothstep(0.18, 0.32, e));
              ra = lerp(0.42, 1.5, elbow); ra2 = lerp(1.75, 0.7, elbow);
              la = lerp(0.34, 0.9, elbow); la2 = lerp(1.85, 1.6, elbow);
              lHip = 0.36; rHip = -0.28;
              lKnee = -0.52; rKnee = -0.2;
            } else if (move === 'superman') {
              // GSP-style lead-hand Superman: lead low-kick feint, switch step,
              // then a straight lead while the rear hand stays by the chin.
              const feint = smoothstep(0.02, 0.08, e) * (1 - smoothstep(0.10, 0.15, e));
              const switchStep = smoothstep(0.11, 0.18, e);
              const land = smoothstep(0.34, 0.46, e);
              const punch = smoothstep(0.18, 0.30, e) * (1 - smoothstep(0.34, 0.50, e));

              // Lead/left leg: lifts like a low kick, then kicks back under the body.
              lHip = lerp(0.46, 1.02, feint);
              lKnee = lerp(-0.58, -1.18, feint);
              lHip = lerp(lHip, -0.52, switchStep);
              lKnee = lerp(lKnee, -0.20, switchStep);
              lHip = lerp(lHip, 0.30, land);
              lKnee = lerp(lKnee, -0.26, land);

              // Rear/right leg: planted during the feint, then drives forward.
              rHip = lerp(-0.34, -0.30, feint);
              rKnee = lerp(-0.18, -0.24, feint);
              rHip = lerp(rHip, 0.56, switchStep);
              rKnee = lerp(rKnee, -0.62, switchStep);
              rHip = lerp(rHip, -0.28, land);
              rKnee = lerp(rKnee, -0.20, land);

              // Lead-hand straight, rear hand tight to the chin.
              la = lerp(0.50, 1.44, punch);
              la2 = lerp(2.20, 0.06, punch);
              ra = lerp(0.42, 0.54, punch);
              ra2 = lerp(2.35, 2.30, punch);
            } else if (move === 'flyknee') {
              const fly = smoothstep(0.08, 0.18, e);
              const knee = smoothstep(0.19, 0.27, e) * (1 - smoothstep(0.32, 0.5, e));
              const settle = smoothstep(0.5, 0.68, e);

              // Knee angles stay negative so the shin folds behind the thigh.
              lHip = 0.85 + fly * 0.65 + knee * 0.1;
              lKnee = -1.2 - fly * 0.55 - knee * 0.15;
              rHip = 0.6 - fly * 1.15;
              rKnee = -1.3 + fly * 0.95;

              lHip = lerp(lHip, 0.42, settle);
              lKnee = lerp(lKnee, -0.55, settle);
              rHip = lerp(rHip, -0.28, settle);
              rKnee = lerp(rKnee, -0.2, settle);

              la = 0.5 - fly * 0.75;
              la2 = 2.2 - fly * 1.75;
              ra = 0.45 - fly * 0.55;
              ra2 = 2.2 - fly * 1.7;
            } else if (move === 'overhand') {
              const wind = smoothstep(0.0, 0.1, e);
              const chop = smoothstep(0.12, 0.2, e) * (1 - smoothstep(0.28, 0.46, e));
              ra = 0.6 + wind * 1.15 - chop * 0.5;
              ra2 = 1.5 + wind * 1.05 - chop * 2.35;
              la = 0.6; la2 = 2.15;
              lHip = 0.5 + chop * 0.12; rHip = -0.45;
              lKnee = -0.7 - chop * 0.1; rKnee = -0.1;
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
      } else if (b === 'jump') {
        const airborne = this.y < (this.surfaceY ?? this.y) - 2;
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

      const shoulder = lerpPt(chest, neck, 0.35);
      const shoulderF = { x: shoulder.x + f * 2.4 * s, y: shoulder.y + 0.6 * s };
      const shoulderB = { x: shoulder.x - f * 2.4 * s, y: shoulder.y - 0.6 * s };
      const hipF = { x: hip.x + f * 2.2 * s, y: hip.y };
      const hipB = { x: hip.x - f * 2.2 * s, y: hip.y - 0.4 * s };

      if (this.dying && this.dying.phase === 'ascend') {
        const a = smoothstep(0, 0.35, this.dying.t);
        la = lerp(la, -1.15, a); la2 = lerp(la2, 0.35, a);
        ra = lerp(ra, -0.95, a); ra2 = lerp(ra2, 0.4, a);
        lHip = lerp(lHip, 0.12, a); rHip = lerp(rHip, -0.08, a);
        lKnee = lerp(lKnee, -0.15, a); rKnee = lerp(rKnee, -0.1, a);
      }

      let armL, armR, legL, legR;

      armL = limb(shoulderB, la * f, la2 * f, upperArm, lowerArm);
      armR = limb(shoulderF, ra * f, ra2 * f, upperArm, lowerArm);
      legL = limb(hipB, lHip * f, lKnee * f, upperLeg, lowerLeg);
      legR = limb(hipF, rHip * f, rKnee * f, upperLeg, lowerLeg);

      let footStyleL = 'flat', footStyleR = 'flat';
      if (this.blown) {
        footStyleL = footStyleR = this.blown.phase === 'getup' ? 'flat' : 'point';
      } else if (fightingPose) {
        const cs = this.combat.state;
        if (cs === 'kick' || (cs === 'combo' && (this.combat.comboStep || 0) === 2)) footStyleL = 'point';
        if (cs === 'flyingkick' || cs === 'sweep') footStyleL = footStyleR = 'point';
        if (cs === 'launched' || cs === 'knockdown') footStyleL = footStyleR = 'point';
        if (cs === 'strike' && KICK_MOVE_RE.test(this.combat.move)) footStyleL = 'point';
        if (cs === 'strike' && this.combat.move === 'highkick') { footStyleL = 'flat'; footStyleR = 'point'; }
        if (cs === 'strike' && this.combat.move === 'superman') {
          const e = STRIKES.superman.total - this.combat.t;
          if (e < 0.16) footStyleL = 'point';
          if (this.combat.leaped && !this.combat.leapLanded) {
            footStyleL = 'point';
            footStyleR = 'point';
          }
        }
      } else if (b === 'run') {
        if (lKnee < -0.9) footStyleL = 'point';
        if (rKnee < -0.9) footStyleR = 'point';
      } else if (b === 'walk') {
        if (lKnee < -0.65) footStyleL = 'point';
        if (rKnee < -0.65) footStyleR = 'point';
      } else if (b === 'jump') {
        const airborne = this.y < (this.surfaceY ?? this.y) - 2;
        if (airborne) footStyleL = footStyleR = 'point';
      }

      const footLen = 7.5 * s;
      const extendHand = pts => ({
        x: pts[2].x + (pts[2].x - pts[1].x) * 0.05,
        y: pts[2].y + (pts[2].y - pts[1].y) * 0.05
      });
      const handL = extendHand(armL);
      const handR = extendHand(armR);
      const toeL = toeFor(legL[2], footStyleL, f, footLen);
      const toeR = toeFor(legR[2], footStyleR, f, footLen);

      return { head, neck, chest, hip, armL, armR, legL, legR, handL, handR, toeL, toeR, headR, s, f };
    }

    _tickFace(dt) {
      const busy = this.fighting || this.dying || (this.blown && this.blown.phase !== 'down');
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
      if (this.dying) return this.dying.phase === 'ascend' ? 'surprised' : 'dizzy';
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
      const s = this.visualScale || this.bodyScale;
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
      const s = this.visualScale || this.bodyScale;
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
      const attacking = ATTACK_STATES.has(cs);
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
        punch: 0.35, kick: 0.45, combo: 0.95, flurry: FLURRY_TOTAL,
        sweep: 0.5, uppercut: 0.48, flyingkick: 0.85
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
      } else if (cs === 'flurry') {
        const e = FLURRY_TOTAL - this.combat.t;
        let idx = 0;
        for (let i = 0; i < FLURRY_MOVES.length; i++) {
          if (e >= FLURRY_MOVES[i].at - 0.055) idx = i;
        }
        const h = FLURRY_MOVES[idx];
        start = Math.max(0.02, h.at - 0.055);
        end = h.at + 0.055;
        if (h.side === 'lead') { limb = pose.armL; tip = pose.handL; }
        else { limb = pose.armR; tip = pose.handR; }
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
        if (this.combat.move === 'superman') {
          limb = pose.armL; tip = pose.handL;
        } else if (this.combat.move === 'highkick') {
          limb = pose.legR; tip = pose.toeR;
        } else if (this.combat.move === 'burst') {
          limb = pose.armL; tip = pose.handL;
        } else if (ARM_STRIKE_RE.test(this.combat.move)) {
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

    drawDizzyStars(ctx, head, headR) {
      if (this.dizzyT <= 0) return;
      const fade = clamp(this.dizzyT / DIZZY_FADE, 0, 1);
      const baseAlpha = ctx.globalAlpha;
      const count = reduceMotion ? 3 : 4;
      const rx = headR * 1.9;
      const ry = headR * 0.62;
      ctx.save();
      ctx.translate(head.x, head.y - headR * 0.15);
      ctx.lineJoin = 'round';
      for (let i = 0; i < count; i++) {
        const a = (reduceMotion ? 0 : this.dizzyPhase) + (i / count) * Math.PI * 2;
        const depth = 0.72 + 0.28 * Math.sin(a);
        const twinkle = reduceMotion ? 1 : 0.82 + 0.18 * Math.sin(this.dizzyPhase * 1.7 + i * 1.9);
        const sx = Math.cos(a) * rx;
        const sy = Math.sin(a) * ry;
        ctx.globalAlpha = baseAlpha * fade * depth;
        starPath(ctx, sx, sy, 5.6 * twinkle, 2.5 * twinkle, a * 1.4);
        ctx.fillStyle = '#ffd54f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(27, 26, 23, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = baseAlpha * fade * depth * 0.8;
        ctx.fillStyle = '#fff8dc';
        ctx.beginPath();
        ctx.arc(sx - 1, sy - 1, 0.9 * twinkle, 0, Math.PI * 2);
        ctx.fill();
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
      ctx.translate(this.x, this.y - (this.dying ? this.dying.rise : 0));
      ctx.globalAlpha = this.dying ? this.dying.alpha : 1;
      this.drawSpeedLines(ctx, pose);

      if ((this.fighting || this.dying) && this.maxHp && !this.support) {
        const bw = 40, bh = 5;
        const bx = head.x - bw / 2;
        const by = head.y - headR - 36;
        const frac = clamp(this.hp / this.maxHp, 0, 1);
        ctx.save();
        ctx.fillStyle = 'rgba(247, 246, 242, 0.9)';
        ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
        ctx.strokeStyle = 'rgba(27, 26, 23, 0.75)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
        if (frac > 0) {
          ctx.fillStyle = frac > 0.55 ? '#b23a2f' : frac > 0.25 ? '#c25a2a' : '#8e1f1a';
          ctx.fillRect(bx, by, bw * frac, bh);
        }
        ctx.restore();
      }

      this.drawDizzyStars(ctx, head, headR);

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

      if (this.dying && this.dying.phase === 'ascend') {
        const flap = Math.sin(performance.now() / 130) * 0.12;
        ctx.save();
        ctx.strokeStyle = 'rgba(247, 246, 242, 0.82)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(chest.x - 2, chest.y - 4);
        ctx.quadraticCurveTo(chest.x - 26, chest.y - 20 + flap * 20, chest.x - 34, chest.y + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(chest.x + 2, chest.y - 4);
        ctx.quadraticCurveTo(chest.x + 26, chest.y - 20 - flap * 20, chest.x + 34, chest.y + 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(head.x, head.y - headR - 7, headR + 5, 4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(242, 201, 76, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
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

      if (this.hasPower && !this.dying) {
        const pulse = 1 + Math.sin(performance.now() / 300) * 0.08;
        const by = head.y - headR - (this.fighting ? 56 : this.selected ? 45 : 22);
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
      const pose = this._renderPose || this.pose();
      const hx = this.x + pose.head.x;
      const hy = this.y + pose.head.y;
      const headHit = Math.hypot(px - hx, py - hy) < pose.headR + 8;
      if (headHit) return true;
      if (Math.abs(dx) < 28 && dy > -100 && dy < 8) return true;
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
      const p = this._renderPose || this.pose();
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
    return { text, age: 0, life, lines: null, width: 0 };
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

  function chatEligible(f) {
    return !f.chatting && !f.fighting && !f.pursuit && !f.pursuedBy &&
      !f.blown && !f.dragging && !f.spectating && !f.dying &&
      f.behavior !== 'jump' &&
      f.chatCd <= 0 && f.vy === 0 &&
      level.floorAt(f.x, f.y) >= 0 && !level.isOnAnyStairPath(f.x, f.y) &&
      Math.abs(f.y - level.surfaceAt(f.x, f.y)) <= 18;
  }

  function collectChatPairs(minD, maxD, filter) {
    const candidates = [];
    for (const f of figures) {
      if (!chatEligible(f)) continue;
      candidates.push({ f, floor: level.floorAt(f.x, f.y) });
    }
    const pairs = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.floor !== b.floor) continue;
        const d = Math.abs(a.f.x - b.f.x);
        if (d < minD || d > maxD) continue;
        if (filter && !filter(a.f, b.f, a.floor)) continue;
        pairs.push([a.f, b.f]);
      }
    }
    return pairs;
  }

  function findChatPair() {
    if (!autonChk.checked || fightPick) return null;
    const pairs = collectChatPairs(80, 260);
    return pairs.length ? pick(pairs) : null;
  }

  function findChatApproach() {
    if (!autonChk.checked || fightPick) return null;
    const pairs = collectChatPairs(120, 600, (a, b, floor) => {
      const mid = (a.x + b.x) / 2;
      if (floor === 0) {
        if (mid < level.stairX0 && Math.max(a.x, b.x) >= level.stairX0) return false;
        if (mid > level.stairX1 && Math.min(a.x, b.x) <= level.stairX1) return false;
      } else if (floor === 1) {
        if (mid < level.upperStairX0 && Math.max(a.x, b.x) >= level.upperStairX0) return false;
        if (mid > level.upperStairX1 && Math.min(a.x, b.x) <= level.upperStairX1) return false;
      }
      return true;
    });
    return pairs.length ? pick(pairs) : null;
  }

  function startChatApproach(a, b) {
    if (chat || !a || !b) return;
    const dir = b.x > a.x ? 1 : -1;
    const floor = level.floorAt(a.x, a.y);
    const bnd = level.floorBounds(floor);
    const walkX = clamp(b.x - dir * 64, bnd.x0 + 20, bnd.x1 - 20);
    chat = { a, b, phase: 'approach', t: 0, walkX, opener: null, reply: null };
    for (const f of [a, b]) {
      f.chatting = true;
      f.chatPartner = f === a ? b : a;
      f.chatCd = 25 + Math.random() * 20;
      f.bubble = null;
      f.think = 999;
      f.vy = 0;
    }
    a.setBehavior('walk');
    b.setBehavior('idle');
    a.facing = dir;
    b.facing = -dir;
  }

  function chooseChatLine(a, b) {
    const sameStyle = a.style === b.style && STYLE_CHAT[a.style];
    return sameStyle && Math.random() < 0.35
      ? pick(STYLE_CHAT[a.style])
      : pick(CHAT_SCRIPT);
  }

  function beginChatLines(a, b) {
    const line = chooseChatLine(a, b);
    chat.phase = 'open';
    chat.t = CHAT_OPEN;
    chat.opener = line[0];
    chat.reply = line[1];
    a.setBehavior('idle');
    b.setBehavior('idle');
    a.facing = b.x < a.x ? -1 : 1;
    b.facing = a.x < b.x ? -1 : 1;
    a.bubble = makeBubble(line[0], CHAT_OPEN + 0.2);
  }

  function startChat(a, b) {
    if (chat || !a || !b) return;
    chat = { a, b, phase: 'open', t: 0, opener: null, reply: null };
    for (const f of [a, b]) {
      f.chatting = true;
      f.chatPartner = f === a ? b : a;
      f.chatCd = 25 + Math.random() * 20;
      f.bubble = null;
      f.setBehavior('idle');
      f.think = 999;
      f.vy = 0;
    }
    beginChatLines(a, b);
  }

  function updateChat(dt) {
    if (chaosOn) {
      if (chat) cancelChat();
      return;
    }
    if (!autonChk.checked) {
      cancelChat();
      return;
    }
    if (chatCd > 0) chatCd -= dt;
    for (const f of figures) {
      if (f.chatCd > 0) f.chatCd -= dt;
      if (f.bubble) {
        f.bubble.age += dt;
        if (f.bubble.age >= f.bubble.life) f.bubble = null;
      }
    }

    if (chat) {
      const { a, b } = chat;
      const floorA = a ? level.floorAt(a.x, a.y) : -1;
      const floorB = b ? level.floorAt(b.x, b.y) : -1;
      if (!a || !b || a.chatPartner !== b || b.chatPartner !== a ||
          a.fighting || b.fighting || a.blown || b.blown ||
          a.dragging || b.dragging || a.pursuit || b.pursuit ||
          a.pursuedBy || b.pursuedBy || a.dying || b.dying ||
          floorA < 0 || floorA !== floorB) {
        cancelChat();
        return;
      }
      if (chat.phase === 'approach') {
        chat.t += dt;
        const arrived = Math.abs(a.x - chat.walkX) <= 4;
        if (arrived || chat.t >= CHAT_APPROACH) {
          if (arrived) {
            beginChatLines(a, b);
          } else {
            cancelChat();
          }
        }
        return;
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
    if (pair) {
      startChat(pair[0], pair[1]);
      return;
    }
    if (Math.random() < 0.58) {
      const approach = findChatApproach();
      if (approach) {
        startChatApproach(approach[0], approach[1]);
        return;
      }
    }
    chatCd = 2 + Math.random() * 2;
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
    const topSafe = toolbarHeight + (cinematicOn ? letterboxHeight + 8 : 8);
    const bottomSafe = H - (cinematicOn ? letterboxHeight + 8 : 60);
    for (const f of figures) {
      const bubble = f.bubble;
      if (!bubble) continue;
      const pose = f._renderPose || f.pose();
      const head = pose.head;
      const anchor = camera.worldToScreen(
        f.x + head.x,
        f.y + head.y - pose.headR - 10
      );
      if (!bubble.lines) {
        const wrapped = wrapBubbleText(bubble.text, 170);
        let textW = 0;
        ctx.save();
        ctx.font = '12px system-ui, -apple-system, sans-serif';
        for (const wrappedLine of wrapped) {
          textW = Math.max(textW, ctx.measureText(wrappedLine).width);
        }
        ctx.restore();
        bubble.lines = wrapped;
        bubble.width = Math.min(190, Math.max(54, textW + 10 * 2));
      }
      const lines = bubble.lines;
      const lineH = 15;
      const padX = 10;
      const padY = 8;
      const w = bubble.width;
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
    f.chaosIdleT = 0;
    f.chaosStairT = 0;
    f._chaosLastX = null;
    f._chaosLastY = null;
    f.bodyScale = 1;
    f.landT = 0;
    if (chaosOn) {
      chaosCd = 0;
      updateChaos(0);
      const colors = new Set(figures.filter(g => !g.dying).map(g => g.color.toLowerCase()));
      if (colors.size <= 1) {
        flashStatus('Round over — add an enemy color', 1800);
      } else if (!f.fighting && !f.support && !f.pursuit && !f.pursuedBy &&
                 f.vy === 0 && level.floorAt(f.x, f.y) >= 0) {
        const best = nearestChaosEnemy(f);
        if (best) {
          beginPursuit(f, best, {
            hunt: true,
            chaos: true,
            auto: true,
            allowBlown: true,
            waitForLanding: true
          });
        }
      }
    } else if (chaosAutoEnded) {
      flashStatus('Round over — click Chaos to start a new round', 1800);
    }
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

  function pursuitSurfaceY(level, x, y, preferUpper = null) {
    if (preferUpper === true && level.isOnUpperStairs(x)) {
      const rampY = level.upperStairsYAt(x);
      if (Math.abs(rampY - y) <= 22) return rampY;
    }
    if (preferUpper === false && level.isOnStairs(x)) {
      const rampY = level.stairsYAt(x);
      if (Math.abs(rampY - y) <= 22) return rampY;
    }
    if (level.isOnStairs(x)) {
      const rampY = level.stairsYAt(x);
      if (Math.abs(rampY - y) <= 22) return rampY;
    }
    if (level.isOnUpperStairs(x)) {
      const rampY = level.upperStairsYAt(x);
      if (Math.abs(rampY - y) <= 22) return rampY;
    }
    return level.surfaceAt(x, y + 8);
  }

  function pursuitFloor(level, x, y) {
    if (x >= level.level2X0 && x <= level.level2X1 && Math.abs(y - level.level2Y) <= 10) return 2;
    if (level.onUpperStairPath(x, y, 14)) return -1;
    if (level.onLowerStairPath(x, y, 14)) return -1;
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
      !o.pursuit && !o.pursuedBy && !o.dying &&
      floorOf(o) >= 0
    );
  }

  function stairsEnemiesFor(f) {
    if (floorOf(f) < 0) return [];
    return figures.filter(o =>
      o !== f &&
      f.isEnemy(o) &&
      !o.fighting && !o.blown && !o.dragging &&
      !o.pursuit && !o.pursuedBy && !o.dying &&
      level.isOnAnyStairPath(o.x, o.y)
    );
  }

  function fightTargetError(attacker, target) {
    if (!attacker.isEnemy(target)) return 'Pick another color';
    if (target.dying) return 'Unavailable';
    if (target.fighting) return 'Already fighting';
    if (target.blown || target.dragging) return 'Unavailable';
    if (target.pursuit || target.pursuedBy) return 'Already busy';
    if (level.isOnAnyStairPath(target.x, target.y)) return 'Target on stairs';
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

  function cancelSupport(f) {
    if (!f || !f.support) return;
    const target = f.support.target;
    if (target && target.rearAttacker === f) {
      target.rearAttacker = null;
      target.rearT = 0;
      target.rearCounterTarget = null;
    }
    f.support = null;
    if (f.fighting) f.stopFight();
  }

  function beginSupport(helper, target, teammate = null) {
    if (!helper || !target) return false;
    clearChaosStairExit(helper);
    if (!chaosOn || helper.dying || helper.blown || helper.dragging) return false;
    if (!target.fighting || target.dying) return false;
    if (target.color.toLowerCase() === helper.color.toLowerCase()) return false;
    if (teammate) {
      if (!teammate.fighting || teammate.dying) return false;
      if (target.foe !== teammate || teammate.foe !== target) return false;
    }
    const floor = level.floorAt(target.x, target.y);
    if (floor < 0) return false;
    if (target.pursuit) cancelPursuit(target);
    if (target.pursuedBy) {
      if (target.pursuedBy.pursuit) cancelPursuit(target.pursuedBy);
      else target.pursuedBy = null;
    }
    if (helper.pursuit) cancelPursuit(helper);
    let flankSide = null;
    let flankDist = 0;
    if (teammate) {
      let slot = 0;
      for (const f of figures) {
        if (f !== helper && f.support && f.support.target === target) slot++;
      }
      const frontSide = teammate.x <= target.x ? -1 : 1;
      flankSide = slot % 2 === 0 ? -frontSide : frontSide;
      flankDist = 62 + Math.floor(slot / 2) * 18;
    }
    helper.support = {
      teammate: teammate || null,
      target,
      flankSide,
      flankDist,
      flankX: null,
      flankT: 0,
      flankLastDist: null
    };
    helper.fighting = true;
    helper.foe = target;
    helper.chaosFight = false;
    helper.combatFloor = floor;
    helper.dying = null;
    helper.spectating = null;
    helper.chatting = false;
    helper.chatPartner = null;
    helper.bubble = null;
    helper.behavior = 'idle';
    helper.phase = 0;
    helper.vy = 0;
    helper.y = level.floorY(floor);
    helper.bodyScale = 1;
    helper.maxHp = MAX_HP;
    helper.hp = clamp(helper.hp, 1, MAX_HP);
    helper.flurryCd = 2.5;
    helper.dizzyT = 0;
    helper.rearAttacker = null;
    helper.rearT = 0;
    helper.rearCd = 0;
    helper.rearCounterTarget = null;
    helper.faceHoldT = 0;
    helper.combat = createCombatState('ready');
    helper._lastCombatState = 'idle';
    helper.duelIntro = null;
    helper.introRunning = false;
    helper.trail.length = 0;
    helper.facing = target.x >= helper.x ? 1 : -1;
    return true;
  }

  function beginPursuit(attacker, target, opts = {}) {
    if (!opts.chaos && !opts.assist && !opts.hunt &&
        chaosAlliance && chaosAlliedColors(attacker.color, target.color)) {
      breakChaosAlliance('manual');
    }
    clearChaosStairExit(attacker);
    clearChaosStairExit(target);
    cancelChatFor(attacker);
    cancelChatFor(target);
    cancelSpectating(attacker);
    cancelSpectating(target);
    if (!opts.chaos && !opts.assist && !opts.hunt) {
      for (const f of figures) if (f.pursuit) cancelPursuit(f);
    }
    if (!opts.assist && !opts.hunt) clearFightPick();
    attacker.pursuit = {
      target,
      t: 0,
      drop: false,
      stair: null,
      auto: !!opts.auto,
      allowBlown: !!opts.allowBlown,
      waitForLanding: !!opts.waitForLanding,
      chaos: !!opts.chaos,
      assist: !!opts.assist,
      hunt: !!opts.hunt,
      teammate: opts.teammate || null
    };
    if (!opts.assist && !opts.hunt) {
      target.pursuedBy = attacker;
      target.setBehavior('idle');
      target.think = 999;
    }
    attacker.setBehavior('run');
    updateUI();
  }

  function beginFightPick(attacker) {
    for (const f of figures) if (f.pursuit) cancelPursuit(f);
    fightPick = attacker;
    if (canvas) canvas.style.cursor = 'crosshair';
    updateUI();
  }

  function clearFightPick() {
    if (!fightPick) return false;
    fightPick = null;
    if (canvas && canvas.style.cursor === 'crosshair') canvas.style.cursor = 'default';
    return true;
  }

  function cancelFightPick() {
    if (clearFightPick()) updateUI();
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
    const viewportW = window.innerWidth;
    const compact = viewportW <= 520;
    const narrow = viewportW <= 360;
    if (fightPick && (
      fightPick !== selected ||
      fightPick.fighting || fightPick.blown || fightPick.dragging || fightPick.dying ||
      level.floorAt(fightPick.x, fightPick.y) < 0 ||
      fightTargetsFor(fightPick).length === 0
    )) {
      clearFightPick();
    }
    const chasers = figures.filter(f => f.pursuit);
    for (const chaser of chasers) {
      if (chaser !== selected && !chaser.pursuit.auto) cancelPursuit(chaser);
    }
    const chaser = figures.find(f => f.pursuit);
    document.body.dataset.selection = has ? 'some' : 'none';
    document.body.dataset.fightPick = fightPick ? 'on' : 'off';
    document.body.dataset.pursuit = chaser ? 'on' : 'off';
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
        btn.disabled = !has || selected.blown || selected.dying;
        on = holder;
        btn.textContent = holder
          ? (narrow ? 'Remove' : 'Remove Power')
          : (narrow ? 'Power' : 'Give Power');
        btn.title = holder
          ? 'Remove the superpower (P)'
          : 'Grant this figure the superpower (P)';
      } else if (btn.dataset.action === 'blast') {
        const holder = has && selected.hasPower;
        btn.disabled = !holder || selected.blown || selected.dying || selected.powerCd > 0;
        btn.textContent = holder && selected.powerCd > 0
          ? (narrow ? '...' : 'Recharging')
          : 'Blast';
        btn.title = !holder
          ? 'Give this figure the superpower first'
          : selected.powerCd > 0
            ? 'Superpower recharging'
            : 'Blast the nearest figure or your chase target (B)';
      } else {
        on = has && sel.every(f => !f.fighting && f.behavior === btn.dataset.action);
      }
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    powerGlyph.className = '';
    if (has && selected.hasPower) {
      powerGlyph.className = selected.powerCd > 0 ? 'recharging' : 'charged';
      powerGlyph.title = selected.powerCd > 0 ? 'Superpower recharging' : 'Superpower ready';
    } else {
      powerGlyph.title = '';
    }
    revokeBtn.hidden = !(has && selected.hasPower);
    removeBtn.hidden = !has;

    const flashing = performance.now() < statusFlash.until;
    colorPicker.disabled = !has;
    if (has) {
      const hex = rgbToHex(selected.color);
      if (colorPicker.value !== hex) colorPicker.value = hex;
    }
    syncPaletteActive();

    if (styleSelect) {
      const nextStyle = has ? (styleMixed ? 'mixed' : sel[0].style) : lastStyle;
      if (styleSelect.value !== nextStyle) styleSelect.value = nextStyle;
      const locked = has && sel.some(f => f.fighting);
      styleSelect.disabled = !has || locked;
      styleSelect.title = !has
        ? 'Fighting style'
        : locked
          ? 'Style is locked during a duel'
          : 'Fighting style';
    }

    if (flashing) {
      setStatus(statusFlash.text);
    } else if (fightPick) {
      setStatus(
        compact ? 'Pick a target' : 'Pick an opponent',
        'Pick an opponent · Esc to cancel'
      );
    } else if (has && selected.pursuit) {
      const climbing = !selected.pursuit.drop && pursuitFloor(level, selected.x, selected.y) < 0;
      setStatus(
        climbing
          ? (compact ? 'Climbing' : 'Climbing…')
          : (compact ? 'Chasing' : 'Chasing…'),
        'Chasing target · Esc to cancel'
      );
    } else if (!has) {
      const text = figures.length
        ? (compact ? 'Click a figure' : 'Click a figure to select')
        : (compact ? 'Add a figure' : 'Add a figure to start');
      setStatus(text);
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
      setStatus(
        compact ? (multi ? `${sel.length} selected` : `${mode}${suffix}`) : fullText,
        fullText
      );
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

  function setPaletteOpen(open, returnFocus = false) {
    if (!palettePanel || !paletteBtn) return;
    if (open && !selected) open = false;
    palettePanel.hidden = !open;
    paletteBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const active = paletteSwatches.find(b => b.getAttribute('aria-pressed') === 'true') || paletteSwatches[0];
      if (active) active.focus();
    } else if (returnFocus) {
      paletteBtn.focus();
    }
  }

  function syncPaletteActive() {
    if (!palettePanel) return;
    const list = selectionList();
    const hexes = new Set(list.map(f => rgbToHex(f.color)));
    const active = hexes.size === 1 ? [...hexes][0] : null;
    for (const b of paletteSwatches) {
      b.setAttribute('aria-pressed', b.dataset.color === active ? 'true' : 'false');
    }
    if (!list.length) setPaletteOpen(false);
  }

  function applyPaletteColor(hex) {
    const list = selectionList();
    if (!list.length) return;
    for (const f of list) f.color = hex;
    colorPicker.value = hex;
    updateUI();
    setPaletteOpen(false, true);
  }

  addBtn.addEventListener('click', () => {
    addFigure(groundSpawnX(), level.groundY, colorPicker.value);
  });

  if (autonChk) {
    autonChk.addEventListener('change', () => {
      if (!autonChk.checked) {
        cancelChat();
        for (const f of figures) cancelSpectating(f);
      } else {
        chatCd = 8 + Math.random() * 7;
      }
    });
  }

  if (chaosBtn) {
    chaosBtn.addEventListener('click', () => setChaos(!chaosOn));
  }

  colorPicker.addEventListener('input', () => {
    for (const f of selectionList()) f.color = colorPicker.value;
    updateUI();
  });

  if (paletteBtn) {
    paletteBtn.addEventListener('click', e => {
      e.stopPropagation();
      setPaletteOpen(palettePanel.hidden);
    });
  }

  if (palettePanel) {
    palettePanel.addEventListener('click', e => {
      const swatch = e.target.closest('.palette-swatch');
      if (!swatch) return;
      e.stopPropagation();
      applyPaletteColor(swatch.dataset.color);
    });
  }

  document.addEventListener('pointerdown', e => {
    if (!palettePanel || palettePanel.hidden) return;
    if (palettePanel.contains(e.target) || (paletteBtn && paletteBtn.contains(e.target))) return;
    setPaletteOpen(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !palettePanel || palettePanel.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setPaletteOpen(false, true);
  }, true);

  if (styleSelect) {
    styleSelect.addEventListener('change', () => {
      const style = styleSelect.value;
      if (!STYLES[style]) {
        updateUI();
        return;
      }
      lastStyle = style;
      writeStorage('stickman.style', style);
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
  syncChaosUI();
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
      cancelSpectating(selected);
      if (btn.dataset.action === 'power') {
        togglePower(selected);
      } else if (btn.dataset.action === 'blast') {
        usePower(selected);
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
          cancelSpectating(f);
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
    revokePower(selected);
  });

  removeBtn.addEventListener('click', removeSelectedFigures);

  const KEY_ACTIONS = {
    '1': 'idle', '3': 'walk', '4': 'run', '5': 'jump',
    f: 'fight', p: 'power', b: 'blast',
  };
  document.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if ((key === 'delete' || key === 'backspace') && selectionList().length) {
      e.preventDefault();
      removeSelectedFigures();
      return;
    }
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
        if (figures[i].dying) continue;
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
      if (figures[i].dying) continue;
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
      const items = group.map(f => ({
        f,
        opponent: f.fighting && !f.support ? f.foe : null
      }));
      for (const f of group) {
        cancelChatFor(f);
        cancelSpectating(f);
        if (f.support) cancelSupport(f);
        if (f.pursuit) cancelPursuit(f);
        if (f.pursuedBy) cancelPursuit(f.pursuedBy);
        clearDuelIntro(f);
        f.rearAttacker = null;
        f.rearT = 0;
        f.rearCd = 0;
        f.rearCounterTarget = null;
        f.faceHoldT = 0;
      }
      for (const f of group) f.dragging = true;
      drag = {
        moved: false,
        sx: x,
        sy: y,
        items: items.map(it => ({ ...it, x: it.f.x, y: it.f.y }))
      };
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
      const rematches = [];
      for (const it of drag.items) {
        const f = it.f;
        f.dragging = false;
        f.bodyScale = 1;
        f.landT = 0;
        f.vy = 0;
        if (f.fighting) endDuel(f);
        f.y = level.surfaceAt(f.x, f.y + 8);
        const foe = it.opponent;
        if (!foe || foe.dying || foe.dragging || foe.blown) continue;
        if (rematches.some(([a, b]) =>
          (a === f && b === foe) || (a === foe && b === f))) continue;
        rematches.push([f, foe]);
      }
      drag = null;
      canvas.style.cursor = 'default';
      for (const [a, b] of rematches) {
        if (a.dying || b.dying || a.dragging || b.dragging || a.blown || b.blown) continue;
        const af = level.floorAt(a.x, a.y);
        const bf = level.floorAt(b.x, b.y);
        if (af < 0 || bf < 0) continue;
        if (af === bf) startDuel(a, b);
        else beginPursuit(a, b);
      }
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
      updateChaos(dt);
      updateChat(dt);
      updateBirds(dt);
      updateEffects(dt);
      updateSplats(dt);
      spectatorCommentCd = Math.max(0, spectatorCommentCd - dt);
      flushDeaths();
    }

    for (const f of figures) f._renderPose = f.pose();
    const pickTargets = fightPick ? new Set(fightTargetsFor(fightPick)) : null;
    for (const f of figures) {
      f.fightTarget = !!(f.pursuedBy || (pickTargets && pickTargets.has(f)));
    }

    updateCinematic(rdt);
    camera.update(rdt);

    const stamp = clockStamp();
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

    if (blastBtn) {
      const cd = selected && selected.hasPower && selected.powerCd > 0
        ? Math.min(1, selected.powerCd / 4) : 0;
      const next = cd.toFixed(3);
      if (next !== lastBlastCd) {
        blastBtn.style.setProperty('--cd', next);
        lastBlastCd = next;
      }
    }
    if (now - lastUITime >= 100) {
      updateUI();
      lastUITime = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
