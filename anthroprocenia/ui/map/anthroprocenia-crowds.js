import { routeTree, routeFromTree } from './anthroprocenia-townscape.js';

export const CLUMP_SPLIT_SCREENS = 24, CLUMP_CELL_PX = 32;
const MAX_CLUMP_MEMBERS = 32, MAX_FORMATION_MEMBERS = 64, MAX_ROUTE_TREES = 32;
const dotPaths = new Map();
const layouts = new Map();
const DOT_CORNERS = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);

export function occupationIconPaths(walkers, scale = 1) {
  const groups = new Map();
  for (const walker of walkers) {
    if (walker.fade < 0.35) continue;
    const name = walker.role || walker.occupation || 'Resident';
    if (!groups.has(name)) groups.set(name, { name, members: [] });
    groups.get(name).members.push(walker);
  }
  const ordered = [...groups.values()].sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
  const chosen = [];
  let remaining = 512;
  for (let i = ordered.length - 1; i >= 0 && remaining && chosen.length < 128; i--) {
    const group = ordered[i], count = Math.min(remaining, group.members.length);
    chosen.push({ ...group, count }); remaining -= count;
  }
  return chosen.reverse().map(group => {
    const name = group.name.toLowerCase();
    let fill = '#ccb58b', points = [[-5, 1], [-3, 0], [-2, -3], [2, -3], [3, 0], [5, 1]];
    if (/king|queen|chief|prince|princess|emperor|empress|noble|sultan|pharaoh|monarch/.test(name)) {
      fill = '#ffd76a'; points = [[-4, 2], [-5, -4], [-2, -1], [0, -5], [2, -1], [5, -4], [4, 2]];
    } else if (/priest|bishop|monk|imam|rabbi|clergy|shaman|pandit|abbot/.test(name)) {
      fill = '#e6d9ff'; points = [[-3, 2], [-3, -2], [0, -6], [3, -2], [3, 2]];
    } else if (/medic|healer|doctor|nurse|physician/.test(name)) {
      fill = '#ef8b8b'; points = [[-1, -5], [1, -5], [1, -2], [4, -2], [4, 0], [1, 0], [1, 3], [-1, 3], [-1, 0], [-4, 0], [-4, -2], [-1, -2]];
    } else if (/soldier|warrior|guard|officer|general|captain|archer|cavalry|commander/.test(name)) {
      fill = '#b7c8df'; points = [[-4, 2], [-4, -2], [-2, -4], [-1, -4], [-1, -6], [1, -6], [1, -4], [3, -3], [4, 2]];
    } else if (/scholar|teacher|scribe|senator|scientist|judge|governor/.test(name)) {
      fill = '#99c9ef'; points = [[-5, -2], [0, -5], [5, -2], [2, 0], [2, 2], [-2, 2], [-2, 0]];
    } else if (/merchant|banker|trader|diplomat/.test(name)) {
      fill = '#a4d5b6'; points = [[-5, 2], [-3, 1], [-3, -5], [3, -5], [3, 1], [5, 2]];
    } else if (/sailor|fisher|mariner|navigator/.test(name)) {
      fill = '#e5f1ff'; points = [[-4, 1], [-5, -3], [5, -3], [4, 1]];
    } else if (/miner|smith|engineer|builder|mason|carpenter/.test(name)) {
      fill = '#dba35d'; points = [[-5, 2], [-4, -1], [-2, -4], [2, -4], [4, -1], [5, 2]];
    }
    const d = [], members = [];
    for (let i = 0; i < group.count; i++) {
      const person = group.members[Math.floor(i * group.members.length / group.count)];
      members.push(person);
      const y = person.y - (person.radius || 2) - 6 * scale;
      d.push(points.map(([dx, dy], j) => `${j ? 'L' : 'M'}${(person.x + dx * scale).toFixed(1)},${(y + dy * scale).toFixed(1)}`).join('') + 'Z');
    }
    return { occupation: group.name, count: group.count, fill, d: d.join(''), members };
  });
}

