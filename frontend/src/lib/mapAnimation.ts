/** Cancelable animation: a newer geographic selection always wins. */
export function animateFrames(
  duration: number,
  update: (progress: number) => void,
): () => void {
  if (duration === 0) {
    update(1);
    return () => {};
  }
  const start = performance.now();
  let frame = 0,
    cancelled = false;
  const step = (now: number) => {
    if (cancelled) return;
    const progress = Math.min(1, Math.max(0, (now - start) / duration));
    update(progress);
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  update(0);
  frame = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const lerp = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;
export function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
