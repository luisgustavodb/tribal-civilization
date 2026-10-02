import * as THREE from 'three';
import { MB } from './models';

interface Pal { roof: number; wall: number; accent: number; wood: number; stone: number }
const WOOD = 0x7a5632, STONE = 0x8f8a82, DSTONE = 0x6f6b64, HIDE = 0xc9a874, THATCH = 0xc8a85a, MUD = 0x9a7a55, DARK = 0x2a211a;
const PALS: Record<string, Pal> = {
  '-1': { roof: THATCH, wall: MUD, accent: 0xc8573a, wood: WOOD, stone: STONE },
  '0': { roof: 0xddc468, wall: 0xb89a68, accent: 0x2aa6a0, wood: 0x8a6a40, stone: 0xa8a090 },
  '1': { roof: 0x5e5048, wall: 0x8a8478, accent: 0xb85a3a, wood: 0x5a4030, stone: 0x7a766c },
  '2': { roof: 0xeee8da, wall: 0xdcccA4, accent: 0x3a6ad8, wood: 0x9a7a50, stone: 0xc8c0a8 },
  '3': { roof: 0xc8a070, wall: 0xb08a5a, accent: 0xe08a2a, wood: 0x7a5a3a, stone: 0x9a8a70 },
  '4': { roof: 0x4a3a30, wall: 0x5a4030, accent: 0xc02030, wood: 0x3a2a20, stone: 0x5a5650 },
  '5': { roof: 0x4f8040, wall: 0x6a5a48, accent: 0x8a5ac8, wood: 0x5a4a38, stone: 0x6a7060 },
};

function fireRing(m: MB, x: number, z: number, r: number, n = 8) {
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; m.box(0.14, 0.1, 0.14, x + Math.cos(a) * r, 0, z + Math.sin(a) * r, i % 2 ? STONE : DSTONE, a); }
  m.log(0.4, 0.04, x, 0.08, z, 0x4a3320, 0.6);
  m.log(0.4, 0.04, x, 0.08, z, 0x4a3320, -0.6);
  m.cone(r * 0.55, 0.38, x, 0.06, z, 0xff8a1e, 6);
  m.cone(r * 0.35, 0.3, x, 0.18, z, 0xffd23a, 5);
}
function tent(m: MB, x: number, z: number, s: number, c: number, ry = 0) {
  m.cone(0.5 * s, 1.0 * s, x, 0, z, c, 6, ry);
  m.cyl(0.015, 0.015, 0.35 * s, x, 1.0 * s - 0.05, z, WOOD, 4);
  m.box(0.16 * s, 0.4 * s, 0.05, x + Math.sin(ry) * 0.2, 0, z + 0.4 * s * Math.cos(ry), DARK);
}
function crate(m: MB, x: number, y: number, z: number, s = 0.22, c = 0x9a7040, ry = 0) { m.box(s, s, s, x, y, z, c, ry); }
function flag(m: MB, x: number, z: number, h: number, c: number) {
  m.cyl(0.018, 0.018, h, x, 0, z, WOOD, 4);
  m.box(0.28, 0.16, 0.02, x + 0.15, h - 0.2, z, c);
}
function rack(m: MB, x: number, z: number, len: number, ry: number, c = 0xc86a50) {
  const dx = Math.cos(ry) * len / 2, dz = -Math.sin(ry) * len / 2;
  m.cyl(0.02, 0.02, 0.6, x - dx, 0, z - dz, WOOD, 4);
  m.cyl(0.02, 0.02, 0.6, x + dx, 0, z + dz, WOOD, 4);
  m.log(len, 0.015, x, 0.55, z, WOOD, ry);
  for (let i = -1; i <= 1; i++) m.box(0.07, 0.2, 0.03, x + Math.cos(ry) * i * len * 0.3, 0.33, z - Math.sin(ry) * i * len * 0.3, c, ry);
}
function stall(m: MB, x: number, z: number, c1: number, c2: number, ry = 0) {
  m.box(0.7, 0.3, 0.4, x, 0, z, 0x8a6a40, ry);
  for (const s of [-1, 1]) m.cyl(0.02, 0.02, 0.7, x + Math.cos(ry) * 0.33 * s, 0, z - Math.sin(ry) * 0.33 * s - 0.17 * Math.cos(ry), WOOD, 4);
  for (let i = 0; i < 4; i++) m.box(0.18, 0.04, 0.5, x + Math.cos(ry) * (i - 1.5) * 0.18, 0.68 + 0.0, z - Math.sin(ry) * (i - 1.5) * 0.18 - 0.02, i % 2 ? c1 : c2, ry);
  m.sph(0.07, x - 0.15, 0.36, z, 0xd0402a, 1, 4); m.sph(0.07, x + 0.1, 0.36, z, 0xe0c030, 1, 4);
}
function pillars(m: MB, w: number, d: number, h: number, c: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w * i) / (n - 1);
    m.cyl(0.07, 0.08, h, x, 0.12, -d / 2, c, 6);
    m.cyl(0.07, 0.08, h, x, 0.12, d / 2, c, 6);
  }
}
function crops(m: MB, w: number, d: number, c1: number, c2: number) {
  m.box(w, 0.08, d, 0, 0, 0, 0x6a4a2a);
  for (let i = 0; i < Math.floor(d * 2.2); i++) {
    const z = -d / 2 + 0.2 + i * 0.42;
    if (z > d / 2 - 0.1) break;
    m.box(w - 0.3, 0.07, 0.14, 0, 0.08, z, 0x5a3c20);
    for (let k = 0; k < Math.floor(w * 2.4); k++) { const x = -w / 2 + 0.2 + k * 0.4; if (x > w / 2 - 0.1) break; m.cone(0.07, 0.3, x, 0.1, z, (i + k) % 3 ? c1 : c2, 4); }
  }
}
function fenceRing(m: MB, w: number, d: number) {
  const post = (x: number, z: number) => m.cyl(0.03, 0.03, 0.4, x, 0, z, WOOD, 4);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.5) { post(x, -d / 2); post(x, d / 2); }
  for (let z = -d / 2; z <= d / 2 + 0.01; z += 0.5) { post(-w / 2, z); post(w / 2, z); }
  m.box(w, 0.03, 0.03, 0, 0.28, -d / 2, WOOD); m.box(w, 0.03, 0.03, 0, 0.28, d / 2, WOOD);
  m.box(0.03, 0.03, d, -w / 2, 0.28, 0, WOOD); m.box(0.03, 0.03, d, w / 2, 0.28, 0, WOOD);
}
function mineEntrance(m: MB, ore: number) {
  m.sph(0.8, 0, 0.0, -0.1, 0x6a655c, 0.7, 6);
  m.box(0.5, 0.55, 0.3, 0, 0, 0.35, 0x15110e);
  m.box(0.1, 0.62, 0.12, -0.3, 0, 0.35, WOOD); m.box(0.1, 0.62, 0.12, 0.3, 0, 0.35, WOOD);
  m.box(0.75, 0.1, 0.14, 0, 0.58, 0.35, WOOD);
  m.box(0.3, 0.14, 0.22, 0.55, 0.0, 0.55, 0x6a5a48);
  m.sph(0.1, 0.55, 0.2, 0.55, ore, 0.7, 5);
  m.sph(0.14, -0.5, 0.1, 0.5, ore, 0.7, 5);
  m.sph(0.08, -0.35, 0.08, 0.7, ore, 0.7, 5);
}
function house(m: MB, p: Pal, w: number, d: number, wh: number, rh: number, wallC: number, roofC: number) {
  m.box(w, wh, d, 0, 0, 0, wallC);
  m.gable(w + 0.3, rh, d + 0.3, 0, wh, 0, roofC, 0);
  m.box(0.22, 0.38, 0.05, 0, 0, d / 2 + 0.01, DARK);
  m.box(0.14, 0.14, 0.05, w / 2 - 0.3, wh * 0.45, d / 2 + 0.01, 0x3a2e24);
  void p;
}

