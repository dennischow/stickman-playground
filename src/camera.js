const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Camera {
  constructor() {
    this.w = 1;
    this.h = 1;
    this.x = 0.5;
    this.y = 0.5;
    this.zoom = 1;
    this.rotation = 0;
    this.targetX = 0.5;
    this.targetY = 0.5;
    this.targetZoom = 1;
    this.targetRotation = 0;
    this.minZoom = 1;
    this.maxZoom = 1.3;
    this.maxRotation = 0.024;
    this.follow = 7;
    this.snap = false;
  }

  resize(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.reset();
  }

  reset() {
    this.x = this.targetX = this.w / 2;
    this.y = this.targetY = this.h / 2;
    this.zoom = this.targetZoom = 1;
    this.rotation = this.targetRotation = 0;
  }

  setTarget(x, y, zoom = this.targetZoom, rotation = this.targetRotation) {
    this.targetX = x;
    this.targetY = y;
    this.targetZoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.targetRotation = clamp(rotation, -this.maxRotation, this.maxRotation);
  }

  update(dt) {
    if (dt <= 0) {
      this.clamp();
      return;
    }
    if (this.snap) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.zoom = this.targetZoom;
      this.rotation = this.targetRotation;
      this.clamp();
      return;
    }
    const k = 1 - Math.exp(-dt * this.follow);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;
    this.rotation += (this.targetRotation - this.rotation) * k;
    this.clamp();
  }

  _limits(zoom, rotation) {
    const maxRot = Math.min(
      this.maxRotation,
      Math.max(0, (zoom - 1) * Math.min(this.w / this.h, this.h / this.w))
    );
    const r = clamp(rotation, -maxRot, maxRot);
    const c = Math.abs(Math.cos(r));
    const s = Math.abs(Math.sin(r));
    return {
      rotation: r,
      halfW: (this.w * c + this.h * s) / (2 * zoom),
      halfH: (this.w * s + this.h * c) / (2 * zoom)
    };
  }

  clamp() {
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    const t = this._limits(this.targetZoom, this.targetRotation);
    this.targetRotation = t.rotation;
    this.targetX = clamp(this.targetX, t.halfW, this.w - t.halfW);
    this.targetY = clamp(this.targetY, t.halfH, this.h - t.halfH);

    const l = this._limits(this.zoom, this.rotation);
    this.rotation = l.rotation;
    this.x = clamp(this.x, l.halfW, this.w - l.halfW);
    this.y = clamp(this.y, l.halfH, this.h - l.halfH);
  }

  apply(ctx) {
    ctx.translate(this.w / 2, this.h / 2);
    if (this.rotation) ctx.rotate(this.rotation);
    if (this.zoom !== 1) ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  screenToWorld(sx, sy) {
    const dx = sx - this.w / 2;
    const dy = sy - this.h / 2;
    const c = Math.cos(-this.rotation);
    const s = Math.sin(-this.rotation);
    return {
      x: this.x + (dx * c - dy * s) / this.zoom,
      y: this.y + (dx * s + dy * c) / this.zoom
    };
  }

  worldToScreen(wx, wy) {
    const dx = (wx - this.x) * this.zoom;
    const dy = (wy - this.y) * this.zoom;
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return {
      x: this.w / 2 + dx * c - dy * s,
      y: this.h / 2 + dx * s + dy * c
    };
  }
}
