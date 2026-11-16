// Coordinates are canonical across the horizontal map seam; duplicated tile records count only once.
export function riverEndpoints(segments, mapWidth = 0) {
  const nodes = new Map(), edges = new Set();
  const keyOf = (x, y) => {
    if (mapWidth) x = ((x % mapWidth) + mapWidth) % mapWidth;
    return `${Math.round(x * 100000)},${Math.round(y * 100000)}`;
  };
  for (const segment of segments) {
    const a = keyOf(segment.x1, segment.y1), b = keyOf(segment.x2, segment.y2);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edges.has(key)) continue;
    edges.add(key);
    for (const [id, x, y, innerX, innerY, suppressed, tile] of [
      [a, segment.x1, segment.y1, segment.x2, segment.y2, segment.suppressStart, segment.tile],
      [b, segment.x2, segment.y2, segment.x1, segment.y1, segment.suppressEnd, segment.endTile === undefined ? segment.tile : segment.endTile],
    ]) {
      let node = nodes.get(id);
      if (!node) {
        let dx = x - innerX;
        if (mapWidth) dx -= Math.round(dx / mapWidth) * mapWidth;
        const dy = y - innerY, length = Math.hypot(dx, dy);
        node = { ...segment, tile, x, y, dx: dx / length, dy: dy / length, degree: 0, suppressed: false };
        nodes.set(id, node);
      }
      node.degree++;
      node.suppressed = node.suppressed || !!suppressed;
    }
  }
  return [...nodes.values()].filter(node => node.degree === 1 && !node.suppressed);
}

export function riverDelta(endpoint, hexWidth) {
  const { x, y, dx, dy, hw } = endpoint;
  const length = Math.max(hw * 5, hexWidth * 0.1), polygons = [], segments = [];
  const phase = Math.sin(x * 12.9898 + y * 78.233) * Math.PI;
  for (const angle of [-0.65, 0, 0.65]) {
    const ux = dx * Math.cos(angle) - dy * Math.sin(angle), uy = dx * Math.sin(angle) + dy * Math.cos(angle);
    const left = [], right = [];
    let previous = null;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, half = hw * 1.15 * (1 - t);
      const wobble = Math.sin(Math.PI * t) * Math.sin(t * Math.PI * 3 + phase + angle) * length * 0.1;
      const forward = length * t;
      const px = x - dx * hw * 1.5 + ux * forward - uy * wobble;
      const py = y - dy * hw * 1.5 + uy * forward + ux * wobble;
      left.push([px - uy * half, py + ux * half]);
      right.push([px + uy * half, py - ux * half]);
      if (previous) segments.push({ x1: previous.x, y1: previous.y, x2: px, y2: py, hw: previous.half });
      previous = { x: px, y: py, half };
    }
    polygons.push([...left, ...right.slice(0, -1).reverse()]);
  }
  const points = polygons.flat();
  return { ...endpoint, polygons, segments, box: {
    x0: Math.min(...points.map(p => p[0])), x1: Math.max(...points.map(p => p[0])),
    y0: Math.min(...points.map(p => p[1])), y1: Math.max(...points.map(p => p[1])),
  } };
}

export function visibleRiverDeltas(deltas, rect, mapWidth = 0) {
  const visible = [];
  for (const delta of deltas) {
    if (delta.box.y1 < rect.y0 || delta.box.y0 > rect.y1) continue;
    const first = mapWidth ? Math.ceil((rect.x0 - delta.box.x1) / mapWidth) : 0;
    const last = mapWidth ? Math.floor((rect.x1 - delta.box.x0) / mapWidth) : 0;
    for (let wrap = first; wrap <= last; wrap++) {
      const shift = wrap * mapWidth;
      if (delta.box.x1 + shift < rect.x0 || delta.box.x0 + shift > rect.x1) continue;
      visible.push({ delta, shift });
    }
  }
  return visible;
}
