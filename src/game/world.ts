import { N, V, BIO, DEP } from './data';
import { Noise, Rand, clamp, smooth } from './rng';

export interface TreeInst { x: number; z: number; s: number; type: number; tile: number; r: number }
export interface Site { kind: 'cave' | 'ruin' | 'monolith'; tile: number; x: number; z: number; found: boolean }
export interface AnimalSpawn { type: number; x: number; z: number }

export interface World {
  seed: number;
  h: Float32Array; surf: Float32Array; wet: Uint8Array; flow: Float32Array; riverW: Float32Array;
  vcolor: Float32Array;
  wdist: Float32Array; // vertex distance to any water
  biome: Uint8Array; fert: Float32Array; moist: Float32Array; temp: Float32Array;
  tileWater: Uint8Array; // 0 dry, 1 deep (impassable), 2 river ford
  wdT: Float32Array; // tile distance to water
  odT: Float32Array; // tile distance to ocean
  dep: Uint8Array; depAmt: Float32Array; depMax: Float32Array;
  treeStart: Int32Array; treeCount: Uint8Array; treeAlive: Uint8Array; trees: TreeInst[];
  sites: Site[]; animals: AnimalSpawn[];
  hotspots: { x: number; z: number; type: number }[];
}

export function classify(h: number, moist: number, temp: number, fd: number, od: number): number {
  if (h > 6.8) return BIO.MOUNTAIN;
  if (od <= 2.2 && h < 1.2) return BIO.BEACH;
  if (temp > 0.6 && moist < 0.42) return BIO.DESERT;
  if (moist > 0.68 && h < 2.2 && fd < 14) return BIO.SWAMP;
  if (fd < 4 && h < 3.6) return BIO.VALLEY;
  if (moist > 0.55) return BIO.FOREST;
  return BIO.PLAINS;
}

function chamfer(mask: Uint8Array): Float32Array {
  const d = new Float32Array(V * V).fill(999);
  for (let i = 0; i < V * V; i++) if (mask[i]) d[i] = 0;
  for (let z = 0; z < V; z++)
    for (let x = 0; x < V; x++) {
      const i = z * V + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (z > 0) {
        v = Math.min(v, d[i - V] + 1);
        if (x > 0) v = Math.min(v, d[i - V - 1] + 1.414);
        if (x < V - 1) v = Math.min(v, d[i - V + 1] + 1.414);
      }
      d[i] = v;
    }
  for (let z = V - 1; z >= 0; z--)
    for (let x = V - 1; x >= 0; x--) {
      const i = z * V + x;
      let v = d[i];
      if (x < V - 1) v = Math.min(v, d[i + 1] + 1);
      if (z < V - 1) {
        v = Math.min(v, d[i + V] + 1);
        if (x < V - 1) v = Math.min(v, d[i + V + 1] + 1.414);
        if (x > 0) v = Math.min(v, d[i + V - 1] + 1.414);
      }
      d[i] = v;
    }
  return d;
}

