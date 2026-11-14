export function captureMapDetails(map, info, width, height, compose) {
  for (const method of ['getLocationFromIndex', 'getTerrainType', 'getFeatureType', 'isCliffCrossing', 'getAdjacentPlotLocation', 'getIndexFromXY']) {
    if (typeof map[method] !== 'function') throw new Error(`Map detail capture requires GameplayMap.${method}.`);
  }
  const cliffs = new Map(), hills = [], labels = [];
  for (let index = 0; index < width * height; index++) {
    const location = map.getLocationFromIndex(index), { x, y } = location;
    const terrain = info.Terrains.lookup(map.getTerrainType(x, y));
    const feature = info.Features.lookup(map.getFeatureType(x, y));
    if (/HILL/.test(terrain && terrain.TerrainType || '')) hills.push(index);
    if (feature && feature.FeatureType && !/NO_FEATURE|FEATURE_NONE/.test(feature.FeatureType)) labels.push([index, compose(feature.Name || feature.FeatureType)]);
    for (let direction = 0; direction < 6; direction++) {
      if (!map.isCliffCrossing(x, y, direction)) continue;
      const neighbor = map.getAdjacentPlotLocation(location, direction);
      if (!neighbor || neighbor.y < 0 || neighbor.y >= height) continue;
      const other = map.getIndexFromXY(neighbor.x, neighbor.y);
      if (other < 0 || other === index) continue;
      const a = Math.min(index, other), b = Math.max(index, other);
      cliffs.set(`${a},${b}`, [a, b]);
    }
  }
  return { cliffs: [...cliffs.values()], hills, labels };
}

export const FOG_FRONTIER_BANDS = [[0.28, 0.045], [0.235, 0.055], [0.19, 0.065], [0.145, 0.08], [0.10, 0.10], [0.055, 0.14]];
export function mapDetailPaths(details, positions, neighbors, vertex, visibility, actualVisibility, natural, footprint, viewport = null) {
  const paths = { cliffs: '', cliffFaces: '', hills: '', unseen: '', sight: '' };
  const counts = { cliffs: 0, cliffFaces: 0, hills: 0, unseen: 0, sight: 0 };
  let limited = false;
  const add = (kind, path, commands) => {
    if ((kind === 'unseen' || kind === 'sight') &&
        ((counts.unseen + counts.sight + commands) * FOG_FRONTIER_BANDS.length > 8192 ||
         (paths.unseen.length + paths.sight.length + path.length) * FOG_FRONTIER_BANDS.length > 262144)) { limited = true; return; }
    if (counts[kind] + commands > 8192 || paths[kind].length + path.length > 262144) { limited = true; return; }
    counts[kind] += commands; paths[kind] += path;
  };
  const point = value => value.toFixed(2);
  const polygon = points => points.map(([x, y], k) => `${k ? 'L' : 'M'}${point(x)},${point(y)}`).join('') + 'Z';
  const edgeVertices = [[1, 2], [4, 5], [0, 1], [5, 0], [2, 3], [3, 4]];
  const edge = (index, direction) => edgeVertices[direction].map(corner => vertex(index, corner));
  const inView = points => !viewport || !(
    Math.max(...points.map(p => p[0])) < viewport.x0 || Math.min(...points.map(p => p[0])) > viewport.x1 ||
    Math.max(...points.map(p => p[1])) < viewport.y0 || Math.min(...points.map(p => p[1])) > viewport.y1);
  const visible = index => positions[index] && (!visibility || visibility[index] > 0);
  if (natural && details) {
    const stride = Math.max(1, Math.ceil(details.cliffs.length / 630));
    for (let k = 0; k < details.cliffs.length; k += stride) {
      const [a, b] = details.cliffs[k];
      if (!visible(a) || !visible(b)) continue;
      const direction = (neighbors[a] || []).indexOf(b);
      if (direction < 0) continue;
      const [p, q] = edge(a, direction), top = vertex(a, 0), bottom = vertex(a, 3);
      if (!inView([p, q])) continue;
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const inward = -dy * ((top[0] + bottom[0] - p[0] - q[0]) / 2) + dx * ((top[1] + bottom[1] - p[1] - q[1]) / 2) >= 0 ? 1 : -1;
      const spot = (t, depth) => [p[0] + dx * t - dy * depth * inward, p[1] + dy * t + dx * depth * inward];
      const fringe = [spot(0, -0.015), spot(1, -0.015)];
      for (let tooth = 4; tooth >= 0; tooth--) {
        const depth = 0.09 + ((a + b + tooth) % 3) * 0.02;
        fringe.push(spot((tooth + 0.5) / 5, depth), spot(tooth / 5, 0.022));
        if (tooth % 2) add('cliffFaces', polygon([spot((tooth + 1) / 5, -0.005), spot((tooth + 0.5) / 5, depth * 0.65), spot(tooth / 5, 0.015)]), 4);
      }
      add('cliffs', polygon(fringe), 13);
    }
    const hillStride = Math.max(1, Math.ceil(details.hills.length / 455));
    for (let k = 0; k < details.hills.length; k += hillStride) {
      const index = details.hills[k];
      if (!visible(index)) continue;
      const top = vertex(index, 0), bottom = vertex(index, 3), left = vertex(index, 5), right = vertex(index, 1);
      if (!inView([top, bottom, left, right])) continue;
      const cx = top[0], cy = (top[1] + bottom[1]) / 2, radius = (right[0] - left[0]) * 0.055;
      for (let row = -1; row <= 1; row++) for (let column = -1; column <= 1; column++) {
        const x = cx + (column * 2.8 + (row === 0 ? 0.4 : 0)) * radius;
        const y = cy + (row * 1.8 + (column === 0 ? -0.25 : 0.2)) * radius;
        add('hills', `M${point(x - radius)},${point(y)}Q${point(x)},${point(y - radius)} ${point(x + radius)},${point(y)}`, 2);
      }
    }
    limited = limited || stride > 1 || hillStride > 1;
  }
  if (footprint && actualVisibility) {
    for (let index = 0; index < positions.length; index++) {
      if (!positions[index]) continue;
      for (let direction = 0; direction < 6; direction++) {
        const other = (neighbors[index] || [])[direction];
        if (other === undefined || other < 0 || other < index || !positions[other]) continue;
        const a = actualVisibility[index] || 0, b = actualVisibility[other] || 0;
        const kind = (a === 0) !== (b === 0) ? 'unseen' : (a === 2) !== (b === 2) ? 'sight' : null;
        if (!kind) continue;
        const [p, q] = edge(index, direction);
        if (!inView([p, q])) continue;
        add(kind, `M${point(p[0])},${point(p[1])}L${point(q[0])},${point(q[1])}`, 2);
      }
    }
  }
  return { ...paths, limited };
}
