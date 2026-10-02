import { N, BMAP, DEP, DEP_INFO, BIO } from './data';
import type { Game } from './sim';
import { clamp } from './rng';

export const LEGENDS: Record<string, { label: string; color: string }[]> = {
  territory: [{ label: 'Your lands', color: '#e8c060' }, { label: 'Other tribes', color: '#c05050' }],
  fertility: [{ label: 'Barren', color: '#a07040' }, { label: 'Moderate', color: '#b8c040' }, { label: 'Fertile', color: '#30c030' }],
  water: [{ label: 'Far from fresh water', color: '#a08060' }, { label: 'Near river/lake', color: '#30a0ff' }],
  resources: DEP_INFO.slice(1).map((d) => ({ label: d.name, color: d.color })).concat([{ label: 'Forest', color: '#2a6a2a' }]),
  food: [{ label: 'Poor', color: '#806040' }, { label: 'Good (farm / forage / hunt / fish)', color: '#e0d040' }, { label: 'Rich', color: '#40e040' }],
  density: [{ label: 'Few people', color: '#ffe080' }, { label: 'Crowded', color: '#ff5020' }],
  housing: [{ label: 'Vacancies', color: '#40d060' }, { label: 'Full', color: '#e04040' }],
  happiness: [{ label: 'Unhappy', color: '#e03030' }, { label: 'Content', color: '#e0e040' }, { label: 'Joyful', color: '#30d050' }],
  trade: [{ label: 'Market reach', color: '#c050c0' }, { label: 'Roads', color: '#e8c050' }],
  danger: [{ label: 'Safe', color: '#304030' }, { label: 'Threatened', color: '#ff3030' }],
  pollution: [{ label: 'Clean', color: '#404040' }, { label: 'Polluted', color: '#a06020' }],
};

