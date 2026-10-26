// Find a clear patch of land on the largest island/mainland. All dimensions
// remain in map coordinates: small countries never receive oversized badges.
export function logoPlacement(rings) {
  const outer = rings[0];
  const xs = outer.map(([x]) => x),
    ys = outer.map(([, y]) => y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  function clearance(x, y) {
    let inside = false,
      distance = Infinity;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[j],
          [bx, by] = ring[i];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
        const dx = bx - ax,
          dy = by - ay;
        const t = Math.max(
          0,
          Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)),
        );
        distance = Math.min(distance, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2);
      }
    }
    return inside ? Math.sqrt(distance) : -Math.sqrt(distance);
  }
  let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, radius: -Infinity };
  function consider(x, y) {
    const radius = clearance(x, y);
    if (radius > best.radius) best = { x, y, radius };
  }
  for (let x = 0; x <= 12; x++)
    for (let y = 0; y <= 12; y++)
      consider(minX + ((maxX - minX) * x) / 12, minY + ((maxY - minY) * y) / 12);
  let stepX = (maxX - minX) / 12,
    stepY = (maxY - minY) / 12;
  for (let pass = 0; pass < 7; pass++) {
    const { x, y } = best;
    stepX /= 2;
    stepY /= 2;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) consider(x + stepX * dx, y + stepY * dy);
  }
  const radius = Math.max(0, best.radius);
  // Rectangle corners fit within the interior circle, leaving coastlines clear.
  return [best.x - radius * 0.8, best.y - radius * 0.525, radius * 1.6, radius * 1.05].map(
    (value) => Math.round(value * 10000) / 10000,
  );
}