export function crowdFormation(person, group, graph) {
  const sub = group.unitSub || '', state = group.unitState || '';
  const moving = !!(person.route && person.leg < person.route.length - 1 && person.wait <= 0 && !(person.strollPause > 0));
  if (group.military) {
    if (group.battleReady !== true) return 'loose';
    if (sub === 'infantry' && ['alert', 'sleeping', 'fortified'].includes(state)) return 'shield';
    if (['idle', 'holding', 'healing', 'sleeping'].includes(state)) return 'loose';
    if (sub === 'cavalry') return 'wedge';
    if (sub === 'ranged' || sub === 'siege') return 'line';
    return 'ranks';
  }
  if (!moving || (person.activity && person.activity.meandering)) return 'loose';
  const from = person.route[person.leg], to = person.route[person.leg + 1];
  return graph.roadNodes && graph.roadNodes.has(from) && graph.roadNodes.has(to) ? 'caravan' : 'path';
}

export function formationLayout(count, kind = 'loose') {
  const key = `${count}|${kind}`;
  if (layouts.has(key)) {
    const points = layouts.get(key);
    layouts.delete(key); layouts.set(key, points);
    return points;
  }
  const points = [], columns = kind === 'caravan' ? 2 : kind === 'line' ? Math.ceil(Math.sqrt(count * 5)) : Math.ceil(Math.sqrt(count * (kind === 'shield' ? 2 : 1)));
  for (let i = 0; i < count; i++) {
    let x, y;
    if (kind === 'wedge') {
      const row = Math.floor(Math.sqrt(i)), slot = i - row * row;
      x = slot - row; y = row;
    } else if (kind === 'loose') {
      const angle = i * 2.399963229728653, reach = 1.15 * Math.sqrt(i);
      x = Math.cos(angle) * reach; y = Math.sin(angle) * reach;
    } else if (kind === 'path') {
      x = Math.sin(i * 2.399963229728653) * 1.1; y = i * 0.9 + Math.cos(i * 1.618) * 0.2;
    } else {
      const row = Math.floor(i / columns), slot = i % columns, rowSize = Math.min(columns, count - row * columns);
      x = slot - (rowSize - 1) / 2; y = row * (kind === 'caravan' ? 1.4 : 1);
      if (kind === 'line') { x *= 1.35; y *= 1.8; }
      if (kind === 'shield') { x *= 0.76; y *= 0.8; }
    }
    points.push({ x, y });
  }
  const mx = points.reduce((sum, p) => sum + p.x, 0) / Math.max(1, count), my = points.reduce((sum, p) => sum + p.y, 0) / Math.max(1, count);
  for (const point of points) { point.x -= mx; point.y -= my; }
  if (layouts.size >= 128) layouts.delete(layouts.keys().next().value);
  layouts.set(key, points);
  return points;
}

// One reusable path per count/scale, rather than a DOM element for each crowd member.
export function crowdDotPath(count, radius, military = false, kind = military ? 'ranks' : 'loose') {
  const key = `${count}|${radius}|${kind}`;
  if (dotPaths.has(key)) {
    const shape = dotPaths.get(key);
    dotPaths.delete(key); dotPaths.set(key, shape);
    return shape;
  }
  const points = formationLayout(count, kind).map(p => ({ x: p.x * radius * 2.8, y: p.y * radius * 2.8 }));
  const fmt = n => Number(n.toFixed(3));
  const d = points.map(p => Array.from({ length: 8 }, (_, k) => {
    const angle = k * Math.PI / 4;
    return `${k ? 'L' : 'M'}${fmt(p.x + Math.cos(angle) * radius)},${fmt(p.y + Math.sin(angle) * radius)}`;
  }).join('') + 'Z').join('');
  const result = { d, radius: Math.max(0, ...points.map(p => Math.hypot(p.x, p.y) + radius)) };
  if (dotPaths.size >= 128) dotPaths.delete(dotPaths.keys().next().value);
  dotPaths.set(key, result);
  return result;
}

