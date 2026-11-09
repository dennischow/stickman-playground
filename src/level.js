import { clamp } from './constants.js';

export class Level {
  constructor() {
    this.w = 1;
    this.h = 1;
    this.groundY = 0;
    this.mezzY = 0;
    this.mezzX0 = 0;
    this.mezzX1 = 0;
    this.stairX0 = 0;
    this.stairX1 = 0;
    this.stairSteps = 10;
    this.stairTread = 1;
    this.stairRise = 1;
    this.level2Y = 0;
    this.level2X0 = 0;
    this.level2X1 = 0;
    this.upperStairX0 = 0;
    this.upperStairX1 = 0;
    this.upperStairSteps = 10;
    this.upperStairTread = 1;
    this.upperStairRise = 1;
    this.rebuild();
  }

  resize(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.rebuild();
  }

  rebuild() {
    this.groundY = this.h - 70;
    this.mezzY = this.h - 230;
    this.level2Y = this.h - 390;
    const margin = Math.max(42, Math.min(70, this.w * 0.045));
    this.mezzX1 = this.w - margin;
    this.mezzX0 = this.w * 0.55;
    this.stairX0 = this.w * 0.34;
    this.stairX1 = this.mezzX0;
    this.stairSteps = 10;
    this.stairTread = (this.stairX1 - this.stairX0) / this.stairSteps;
    this.stairRise = (this.groundY - this.mezzY) / this.stairSteps;

    this.level2X0 = margin;
    this.upperStairX1 = this.mezzX0;
    const upperSpan = Math.max(90, this.w * 0.13);
    this.upperStairX0 = Math.min(
      this.upperStairX1 - 20,
      Math.max(this.level2X0 + 40, this.upperStairX1 - upperSpan)
    );
    this.level2X1 = this.upperStairX0;
    this.upperStairSteps = 10;
    this.upperStairTread = (this.upperStairX1 - this.upperStairX0) / this.upperStairSteps;
    this.upperStairRise = (this.mezzY - this.level2Y) / this.upperStairSteps;
  }

  isOnStairs(x) {
    return x >= this.stairX0 && x < this.stairX1;
  }

  stairsYAt(x) {
    const t = clamp((x - this.stairX0) / Math.max(1, this.stairX1 - this.stairX0), 0, 1);
    return this.groundY - t * (this.groundY - this.mezzY);
  }

  onLowerStairPath(x, y, tol = 22) {
    return this.isOnStairs(x) && Math.abs(y - this.stairsYAt(x)) <= tol;
  }

  isOnUpperStairs(x) {
    return x >= this.upperStairX0 && x < this.upperStairX1;
  }

  upperStairsYAt(x) {
    const t = clamp((x - this.upperStairX0) / Math.max(1, this.upperStairX1 - this.upperStairX0), 0, 1);
    return this.level2Y + t * (this.mezzY - this.level2Y);
  }

  onUpperStairPath(x, y, tol = 22) {
    return this.isOnUpperStairs(x) && Math.abs(y - this.upperStairsYAt(x)) <= tol;
  }

  isOnAnyStairPath(x, y) {
    return this.onLowerStairPath(x, y) || this.onUpperStairPath(x, y);
  }

  surfaceAt(x, currentY = Infinity) {
    const limit = currentY - 14;
    let best = this.groundY;
    if (this.isOnStairs(x)) {
      const sy = this.stairsYAt(x);
      if (sy >= limit && sy < best) best = sy;
    }
    if (this.isOnUpperStairs(x)) {
      const sy = this.upperStairsYAt(x);
      if (sy >= limit && sy < best) best = sy;
    }
    if (x >= this.mezzX0 && x <= this.mezzX1 && this.mezzY >= limit && this.mezzY < best) {
      best = this.mezzY;
    }
    if (x >= this.level2X0 && x <= this.level2X1 && this.level2Y >= limit && this.level2Y < best) {
      best = this.level2Y;
    }
    return best;
  }

