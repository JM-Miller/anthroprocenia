// Links between townscapes: roads joining adjacent townscapes and the map's roads, streams joining townscapes' water and
// the map's rivers, and decorative bridges where a new road crosses a (non-navigable) river. Everything is in map pixels and
// nothing here touches the game or the DOM, so it can be tested on its own.

export function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / denominator, u = ((cx - ax) * ry - (cy - ay) * rx) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + rx * t, y: ay + ry * t, t, u };
}

export function nearestOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length2)) : 0;
  const x = x1 + dx * t, y = y1 + dy * t;
  return { x, y, t, d: Math.hypot(px - x, py - y) };
}

// The nearest point of a polyline of { x, y } points, or null for an empty one.
export function nearestOnPolyline(px, py, pts) {
  let best = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const hit = nearestOnSegment(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (!best || hit.d < best.d) best = { ...hit, index: i };
  }
  return best;
}

// The node that lies furthest in direction (dx, dy) from the centre; the town's gate toward a neighbour.
export function outermostNode(nodes, center, dx, dy) {
  let best = null, bestScore = -Infinity;
  for (const node of nodes) {
    const score = (node.x - center.x) * dx + (node.y - center.y) * dy;
    if (score > bestScore) { bestScore = score; best = node; }
  }
  return best;
}

// A bridge over a river where a road crosses it: a plank rectangle along the road, long enough to span the river's width,
// with a rail on each side. `direction` is the road's unit direction at the crossing.
export function bridgeAt(crossing, direction, riverClear, width) {
  const half = Math.max(riverClear, width) + width * 0.8, wide = width / 2;
  const ux = direction.x * half, uy = direction.y * half, vx = -direction.y * wide, vy = direction.x * wide;
  const { x, y } = crossing;
  const poly = [[x - ux - vx, y - uy - vy], [x + ux - vx, y + uy - vy], [x + ux + vx, y + uy + vy], [x - ux + vx, y - uy + vy]];
  return { x, y, reach: Math.hypot(half, wide), poly, rails: [[poly[0], poly[1]], [poly[3], poly[2]]] };
}

// Only facing dry road ends can form a bridge; spatial buckets bound the candidate search.
export function bridgeRoadGaps(roads, { width, maxSpan, isWet, clear = () => true, limit = 128, minFacing = 0.94 }) {
  const cells = new Map(), ends = [], bridges = [], links = [], used = new Set();
  if (!(width > 0) || !(maxSpan > width)) return { bridges, roads: links };
  for (const road of roads) {
    const pts = road.pts;
    if (pts.length < 2) continue;
    for (const [point, inner] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const length = Math.hypot(point.x - inner.x, point.y - inner.y);
      if (!length || isWet(point.x, point.y)) continue;
      const end = { point, road, dx: (point.x - inner.x) / length, dy: (point.y - inner.y) / length, id: ends.length };
      ends.push(end);
      const key = `${Math.floor(point.x / maxSpan)},${Math.floor(point.y / maxSpan)}`;
      const list = cells.get(key) || [];
      list.push(end); cells.set(key, list);
    }
  }
  for (const a of ends) {
    if (used.has(a.id) || bridges.length >= limit) continue;
    const x = Math.floor(a.point.x / maxSpan), y = Math.floor(a.point.y / maxSpan), candidates = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const b of cells.get(`${x + dx},${y + dy}`) || []) {
      if (b.id <= a.id || used.has(b.id) || b.road === a.road) continue;
      const vx = b.point.x - a.point.x, vy = b.point.y - a.point.y, length = Math.hypot(vx, vy);
      if (length <= width * 0.1 || length > maxSpan ||
          (vx * a.dx + vy * a.dy) / length < minFacing || (-vx * b.dx - vy * b.dy) / length < minFacing) continue;
      candidates.push({ b, length });
    }
    candidates.sort((a, b) => a.length - b.length || a.b.id - b.b.id);
    for (const { b, length } of candidates) {
      const mid = { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 };
      if (!isWet(mid.x, mid.y) || !clear(a.point, b.point, width / 2)) continue;
      const steps = Math.min(256, Math.max(16, Math.ceil(length / (width / 2))));
      let wet = 0;
      for (let k = 1; k < steps; k++) if (isWet(a.point.x + (b.point.x - a.point.x) * k / steps, a.point.y + (b.point.y - a.point.y) * k / steps)) wet++;
      if (wet < steps / 4) continue;
      const bridge = bridgeAt(mid, { x: (b.point.x - a.point.x) / length, y: (b.point.y - a.point.y) / length }, length / 2, width);
      bridge.start = a.point; bridge.end = b.point;
      bridges.push(bridge);
      links.push({ pts: [a.point, b.point], towns: [...new Set([...(a.road.towns || []), ...(b.road.towns || [])])], kind: 'bridge' });
      used.add(a.id); used.add(b.id);
      break;
    }
  }
  return { bridges, roads: links };
}