export function individualDotPaths(dots) {
  const groups = Array.from({ length: 32 }, () => []);
  const fmt = n => Math.round(n * 1000) / 1000;
  for (const dot of dots) {
    const bucket = Math.max(0, Math.min(15, Math.round(dot.fade * 15)));
    if (!bucket) continue;
    const cos = Math.cos(dot.angle || 0), sin = Math.sin(dot.angle || 0);
    let d = '';
    for (let k = 0; k < DOT_CORNERS.length; k++) {
      const [x, y] = DOT_CORNERS[k];
      d += `${k ? 'L' : 'M'}${fmt(dot.x + (x * cos - y * sin) * dot.radius)},${fmt(dot.y + (x * sin + y * cos) * dot.radius)}`;
    }
    groups[bucket + (dot.military ? 16 : 0)].push(d + 'Z');
  }
  return groups.map((paths, i) => ({
    d: paths.join(''), opacity: (i % 16) / 15,
    fill: i >= 16 ? '#ffd76a' : 'rgb(255,246,214)',
  })).filter(batch => batch.d);
}

export function crowdDotStride(tileScreens) {
  return tileScreens >= 12 ? 1 : tileScreens >= 6 ? 2 : tileScreens >= 3 ? 4 : 8;
}

export function crowdScreenDots(markers, radius, aspect, padding, stride = 1) {
  const dots = [];
  for (const marker of markers) {
    const military = !!marker.clump.military;
    const kind = marker.kind || (military ? 'ranks' : 'loose');
    marker.radius = crowdDotPath(marker.members.length, radius, military, kind).radius + padding;
    const heading = marker.heading || { x: 0, y: -1 };
    const angle = Math.atan2(heading.y * aspect, heading.x) + Math.PI / 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const layout = formationLayout(marker.members.length, kind);
    for (let i = 0; i < layout.length; i += stride) {
      const point = layout[i];
      const x = point.x * radius * 2.8, y = point.y * radius * 2.8;
      dots.push({ x: marker.x + x * cos - y * sin, y: marker.y + x * sin + y * cos,
        radius, military, fade: 1, angle });
    }
  }
  return dots;
}