export function generateWorld(seed: number): World {
  const nA = new Noise(seed), nB = new Noise(seed + 101), nC = new Noise(seed + 202), nD = new Noise(seed + 303), nE = new Noise(seed + 404);
  const rand = new Rand(seed * 7 + 3);
  const raw = new Float32Array(V * V);
  for (let vz = 0; vz < V; vz++)
    for (let vx = 0; vx < V; vx++) {
      const u = vx / N, v = vz / N;
      const dx = Math.abs(u - 0.5) * 2, dz = Math.abs(v - 0.5) * 2;
      const dd = Math.pow(Math.pow(dx, 3) + Math.pow(dz, 3), 1 / 3) + (nA.fbm(u * 3 + 50, v * 3 + 50, 3) - 0.5) * 0.45;
      const mask = 1 - smooth(0.5, 1.0, dd);
      const e = nA.fbm(u * 3.2 + 5, v * 3.2 + 5, 5);
      const ridge = nB.ridged(u * 2.6, v * 2.6, 4);
      const mm = smooth(0.4, 0.8, clamp((nC.fbm(u * 2 + 9, v * 2 + 9, 3) - 0.5) * 3 + 0.5, 0, 1));
      raw[vz * V + vx] = e * 0.5 + mask * 0.7 + mm * (0.2 + ridge * ridge * 1.3) * Math.min(1, mask * 1.6);
    }
  const sorted = raw.slice().sort();
  const sea = sorted[Math.floor(sorted.length * 0.37)];
  let maxHH = 0;
  for (let i = 0; i < raw.length; i++) maxHH = Math.max(maxHH, raw[i] - sea);
  const h = new Float32Array(V * V);
  for (let i = 0; i < raw.length; i++) {
    const hh = raw[i] - sea;
    h[i] = hh < 0 ? hh * 9 : Math.pow(hh / maxHH, 1.55) * 15;
  }
  // ensure mountains
  for (let t = 0; t < 6; t++) {
    let m = 0, l = 0;
    for (let i = 0; i < h.length; i++) { if (h[i] > 0) l++; if (h[i] > 6.8) m++; }
    if (m / Math.max(1, l) > 0.06) break;
    for (let i = 0; i < h.length; i++) if (h[i] > 2.2) h[i] *= 1.14;
  }

  const wet = new Uint8Array(V * V);
  const surf = new Float32Array(V * V);
  const flow = new Float32Array(V * V * 2);
  const riverW = new Float32Array(V * V);
  for (let i = 0; i < V * V; i++) if (h[i] < 0.02) { wet[i] = 1; surf[i] = 0; }
  const oceanMask = new Uint8Array(V * V);
  for (let i = 0; i < V * V; i++) oceanMask[i] = wet[i] === 1 ? 1 : 0;
  const od0 = chamfer(oceanMask);

  const addLake = (cx: number, cz: number, r: number, L: number) => {
    const R = Math.ceil(r) + 1;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 1 || z < 1 || x >= V - 1 || z >= V - 1) continue;
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        const i = z * V + x;
        if (wet[i] === 1) continue;
        const target = L - 1.3 * (1 - (d / r) * (d / r)) - 0.05;
        const inner = d < r * 0.88;
        if (inner) {
          h[i] = Math.min(h[i], target);
          wet[i] = 2; surf[i] = L;
        } else {
          const t = smooth(r * 0.88, r, d);
          h[i] = Math.min(h[i], L + 0.35 * t + 0.05 + (1 - t) * 0.0 - 0.0) ;
        }
      }
  };
  // lakes
  let lakes = 0;
  for (let tries = 0; tries < 400 && lakes < 5; tries++) {
    const cx = rand.int(10, N - 10), cz = rand.int(10, N - 10);
    const i = cz * V + cx;
    if (wet[i] || h[i] < 0.8 || h[i] > 3.6 || od0[i] < 12) continue;
    addLake(cx, cz, rand.range(4, 7.5), h[i] - 0.15);
    lakes++;
  }
  // rivers
  const cand: number[] = [];
  for (let z = 6; z < V - 6; z += 2)
    for (let x = 6; x < V - 6; x += 2) {
      const i = z * V + x;
      if (h[i] > 5.5 && h[i] < 12 && od0[i] > 14) cand.push(i);
    }
  for (let i = cand.length - 1; i > 0; i--) { const j = rand.int(0, i); const t = cand[i]; cand[i] = cand[j]; cand[j] = t; }
  const sources: number[] = [];
  for (const c of cand) {
    const cx = c % V, cz = Math.floor(c / V);
    if (sources.every((s) => Math.hypot((s % V) - cx, Math.floor(s / V) - cz) > 22)) sources.push(c);
    if (sources.length >= 9) break;
  }
  const riverMask = new Uint8Array(V * V);
  for (const src of sources) {
    const path: number[] = [];
    const visited = new Set<number>();
    let x = src % V, z = Math.floor(src / V);
    for (let step = 0; step < 600; step++) {
      const i = z * V + x;
      path.push(i);
      visited.add(i);
      if (wet[i] !== 0 && path.length > 3) break;
      let best = -1, bh = 1e9;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx, nz = z + dz;
          if (nx < 1 || nz < 1 || nx >= V - 1 || nz >= V - 1) continue;
          const ni = nz * V + nx;
          if (visited.has(ni)) continue;
          const hv = h[ni] + rand.f() * 0.08 + (dx && dz ? 0.03 : 0);
          if (hv < bh) { bh = hv; best = ni; }
        }
      if (best < 0) break;
      x = best % V; z = Math.floor(best / V);
    }
    if (path.length < 12) continue;
    let run = 1e9;
    const beds: number[] = [];
    for (const i of path) { run = Math.min(run, h[i]); beds.push(Math.max(run - 0.35, -0.05)); }
    for (let k = 0; k < path.length; k++) {
      const pi = path[k];
      if (wet[pi] === 1) continue;
      const cx = pi % V, cz = Math.floor(pi / V);
      const wide = k > path.length * 0.55;
      const R = wide ? 2 : 1;
      const nxt = path[Math.min(path.length - 1, k + 1)];
      let fx = (nxt % V) - cx, fz = Math.floor(nxt / V) - cz;
      const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      for (let dz = -(R + 2); dz <= R + 2; dz++)
        for (let dx = -(R + 2); dx <= R + 2; dx++) {
          const d = Math.hypot(dx, dz);
          if (d > R + 2) continue;
          const vx = cx + dx, vz = cz + dz;
          if (vx < 1 || vz < 1 || vx >= V - 1 || vz >= V - 1) continue;
          const j = vz * V + vx;
          if (wet[j] === 1 || wet[j] === 2) continue;
          const target = beds[k] + 0.22 * d;
          h[j] = Math.min(h[j], target);
          if (d <= R + 0.01) {
            wet[j] = 3; surf[j] = beds[k] + 0.45; flow[j * 2] = fx; flow[j * 2 + 1] = fz; riverMask[j] = 1;
            riverW[j] = wide ? 1 : 0.6;
          }
        }
    }
    const last = path[path.length - 1];
    if (wet[last] === 0) {
      const lx = last % V, lz = Math.floor(last / V);
      addLake(lx, lz, rand.range(4, 6), beds[beds.length - 1] + 0.45);
    }
  }
  // distances
  const anyWater = new Uint8Array(V * V), freshMask = new Uint8Array(V * V);
  for (let i = 0; i < V * V; i++) {
    anyWater[i] = wet[i] ? 1 : 0;
    freshMask[i] = wet[i] === 2 || wet[i] === 3 ? 1 : 0;
  }
  for (let i = 0; i < V * V; i++) oceanMask[i] = wet[i] === 1 ? 1 : 0;
  const wdist = chamfer(anyWater), fdist = chamfer(freshMask), odist = chamfer(oceanMask);

  // vertex fields
  const vmoist = new Float32Array(V * V), vtemp = new Float32Array(V * V);
  for (let vz = 0; vz < V; vz++)
    for (let vx = 0; vx < V; vx++) {
      const i = vz * V + vx;
      const u = vx / N, v = vz / N;
      const nm = clamp((nA.fbm(u * 4 + 70, v * 4 + 70, 4) - 0.5) * 1.9 + 0.5, 0, 1);
      vmoist[i] = clamp(0.8 * nm + 0.2 * Math.exp(-fdist[i] / 8) + 0.05 * Math.exp(-odist[i] / 6), 0, 1);
      const nt = clamp((nD.fbm(u * 2.5 + 20, v * 2.5 + 20, 3) - 0.5) * 1.8 + 0.5, 0, 1);
      vtemp[i] = clamp(0.25 + 0.5 * v + (nt - 0.5) * 0.5 - Math.max(0, h[i]) * 0.012, 0, 1);
    }

  // tile data
  const biome = new Uint8Array(N * N), fert = new Float32Array(N * N), moist = new Float32Array(N * N), temp = new Float32Array(N * N);
  const tileWater = new Uint8Array(N * N), wdT = new Float32Array(N * N), odT = new Float32Array(N * N);
  const tileH = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const t = j * N + i;
      const vs = [j * V + i, j * V + i + 1, (j + 1) * V + i, (j + 1) * V + i + 1];
      let ah = 0, am = 0, at = 0, wd = 0, fd = 0, od = 0, oc = 0, lk = 0, rv = 0;
      for (const q of vs) {
        ah += h[q]; am += vmoist[q]; at += vtemp[q]; wd += wdist[q]; fd += fdist[q]; od += odist[q];
        if (wet[q] === 1) oc++; else if (wet[q] === 2) lk++; else if (wet[q] === 3) rv++;
      }
      ah /= 4; am /= 4; at /= 4; wd /= 4; fd /= 4; od /= 4;
      tileH[t] = ah; moist[t] = am; temp[t] = at; wdT[t] = wd; odT[t] = od;
      let b: number;
      if (oc >= 2) { b = BIO.OCEAN; tileWater[t] = 1; }
      else if (lk >= 2) { b = BIO.LAKE; tileWater[t] = 1; }
      else if (rv >= 2) { b = BIO.RIVER; tileWater[t] = 2; }
      else b = classify(ah, am, at, fd, od);
      biome[t] = b;
      const base = [0, 0, 0, 0.15, 0.62, 0.4, 0.08, 0.32, 0.04, 0.95][b];
      fert[t] = clamp(base + (fd < 3 ? 0.12 : fd < 6 ? 0.05 : 0) + (nE.fbm(i * 0.1, j * 0.1, 2) - 0.5) * 0.15, 0, 1);
    }

  // colors
  const vcolor = new Float32Array(V * V * 3);
  const pal: Record<number, [number, number, number]> = {
    [BIO.BEACH]: [0.9, 0.84, 0.62], [BIO.PLAINS]: [0.55, 0.69, 0.3], [BIO.FOREST]: [0.28, 0.5, 0.22],
    [BIO.DESERT]: [0.86, 0.74, 0.46], [BIO.SWAMP]: [0.36, 0.43, 0.24], [BIO.MOUNTAIN]: [0.5, 0.48, 0.45], [BIO.VALLEY]: [0.38, 0.65, 0.23],
  };
  for (let vz = 0; vz < V; vz++)
    for (let vx = 0; vx < V; vx++) {
      const i = vz * V + vx;
      const hv = h[i];
      let b = classify(hv, vmoist[i], vtemp[i], fdist[i], odist[i]);
      let c = (pal[b] || pal[BIO.PLAINS]).slice() as [number, number, number];
      const nv = nE.fbm(vx * 0.35, vz * 0.35, 3) - 0.5;
      const rr = vx < V - 1 ? Math.abs(h[i + 1] - hv) : 0, rd = vz < V - 1 ? Math.abs(h[i + V] - hv) : 0;
      const slope = Math.max(rr, rd);
      if (b === BIO.MOUNTAIN || slope > 1.1) {
        const rock = [0.48 + nv * 0.15, 0.45 + nv * 0.12, 0.42 + nv * 0.1];
        const m = b === BIO.MOUNTAIN ? 1 : smooth(1.1, 2.2, slope);
        c = [c[0] + (rock[0] - c[0]) * m, c[1] + (rock[1] - c[1]) * m, c[2] + (rock[2] - c[2]) * m];
      }
      if (hv > 11) {
        const s = smooth(11, 13.5, hv + nv * 2);
        c = [c[0] + (0.95 - c[0]) * s, c[1] + (0.96 - c[1]) * s, c[2] + (0.98 - c[2]) * s];
      }
      if (hv < 0.15 && hv > -0.5 && wet[i] === 0) { /* shoreline */ }
      if (hv < 0.3) {
        const s = smooth(0.3, -0.2, hv);
        c = [c[0] + (0.86 - c[0]) * s * 0.7, c[1] + (0.8 - c[1]) * s * 0.7, c[2] + (0.6 - c[2]) * s * 0.7];
      }
      if (wet[i] !== 0) {
        const dep = Math.max(0, surf[i] - hv);
        const s = clamp(dep / 5, 0, 1);
        c = [0.78 - s * 0.55, 0.74 - s * 0.4, 0.55 - s * 0.1];
      }
      const k = 1 + nv * 0.35;
      vcolor[i * 3] = clamp(c[0] * k, 0, 1); vcolor[i * 3 + 1] = clamp(c[1] * k, 0, 1); vcolor[i * 3 + 2] = clamp(c[2] * k, 0, 1);
    }

  // deposits
  const dep = new Uint8Array(N * N), depAmt = new Float32Array(N * N), depMax = new Float32Array(N * N);
  const nCu = new Noise(seed + 505), nSn = new Noise(seed + 606), nFe = new Noise(seed + 707), nBy = new Noise(seed + 808), nFi = new Noise(seed + 909);
  const setDep = (t: number, type: number, a: number) => { dep[t] = type; depAmt[t] = a; depMax[t] = a; };
  const hotspots: { x: number; z: number; type: number }[] = [];
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const t = j * N + i;
      const b = biome[t], hh = tileH[t];
      if (tileWater[t]) continue;
      const r = rand.f();
      const hill = b === BIO.MOUNTAIN || hh > 3.6;
      const hillF = b === BIO.MOUNTAIN ? 1 : 0.35;
      if (hill && hh < 13) {
        const cu = nCu.fbm(i * 0.11, j * 0.11, 2), sn = nSn.fbm(i * 0.11 + 30, j * 0.11, 2), fe = nFe.fbm(i * 0.11, j * 0.11 + 60, 2);
        if (cu > 0.6 && r < 0.45 * hillF) setDep(t, DEP.COPPER, rand.range(70, 150));
        else if (sn > 0.62 && r < 0.42 * hillF) setDep(t, DEP.TIN, rand.range(60, 120));
        else if (fe > 0.62 && hh > 6 && r < 0.45) setDep(t, DEP.IRON, rand.range(70, 140));
        else if (r < 0.13 * hillF) setDep(t, DEP.STONE, rand.range(80, 200));
        else if (b === BIO.MOUNTAIN && r > 0.995) setDep(t, DEP.GEMS, rand.range(20, 40));
        continue;
      }
      if (b === BIO.BEACH && odT[t] < 2.6 && r < 0.12) setDep(t, DEP.SALT, 120);
      else if (b === BIO.DESERT) {
        if (r < 0.05) setDep(t, DEP.SALT, 100);
        else if (r > 0.992) setDep(t, DEP.GEMS, rand.range(20, 35));
        else if (r < 0.07 && nFi.fbm(i * 0.2, j * 0.2, 2) > 0.55) setDep(t, DEP.STONE, 100);
      } else if (wdT[t] < 2.4 && b !== BIO.BEACH && b !== BIO.DESERT && odT[t] > 3 && r < 0.14) setDep(t, DEP.CLAY, rand.range(100, 160));
      else if (b === BIO.SWAMP && r < 0.18) setDep(t, DEP.CLAY, 120);
      else if ((b === BIO.FOREST || b === BIO.PLAINS || b === BIO.VALLEY || b === BIO.SWAMP) && nBy.fbm(i * 0.14, j * 0.14, 2) > 0.57 && r < 0.3) setDep(t, DEP.BERRIES, rand.range(30, 50));
      else if ((b === BIO.PLAINS || b === BIO.SWAMP || b === BIO.VALLEY || b === BIO.DESERT) && nFi.fbm(i * 0.14 + 9, j * 0.14, 2) > 0.55 && r < 0.28) setDep(t, DEP.FIBER, rand.range(25, 40));
      else if ((b === BIO.PLAINS || b === BIO.FOREST) && r < 0.008) setDep(t, DEP.STONE, 80);
    }
  // hotspots
  const hsTypes = [DEP.COPPER, DEP.TIN, DEP.IRON, DEP.GEMS, DEP.RARE, DEP.RARE, DEP.SALT, DEP.GEMS];
  for (const type of hsTypes) {
    for (let tries = 0; tries < 200; tries++) {
      const i = rand.int(8, N - 9), j = rand.int(8, N - 9), t = j * N + i;
      if (tileWater[t]) continue;
      const b = biome[t];
      const ok =
        ([DEP.COPPER, DEP.TIN, DEP.IRON].includes(type) && (b === BIO.MOUNTAIN || tileH[t] > 4)) ||
        (type === DEP.GEMS && (b === BIO.MOUNTAIN || b === BIO.DESERT)) ||
        (type === DEP.RARE && b !== BIO.MOUNTAIN) ||
        (type === DEP.SALT && (b === BIO.BEACH || b === BIO.DESERT));
      if (!ok) continue;
      hotspots.push({ x: i + 0.5, z: j + 0.5, type });
      for (let dz = -4; dz <= 4; dz++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = i + dx, z = j + dz;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          const tt = z * N + x;
          if (tileWater[tt] || Math.hypot(dx, dz) > 4.2 || rand.f() > 0.5) continue;
          const base = type === DEP.RARE ? 25 : type === DEP.GEMS ? 45 : 200;
          setDep(tt, type, base * rand.range(0.8, 1.4));
        }
      break;
    }
  }

  // trees
  const trees: TreeInst[] = [];
  const treeStart = new Int32Array(N * N), treeCount = new Uint8Array(N * N);
  const nT = new Noise(seed + 1001);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const t = j * N + i;
      treeStart[t] = trees.length;
      if (tileWater[t]) continue;
      const b = biome[t];
      if (dep[t] && dep[t] !== DEP.BERRIES && dep[t] !== DEP.FIBER) continue;
      let cnt = 0, type = 0;
      const dn = nT.fbm(i * 0.09, j * 0.09, 3);
      if (b === BIO.FOREST) { cnt = Math.round(1.5 + dn * 3 + rand.f()); type = moist[t] > 0.62 ? 1 : 0; if (temp[t] < 0.42) type = 0; }
      else if (b === BIO.PLAINS || b === BIO.VALLEY) { cnt = nT.fbm(i * 0.16 + 7, j * 0.16, 2) > 0.62 && rand.f() < 0.5 ? rand.int(1, 2) : rand.f() < 0.03 ? 1 : 0; type = 1; }
      else if (b === BIO.SWAMP) { cnt = rand.f() < 0.25 ? 1 : 0; type = 4; }
      else if (b === BIO.BEACH) { cnt = rand.f() < 0.07 ? 1 : 0; type = 2; }
      else if (b === BIO.DESERT) { cnt = rand.f() < 0.05 ? 1 : 0; type = 3; }
      else if (b === BIO.MOUNTAIN && tileH[t] < 10) { cnt = rand.f() < 0.12 ? 1 : 0; type = 0; }
      if (dep[t]) cnt = Math.min(cnt, 1);
      cnt = Math.min(cnt, 5);
      for (let k = 0; k < cnt; k++) {
        const x = i + 0.15 + rand.f() * 0.7, z = j + 0.15 + rand.f() * 0.7;
        trees.push({ x, z, s: 0.8 + rand.f() * 0.6, type: type === 1 && rand.f() < 0.35 ? 0 : type, tile: t, r: rand.f() * 6.28 });
      }
      treeCount[t] = cnt;
    }
  const treeAlive = new Uint8Array(trees.length).fill(1);

  const w: World = {
    seed, h, surf, wet, flow, riverW, vcolor, wdist, biome, fert, moist, temp, tileWater, wdT, odT,
    dep, depAmt, depMax, treeStart, treeCount, treeAlive, trees, sites: [], animals: [], hotspots,
  };

  // sites
  const placeSites = (kind: Site['kind'], count: number, ok: (t: number) => boolean) => {
    for (let tries = 0; tries < 800 && count > 0; tries++) {
      const i = rand.int(6, N - 7), j = rand.int(6, N - 7), t = j * N + i;
      if (tileWater[t] || dep[t] || !ok(t)) continue;
      if (w.sites.some((s) => Math.hypot(s.x - i, s.z - j) < 14)) continue;
      w.sites.push({ kind, tile: t, x: i + 0.5, z: j + 0.5, found: false });
      count--;
    }
  };
  placeSites('cave', 6, (t) => {
    if (biome[t] !== BIO.MOUNTAIN) return false;
    const i = t % N, j = Math.floor(t / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (j + dz) * N + i + dx; if (n >= 0 && n < N * N && biome[n] !== BIO.MOUNTAIN && !tileWater[n]) return true; }
    return false;
  });
  placeSites('ruin', 6, (t) => (biome[t] === BIO.PLAINS || biome[t] === BIO.FOREST || biome[t] === BIO.DESERT || biome[t] === BIO.VALLEY) && slopeAt(w, t) < 0.5);
  placeSites('monolith', 4, (t) => (biome[t] === BIO.PLAINS || biome[t] === BIO.BEACH || biome[t] === BIO.DESERT) && slopeAt(w, t) < 0.5);
  // clear trees on site tiles
  for (const s of w.sites) {
    const st = treeStart[s.tile];
    for (let k = 0; k < treeCount[s.tile]; k++) treeAlive[st + k] = 0;
    treeCount[s.tile] = 0;
  }

  // animals: 0 deer 1 boar 2 mammoth 3 wolf
  const herd = (type: number, n: number, ok: (t: number) => boolean, tries: number, size: number) => {
    for (let k = 0; k < n; k++) {
      for (let q = 0; q < tries; q++) {
        const i = rand.int(3, N - 4), j = rand.int(3, N - 4), t = j * N + i;
        if (tileWater[t] || !ok(t)) continue;
        const m = rand.int(Math.max(1, size - 2), size);
        for (let a = 0; a < m; a++) {
          const x = clamp(i + rand.range(-2, 2), 1, N - 1), z = clamp(j + rand.range(-2, 2), 1, N - 1);
          if (!tileWater[Math.floor(z) * N + Math.floor(x)]) w.animals.push({ type, x, z });
        }
        break;
      }
    }
  };
  herd(0, 16, (t) => [BIO.PLAINS, BIO.FOREST, BIO.VALLEY].includes(biome[t]), 80, 5);
  herd(1, 10, (t) => [BIO.FOREST, BIO.SWAMP, BIO.VALLEY].includes(biome[t]), 80, 3);
  herd(2, 5, (t) => [BIO.PLAINS, BIO.DESERT].includes(biome[t]) || (biome[t] === BIO.FOREST && temp[t] < 0.4), 80, 3);
  herd(3, 6, (t) => [BIO.FOREST, BIO.PLAINS, BIO.MOUNTAIN].includes(biome[t]), 80, 2);
  return w;
}