export function buildingGeometry(type: string, style: number, mask: number): THREE.BufferGeometry {
  const p = PALS[String(style)] || PALS['-1'];
  const m = new MB();
  switch (type) {
    case 'sleep':
      m.gable(0.95, 0.5, 0.85, 0, 0, 0, HIDE);
      m.box(0.5, 0.05, 0.5, 0, 0, 0.0, 0x5a4a30);
      m.log(0.5, 0.03, 0, 0.48, 0, WOOD, 0);
      break;
    case 'hut':
      if (style === 3) { tent(m, -0.3, -0.2, 1.4, p.roof, 0.4); tent(m, 0.5, 0.4, 1.0, 0xd8b080, 2.0); m.cone(0.08, 0.18, 0, 0, 0.6, 0xff8a1e, 5); }
      else {
        m.cyl(0.62, 0.7, 0.5, 0, 0, 0, p.wall, 9);
        m.cone(0.92, 0.85, 0, 0.45, 0, p.roof, 9);
        m.box(0.28, 0.4, 0.06, 0, 0, 0.68, DARK);
        if (style === 4) for (let i = 0; i < 5; i++) { const a = i * 1.25; m.cone(0.04, 0.3, Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95, 0x3a2a20, 4); }
        if (style >= 0) m.box(0.3, 0.06, 0.02, 0, 0.6, 0.78, p.accent);
        m.cyl(0.015, 0.015, 0.2, 0, 1.28, 0, WOOD, 4);
      }
      break;
    case 'timber':
      house(m, p, 1.5, 1.5, 0.7, 0.65, style >= 0 ? p.wall : 0xa8825a, p.roof);
      m.box(0.2, 0.3, 0.2, 0.5, 1.0, -0.3, p.stone);
      if (style >= 0) m.box(1.5, 0.05, 0.02, 0, 0.62, 0.76, p.accent);
      break;
    case 'stone_house':
      house(m, p, 1.55, 1.55, 0.95, 0.7, p.stone === STONE ? 0xaaa59a : p.stone, style >= 0 ? p.accent : 0xb8583a);
      m.box(0.22, 0.4, 0.22, 0.5, 1.2, -0.3, DSTONE);
      m.box(1.65, 0.07, 0.07, 0, 0.9, 0.78, DSTONE);
      break;
    case 'longhouse':
      m.box(2.7, 0.85, 1.5, 0, 0, 0, p.stone === STONE ? 0xa8a398 : p.stone);
      m.gable(2.95, 0.8, 1.8, 0, 0.85, 0, style >= 0 ? p.accent : 0xa8482e);
      for (let i = 0; i < 4; i++) m.cyl(0.05, 0.05, 0.85, -1.2 + i * 0.8, 0, 0.78, WOOD, 5);
      m.box(0.3, 0.55, 0.05, -0.4, 0, 0.77, DARK); m.box(0.3, 0.55, 0.05, 0.6, 0, 0.77, DARK);
      m.box(0.25, 0.4, 0.25, 0.9, 1.3, 0, DSTONE);
      break;
    case 'campfire':
      fireRing(m, 0, 0, 0.42);
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; m.log(0.35, 0.06, Math.cos(a) * 0.8, 0.07, Math.sin(a) * 0.8, 0x6a4a2a, -a + 1.57); }
      m.cone(0.25, 0.5, 0.75, 0, -0.75, HIDE, 5);
      break;
    case 'hearth':
      fireRing(m, 0, 0, 0.6, 10);
      for (let i = 0; i < 6; i++) { const a = i * 1.047; m.box(0.55, 0.16, 0.18, Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15, 0x7a5632, -a + 1.57); }
      rack(m, -1.2, -1.2, 0.8, 0.5); rack(m, 1.2, -1.2, 0.8, -0.5, 0xe0c060);
      m.cyl(0.07, 0.09, 1.6, 1.3, 0, 1.2, 0x7a4a2a, 6);
      for (let i = 0; i < 4; i++) m.box(0.2, 0.2, 0.2, 1.3, 0.3 + i * 0.35, 1.2, [0xc8573a, 0xe0c060, 0x2aa6a0, 0xf0e8d0][i]);
      tent(m, -1.2, 1.2, 1.2, HIDE, 0.5);
      break;
    case 'gatherer':
      m.gable(0.9, 0.6, 0.8, -0.35, 0, -0.3, p.roof);
      for (let i = 0; i < 4; i++) m.cyl(0.14, 0.11, 0.18, 0.1 + (i % 2) * 0.3, 0, 0.2 + Math.floor(i / 2) * 0.3, 0x9a7a40, 7);
      for (let i = 0; i < 3; i++) m.sph(0.04, 0.1 + i * 0.1, 0.2, 0.25, [0x8a2aa0, 0xc03030, 0x8a2aa0][i], 1, 4);
      rack(m, 0.3, -0.5, 0.7, 0, 0x9ab048);
      break;
    case 'water_spot':
      m.cyl(0.45, 0.5, 0.15, 0.1, 0, 0, STONE, 9);
      m.cyl(0.38, 0.38, 0.12, 0.1, 0.05, 0, 0x4aa3d8, 9);
      for (let i = 0; i < 3; i++) m.cyl(0.1, 0.07, 0.2, -0.6, 0, -0.5 + i * 0.35, 0xb87040, 6);
      rack(m, -0.2, 0.7, 0.9, 0, 0x4aa3d8);
      break;
    case 'storage_pile':
      m.box(1.3, 0.45, 1.1, 0, 0, 0, 0x8a6a40);
      for (let i = 0; i < 4; i++) m.log(1.0, 0.07, 0, 0.5 + (i % 2) * 0.1, -0.35 + i * 0.22, 0x6a4a2a);
      m.gable(1.5, 0.35, 1.3, 0, 0.45, 0, HIDE);
      crate(m, 0.8, 0, 0.5); crate(m, -0.75, 0, -0.55, 0.25, 0x8a6030);
      m.cyl(0.14, 0.12, 0.28, 0.75, 0, -0.5, 0xb87040, 7);
      break;
    case 'cooking':
      m.cyl(0.3, 0.32, 0.12, 0, 0, 0, DSTONE, 8); m.sph(0.17, 0, 0.3, 0, 0x3a3a3a, 0.8, 6);
      m.cone(0.12, 0.2, 0, 0.1, 0, 0xff8a1e, 5); m.log(0.5, 0.02, 0, 0.5, 0, WOOD, 0.5);
      break;
    case 'elders':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; m.box(0.2, 0.55 + (i % 3) * 0.12, 0.15, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0x9a968c, a); }
      fireRing(m, 0, 0, 0.28, 6);
      m.cyl(0.05, 0.07, 1.4, 0.3, 0, 0.3, 0x7a4a2a, 6);
      m.box(0.18, 0.18, 0.18, 0.3, 0.9, 0.3, 0xe8e0d0); m.box(0.2, 0.15, 0.2, 0.3, 1.2, 0.3, p.accent === 0xc8573a ? 0x8a5ac8 : p.accent);
      break;
    case 'woodcutter':
      for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) m.log(0.9, 0.08, -0.4, 0.09 + i * 0.14, -0.4 + j * 0.17 - i * 0.08, 0x7a5030);
      m.cyl(0.14, 0.16, 0.24, 0.35, 0, 0.3, 0x8a6030, 7);
      m.log(0.4, 0.015, 0.35, 0.34, 0.3, WOOD, 0.8); m.box(0.12, 0.05, 0.02, 0.5, 0.4, 0.2, 0x909090);
      m.gable(0.8, 0.5, 0.7, 0.3, 0, -0.45, p.roof);
      break;
    case 'quarry':
      m.cyl(0.55, 0.5, 0.06, 0, 0, 0, 0x4a463e, 9);
      for (let i = 0; i < 5; i++) m.box(0.28, 0.2, 0.2, -0.5 + i * 0.22, 0.03 + (i % 2) * 0.2, -0.65, 0xa0a09a, i * 0.3);
      m.box(0.05, 0.9, 0.05, 0.55, 0, 0.3, WOOD); m.box(0.05, 0.9, 0.05, 0.9, 0, 0.3, WOOD); m.box(0.5, 0.05, 0.05, 0.72, 0.88, 0.3, WOOD); m.log(0.5, 0.012, 0.72, 0.5, 0.3, 0x8a7a50, 1.57);
      m.box(0.2, 0.14, 0.16, 0.2, 0, 0.5, 0xb0b0aa);
      break;
    case 'workshop':
      m.box(1.2, 0.6, 0.9, -0.1, 0, -0.2, p.wood);
      m.gable(1.45, 0.5, 1.1, -0.1, 0.6, -0.2, p.roof);
      m.box(0.6, 0.18, 0.28, 0.3, 0, 0.55, 0x8a6a40);
      m.box(0.1, 0.07, 0.1, 0.1, 0.18, 0.55, 0x909090); m.cyl(0.04, 0.04, 0.2, 0.55, 0.18, 0.55, 0xa0a0a0, 5);
      m.box(0.22, 0.5, 0.22, 0.35, 0.9, -0.45, STONE);
      break;
    case 'outpost':
      fenceRing(m, 1.6, 1.6);
      tent(m, 0, 0, 1.3, p.roof, 0.3);
      flag(m, 0.55, 0.55, 1.5, p.accent);
      m.cyl(0.07, 0.07, 0.15, -0.5, 0, 0.5, DSTONE, 6);
      break;
    case 'resource_camp':
      tent(m, 0, 0, 0.7, HIDE, 0.5); flag(m, 0.3, 0.3, 0.9, p.accent === 0xc8573a ? 0xe8c060 : p.accent);
      break;
    case 'hunting_camp':
      tent(m, -0.35, -0.2, 1.2, p.roof, 0.6);
      rack(m, 0.4, 0.3, 0.9, 0.3, 0xb04a3a);
      m.cyl(0.02, 0.02, 0.8, 0.7, 0, -0.5, WOOD, 4); m.sph(0.08, 0.7, 0.85, -0.5, 0xe8e0d0, 1, 5);
      m.box(0.3, 0.12, 0.2, -0.5, 0, 0.55, 0xb04a3a, 0.4);
      break;
    case 'fishing':
      m.box(1.4, 0.07, 0.5, 0, 0.18, -0.5, 0x8a6a40);
      for (let i = 0; i < 4; i++) m.cyl(0.03, 0.03, 0.3, -0.6 + i * 0.4, 0, -0.5, WOOD, 4);
      rack(m, 0, 0.5, 1.0, 0, 0x7ab0c8);
      m.gable(0.7, 0.4, 0.6, -0.5, 0, 0.0, p.roof);
      m.box(0.2, 0.08, 0.4, 0.6, 0.0, -0.5, 0xc8a070, 0.8);
      break;
    case 'palisade': {
      const post = (x: number, z: number, h = 0.9) => { m.cyl(0.07, 0.08, h, x, 0, z, 0x6a4a2a, 5); m.cone(0.07, 0.18, x, h, z, 0x5a3a20, 5); };
      post(0, 0, 1.0);
      if (mask & 1) { post(0, -0.33, 0.85); post(0, -0.66, 0.9); m.box(0.05, 0.05, 0.9, 0, 0.45, -0.5, WOOD); }
      if (mask & 4) { post(0, 0.33, 0.85); post(0, 0.66, 0.9); m.box(0.05, 0.05, 0.9, 0, 0.45, 0.5, WOOD); }
      if (mask & 2) { post(0.33, 0, 0.85); post(0.66, 0, 0.9); m.box(0.9, 0.05, 0.05, 0.5, 0.45, 0, WOOD); }
      if (mask & 8) { post(-0.33, 0, 0.85); post(-0.66, 0, 0.9); m.box(0.9, 0.05, 0.05, -0.5, 0.45, 0, WOOD); }
      break;
    }
    case 'stone_wall': {
      m.box(0.55, 1.0, 0.55, 0, 0, 0, 0x8f8a82);
      m.box(0.6, 0.12, 0.6, 0, 1.0, 0, 0x7a766e);
      const seg = (dx: number, dz: number) => { const len = 0.5; const sx = dx ? len : 0.42, sz = dz ? len : 0.42; m.box(sx, 0.85, sz, dx * 0.5, 0, dz * 0.5, 0x9a958c); m.box(sx, 0.1, sz + 0.05, dx * 0.5, 0.85, dz * 0.5, 0x7a766e); };
      if (mask & 1) seg(0, -1); if (mask & 4) seg(0, 1); if (mask & 2) seg(1, 0); if (mask & 8) seg(-1, 0);
      break;
    }
    case 'lookout':
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) m.cyl(0.04, 0.05, 1.7, x, 0, z, 0x6a4a2a, 5);
      m.box(0.85, 0.07, 0.85, 0, 1.2, 0, 0x8a6a40);
      m.box(0.8, 0.12, 0.04, 0, 1.28, -0.4, WOOD); m.box(0.8, 0.12, 0.04, 0, 1.28, 0.4, WOOD);
      m.pyr(0.7, 0.4, 0, 1.75, 0, p.roof); m.box(0.04, 0.5, 0.04, 0.3, 0, 0, WOOD);
      m.box(0.05, 0.9, 0.05, 0.38, 0.0, 0.0, WOOD, 0, 0, 0);
      break;
    case 'warrior_lodge':
      house(m, p, 1.5, 1.4, 0.7, 0.7, p.wood === WOOD ? 0x7a4a38 : p.wood, 0x6a3a2a);
      for (let i = 0; i < 4; i++) { m.cyl(0.015, 0.015, 1.1, -0.7 + i * 0.2, 0, 0.9, WOOD, 4); m.cone(0.03, 0.1, -0.7 + i * 0.2, 1.1, 0.9, 0xc0c0c0, 4); }
      m.cyl(0.14, 0.14, 0.04, 0.6, 0.35, 0.78, 0xc02828, 8);
      flag(m, -0.8, -0.8, 1.6, 0xc02828);
      break;
    case 'trading_post':
      stall(m, -0.3, -0.1, 0xc8573a, 0xf0e0b0);
      crate(m, 0.5, 0, -0.4); crate(m, 0.55, 0.22, -0.4, 0.18, 0x7a5030); crate(m, 0.4, 0, 0.45, 0.25);
      m.cyl(0.1, 0.08, 0.25, 0.6, 0, 0.1, 0xb87040, 6);
      flag(m, 0.7, -0.7, 1.2, 0xd04aa0);
      break;
    case 'farm':
      crops(m, 2.8, 2.8, 0x8ab840, 0xd8c050);
      m.cyl(0.015, 0.015, 0.6, 1.1, 0.08, 1.1, WOOD, 4); m.box(0.4, 0.03, 0.03, 1.1, 0.5, 1.1, WOOD); m.sph(0.07, 1.1, 0.68, 1.1, 0xe8c070, 1, 5);
      for (let i = -3; i <= 3; i++) m.cyl(0.02, 0.02, 0.2, i * 0.4, 0, -1.45, WOOD, 4);
      break;
    case 'pen':
      m.box(2.8, 0.03, 2.8, 0, 0, 0, 0xb8a060);
      fenceRing(m, 2.8, 2.8);
      m.gable(0.9, 0.4, 0.7, -0.8, 0, -0.9, p.roof);
      for (let i = 0; i < 3; i++) { m.box(0.3, 0.16, 0.14, 0.2 + i * 0.4, 0.1, 0.4 - (i % 2) * 0.5, [0x5a4434, 0xb08050, 0x6a5444][i], i); m.sph(0.07, 0.38 + i * 0.4, 0.18, 0.4 - (i % 2) * 0.5, 0x4a3828, 1, 4); }
      break;
    case 'granary':
      for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) m.cyl(0.05, 0.06, 0.4, x, 0, z, WOOD, 5);
      m.cyl(0.62, 0.62, 0.7, 0, 0.4, 0, p.wall === MUD ? 0xb89a68 : p.wall, 10);
      m.cone(0.85, 0.7, 0, 1.1, 0, p.roof, 10);
      m.box(0.2, 0.3, 0.05, 0, 0.55, 0.62, DARK);
      break;
    case 'totem':
      for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; m.box(0.14, 0.4, 0.12, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0x9a968c, a); }
      m.cyl(0.1, 0.12, 1.9, 0, 0, 0, 0x7a4a2a, 7);
      [0xc8573a, 0xe8d8a0, 0x2aa6a0, 0xe0a030].forEach((c, i) => m.box(0.3, 0.25, 0.3, 0, 0.2 + i * 0.4, 0, c));
      m.cone(0.2, 0.3, 0, 1.9, 0, 0xe0a030, 4);
      break;
    case 'meeting':
      for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; m.box(0.22, 0.7 + (i % 3) * 0.15, 0.16, Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25, 0x9a968c, a); }
      m.cyl(0.9, 0.9, 0.05, 0, 0, 0, 0xb8a878, 12);
      fireRing(m, 0, 0, 0.35, 7);
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.78; m.log(0.5, 0.07, Math.cos(a) * 0.7, 0.07, Math.sin(a) * 0.7, 0x6a4a2a, -a + 1.57); }
      break;
    case 'herbalist':
      m.cyl(0.55, 0.6, 0.45, -0.2, 0, -0.2, p.wall, 8); m.cone(0.8, 0.7, -0.2, 0.4, -0.2, 0x4f8040, 8);
      for (let i = 0; i < 5; i++) m.sph(0.1, 0.4 + (i % 3) * 0.2, 0.25 + (i % 2) * 0.2, 0.1, [0x4a9a3a, 0x8a4aa0, 0xe0c040][i % 3] as number);
      rack(m, 0.3, 0.1, 0.5, 1.57, 0x6aa040);
      break;
    case 'clay_pit':
      m.cyl(0.6, 0.55, 0.08, 0, 0, 0, 0x8a5030, 9);
      m.sph(0.35, 0.35, 0, 0.3, 0xb8683a, 0.4, 6);
      m.box(0.5, 0.22, 0.4, -0.55, 0, -0.5, 0xc07844);
      m.log(0.6, 0.015, -0.3, 0.5, 0.4, WOOD, 0.6); m.box(0.14, 0.04, 0.1, -0.1, 0.55, 0.6, 0x909090);
      for (let i = 0; i < 3; i++) m.cyl(0.08, 0.06, 0.14, 0.4 + i * 0.12, 0, -0.5, 0xb87040, 6);
      break;
    case 'potter':
      m.sph(0.55, -0.2, 0.0, -0.1, 0xa86840, 0.9, 8); m.box(0.25, 0.3, 0.1, -0.2, 0, 0.4, DARK);
      m.cyl(0.08, 0.1, 0.9, -0.2, 0.4, -0.1, DSTONE, 6);
      for (let i = 0; i < 5; i++) m.cyl(0.1, 0.07, 0.2, 0.5, 0.0 + (i > 2 ? 0.2 : 0), -0.5 + (i % 3) * 0.28, [0xc87a4a, 0xa86840, 0xd08a50][i % 3], 6);
      m.box(0.4, 0.2, 0.4, 0.45, 0, 0.4, 0x8a6a40);
      break;
    case 'market':
      m.cyl(1.4, 1.4, 0.06, 0, 0, 0, 0xc8b88a, 12);
      stall(m, -0.8, -0.8, 0xc8573a, 0xf0e0b0, 0.3); stall(m, 0.8, -0.8, 0x3a6ad8, 0xf0f0f0, -0.3); stall(m, -0.8, 0.8, 0x4a9a3a, 0xf0e0b0, 2.8); stall(m, 0.8, 0.8, 0xe0a030, 0xc8573a, -2.8);
      m.cyl(0.14, 0.12, 0.3, 0, 0.06, 0, 0xb87040, 7); m.cyl(0.1, 0.08, 0.25, 0.25, 0.06, 0.15, 0xc87a4a, 7);
      flag(m, 0, 0, 1.6, 0xd04aa0);
      break;
    case 'well':
      m.cyl(0.32, 0.34, 0.35, 0, 0, 0, STONE, 9); m.cyl(0.24, 0.24, 0.05, 0, 0.32, 0, 0x4aa3d8, 9);
      m.box(0.04, 0.8, 0.04, -0.3, 0, 0, WOOD); m.box(0.04, 0.8, 0.04, 0.3, 0, 0, WOOD); m.box(0.7, 0.05, 0.06, 0, 0.8, 0, WOOD);
      m.cyl(0.06, 0.05, 0.1, 0.05, 0.5, 0, 0xb87040, 5);
      break;
    case 'salt_works':
      for (let i = 0; i < 4; i++) m.box(0.8, 0.05, 0.6, -0.5 + (i % 2) * 0.9, 0, -0.5 + Math.floor(i / 2) * 0.75, i % 3 === 0 ? 0xf0f0f0 : 0xd8e4ea);
      rack(m, 0, 0.9, 1.0, 0, 0xf0f0f0);
      m.gable(0.6, 0.4, 0.5, 0.6, 0, 0.7, p.roof);
      break;
    case 'copper_mine': mineEntrance(m, 0xd0743a); break;
    case 'tin_mine': mineEntrance(m, 0xdde4f0); break;
    case 'iron_mine': mineEntrance(m, 0x9a4a30); break;
    case 'gem_mine': mineEntrance(m, 0x40e0e0); m.cone(0.05, 0.2, 0.7, 0.3, 0.6, 0xd070e0, 5); break;
    case 'foundry':
      m.box(0.9, 0.8, 0.8, -0.2, 0, -0.1, DSTONE);
      m.cyl(0.14, 0.2, 1.6, -0.35, 0.8, -0.2, DSTONE, 7);
      m.box(0.3, 0.3, 0.1, -0.2, 0.15, 0.32, 0xff7a1e);
      m.box(0.35, 0.12, 0.22, 0.55, 0, 0.45, 0x4a4a52); m.box(0.12, 0.18, 0.12, 0.55, 0.12, 0.45, 0x4a4a52);
      m.gable(0.6, 0.35, 0.6, 0.5, 0.0, -0.45, p.roof);
      m.box(0.2, 0.1, 0.2, 0.6, 0, 0.0, 0xc89030);
      break;
    case 'ironworks':
      m.box(1.5, 0.9, 1.0, 0, 0, -0.3, 0x5a5650);
      m.cyl(0.14, 0.2, 1.7, -0.5, 0.9, -0.4, 0x4a463e, 7); m.cyl(0.12, 0.17, 1.4, 0.1, 0.9, -0.4, 0x4a463e, 7);
      m.box(0.5, 0.3, 0.1, -0.2, 0.15, 0.22, 0xff6a1e);
      m.box(0.4, 0.14, 0.26, 0.5, 0, 0.55, 0x3a3a42);
      m.box(0.9, 0.1, 0.6, 0.0, 0.9, -0.3, 0x3a3630);
      break;
    case 'stone_tower':
      m.cyl(0.62, 0.72, 2.6, 0, 0, 0, 0xa8a398, 9);
      m.cyl(0.78, 0.7, 0.25, 0, 2.6, 0, 0x8f8a82, 9);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; m.box(0.2, 0.22, 0.14, Math.cos(a) * 0.72, 2.85, Math.sin(a) * 0.72, 0x8f8a82, -a); }
      m.cone(0.7, 0.5, 0, 2.85, 0, p.accent === 0xc8573a ? 0xa8482e : p.accent, 9);
      m.box(0.2, 0.4, 0.05, 0, 0, 0.68, DARK); m.box(0.12, 0.2, 0.05, 0, 1.6, 0.6, DARK);
      break;
    case 'irrigation':
      m.box(1.8, 0.14, 0.4, 0, 0, 0, 0x8f8a82); m.box(1.7, 0.05, 0.28, 0, 0.12, 0, 0x4aa3d8);
      m.box(0.4, 0.14, 1.6, -0.7, 0, 0.9, 0x8f8a82); m.box(0.28, 0.05, 1.5, -0.7, 0.12, 0.9, 0x4aa3d8);
      m.box(0.1, 0.5, 0.5, 0.3, 0, 0, WOOD);
      m.cyl(0.4, 0.4, 0.06, 0.8, 0, -0.7, 0x8f8a82, 8);
      break;
    case 'scribe':
      m.box(1.5, 0.9, 1.4, 0, 0, 0, 0xd8c8a0); m.gable(1.7, 0.6, 1.6, 0, 0.9, 0, 0x8a5a3a);
      m.box(0.24, 0.45, 0.05, 0, 0, 0.71, DARK);
      for (let i = 0; i < 3; i++) m.box(0.2, 0.03, 0.14, 0.9, 0.05 + i * 0.04, 0.4 - i * 0.05, 0xc07844, i * 0.3);
      m.box(0.25, 0.06, 0.2, -0.9, 0, 0.5, 0xf0e0b0);
      break;
    case 'temple':
      m.box(3.0, 0.2, 3.0, 0, 0, 0, 0xc8c0a8); m.box(2.6, 0.2, 2.6, 0, 0.2, 0, 0xd4ccb4);
      pillars(m, 1.9, 1.9, 1.2, 0xeee6d0, 3);
      m.box(1.2, 0.9, 1.2, 0, 0.4, 0, 0xd8c8a0);
      m.box(2.3, 0.14, 2.3, 0, 1.52, 0, 0xe0d8c0);
      m.pyr(1.5, 0.9, 0, 1.66, 0, p.accent === 0xc8573a ? 0xc0a040 : p.accent);
      m.sph(0.1, 0, 2.6, 0, 0xffd860, 1, 5);
      m.box(0.3, 0.55, 0.05, 0, 0.4, 0.62, DARK);
      break;
    case 'warehouse':
      m.box(2.8, 0.9, 1.7, 0, 0, 0, p.wood === WOOD ? 0x8a6a45 : p.wood);
      m.gable(3.1, 0.8, 2.0, 0, 0.9, 0, p.roof);
      m.box(0.7, 0.7, 0.05, -0.5, 0, 0.86, DARK); m.box(0.7, 0.7, 0.05, 0.6, 0, 0.86, DARK);
      crate(m, 1.4, 0, 1.05, 0.3); crate(m, -1.2, 0, 1.1, 0.26, 0x8a6030); m.cyl(0.18, 0.15, 0.35, -1.5, 0, 0.9, 0xb87040, 7);
      break;
    case 'aqueduct':
      for (let i = 0; i < 3; i++) { m.box(0.3, 0.8, 0.5, -0.65 + i * 0.65, 0, 0, 0xb8b0a0); }
      m.box(2.0, 0.18, 0.55, 0, 0.8, 0, 0xc8c0b0); m.box(1.9, 0.05, 0.35, 0, 0.98, 0, 0x4aa3d8);
      m.cyl(0.45, 0.5, 0.2, 0.2, 0, 0.85, 0xa8a090, 8); m.cyl(0.35, 0.35, 0.05, 0.2, 0.2, 0.85, 0x4aa3d8, 8);
      break;
    case 'great_hall':
      m.box(4.0, 0.25, 4.0, 0, 0, 0, 0xb8b0a0); m.box(3.5, 0.25, 3.5, 0, 0.25, 0, 0xc8c0b0);
      m.box(2.6, 1.3, 2.2, 0, 0.5, 0, 0xb09a78);
      m.gable(3.2, 1.2, 2.8, 0, 1.8, 0, p.accent === 0xc8573a ? 0x9a3a28 : p.accent);
      pillars(m, 3.0, 3.0, 1.6, 0xeee6d0, 4);
      m.box(0.6, 0.9, 0.06, 0, 0.5, 1.12, DARK);
      flag(m, -1.7, 1.7, 2.6, 0xe0a030); flag(m, 1.7, 1.7, 2.6, 0xe0a030);
      m.box(0.5, 0.45, 0.5, 0.9, 3.0, 0, DSTONE);
      fireRing(m, 0, 2.7, 0.2, 5);
      break;
    case 'monument':
      m.box(3.0, 0.2, 3.0, 0, 0, 0, 0xb8b0a0); m.box(2.4, 0.3, 2.4, 0, 0.2, 0, 0xc4bcac); m.box(1.8, 0.3, 1.8, 0, 0.5, 0, 0xd0c8b8);
      m.box(0.9, 2.4, 0.9, 0, 0.8, 0, 0xe0d8c8); m.pyr(0.75, 0.7, 0, 3.2, 0, 0xffd860);
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.78; m.box(0.2, 0.9, 0.2, Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25, 0xd8d0c0); m.sph(0.12, Math.cos(a) * 1.25, 1.0, Math.sin(a) * 1.25, 0xffd860, 1, 5); }
      break;
    default:
      m.box(1, 0.8, 1, 0, 0, 0, 0xaaaaaa);
  }
  return m.build();
}

