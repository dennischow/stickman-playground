# Stickman Playground

A paper-and-ink canvas toy where procedurally animated stick figures walk, run, crawl, jump, and get into kung-fu duels — optionally with wall-blasting superpowers, synthesized sound, and comic impact effects.

Built with vanilla JavaScript and the Canvas 2D API, bundled with Vite. No game engine, no framework.

## Features

- **Procedural stick figures** — every pose is computed from limb angles, so motion is smooth and resolution-independent.
- **Articulated poses** — a split hip → chest → neck spine, shoulder and hip anchors, and visible hands and feet give each stance a readable skeleton. Combat uses a chin-high guard, chambered kicks, and hip-driven punches.
- **Motion behaviors** — idle, walk, run, crawl, and a physically simulated jump with crouch, air, and landing phases.
- **Individual movement** — each figure gets its own walk/run speed, jump height, crouch timing, and landing rest, so a crowd never moves in lockstep.
- **Motion polish** — smoothed frame-to-frame velocity drives subtle head, torso, and arm lag; landings squash and settle; footsteps kick up dust; fast strikes leave short smear arcs. All of it respects `prefers-reduced-motion`.
- **Autonomous mode** — figures randomly switch actions on their own, each with a randomized "think" timer.
- **Kung-fu combat** — AI duels with approach, block, dodge, punch, kick, combo, spin kick, sweep, uppercut, flying kick, stagger, knockdown, launch, and get-up states. Hits use natural recoil poses and knockdowns fall, settle, and push back up continuously.
- **Superpower** — grant a figure the power, then blast the nearest figure into the wall with knockback, slow-motion, impact typography, ink splats, and screen shake.
- **Comic impact feel** — sprite-based dust and ink, persistent ground splats, starbursts, manga sound-effect words (`BAM`, `WHACK`, `K.O.`, `BOOM`), tinted flashes, and hit-stop.
- **Synthesized audio** — a small WebAudio engine generates whooshes, impacts, footsteps, jumps, landings, blasts, and K.O. sounds. No audio files, with stereo panning by on-screen position and a persisted mute setting.
- **Cinematic camera** — a damped camera adds gentle idle framing, duel intro push-in, fight follow, K.O. focus, and blast tracking, with letterbox bars and a persisted toggle. Pointer input is inverse-transformed, so selection and dragging stay accurate while the camera moves.
- **Multi-level stage** — a paper/ink mezzanine and staircase give the playground vertical space: figures climb stairs, jump between floors, fall off edges, and can be dragged onto either level. Duels stay on the same floor.
- **Six scenes** — blank paper plus five photo backgrounds (lake, factory, bridge, highway, floating island), desaturated behind a paper veil. The selection persists via `localStorage`.
- **Selection & dragging** — click, shift/meta/ctrl-click to multi-select, drag to move a group, or marquee box-select.
- **Keyboard shortcuts** — `1–5` for motion, `F` fight, `P` power, `R` revoke, `A` add, `M` mute, `C` cinematic.
- **Responsive, accessible UI** — the top bar and contextual action dock adapt to narrow screens, buttons expose `aria-pressed`, and `prefers-reduced-motion` trims particles, flashes, slow-motion, and camera motion while CSS disables transitions and grain animation.

## Getting Started

Requires Node.js 18+.

```bash
npm install
npm run dev       # start the Vite dev server
```

Other scripts:

```bash
npm run build     # production build into dist/
npm run preview   # preview the production build
npm run check     # syntax-check the JavaScript modules
```

## Controls

### Mouse / touch

| Action | Result |
| --- | --- |
| Click a figure | Select it |
| Shift / Meta / Ctrl + click | Toggle selection (multi-select) |
| Drag a figure | Move the whole selection |
| Drag on empty canvas | Marquee box-select |
| Click empty canvas | Clear selection |

### Keyboard

| Key | Action |
| --- | --- |
| `A` | Add a stick figure |
| `1` | Idle |
| `2` | Crawl |
| `3` | Walk |
| `4` | Run |
| `5` | Jump |
| `F` | Fight the nearest enemy / end the current duel |
| `P` | Grant or use the superpower |
| `R` | Revoke the superpower |
| `M` | Mute or unmute sound |
| `C` | Toggle the cinematic camera and letterbox |

### Toolbar

The top bar holds the always-relevant controls: **Add**, **Autonomous**, **Scene**, **Sound**, and **Cinematic**. The selection chip beside the wordmark shows the current selection, its color swatch, the superpower state, and a small × to revoke the power.

