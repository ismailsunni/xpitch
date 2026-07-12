/*
 * pitch.ts — draws a football pitch on a <canvas> plus data overlays:
 * heatmap, movement trail, average-position marker and 3x3 zone grid.
 *
 * Pitch coordinates: u in [0,1] along length (left=defensive, right=attacking),
 * v in [0,1] across width. Rendered onto a canonical 105x68 template.
 */

const GREEN_DARK = '#1c7a3e';
const GREEN_LIGHT = '#2a9350';
const LINE = 'rgba(255,255,255,0.75)';

export type PitchMode = 'heatmap' | 'trail' | 'zones';

interface FitResult {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

function fit(canvas: HTMLCanvasElement, aspect = 68 / 105): FitResult {
  const parent = canvas.parentElement as HTMLElement;
  const w = parent.clientWidth || 320;
  const h = Math.round(w * aspect);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function mapper(w: number, h: number, margin: number) {
  const pw = w - 2 * margin;
  const ph = h - 2 * margin;
  return (u: number, v: number) => ({ x: margin + u * pw, y: margin + v * ph });
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.fillStyle = LINE;
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPitchLines(ctx: CanvasRenderingContext2D, w: number, h: number, margin: number) {
  const pw = w - 2 * margin;
  const ph = h - 2 * margin;
  const stripes = 12;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? GREEN_DARK : GREEN_LIGHT;
    ctx.fillRect(margin + (i / stripes) * pw, margin, pw / stripes + 1, ph);
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, margin, pw, ph);
  ctx.beginPath();
  ctx.moveTo(margin + pw / 2, margin);
  ctx.lineTo(margin + pw / 2, margin + ph);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(margin + pw / 2, margin + ph / 2, ph * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, margin + pw / 2, margin + ph / 2, 2.5);
  const penW = pw * 0.16;
  const penH = ph * 0.58;
  const goalW = pw * 0.055;
  const goalH = ph * 0.3;
  ctx.strokeRect(margin, margin + (ph - penH) / 2, penW, penH);
  ctx.strokeRect(margin, margin + (ph - goalH) / 2, goalW, goalH);
  dot(ctx, margin + penW * 0.72, margin + ph / 2, 2.5);
  ctx.strokeRect(margin + pw - penW, margin + (ph - penH) / 2, penW, penH);
  ctx.strokeRect(margin + pw - goalW, margin + (ph - goalH) / 2, goalW, goalH);
  dot(ctx, margin + pw - penW * 0.72, margin + ph / 2, 2.5);
}

// A large, faint block arrow spanning the pitch, showing the attacking
// direction (data is always oriented so attacking is to the right). Drawn as a
// background watermark right after the pitch lines, so data overlays sit on top.
function drawAttackArrow(ctx: CanvasRenderingContext2D, w: number, h: number, margin: number) {
  const pw = w - 2 * margin;
  const ph = h - 2 * margin;
  const y = margin + ph / 2; // vertical centre
  const x1 = margin + pw * 0.16;
  const x2 = margin + pw * 0.84;
  const head = ph * 0.26; // big arrowhead
  const shaftH = ph * 0.11; // thick shaft
  const headBaseX = x2 - head;
  const top = y - shaftH / 2;
  const bot = y + shaftH / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  ctx.beginPath();
  ctx.moveTo(x1, top);
  ctx.lineTo(headBaseX, top);
  ctx.lineTo(headBaseX, y - head / 2);
  ctx.lineTo(x2, y);
  ctx.lineTo(headBaseX, y + head / 2);
  ctx.lineTo(headBaseX, bot);
  ctx.lineTo(x1, bot);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDirectionLabels(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  margin: number,
  compass?: { left: string; right: string; top: string; bottom: string } | null
) {
  ctx.font = '11px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  // Attacking is drawn to the right; when a field is set, also show compass.
  ctx.textAlign = 'left';
  ctx.fillText(compass ? `◀ Defensive (${compass.left})` : '◀ Defensive', margin + 4, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(compass ? `(${compass.right}) Attacking ▶` : 'Attacking ▶', w - margin - 4, h - 4);
  if (compass) {
    ctx.textAlign = 'center';
    ctx.fillText(compass.top, w / 2, margin + 12);
    ctx.fillText(compass.bottom, w / 2, h - 16);
  }
}

function heatColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [30, 60, 200]],
    [0.35, [40, 190, 200]],
    [0.55, [70, 210, 90]],
    [0.75, [240, 220, 50]],
    [1, [230, 40, 40]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function timeColor(t: number): [number, number, number] {
  const c0 = [140, 90, 250];
  const c1 = [255, 150, 30];
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * t),
    Math.round(c0[1] + (c1[1] - c0[1]) * t),
    Math.round(c0[2] + (c1[2] - c0[2]) * t),
  ];
}

function drawHeatmap(canvas: HTMLCanvasElement, positional: any, aspect: number) {
  const { ctx, w, h } = fit(canvas, aspect);
  const margin = Math.max(14, w * 0.03);
  drawPitchLines(ctx, w, h, margin);
  drawAttackArrow(ctx, w, h, margin);
  const map = mapper(w, h, margin);
  const { grid, gridMax, GX, GY } = positional;

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d') as CanvasRenderingContext2D;
  const cellW = (w - 2 * margin) / GX;
  const radius = Math.max(cellW * 1.6, 10);

  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      const val = grid[gy][gx];
      if (val <= 0) continue;
      const intensity = Math.pow(val / gridMax, 0.55);
      const p = map((gx + 0.5) / GX, (gy + 0.5) / GY);
      const g = octx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      g.addColorStop(0, `rgba(0,0,0,${0.9 * intensity})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      octx.fillStyle = g;
      octx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    }
  }

  const img = octx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    if (a <= 0.02) {
      d[i + 3] = 0;
      continue;
    }
    const c = heatColor(a);
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = Math.min(255, a * 235);
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0);

  if (positional.avgPos) {
    const p = map(positional.avgPos.u, positional.avgPos.v);
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('AVG', p.x, p.y - 12);
  }
  drawDirectionLabels(ctx, w, h, margin, positional.compass);
}

function drawTrail(canvas: HTMLCanvasElement, positional: any, aspect: number) {
  const { ctx, w, h } = fit(canvas, aspect);
  const margin = Math.max(14, w * 0.03);
  drawPitchLines(ctx, w, h, margin);
  drawAttackArrow(ctx, w, h, margin);
  const map = mapper(w, h, margin);
  const pts = positional.points;
  if (!pts.length) return;

  const tMax = pts[pts.length - 1].tSec || 1;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = map(pts[i - 1].u, pts[i - 1].v);
    const b = map(pts[i].u, pts[i].v);
    const c = timeColor(pts[i].tSec / tMax);
    ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},0.55)`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  drawDirectionLabels(ctx, w, h, margin, positional.compass);
}

function drawZones(canvas: HTMLCanvasElement, positional: any, aspect: number) {
  const { ctx, w, h } = fit(canvas, aspect);
  const margin = Math.max(14, w * 0.03);
  drawPitchLines(ctx, w, h, margin);
  drawAttackArrow(ctx, w, h, margin);
  const pw = w - 2 * margin;
  const ph = h - 2 * margin;
  const grid = positional.zoneGrid;
  const ny = grid.length;
  const nx = grid[0]?.length || 0;
  let total = 0;
  for (const row of grid) for (const c of row) total += c;
  total = total || 1;
  const cw = pw / nx;
  const ch = ph / ny;
  const fontPx = Math.max(9, Math.min(14, cw * 0.34));

  for (let zy = 0; zy < ny; zy++) {
    for (let zx = 0; zx < nx; zx++) {
      const pct = grid[zy][zx] / total;
      const x = margin + zx * cw;
      const y = margin + zy * ch;
      ctx.fillStyle = `rgba(230,40,40,${0.12 + pct * 0.88})`;
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeRect(x, y, cw, ch);
      // Skip the label on empty cells at a fine grid to reduce clutter.
      if (pct > 0.004 || nx <= 3) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${fontPx}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(pct * 100) + '%', x + cw / 2, y + ch / 2 + fontPx * 0.35);
      }
    }
  }
  drawAttackArrow(ctx, w, h, margin);
  drawDirectionLabels(ctx, w, h, margin, positional.compass);
}

export function drawPitch(canvas: HTMLCanvasElement, positional: any, mode: PitchMode) {
  if (!canvas || !positional) return;
  // Use the real field aspect ratio when a field is defined; otherwise the
  // canonical 105x68 template (the PCA bounding box aspect is not meaningful).
  let aspect = positional.templateAspect || 68 / 105;
  if (positional.hasField && positional.lengthM > 0) {
    aspect = Math.min(0.95, Math.max(0.4, positional.widthM / positional.lengthM));
  }
  if (mode === 'heatmap') drawHeatmap(canvas, positional, aspect);
  else if (mode === 'trail') drawTrail(canvas, positional, aspect);
  else if (mode === 'zones') drawZones(canvas, positional, aspect);
}