// Waterfront decks are visual structures, not permission for ordinary road links or walkers to cross water.
export function waterfrontLayout(center, water, radius, extensive = false) {
  const dx = water.x - center.x, dy = water.y - center.y, length = Math.hypot(dx, dy);
  if (!(length > 0) || !(radius > 0)) return { decks: [], buildings: [] };
  const ux = dx / length, uy = dy / length, vx = -uy, vy = ux;
  const width = radius * (extensive ? 0.04 : 0.025), depth = Math.max(width * 2, Math.min(radius * 0.18, water.depth || radius * 0.15));
  const at = (d, side) => [center.x + ux * d + vx * side, center.y + uy * d + vy * side];
  const box = (from, to, side, half) => [at(from, side - half), at(to, side - half), at(to, side + half), at(from, side + half)];
  const decks = [box(-width, length + depth, 0, width)];
  const buildings = [];
  const count = extensive ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const side = (i - (count - 1) / 2) * width * 5;
    if (side) decks.push(box(length - width, length + depth, side, width));
    buildings.push({
      poly: box(length + depth * 0.35, length + depth * 0.8, side, width * 0.65),
      detail: [[at(length + depth * 0.4, side), at(length + depth * 0.75, side)]],
    });
  }
  decks.push([at(length - width, -width * (extensive ? 6 : 2)), at(length + width, -width * (extensive ? 6 : 2)),
    at(length + width, width * (extensive ? 6 : 2)), at(length - width, width * (extensive ? 6 : 2))]);
  return { decks, buildings };
}
export function deckEdgeAllowed(a, b, decks) {
  const intervals = [];
  for (const poly of decks) {
    let area = 0, from = 0, to = 1;
    const origin = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      area += (p[0] - origin[0]) * (q[1] - origin[1]) - (q[0] - origin[0]) * (p[1] - origin[1]);
    }
    if (!area) continue;
    const sign = Math.sign(area);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length], dx = q[0] - p[0], dy = q[1] - p[1];
      const start = sign * (dx * (a.y - p[1]) - dy * (a.x - p[0]));
      const slope = sign * (dx * (b.y - a.y) - dy * (b.x - a.x));
      if (Math.abs(slope) < 1e-14) { if (start < -1e-12) { to = -1; break; } }
      else if (slope > 0) from = Math.max(from, (-1e-12 - start) / slope);
      else to = Math.min(to, (-1e-12 - start) / slope);
    }
    if (from <= to) intervals.push([from, to]);
  }
  intervals.sort((x, y) => x[0] - y[0]);
  let end = 0;
  for (const [from, to] of intervals) {
    if (from > end + 1e-10) return false;
    end = Math.max(end, to);
    if (end >= 1 - 1e-10) return true;
  }
  return false;
}