Selection actions live in a floating dock at the bottom of the screen. It appears whenever a figure is selected and sits inside the cinematic letterbox bar when cinematic mode is on:

- **Motion** — set the selection to Idle, Crawl, Walk, Run, or Jump.
- **Combat** — start/stop a duel and grant or use the superpower.

## How It Works

The game loop, rendering, physics, AI, and input live in [`src/main.js`](src/main.js). Camera math and screen/world transforms live in [`src/camera.js`](src/camera.js). Sound is generated by [`src/audio.js`](src/audio.js). The top bar and action dock markup are in [`index.html`](index.html), with styles in [`src/style.css`](src/style.css).

### Render loop

The `frame()` loop in [`src/main.js`](src/main.js) uses `requestAnimationFrame` with a delta capped at 50 ms to avoid huge jumps after tab switches. Each frame it:

1. Scales the timestep for hit-stop or slow-motion.
2. Advances figure physics, timed effects, and persistent splats.
3. Caches one pose per figure for the frame.
4. Updates the cinematic framing target and damps the camera toward it.
5. Repaints the cached scene only when it is dirty.
6. Applies screen-space shake, then the camera transform, and draws the scene, ground splats, shadows, figures, marquee, and effects in world space.
7. Restores the camera, applies the tinted flash overlay, and syncs the selection chip at ~10 Hz.

The scene is rendered once to an offscreen canvas on resize or scene change, so photo backgrounds cost nothing per frame.

### The stick figure model

`StickFigure` stores position, facing, behavior, animation phase, velocity, and combat state. Its `pose()` method builds a split torso (hip → chest → neck) with shoulder and hip anchors, then attaches two-segment arms ending in hands and two-segment legs ending in feet and toes. `draw()` renders the articulated skeleton, expressive face, motion-trail ghosts, selection ring, power glyph, speed lines, and ground shadow.

Idle uses a relaxed contrapposto with asymmetric knees and separated arms. Walk plants the front foot with a heel/toe stroke; run adds a flight phase, pointed feet, and stronger arm drive. Jump poses cover crouch, airborne extension, and a compressed landing. Combat stances use staggered feet, a chin-high guard, chambered knees, hip rotation into punches, and counterbalancing arms. These are visual poses only: hit ranges, timings, knockback, and AI balance are unchanged.

Gravity is a constant `1500 px/s²`. Horizontal movement is driven by per-behavior speeds multiplied by a per-figure randomized `speedMul` (0.9–1.25), with facing flips at the screen margins. Voluntary jumps also vary in height (`jumpMul` 0.92–1.12), crouch duration, and landing rest. Faster runners lean slightly more and draw longer speed lines, so movement differences read clearly.

Frame-to-frame position changes are smoothed into per-figure velocity and acceleration. Those values drive damped springs for the upper body, head, and arms (scaled down during authored attacks), add landing squash and settle, spawn small footstep dust puffs, and draw brief smear arcs on fast strikes. All of these are visual-only and are disabled or reduced when reduced motion is requested.

### Combat state machine

When two figures of different colors fight on the same floor, `startDuel()` locks them to that floor and points them at each other. The fight button only pairs enemies on the selected figure's floor, and knockback stays inside that floor's bounds. `updateFight()` runs a per-figure state machine:

```
ready → approach → punch / kick / combo / spinkick / sweep / uppercut / flyingkick
      ↳ block / dodge
      ↳ stagger / knockdown / launched / getup
```

`landHit()` checks range, honors block/dodge, rolls for knockdown, applies knockback, and spawns hit effects, hit-stop, sound, and impact typography. Staggered figures recoil with a timed guard and recovery step. Knockdowns use a continuous knee-buckle → hip-drop → torso-rotate fall, land with dust and a thud, lie grounded with the head rotated, then push up through hands and crouch instead of popping upright. Facing is frozen while a figure is down or launched.

### Superpower

`blastFigure()` pushes the caster back, resets the target, and puts it into a `blown` sequence: it flies across the screen, hits the wall with a burst and `BAM`/`WHAM` text, falls, lies down, then gets up. Blasts trigger brief slow-motion, a gold flash, an ink splat, and screen shake.

### Scenes

Scenes are declared in `SCENES` in [`src/main.js`](src/main.js). Photo images are preloaded, cover-scaled, desaturated with a canvas filter, and veiled with the paper color. The chosen scene is saved to `localStorage` under `stickman.scene`.