  floorAt(x, y) {
    if (x >= this.level2X0 && x <= this.level2X1 && Math.abs(y - this.level2Y) <= 10) return 2;
    if (this.onUpperStairPath(x, y, 14)) return -1;
    if (this.onLowerStairPath(x, y, 14)) return -1;
    if (x >= this.mezzX0 && x <= this.mezzX1 && Math.abs(y - this.mezzY) <= 10) return 1;
    if (Math.abs(y - this.groundY) <= 10) return 0;
    return -1;
  }

  floorY(floor) {
    if (floor === 2) return this.level2Y;
    if (floor === 1) return this.mezzY;
    return this.groundY;
  }

  floorBounds(floor) {
    if (floor === 2) {
      const pad = Math.min(42, (this.level2X1 - this.level2X0) * 0.2);
      return { x0: this.level2X0 + pad, x1: this.level2X1 - pad };
    }
    if (floor === 1) {
      return { x0: this.mezzX0 + 42, x1: this.mezzX1 - 42 };
    }
    return { x0: 50, x1: this.w - 50 };
  }

  draw(ctx) {
    const ink = 'rgba(27, 26, 23, 0.55)';
    const softInk = 'rgba(27, 26, 23, 0.28)';
    const paper = 'rgba(247, 246, 242, 0.58)';
    const paperSolid = 'rgba(247, 246, 242, 0.86)';
    const {
      mezzX0, mezzX1, mezzY, groundY, stairX0, stairX1, stairSteps, stairTread, stairRise,
      level2X0, level2X1, level2Y, upperStairX0, upperStairX1,
      upperStairSteps, upperStairTread, upperStairRise
    } = this;

    // Back wall wash under the mezzanine.
    ctx.save();
    ctx.fillStyle = 'rgba(247, 246, 242, 0.16)';
    ctx.fillRect(mezzX0, mezzY, mezzX1 - mezzX0, groundY - mezzY);
    ctx.fillStyle = 'rgba(27, 26, 23, 0.045)';
    ctx.fillRect(mezzX0, mezzY + 10, mezzX1 - mezzX0, 18);
    ctx.restore();

    // Back wall wash under the second floor.
    ctx.save();
    ctx.fillStyle = 'rgba(247, 246, 242, 0.12)';
    ctx.fillRect(level2X0, level2Y, level2X1 - level2X0, groundY - level2Y);
    ctx.fillStyle = 'rgba(27, 26, 23, 0.035)';
    ctx.fillRect(level2X0, level2Y + 10, level2X1 - level2X0, 16);
    ctx.restore();

    // Support posts and a light cross-brace.
    ctx.save();
    ctx.strokeStyle = softInk;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const posts = [mezzX0 + 28, (mezzX0 + mezzX1) * 0.5, mezzX1 - 28];
    for (const px of posts) {
      ctx.beginPath();
      ctx.moveTo(px, mezzY + 8);
      ctx.lineTo(px, groundY);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(mezzX0 + 28, mezzY + 8);
    ctx.lineTo((mezzX0 + mezzX1) * 0.5, groundY - 8);
    ctx.moveTo(mezzX1 - 28, mezzY + 8);
    ctx.lineTo((mezzX0 + mezzX1) * 0.5, groundY - 8);
    ctx.stroke();
    ctx.restore();

    // Staircase mass and treads.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(stairX0, groundY);
    for (let i = 0; i < stairSteps; i++) {
      const x = stairX0 + i * stairTread;
      const y = groundY - (i + 1) * stairRise;
      ctx.lineTo(x, y);
      ctx.lineTo(x + stairTread, y);
    }
    ctx.lineTo(stairX1, groundY);
    ctx.closePath();
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = softInk;
    ctx.lineWidth = 1;
    for (let i = 1; i < stairSteps; i++) {
      const x = stairX0 + i * stairTread;
      const y = groundY - i * stairRise;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + stairRise * 0.55);
      ctx.stroke();
    }
    ctx.restore();

    // Mezzanine slab.
    ctx.save();
    ctx.fillStyle = paperSolid;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(mezzX0, mezzY, mezzX1 - mezzX0, 9);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(247, 246, 242, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mezzX0 + 5, mezzY + 2);
    ctx.lineTo(mezzX1 - 5, mezzY + 2);
    ctx.stroke();
    ctx.restore();

    // Railing behind figures on the mezzanine.
    ctx.save();
    ctx.strokeStyle = softInk;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const railY = mezzY - 50;
    ctx.beginPath();
    ctx.moveTo(mezzX0, railY);
    ctx.lineTo(mezzX1, railY);
    ctx.stroke();
    const railGap = Math.max(44, (mezzX1 - mezzX0) / 10);
    for (let x = mezzX0; x <= mezzX1 + 1; x += railGap) {
      ctx.beginPath();
      ctx.moveTo(x, railY);
      ctx.lineTo(x, mezzY);
      ctx.stroke();
    }
    ctx.restore();

    // Small landing lip at the top of the stairs.
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(stairX1 - 18, mezzY);
    ctx.lineTo(stairX1, mezzY);
    ctx.stroke();
    ctx.restore();

    // Posts holding up the second floor.
    ctx.save();
    ctx.strokeStyle = softInk;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const upperPostL = level2X0 + 28;
    const upperPostR = Math.min(level2X1 - 28, stairX0 - 18);
    const upperPosts = upperPostR - upperPostL > 120
      ? [upperPostL, (upperPostL + upperPostR) * 0.5, upperPostR]
      : [upperPostL, upperPostR];
    for (const px of upperPosts) {
      ctx.beginPath();
      ctx.moveTo(px, level2Y + 8);
      ctx.lineTo(px, groundY);
      ctx.stroke();
    }
    if (upperPostR > upperPostL + 12) {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(upperPostL, level2Y + 8);
      ctx.lineTo(upperPostR, groundY - 8);
      ctx.stroke();
    }
    ctx.restore();

    // Upper staircase: open treads on a slim diagonal stringer.
    ctx.save();
    ctx.strokeStyle = softInk;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(upperStairX1, mezzY);
    ctx.lineTo(upperStairX0, level2Y);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(upperStairX1, mezzY);
    ctx.lineTo(upperStairX0, level2Y);
    ctx.stroke();

    const upperStepH = Math.max(5, upperStairRise + 1);
    for (let i = 0; i < upperStairSteps; i++) {
      const x = upperStairX1 - (i + 1) * upperStairTread;
      const y = mezzY - (i + 1) * upperStairRise;
      ctx.fillStyle = paperSolid;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(x, y, upperStairTread + 0.6, upperStepH);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Second-floor slab.
    ctx.save();
    ctx.fillStyle = paperSolid;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(level2X0, level2Y, level2X1 - level2X0, 9);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(247, 246, 242, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(level2X0 + 5, level2Y + 2);
    ctx.lineTo(level2X1 - 5, level2Y + 2);
    ctx.stroke();
    ctx.restore();

    // Railing behind figures on the second floor.
    ctx.save();
    ctx.strokeStyle = softInk;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const upperRailY = level2Y - 50;
    ctx.beginPath();
    ctx.moveTo(level2X0, upperRailY);
    ctx.lineTo(level2X1, upperRailY);
    ctx.stroke();
    const upperRailGap = Math.max(44, (level2X1 - level2X0) / 10);
    for (let x = level2X0; x <= level2X1 + 1; x += upperRailGap) {
      ctx.beginPath();
      ctx.moveTo(x, upperRailY);
      ctx.lineTo(x, level2Y);
      ctx.stroke();
    }
    ctx.restore();

    // Small landing lip at the top of the upper stairs.
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(upperStairX0, level2Y);
    ctx.lineTo(upperStairX0 + 18, level2Y);
    ctx.stroke();
    ctx.restore();
  }
}
