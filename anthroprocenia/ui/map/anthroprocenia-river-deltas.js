// Route the displayed channel along shared hex edges, not every adjacent pair of river centres.
export function navigableRiverCourses(terrain, neighbors, positions, hexWidth, hexHeight, mapWidth = 0) {
  const vertices = [[0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25]];
  const sides = [[1, 2], [4, 5], [0, 1], [5, 0], [2, 3], [3, 4]];
  const wrap = x => mapWidth ? ((x % mapWidth) + mapWidth) % mapWidth : x;
  const seen = new Set(), segments = [], anchors = new Map();
  for (let start = 0; start < terrain.length; start++) {
    if (terrain[start] !== 10 || !positions[start] || seen.has(start)) continue;
    const tiles = [start];
    seen.add(start);
    for (let i = 0; i < tiles.length; i++) for (const tile of neighbors[tiles[i]] || []) {
      if (tile < 0 || terrain[tile] !== 10 || !positions[tile] || seen.has(tile)) continue;
      seen.add(tile); tiles.push(tile);
    }
    const nodes = new Map(), edges = new Map(), corners = new Map();
    const nodeAt = (x, y) => {
      x = wrap(x);
      const key = `${Math.round(x * 100000)},${Math.round(y * 100000)}`;
      if (!nodes.has(key)) nodes.set(key, { point: [x, y], edges: [] });
      return nodes.get(key);
    };
    const addEdge = (from, to, a, b) => {
      const edge = { from, to, a, b };
      from.edges.push(edge); to.edges.push(edge);
      return edge;
    };
    let outlet = null;
    for (const tile of tiles) {
      const at = positions[tile];
      const points = vertices.map(([x, y]) => nodeAt(at.x + x * hexWidth, at.y + y * hexHeight));
      corners.set(tile, points);
      for (let direction = 0; direction < sides.length; direction++) {
        const [i, j] = sides[direction], from = points[i], to = points[j];
        const ids = [from.point.join(','), to.point.join(',')].sort(), key = ids.join('|');
        const neighbor = (neighbors[tile] || [])[direction];
        let edge = edges.get(key);
        if (!edge) {
          edge = addEdge(from, to, tile, neighbor >= 0 && positions[neighbor] ? neighbor : tile);
          edges.set(key, edge);
        }
        if (neighbor >= 0 && positions[neighbor] && [0, 1, 9].includes(terrain[neighbor])
          && (!outlet || terrain[outlet.b] === 9 && terrain[neighbor] !== 9)) outlet = edge;
      }
    }
    let root = corners.get(start)[0];
    if (outlet) {
      const [x, y] = outlet.from.point, [bx, by] = outlet.to.point;
      let dx = bx - x;
      if (mapWidth) dx -= Math.round(dx / mapWidth) * mapWidth;
      root = nodeAt(x + dx / 2, (y + by) / 2);
      outlet.from.edges = outlet.from.edges.filter(edge => edge !== outlet);
      outlet.to.edges = outlet.to.edges.filter(edge => edge !== outlet);
      addEdge(outlet.from, root, outlet.a, outlet.b);
      addEdge(root, outlet.to, outlet.a, outlet.b);
    }
    const queue = [root], parents = new Map([[root, null]]), distances = new Map([[root, 0]]);
    for (let i = 0; i < queue.length; i++) for (const edge of queue[i].edges) {
      const next = edge.from === queue[i] ? edge.to : edge.from;
      if (parents.has(next)) continue;
      parents.set(next, edge); distances.set(next, distances.get(queue[i]) + 1); queue.push(next);
    }
    const near = new Map(), far = new Map(), tileDistance = new Map();
    for (const tile of tiles) {
      const points = corners.get(tile).slice().sort((a, b) => distances.get(a) - distances.get(b));
      near.set(tile, points[0]); far.set(tile, points[points.length - 1]);
      tileDistance.set(tile, distances.get(points[0]));
    }
    const selected = new Set();
    for (const tile of tiles) {
      const terminal = (neighbors[tile] || []).every(neighbor => !tileDistance.has(neighbor)
        || tileDistance.get(neighbor) <= tileDistance.get(tile));
      let node = terminal ? far.get(tile) : near.get(tile);
      anchors.set(tile, node.point);
      while (parents.get(node)) {
        const edge = parents.get(node);
        if (selected.has(edge)) break;
        selected.add(edge);
        node = edge.from === node ? edge.to : edge.from;
      }
    }
    for (const edge of selected) segments.push({ a: edge.a, b: edge.b, from: edge.from.point, to: edge.to.point });
    if (outlet) {
      const at = positions[outlet.b];
      segments.push({ a: outlet.a, b: outlet.b, from: root.point,
        to: [wrap(at.x + hexWidth / 2), at.y + hexHeight / 2], water: true });
    }
  }
  return { segments, anchors };
}

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
  const length = endpoint.navigable ? Math.max(hw * 10, hexWidth * 0.22) : Math.max(hw * 5, hexWidth * 0.1);
  const polygons = [], segments = [];
  const phase = Math.sin(x * 12.9898 + y * 78.233) * Math.PI;
  const branch = (origin, angle, reach, startHalf, endHalf, bend, seed) => {
    const ux = dx * Math.cos(angle) - dy * Math.sin(angle), uy = dx * Math.sin(angle) + dy * Math.cos(angle);
    const left = [], right = [];
    let previous = null;
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, half = startHalf + (endHalf - startHalf) * t;
      const wobble = Math.sin(Math.PI * t) * Math.sin(t * Math.PI * 3 + phase + seed) * reach * bend;
      const forward = reach * t;
      const px = origin[0] + ux * forward - uy * wobble;
      const py = origin[1] + uy * forward + ux * wobble;
      left.push([px - uy * half, py + ux * half]);
      right.push([px + uy * half, py - ux * half]);
      if (previous) segments.push({ x1: previous.x, y1: previous.y, x2: px, y2: py, hw: previous.half });
      previous = { x: px, y: py, half };
    }
    polygons.push([...left, ...(endHalf ? right : right.slice(0, -1)).reverse()]);
    return [previous.x, previous.y];
  };
  const origin = [x - dx * hw * 1.5, y - dy * hw * 1.5];
  if (endpoint.navigable) {
    const fork = branch(origin, 0, length * 0.3, hw * 1.15, hw * 0.85, 0.16, 0);
    for (const side of [-1, 1]) {
      const angle = side * 0.42;
      const next = branch(fork, angle, length * 0.35, hw * 0.9, hw * 0.5, 0.2, side);
      for (const split of [-1, 1]) branch(next, angle + split * 0.38,
        length * (0.45 + 0.06 * Math.sin(phase + side + split)), hw * 0.55, 0, 0.22, side * 3 + split);
    }
  } else {
    for (const angle of [-0.65, 0, 0.65]) branch(origin, angle, length, hw * 1.15, 0, 0.1, angle);
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