export class WalkerClumps {
  constructor() {
    this.clumps = new Set(); this.trees = new Map(); this.graph = null;
    this.coarse = false; this.time = 0; this.serial = 0; this.routeBuilds = 0;
  }
  remove(clump) {
    for (const person of clump.members) if (person.clump === clump) {
      person.clump = null; person.speed = person.baseSpeed || person.speed;
    }
    this.clumps.delete(clump);
  }
  clear() {
    for (const clump of this.clumps) this.remove(clump);
    this.trees.clear(); this.graph = null;
  }
  tree(goal) {
    let tree = this.trees.get(goal);
    if (tree) this.trees.delete(goal);
    else { tree = routeTree(this.graph, goal); this.routeBuilds++; }
    this.trees.set(goal, tree);
    if (this.trees.size > MAX_ROUTE_TREES) this.trees.delete(this.trees.keys().next().value);
    return tree;
  }
  route(person, target) {
    if (!person.clump && !person.runnerDuty) return undefined;
    return routeFromTree(this.tree(target), person.node);
  }
  destination(person) {
    const clump = person.clump;
    if (!clump || person.cmd || person.pinned || person.runnerDuty) return undefined;
    if (this.tree(clump.goal).best[person.node] === Infinity) {
      clump.members = clump.members.filter(member => member !== person);
      person.clump = null; person.clumpAfter = this.time + 8; person.speed = person.baseSpeed || person.speed;
      return undefined;
    }
    person.speed = clump.speed;
    const state = clump.group.unitState, shield = clump.group.unitSub === 'infantry' && ['alert', 'sleeping', 'fortified'].includes(state);
    person.activity = {
      node: clump.goal, label: shield ? state === 'sleeping' ? 'Rest in shield wall' : 'Hold shield wall'
        : clump.military ? ['idle', 'holding', 'healing', 'sleeping'].includes(state) ? 'Rest near formation' : 'Drill with formation' : 'Walk with neighbours',
      place: clump.military ? 'formation assembly point' : 'neighbourhood meeting place', duration: 4, outside: true,
    };
    return clump.goal;
  }
  sync(groups, graph, { coarse, project, exclude = () => false, time = 0 }) {
    if (this.graph !== graph) { this.clear(); this.graph = graph; }
    this.coarse = coarse; this.time = time;
    const current = new Set(groups), eligible = (person, group) =>
      !person.cmd && !person.pinned && !person.inside && !person.exiting && person.fade >= 0.35 &&
      !exclude(person, group) && graph.nodes[person.node];
    for (const clump of this.clumps) {
      if (clump.military && clump.group.battleReady !== true) { this.remove(clump); continue; }
      const members = clump.members.filter(person => current.has(clump.group) &&
        clump.group.byId.get(person.id) === person && eligible(person, clump.group));
      const retained = new Set(members);
      for (const person of clump.members) if (!retained.has(person) && person.clump === clump) {
        person.clump = null; person.speed = person.baseSpeed || person.speed;
      }
      clump.members = members;
      clump.speed = Math.min(...members.map(person => person.baseSpeed || person.speed));
      members.forEach((person, slot) => { person.formationSlot = slot; });
      if ((!coarse && !clump.military && !clump.group.unitSub) || members.length < 2) { this.remove(clump); continue; }
      const arrived = members.every(person => person.node === clump.goal && (!person.route || person.leg >= person.route.length - 1));
      if (!clump.military && (arrived || time - clump.created > 30)) {
        for (const person of members) person.clumpAfter = time + 8;
        this.remove(clump);
      } else if (clump.military && arrived) {
        if (clump.readyAt === undefined) clump.readyAt = time + 6;
        if (time >= clump.readyAt && !['alert', 'sleeping', 'fortified', 'idle', 'holding', 'healing'].includes(clump.group.unitState)) {
          clump.round++;
          clump.goal = clump.group.streetNodes[(clump.seed + clump.round * 7) % clump.group.streetNodes.length];
          clump.readyAt = undefined;
        }
      } else clump.readyAt = undefined;
    }
    for (const group of groups) {
      if (group.military && group.battleReady !== true) continue;
      if ((!coarse && !group.military && !group.unitSub) || !group.streetNodes.length) continue;
      const buckets = new Map(), limit = group.military ? MAX_FORMATION_MEMBERS : MAX_CLUMP_MEMBERS;
      for (const person of group.people) {
        if (person.clump || !eligible(person, group) || person.clumpAfter > time) continue;
        const at = project(person), key = group.military ? 'formation' : `${Math.floor(at.x / CLUMP_CELL_PX)},${Math.floor(at.y / CLUMP_CELL_PX)}`;
        const bucket = buckets.get(key) || [];
        bucket.push(person); buckets.set(key, bucket);
      }
      for (const bucket of buckets.values()) for (let start = 0; start < bucket.length; start += limit) {
        const members = bucket.slice(start, start + limit);
        if (members.length < (group.military ? 2 : 3)) continue;
        const seed = this.serial++, first = members[0];
        const goal = !group.military && graph.nodes[first.target] && !graph.doorForms.has(first.target)
          ? first.target : group.streetNodes[seed % group.streetNodes.length];
        const clump = { id: seed, group, members, goal, seed, round: 0, military: !!group.military, created: time,
          speed: Math.min(...members.map(person => person.baseSpeed || person.speed)) };
        this.clumps.add(clump);
        members.forEach((person, slot) => { person.clump = clump; person.formationSlot = slot; });
      }
    }
  }
  markers(project, groups = null, exclude = () => false) {
    if (!this.coarse) return [];
    const markers = [];
    // Display aggregation is independent of route-sharing cooldowns, arrivals and indoor transitions.
    const sources = [];
    if (groups) for (const group of groups) {
      if (!group.crowdDisplay) group.crowdDisplay = { group, military: !!group.military };
      const byFormation = new Map();
      for (const person of group.people) {
        const clump = group.military && person.clump ? person.clump : group.crowdDisplay;
        const members = byFormation.get(clump) || [];
        members.push(person); byFormation.set(clump, members);
      }
      group.crowdDisplay.members = byFormation.get(group.crowdDisplay) || [];
      for (const [clump, members] of byFormation) sources.push({ clump, members });
    } else for (const clump of this.clumps) sources.push({ clump, members: clump.members });
    for (const { clump, members } of sources) {
      const buckets = new Map();
      for (const person of members) {
        if ((!groups && person.clump !== clump) || person.cmd || person.pinned || person.inside || person.fade < 0.04 || exclude(person, clump.group)) continue;
        const at = project(person);
        if (!at) continue;
        const kind = crowdFormation(person, clump.group, this.graph || {});
        const heading = formationHeading(person, this.graph || {});
        const direction = kind === 'caravan' || kind === 'path' ? Math.round(Math.atan2(heading.y, heading.x) * 4 / Math.PI) : 0;
        const key = `${kind}|${direction}|${Math.floor(at.x / CLUMP_CELL_PX)},${Math.floor(at.y / CLUMP_CELL_PX)}`;
        const bucket = buckets.get(key) || [];
        bucket.push({ person, at }); buckets.set(key, bucket);
      }
      const limit = clump.military ? MAX_FORMATION_MEMBERS : MAX_CLUMP_MEMBERS;
      for (const bucket of buckets.values()) for (let start = 0; start < bucket.length; start += limit) {
        const chunk = bucket.slice(start, start + limit);
        if (!chunk.length) continue;
        markers.push({
          clump, members: chunk.map(item => item.person),
          kind: crowdFormation(chunk[0].person, clump.group, this.graph || {}),
          heading: formationHeading(chunk[0].person, this.graph || {}),
          x: chunk.reduce((sum, item) => sum + item.at.x, 0) / chunk.length,
          y: chunk.reduce((sum, item) => sum + item.at.y, 0) / chunk.length,
        });
      }
    }
    return markers;
  }
}

