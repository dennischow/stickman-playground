# Stickman Playground

A paper-and-ink canvas toy where procedurally animated stick figures walk, run, crawl, jump, and get into kung-fu duels — optionally with wall-blasting superpowers.

Built with vanilla JavaScript and the Canvas 2D API, bundled with Vite. No game engine, no framework.

## Features

- **Procedural stick figures** — every pose is computed from limb angles, so motion is smooth and resolution-independent.
- **Motion behaviors** — idle, walk, run, crawl, and a physically simulated jump with crouch, air, and landing phases.
- **Autonomous mode** — figures randomly switch actions on their own, each with a randomized "think" timer and speed multiplier.
- **Kung-fu combat** — AI duels with approach, block, dodge, punch, kick, combo, spin kick, sweep, uppercut, flying kick, stagger, knockdown, launch, and get-up states.
- **Superpower** — grant a figure the power, then blast the nearest figure into the wall with knockback, dust, freeze-frames, and screen shake.
- **Six scenes** — blank paper plus five photo backgrounds (lake, factory, bridge, highway, floating island), desaturated behind a paper veil. The selection persists via `localStorage`.
- **Selection & dragging** — click, shift/meta/ctrl-click to multi-select, drag to move a group, or marquee box-select.
- **Keyboard shortcuts** — `1–5` for motion, `F` fight, `P` power, `R` revoke, `A` add.
- **Responsive, accessible UI** — toolbar adapts to narrow screens, buttons expose `aria-pressed`, and CSS transitions respect `prefers-reduced-motion`.

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
npm run check     # syntax-check src/main.js
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

### Toolbar

- **Figure** — add figures, pick a color for new/selected figures, toggle Autonomous mode.
- **Scene** — choose a background.
- **Motion** — set the behavior of the current selection.
- **Combat** — start/stop a duel or manage the superpower.

## How It Works

All behavior lives in a single IIFE in [`src/main.js`](src/main.js), backed by a static toolbar in [`index.html`](index.html) and styles in [`src/style.css`](src/style.css).

### Render loop

The main loop ([`src/main.js:1668`](src/main.js#L1668)) uses `requestAnimationFrame` with a delta capped at 50 ms to avoid huge jumps after tab switches. Each frame it:

1. Advances figure physics and effects (unless a freeze-frame is active).
2. Repaints the cached scene only when it is dirty.
3. Applies screen shake, draws figures, the marquee, and particle effects.
4. Syncs the toolbar readout.

The scene is rendered once to an offscreen canvas on resize or scene change, so photo backgrounds cost nothing per frame.

### The stick figure model

`StickFigure` ([`src/main.js:275`](src/main.js#L275)) stores position, facing, behavior, phase, velocity, and combat state. Its `pose()` method ([`src/main.js:875`](src/main.js#L875)) blends limb angles per behavior or combat state, then `draw()` ([`src/main.js:1173`](src/main.js#L1173)) renders the skeleton, motion-trail ghosts, selection ring, and power glyph.

Gravity is a constant `1500 px/s²`. Horizontal movement is driven by per-behavior speeds multiplied by a per-figure randomized `speedMul`, with facing flips at the screen margins.

### Combat state machine

When two figures of different colors fight, `startDuel()` points them at each other. `updateFight()` ([`src/main.js:555`](src/main.js#L555)) runs a per-figure state machine:

```
ready → approach → punch / kick / combo / spinkick / sweep / uppercut / flyingkick
      ↳ block / dodge
      ↳ stagger / knockdown / launched / getup
```

`landHit()` ([`src/main.js:515`](src/main.js#L515)) checks range, honors block/dodge, rolls for knockdown, applies knockback, and spawns hit effects. The same logic powers both AI duels and the player's superpower.

### Superpower

`blastFigure()` ([`src/main.js:251`](src/main.js#L251)) pushes the caster back, resets the target, and puts it into a `blown` sequence: it flies across the screen, hits the wall with a star burst, falls, lies down, then gets up. Screen shake and short freeze-frames sell the impact.

### Scenes

Scenes are declared in `SCENES` ([`src/main.js:25`](src/main.js#L25)). Photo images are preloaded, letterboxed with `cover` scaling, desaturated with a canvas filter, and veiled with the paper color. The chosen scene is saved to `localStorage` under `stickman.scene`.

### Effects

Lightweight particle systems (`star`, `dust`, `ring`) are spawned by hits, landings, and blasts, updated in `updateEffects()` ([`src/main.js:165`](src/main.js#L165)), and drawn as additive-feeling shapes. They all expire on a per-effect timer.

### Input

Pointer handling ([`src/main.js:1568`](src/main.js#L1568)) distinguishes figure drags from marquee selection using a small movement threshold. Hit testing is done per figure via `hit()`, which checks the head, torso, and feet. Keyboard handling ([`src/main.js:1533`](src/main.js#L1533)) maps keys to toolbar buttons and ignores typing in form fields.

## Project Structure

```
stickman-playground/
├── index.html                 # Toolbar markup + canvas
├── package.json               # Vite scripts and metadata
├── src/
│   ├── main.js                # All game logic, rendering, input, AI
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