export function buildingHeight(type: string) {
  const h: Record<string, number> = { stone_tower: 3.2, temple: 2.6, great_hall: 3.4, monument: 3.6, lookout: 2.1, hearth: 1.2, campfire: 0.8, hut: 1.3, farm: 0.5, pen: 0.6, palisade: 1.0, stone_wall: 1.1 };
  return h[type] || 1.5;
}

export function scaffoldGeometry(w: number, d: number, h: number): THREE.BufferGeometry {
  const m = new MB();
  const x = w / 2 - 0.05, z = d / 2 - 0.05;
  for (const [px, pz] of [[-x, -z], [x, -z], [-x, z], [x, z]]) m.cyl(0.035, 0.04, h, px, 0, pz, 0x9a7a4a, 4);
  for (const y of [h * 0.4, h * 0.8]) {
    m.box(w - 0.1, 0.035, 0.035, 0, y, -z, 0x8a6a3a); m.box(w - 0.1, 0.035, 0.035, 0, y, z, 0x8a6a3a);
    m.box(0.035, 0.035, d - 0.1, -x, y, 0, 0x8a6a3a); m.box(0.035, 0.035, d - 0.1, x, y, 0, 0x8a6a3a);
  }
  m.box(w, 0.03, 0.03, 0, h * 0.2, -z, 0x8a6a3a, 0, 0, 0.0);
  m.box(0.03, h, 0.03, 0, 0, z, 0x8a6a3a, 0, 0, 0.55);
  return m.build();
}
