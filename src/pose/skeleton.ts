import { LM } from "../domain/types";
import type { Landmark, Side } from "../domain/types";

/** Only the segments this app actually measures. A full skeleton is noise. */
const BONES: Array<[number, number]> = [
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
  [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
];

const MEASURED: Record<Side, number[]> = {
  left: [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  right: [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
};

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: Landmark[],
  side: Side,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);
  if (points.length < 33) return;

  const measured = new Set(MEASURED[side]);
  const px = (p: Landmark) => [p.x * w, p.y * h] as const;

  for (const [a, b] of BONES) {
    const pa = points[a];
    const pb = points[b];
    if (!pa || !pb) continue;
    const active = measured.has(a) && measured.has(b);
    ctx.strokeStyle = active ? "#ffffff" : "rgba(255,255,255,0.22)";
    ctx.lineWidth = active ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(...px(pa));
    ctx.lineTo(...px(pb));
    ctx.stroke();
  }

  for (let i = 0; i < points.length; i++) {
    if (!measured.has(i)) continue;
    const p = points[i];
    const [x, y] = px(p);
    // Radius encodes confidence. A weak landmark also drops to an outline
    // rather than changing hue, so the overlay stays monochrome and still
    // reads at a glance.
    ctx.fillStyle = p.visibility > 0.6 ? "#ffffff" : "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x, y, 3 + p.visibility * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
