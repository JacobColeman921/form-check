import { LM } from "../domain/types";
import type { Landmark, Side } from "../domain/types";

/** Visible body diagram used by every movement. The camera image stays primary. */
const BONES: Array<[number, number]> = [
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
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
  left: [LM.NOSE, 7, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  right: [LM.NOSE, 8, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
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
    if (pa.visibility < 0.5 || pb.visibility < 0.5) continue;
    ctx.strokeStyle = active ? "#65d7e2" : "rgba(255,255,255,0.3)";
    ctx.lineWidth = active ? Math.max(2.5, w / 240) : Math.max(1.5, w / 420);
    ctx.beginPath();
    ctx.moveTo(...px(pa));
    ctx.lineTo(...px(pb));
    ctx.stroke();
  }

  for (let i = 0; i < points.length; i++) {
    if (!measured.has(i)) continue;
    const p = points[i];
    const [x, y] = px(p);
    if (p.visibility < 0.5) continue;
    ctx.fillStyle = "#65d7e2";
    ctx.strokeStyle = "#101319";
    ctx.lineWidth = Math.max(1.5, w / 500);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, w / 200), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