### Level and surfaces

[`src/level.js`](src/level.js) defines the stage geometry: a ground floor, a back-right mezzanine, and a staircase connecting them. `surfaceAt(x, currentY)` returns the walkable height under a figure with a small step-up tolerance, `floorAt(x, y)` identifies the ground, mezzanine, or stairs, and `floorBounds(floor)` keeps duels on their floor. Stairs collide as a smooth ramp but draw as discrete steps, so feet follow the climb without stair-stepping jitter.

Figures query the level every frame instead of using a fixed ground line. Walking follows the surface, jumps and falls land on the surface below, and walking off the mezzanine edge drops to the ground. Dragging can place figures on either level; dropping over an edge falls. The level is drawn into the cached scene, so it works over both plain paper and the photo backgrounds. New ground figures spawn clear of the staircase footprint.

### Cinematic camera

[`src/camera.js`](src/camera.js) implements a small damped 2D camera with `x`, `y`, `zoom`, and a subtle `rotation`. `updateCinematic()` in [`src/main.js`](src/main.js) chooses a framing target:

- **Idle** — selected figures, or all figures when nothing is selected.
- **Duel intro** — a short push-in on both fighters.
- **Fight follow** — keeps both active fighters in frame.
- **K.O. focus** — pushes in on a knocked-down figure.
- **Blast focus** — tracks from the caster toward the target.

The camera is applied only to the world layer. Letterbox bars, the top bar, the action dock, and impact flashes stay in screen space. Screen shake remains a screen-space offset applied after the camera. Pan, zoom, and rotation are clamped so the visible viewport never leaves the world canvas. Pointer coordinates are converted with `camera.screenToWorld()` before hit testing, so selection, dragging, and marquee selection work at any zoom, pan, or rotation. Motion is damped and gentle; `prefers-reduced-motion` uses static framing and disables letterbox animation. The toggle is in the top bar or on `C`, and persists as `stickman.cinematic` (on by default).

### Effects

`updateEffects()` and `drawEffects()` handle short-lived `star`, `dust`, `ink`, `ring`, `burst`, and `word` effects. Dust and ink use pre-rendered sprite atlases for soft, irregular shapes; bursts are layered white/gold star stickers; impact words pop, drift, and fade. Ground splats are a separate persistent layer managed by `updateSplats()` and `drawSplats()`, drawn beneath the figures, capped in count, and cleared on scene changes or resize. Impact flashes are tinted per event and reduced under `prefers-reduced-motion`.

### Audio

[`src/audio.js`](src/audio.js) exports a singleton `SoundEngine`. The `AudioContext` is created lazily on the first pointer/key/touch gesture, then routed through a master gain and dynamics compressor. Small synthesized voices generate whooshes, punches, kicks, blocks, footsteps, jumps, landings, blasts, wall hits, K.O. cues, power charges, and duel starts. Output is stereo-panned from each figure's on-screen position. The mute state is saved under `stickman.muted`, and can be toggled from the top bar or with `M`.

### Input

Pointer positions are converted from screen to world through the camera before hit testing, so selection, dragging, and marquee selection stay accurate when the camera is zoomed, panned, or slightly rotated. Pointer handling then distinguishes figure drags from marquee selection using a small movement threshold. Hit testing is done per figure via `hit()`, which checks the head, torso, and feet. Keyboard handling maps keys to the dock actions, ignores typing in form fields, and handles `M` and `C` separately.

## Project Structure

```
stickman-playground/
├── index.html                 # Toolbar markup + canvas
├── package.json               # Vite scripts and metadata
├── src/
│   ├── main.js                # Game logic, rendering, input, AI
│   ├── camera.js              # Damped cinematic camera + screen/world transforms
│   ├── level.js               # Multi-level stage geometry and surface queries
│   ├── audio.js               # Synthesized WebAudio sound engine
│   └── style.css              # Paper-themed UI, responsive layout
└── public/
    └── backgrounds/           # Photo scenes + CREDITS.md
        ├── lake.jpg
        ├── factory.jpg
        ├── bridge.jpg
        ├── highway.jpg
        └── island.jpg
```

## Credits

Background photographs are from Wikimedia Commons and are licensed under CC BY / CC BY-SA. See [`public/backgrounds/CREDITS.md`](public/backgrounds/CREDITS.md) for authors, licenses, and sources. Derivative backgrounds follow the same licenses as their sources.