// Formation slots are display offsets from the shared street route, checked against the same obstacle/creek geometry.
export function formationPoint(person, graph, spacing) {
  const clump = person.clump;
  if (!clump || person.cmd || person.inside || person.pinned || person.runnerDuty) return person;
  const kind = crowdFormation(person, clump.group, graph), points = formationLayout(clump.members.length, kind);
  const offset = points[(person.formationSlot || 0) % points.length];
  if (!offset) return person;
  const side = offset.x * spacing, back = offset.y * spacing;
  const { x: dx, y: dy } = formationHeading(person, graph);
  const length = Math.hypot(dx, dy) || 1;
  const point = { x: person.x + (side * dy - back * dx) / length, y: person.y + (-side * dx - back * dy) / length };
  return graph.bendAllowed && graph.bendAllowed(person, point) ? point : person;
}

function formationHeading(person, graph) {
  const a = person.route && graph.nodes && graph.nodes[person.route[person.leg]];
  const b = person.route && graph.nodes && graph.nodes[person.route[person.leg + 1]];
  if (a && b && (a.x !== b.x || a.y !== b.y)) person.formationHeading = { x: b.x - a.x, y: b.y - a.y };
  return person.formationHeading || { x: 0, y: -1 };
}

export function nearestEncampment(tree, candidates) {
  let best = null, distance = Infinity;
  for (const candidate of candidates) {
    const cost = tree.best[candidate.node];
    if (cost < distance && candidate.node !== tree.goal) { best = candidate; distance = cost; }
  }
  return best;
}

export function runnerDestination(person, occupation, formation, camp) {
  const supply = occupation === 'Supply runner';
  if (!camp) {
    person.runnerDuty = { returning: true, formation, camp: -1 };
    person.activity = { node: formation, label: 'Await a reachable friendly encampment', place: 'formation', duration: 6, outside: true };
    return formation;
  }
  const returning = person.node === camp.node || (person.runnerDuty && person.runnerDuty.returning && person.node !== formation);
  const target = returning ? formation : camp.node;
  person.runnerDuty = { returning, formation, camp: camp.node };
  person.activity = {
    node: target, label: supply ? returning ? 'Deliver supplies to formation' : 'Collect supplies for formation'
      : returning ? 'Deliver orders to formation' : 'Carry dispatches to encampment',
    place: returning ? 'formation' : camp.name, duration: supply ? 4 : 2, outside: returning,
  };
  return target;
}