export function slopeAt(w: World, t: number) {
  const i = t % N, j = Math.floor(t / N);
  const a = w.h[j * V + i], b = w.h[j * V + i + 1], c = w.h[(j + 1) * V + i], d = w.h[(j + 1) * V + i + 1];
  return Math.max(a, b, c, d) - Math.min(a, b, c, d);
}

export function heightAt(w: World, x: number, z: number) {
  const fx = clamp(x, 0, N - 0.001), fz = clamp(z, 0, N - 0.001);
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const a = w.h[j * V + i], b = w.h[j * V + i + 1], c = w.h[(j + 1) * V + i], d = w.h[(j + 1) * V + i + 1];
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
}

export function tileIdx(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  return j * N + i;
}

export function findTribeSite(w: World, rand: Rand, biome: number, avoid: { x: number; z: number }[], minDist: number): { x: number; z: number } {
  let best = { x: N / 2, z: N / 2 }, bs = -1e9;
  for (let k = 0; k < 900; k++) {
    const i = rand.int(14, N - 15), j = rand.int(14, N - 15), t = j * N + i;
    if (w.tileWater[t] || slopeAt(w, t) > 0.6) continue;
    let s = 0;
    // count biome match in radius 6
    let match = 0, tot = 0, bad = 0;
    for (let dz = -6; dz <= 6; dz += 2)
      for (let dx = -6; dx <= 6; dx += 2) {
        const tt = (j + dz) * N + i + dx;
        tot++;
        if (w.biome[tt] === biome) match++;
        if (w.tileWater[tt] === 1) bad++;
      }
    s = (match / tot) * 6 - (bad / tot) * 3 + w.fert[t] * 1.5 + rand.f() * 0.8;
    if (w.biome[t] === BIO.MOUNTAIN || w.h[j * V + i] > 7) s -= 4;
    if (w.biome[t] === BIO.BEACH && biome !== BIO.BEACH) s -= 1.5;
    for (const a of avoid) {
      const d = Math.hypot(a.x - i, a.z - j);
      if (d < minDist) s -= (minDist - d) * 0.5 + 6;
    }
    if (s > bs) { bs = s; best = { x: i + 0.5, z: j + 0.5 }; }
  }
  return best;
}