function ramp(v: number, stops: [number, number, number][]): [number, number, number] {
  v = clamp(v, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(v)), f = v - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const hex = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

function freshDist(g: Game): Float32Array {
  const a = g as any;
  if (a._fd && a._fdSeed === g.seed) return a._fd;
  const d = new Float32Array(N * N).fill(99);
  const q: number[] = [];
  for (let t = 0; t < N * N; t++) if (g.world.biome[t] === BIO.LAKE || g.world.biome[t] === BIO.RIVER) { d[t] = 0; q.push(t); }
  for (let h = 0; h < q.length; h++) {
    const t = q[h], x = t % N, z = Math.floor(t / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const n = nz * N + nx;
      if (d[n] > d[t] + 1) { d[n] = d[t] + 1; q.push(n); }
    }
  }
  a._fd = d; a._fdSeed = g.seed;
  return d;
}

export function computeOverlay(g: Game, kind: string, out: Uint8ClampedArray) {
  out.fill(0);
  const W = g.world;
  const put = (t: number, c: [number, number, number], a: number) => { out[t * 4] = c[0]; out[t * 4 + 1] = c[1]; out[t * 4 + 2] = c[2]; out[t * 4 + 3] = a; };
  const ownerCol = (o: number): [number, number, number] => (o === 0 ? hex(g.playerColor) : hex(g.tribes[o - 1]?.color || 0x888888));
  // territory base
  const strong = kind === 'territory';
  for (let t = 0; t < N * N; t++) {
    const o = g.owner[t];
    if (o === 255) continue;
    const x = t % N, z = Math.floor(t / N);
    let border = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      if (g.owner[nz * N + nx] !== o) { border = true; break; }
    }
    if (W.tileWater[t] === 1 && !border) continue;
    const c = ownerCol(o);
    const known = o === 0 || g.tribes[o - 1]?.met;
    put(t, known ? c : [160, 160, 160], border ? (strong ? 230 : 150) : strong ? 70 : o === 0 ? 14 : 8);
  }
  if (kind === 'none' || kind === 'territory') return;

  const dim = (t: number, c: [number, number, number], a: number) => { if (W.tileWater[t] === 1) return; put(t, c, a); };
  if (kind === 'fertility') {
    for (let t = 0; t < N * N; t++) dim(t, ramp(W.fert[t], [[150, 100, 60], [190, 190, 60], [40, 190, 40]]), 140);
  } else if (kind === 'water') {
    const d = freshDist(g);
    for (let t = 0; t < N * N; t++) { if (W.tileWater[t]) continue; const v = 1 - clamp(d[t] / 14, 0, 1); put(t, ramp(v, [[160, 130, 90], [90, 160, 190], [30, 120, 255]]), 140); }
  } else if (kind === 'resources') {
    for (let t = 0; t < N * N; t++) {
      if (W.tileWater[t]) continue;
      if (W.dep[t]) { put(t, hex(parseInt(DEP_INFO[W.dep[t]].color.slice(1), 16)), 235); }
      else if (W.treeCount[t] > 1) put(t, [30, 100, 30], 90);
    }
  } else if (kind === 'food') {
    const dens = new Float32Array(N * N);
    for (const a of g.animals) if (a.alive && a.type !== 3) g.scan(a.x, a.z, 4, (t, x, z) => { dens[t] += 0.18 * (1 - Math.hypot(x + 0.5 - a.x, z + 0.5 - a.z) / 5); });
    for (let t = 0; t < N * N; t++) {
      if (W.tileWater[t]) continue;
      let s = 0;
      const b = W.biome[t];
      if (b === BIO.PLAINS || b === BIO.VALLEY || b === BIO.FOREST) s += W.fert[t] * 0.8;
      if (W.dep[t] === DEP.BERRIES) s += 0.6;
      s += Math.min(0.5, dens[t]);
      if (W.wdT[t] < 2.2 && W.odT[t] < 6) s += 0.3;
      put(t, ramp(s / 1.2, [[130, 90, 60], [225, 210, 60], [60, 230, 60]]), 140);
    }
  } else if (kind === 'density') {
    const d = new Float32Array(N * N);
    for (const c of g.citizens) if (c.alive) g.scan(c.x, c.z, 3, (t, x, z) => { d[t] += 1 - Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) / 3.2; });
    for (let t = 0; t < N * N; t++) if (d[t] > 0.05) put(t, ramp(d[t] / 4, [[255, 230, 120], [255, 140, 40], [255, 40, 20]]), 70 + Math.min(150, d[t] * 40));
  } else if (kind === 'housing') {
    const occ = new Map<number, number>();
    for (const c of g.citizens) if (c.alive && c.homeId >= 0) occ.set(c.homeId, (occ.get(c.homeId) || 0) + 1);
    for (const b of g.buildings) {
      if (b.owner !== 0) continue;
      const cap = BMAP[b.type].housing;
      if (!cap) continue;
      const r = (occ.get(b.id) || 0) / cap;
      const col: [number, number, number] = r >= 1 ? [230, 60, 60] : ramp(r, [[60, 210, 90], [230, 210, 60]]);
      g.scan(b.cx, b.cz, 2.5, (t, x, z) => { if (Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz) < 2.3 && !W.tileWater[t]) put(t, col, 200); });
    }
  } else if (kind === 'happiness') {
    const s = new Float32Array(N * N), w = new Float32Array(N * N);
    for (const c of g.citizens) if (c.alive) {
      const h = g.bById.get(c.homeId);
      const x0 = h ? h.cx : c.x, z0 = h ? h.cz : c.z;
      g.scan(x0, z0, 4, (t, x, z) => { const k = 1 - Math.hypot(x + 0.5 - x0, z + 0.5 - z0) / 4.5; if (k > 0) { s[t] += c.happy * k; w[t] += k; } });
    }
    for (let t = 0; t < N * N; t++) if (w[t] > 0.05) put(t, ramp(s[t] / w[t] / 100, [[230, 40, 40], [230, 220, 50], [40, 210, 80]]), 150);
  } else if (kind === 'trade') {
    for (const b of g.buildings) if (b.owner === 0 && BMAP[b.type].slots && b.state === 'ready') g.scan(b.cx, b.cz, 13, (t, x, z) => { const d = Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz); if (d < 13 && !W.tileWater[t]) put(t, [190, 80, 190], 40 + (1 - d / 13) * 110); });
    for (let t = 0; t < N * N; t++) if (g.road[t]) put(t, [240, 200, 80], 230);
  } else if (kind === 'danger') {
    const wolves = g.animals.filter((a) => a.alive && a.type === 3);
    const hostile = g.tribes.filter((t) => t.status === 'hostile' || t.status === 'war' || t.aggression > 0.7);
    const guards = g.buildings.filter((b) => b.owner === 0 && b.state === 'ready' && (b.type === 'lookout' || b.type === 'stone_tower' || BMAP[b.type].work?.k === 'warrior'));
    for (let t = 0; t < N * N; t++) {
      if (W.tileWater[t] === 1) continue;
      const x = (t % N) + 0.5, z = Math.floor(t / N) + 0.5;
      let d = 0;
      for (const h of hostile) d += Math.max(0, 1 - Math.hypot(h.x - x, h.z - z) / 55) * (0.3 + h.aggression);
      for (const w of wolves) d += Math.max(0, 1 - Math.hypot(w.x - x, w.z - z) / 9) * 0.6;
      let def = 0;
      for (const b of guards) { const dd = Math.hypot(b.cx - x, b.cz - z); if (dd < 20) def += (1 - dd / 20) * (b.type === 'stone_tower' ? 2 : 1); }
      const v = d / (1 + def * 1.5);
      if (v > 0.03) put(t, ramp(v, [[240, 200, 60], [255, 60, 30]]), 40 + Math.min(170, v * 250));
    }
  } else if (kind === 'pollution') {
    for (let t = 0; t < N * N; t++) if (g.poll[t] > 0.1) put(t, ramp(g.poll[t] / 8, [[140, 130, 110], [160, 90, 20], [90, 30, 10]]), 80 + Math.min(150, g.poll[t] * 30));
  }
}
