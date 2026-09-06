/**
 * Minimal force-directed layout (zero extra dependency): pair repulsion +
 * link springs + center gravity, annealed over a few hundred ticks.
 * Deterministic from the node set and edge list.
 */

export interface Point {
  x: number;
  y: number;
}

export function forceLayout(
  count: number,
  links: Array<[number, number]>,
  width: number,
  height: number,
): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (2 * Math.PI * index) / Math.max(1, count);
    points.push({
      x: width / 2 + (Math.cos(angle) * width) / 4,
      y: height / 2 + (Math.sin(angle) * height) / 4,
    });
  }
  const repulsion = 24_000;
  const spring = 0.02;
  const restLength = 180;
  const gravity = 0.03;
  for (let tick = 0; tick < 300; tick += 1) {
    const fx = new Array<number>(count).fill(0);
    const fy = new Array<number>(count).fill(0);
    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        let dx = points[a]!.x - points[b]!.x;
        let dy = points[a]!.y - points[b]!.y;
        let distance2 = dx * dx + dy * dy;
        if (distance2 < 1) {
          dx = 1;
          dy = 1;
          distance2 = 2;
        }
        const force = repulsion / distance2;
        const distance = Math.sqrt(distance2);
        fx[a]! += (dx / distance) * force;
        fy[a]! += (dy / distance) * force;
        fx[b]! -= (dx / distance) * force;
        fy[b]! -= (dy / distance) * force;
      }
    }
    for (const [a, b] of links) {
      const dx = points[b]!.x - points[a]!.x;
      const dy = points[b]!.y - points[a]!.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - restLength) * spring;
      fx[a]! += (dx / distance) * force;
      fy[a]! += (dy / distance) * force;
      fx[b]! -= (dx / distance) * force;
      fy[b]! -= (dy / distance) * force;
    }
    for (let index = 0; index < count; index += 1) {
      fx[index]! += (width / 2 - points[index]!.x) * gravity;
      fy[index]! += (height / 2 - points[index]!.y) * gravity;
      points[index] = {
        x: Math.max(80, Math.min(width - 80, points[index]!.x + Math.max(-24, Math.min(24, fx[index]!)))),
        y: Math.max(60, Math.min(height - 60, points[index]!.y + Math.max(-24, Math.min(24, fy[index]!)))),
      };
    }
  }
  return points;
}