// towns: [{ id, x, y, radius, nodes: [{x, y}], roads: [[{x, y}]], water: [[{x, y}]] }]  (the town's street nodes, the map roads
//   that pass near it, and its own streams); mainStreets and streets optionally provide polylines to extend at their ends.
// rivers: [{ x1, y1, x2, y2, clear }]  (the map's non-navigable river segments near the towns)
// Returns { roads, water, bridges, linksByTown }: roads and water are { pts: [{x, y}], towns: [ids], kind }.
// `allow(a, b)` can veto a road between two points (the map uses it to keep roads off water).
export function planTownLinks({ towns, rivers = [], mapRoads = [], width = 1, maxNeighbors = 3, minGap = 0.55, maxGap = 1.8, allow = () => true }) {
  const roads = [], water = [], bridges = [], linksByTown = new Map(towns.map(town => [town.id, []]));
  const addRoad = (a, b, ids, kind) => {
    if (Math.hypot(a.x - b.x, a.y - b.y) < width * 0.2 || !allow(a, b)) return false;
    const road = { pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], towns: ids, kind };
    roads.push(road);
    for (const id of ids) linksByTown.get(id).push({ pts: road.pts, half: 0 });
    return true;
  };
  // 1. Adjacent townscapes (not overlapping, not far apart): the nearest few of each are joined gate to gate.
  const pairs = [];
  for (let i = 0; i < towns.length; i++) for (let j = i + 1; j < towns.length; j++) {
    const d = Math.hypot(towns[i].x - towns[j].x, towns[i].y - towns[j].y), reach = towns[i].radius + towns[j].radius;
    if (d >= reach * minGap && d <= reach * maxGap) pairs.push({ i, j, d });
  }
  pairs.sort((a, b) => a.d - b.d);
  const degree = towns.map(() => 0), joined = [];
  for (const pair of pairs) {
    if (degree[pair.i] >= maxNeighbors || degree[pair.j] >= maxNeighbors) continue;
    const a = towns[pair.i], b = towns[pair.j], dx = (b.x - a.x) / pair.d, dy = (b.y - a.y) / pair.d;
    const gateA = outermostNode(a.nodes, a, dx, dy), gateB = outermostNode(b.nodes, b, -dx, -dy);
    if (!gateA || !gateB) continue;
    if (!addRoad(gateA, gateB, [a.id, b.id], 'town')) continue;
    degree[pair.i]++; degree[pair.j]++;
    joined.push(pair);
  }
  // 2. The map's roads that pass near a townscape: its nearest street node is joined to the road.
  for (const town of towns) {
    const candidates = [];
    for (const road of town.roads) {
      const hit = nearestOnPolyline(town.x, town.y, road);
      if (hit) candidates.push(hit);
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const hit of candidates.slice(0, 3)) {
      if (hit.d > town.radius * 1.2) continue;
      let gate = null, gateDistance = Infinity;
      for (const node of town.nodes) { const d = Math.hypot(node.x - hit.x, node.y - hit.y); if (d < gateDistance) { gateDistance = d; gate = node; } }
      if (gate && gateDistance <= town.radius * 0.9) addRoad(gate, hit, [town.id], 'map');
    }
  }
  const byTile = new Map(), parents = new Map(towns.map(town => [town.id, town.id]));
  const root = id => {
    while (parents.get(id) !== id) { parents.set(id, parents.get(parents.get(id))); id = parents.get(id); }
    return id;
  };
  const join = (a, b) => parents.set(root(a), root(b));
  for (const road of roads) for (const id of road.towns.slice(1)) join(road.towns[0], id);
  const connectedPairs = new Set(roads.filter(road => road.towns.length === 2).map(road => road.towns.slice().sort().join('|')));
  const connectTowns = (a, b, kind) => {
    const pair = [a.id, b.id].sort().join('|');
    if (connectedPairs.has(pair)) return true;
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance;
    const gateA = outermostNode(a.nodes, a, dx, dy), gateB = outermostNode(b.nodes, b, -dx, -dy);
    if (!gateA || !gateB) return false;
    for (const line of mapRoads) {
      const centerA = nearestOnPolyline(a.x, a.y, line), centerB = nearestOnPolyline(b.x, b.y, line);
      if (!centerA || !centerB || centerA.d > a.radius * 1.2 || centerB.d > b.radius * 1.2) continue;
      const nearestGate = (town, hit) => town.nodes.reduce((best, node) =>
        !best || Math.hypot(node.x - hit.x, node.y - hit.y) < Math.hypot(best.x - hit.x, best.y - hit.y) ? node : best, null);
      const roadGateA = nearestGate(a, centerA), roadGateB = nearestGate(b, centerB);
      const hitA = nearestOnPolyline(roadGateA.x, roadGateA.y, line), hitB = nearestOnPolyline(roadGateB.x, roadGateB.y, line);
      const forward = hitA.index < hitB.index || (hitA.index === hitB.index && hitA.t <= hitB.t);
      const first = forward ? hitA : hitB, last = forward ? hitB : hitA;
      const spine = [first, ...line.slice(first.index + 1, last.index + 1), last];
      const pieces = [[roadGateA, hitA], [roadGateB, hitB], ...spine.slice(1).map((point, i) => [spine[i], point])]
        .filter(([p, q]) => Math.hypot(p.x - q.x, p.y - q.y) >= width * 0.2);
      if (!pieces.every(([p, q]) => allow(p, q))) continue;
      for (const [p, q] of pieces) addRoad(p, q, [a.id, b.id], 'major-connection');
      connectedPairs.add(pair); join(a.id, b.id); return true;
    }
    if (!addRoad(gateA, gateB, [a.id, b.id], kind)) return false;
    connectedPairs.add(pair); join(a.id, b.id); return true;
  };
  for (const town of towns) {
    if (!Number.isInteger(town.tile) || town.tile < 0) continue;
    if (!byTile.has(town.tile)) byTile.set(town.tile, []);
    byTile.get(town.tile).push(town);
  }
  for (const group of byTile.values()) {
    let changed;
    do {
      changed = false;
      for (const town of group) {
        const candidates = group.filter(other => root(town.id) !== root(other.id))
          .sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y));
        for (const other of candidates) if (connectTowns(town, other, 'tile')) { changed = true; break; }
      }
    } while (changed && new Set(group.map(town => root(town.id))).size > 1);
    const sourceCenter = group[0].tileCenter;
    if (!sourceCenter) continue;
    for (const tile of group[0].neighbors || []) {
      const adjacent = byTile.get(tile), targetCenter = adjacent && adjacent[0].tileCenter;
      if (!targetCenter) continue;
      const length = Math.hypot(targetCenter.x - sourceCenter.x, targetCenter.y - sourceCenter.y);
      if (!length) continue;
      const dx = (targetCenter.x - sourceCenter.x) / length, dy = (targetCenter.y - sourceCenter.y) / length;
      const facing = (list, center, ux, uy) => {
        const score = town => (town.x - center.x) * ux + (town.y - center.y) * uy;
        const edge = Math.max(...list.map(score));
        return list.filter(town => score(town) + town.radius >= edge - 1e-9);
      };
      const targets = facing(adjacent, targetCenter, -dx, -dy);
      for (const town of facing(group, sourceCenter, dx, dy)) {
        const nearest = targets.slice().sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y));
        for (const target of nearest) if (connectTowns(town, target, 'tile-side')) break;
      }
    }
  }
  const disconnectedTiles = [...byTile].filter(([, group]) => new Set(group.map(town => root(town.id))).size > 1).map(([tile]) => tile);
  // 3. Streams: a townscape's water joins the nearest map river, and the water of adjacent townscapes joins up.
  const ends = town => town.water.flatMap(line => line.length > 1 ? [line[0], line[line.length - 1]] : []);
  const addWater = (a, b, ids, kind) => {
    if (Math.hypot(a.x - b.x, a.y - b.y) >= width * 0.2) water.push({ pts: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }], towns: ids, kind });
  };
  for (const town of towns) {
    for (const end of ends(town)) {
      let best = null;
      for (const river of rivers) {
        const hit = nearestOnSegment(end.x, end.y, river.x1, river.y1, river.x2, river.y2);
        if (!best || hit.d < best.d) best = hit;
      }
      if (best && best.d <= town.radius * 0.7) addWater(end, best, [town.id], 'river');
    }
  }
  for (const pair of joined) {
    const a = towns[pair.i], b = towns[pair.j];
    let best = null;
    for (const p of ends(a)) for (const q of ends(b)) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d <= (a.radius + b.radius) * 1.2 && (!best || d < best.d)) best = { p, q, d };
    }
    if (best) addWater(best.p, best.q, [a.id, b.id], 'town');
  }
  // Extend major street and stream ends to the nearest compatible network, including beyond the old neighbour cutoff.
  const streetLines = towns.flatMap(town => (town.mainStreets || []).map(pts => ({ pts, town })));
  const streamLines = towns.flatMap(town => town.water.map(pts => ({ pts, town })));
  const mapWater = rivers.map(river => ({ pts: [{ x: river.x1, y: river.y1 }, { x: river.x2, y: river.y2 }] }));
  const connectEnds = (sources, targets, additions, add, road) => {
    for (const source of sources) {
      if (source.pts.length < 2) continue;
      const first = source.pts[0], last = source.pts[source.pts.length - 1];
      const closed = Math.hypot(first.x - last.x, first.y - last.y) < width * 0.2;
      for (const end of closed ? [first] : [first, last]) {
        const inner = end === first ? source.pts[1] : source.pts[source.pts.length - 2], candidates = [];
        for (const target of targets.concat(additions)) {
          if (target === source) continue;
          const hit = nearestOnPolyline(end.x, end.y, target.pts);
          if (hit) {
            const forward = closed || (hit.x - end.x) * (end.x - inner.x) + (hit.y - end.y) * (end.y - inner.y) >= 0;
            candidates.push({ hit, target, forward });
          }
        }
        if (candidates.some(c => c.hit.d < width * 0.2)) continue;
        candidates.sort((a, b) => Number(b.forward) - Number(a.forward) || a.hit.d - b.hit.d);
        for (const { hit, target } of candidates) {
          if (hit.d < width * 0.2) break;
          const ids = [...new Set([source.town.id, ...(target.town ? [target.town.id] : target.towns || [])])];
          if (road && !allow(end, hit)) continue;
          add(end, hit, ids, 'trunk');
          break;
        }
      }
    }
  };
  const mapStreets = [...mapRoads, ...towns.flatMap(town => town.roads)].map(pts => ({ pts }));
  const localStreets = towns.flatMap(town => (town.streets || []).map(pts => ({ pts, town })));
  connectEnds(streetLines, streetLines.concat(mapStreets, localStreets), roads, addRoad, true);
  connectEnds(streamLines, streamLines.concat(mapWater), water, addWater, false);
  // 4. A bridge wherever one of the new roads crosses a river or a townscape creek.
  const crossings = rivers.slice();
  for (const line of streamLines.concat(water)) for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1], b = line.pts[i];
    crossings.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, clear: width * 0.3 });
  }
  for (const road of roads) {
    const [a, b] = road.pts, length = Math.hypot(b.x - a.x, b.y - a.y) || 1, direction = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    for (const river of crossings) {
      const hit = segmentIntersection(a.x, a.y, b.x, b.y, river.x1, river.y1, river.x2, river.y2);
      if (!hit || bridges.some(bridge => Math.hypot(bridge.x - hit.x, bridge.y - hit.y) < width * 2)) continue;
      bridges.push(bridgeAt(hit, direction, river.clear || 0, width));
    }
  }
  return { roads, water, bridges, linksByTown, disconnectedTiles };
}
