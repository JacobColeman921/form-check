/**
 * Longest edge capped at `max`, aspect ratio kept.
 *
 * Pose estimation does not need camera resolution. Feeding it 1920x1080 costs
 * roughly nine times the pixels of 640-wide for no accuracy, and on a phone
 * that allocation happens every frame until the tab is killed.
 */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}
