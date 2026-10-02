import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Small procedural low-poly modelling helper. y of box/cyl/cone is the bottom; sph is centered.
export class MB {
  parts: THREE.BufferGeometry[] = [];
  private push(g: THREE.BufferGeometry, c: number, x: number, y: number, z: number, ry: number, rx: number, rz: number) {
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng.attributes.uv) ng.deleteAttribute('uv');
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    const cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(ng);
    return this;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0, rx = 0, rz = 0) {
    return this.push(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, ry, rx, rz);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, c: number, seg = 8) {
    return this.push(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z, 0, 0, 0);
  }
  log(len: number, r: number, x: number, y: number, z: number, c: number, ry = 0) {
    const g = new THREE.CylinderGeometry(r, r, len, 6);
    g.rotateZ(Math.PI / 2);
    return this.push(g, c, x, y, z, ry, 0, 0);
  }
  cone(r: number, h: number, x: number, y: number, z: number, c: number, seg = 8, ry = 0) {
    return this.push(new THREE.ConeGeometry(r, h, seg), c, x, y + h / 2, z, ry, 0, 0);
  }
  pyr(r: number, h: number, x: number, y: number, z: number, c: number) {
    return this.push(new THREE.ConeGeometry(r, h, 4), c, x, y + h / 2, z, Math.PI / 4, 0, 0);
  }
  sph(r: number, x: number, y: number, z: number, c: number, sy = 1, seg = 7) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2));
    if (sy !== 1) g.scale(1, sy, 1);
    return this.push(g, c, x, y, z, 0, 0, 0);
  }
  gable(w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) {
    const A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], C = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2], R1 = [-w / 2, h, 0], R2 = [w / 2, h, 0];
    const tris = [A, R1, R2, A, R2, B, D, C, R2, D, R2, R1, A, D, R1, B, R2, C];
    const arr = new Float32Array(tris.length * 3);
    tris.forEach((v, i) => { arr[i * 3] = v[0]; arr[i * 3 + 1] = v[1]; arr[i * 3 + 2] = v[2]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return this.push(g, c, x, y, z, ry, 0, 0);
  }
  build() {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    this.parts.forEach((p) => p.dispose());
    return g;
  }
}

const C = {
  trunk: 0x6b4a2a, pine1: 0x2f6a3a, pine2: 0x3a7a42, pine3: 0x4a8a4a, leaf1: 0x5a9a3a, leaf2: 0x6aaa44, leaf3: 0x4a8a34, palm: 0x7ab04a, cactus: 0x5a9a5a, dead: 0x6a5a4a,
};

export function treeGeometry(type: number): THREE.BufferGeometry {
  const m = new MB();
  if (type === 0) {
    m.cyl(0.05, 0.08, 0.4, 0, 0, 0, C.trunk, 5);
    m.cone(0.46, 0.6, 0, 0.22, 0, C.pine1, 7);
    m.cone(0.36, 0.55, 0, 0.55, 0, C.pine2, 7);
    m.cone(0.25, 0.5, 0, 0.88, 0, C.pine3, 7);
  } else if (type === 1) {
    m.cyl(0.06, 0.09, 0.55, 0, 0, 0, C.trunk, 5);
    m.sph(0.4, 0, 0.88, 0, C.leaf1, 0.9);
    m.sph(0.28, 0.22, 0.68, 0.06, C.leaf2, 0.9);
    m.sph(0.27, -0.2, 1.0, -0.1, C.leaf3, 0.9);
  } else if (type === 2) {
    m.cyl(0.04, 0.07, 0.5, 0, 0, 0, 0x9a7a4a, 5);
    m.cyl(0.035, 0.045, 0.4, 0.05, 0.5, 0, 0x9a7a4a, 5);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; m.box(0.5, 0.025, 0.12, 0.05 + Math.cos(a) * 0.22, 0.88, Math.sin(a) * 0.22, C.palm, -a, 0, Math.sin(a * 2) * 0.1 - 0.35); }
    m.sph(0.05, 0.05, 0.85, 0.04, 0x6a4a2a, 1, 5);
  } else if (type === 3) {
    m.cyl(0.07, 0.08, 0.6, 0, 0, 0, C.cactus, 6);
    m.cyl(0.04, 0.04, 0.2, 0.14, 0.28, 0, C.cactus, 5);
    m.box(0.16, 0.05, 0.05, 0.07, 0.28, 0, C.cactus);
    m.cyl(0.04, 0.04, 0.16, -0.13, 0.35, 0, C.cactus, 5);
    m.box(0.14, 0.05, 0.05, -0.065, 0.35, 0, C.cactus);
  } else {
    m.cyl(0.04, 0.07, 0.7, 0, 0, 0, C.dead, 5);
    m.box(0.3, 0.03, 0.03, 0.12, 0.45, 0, C.dead, 0, 0, 0.6);
    m.box(0.25, 0.03, 0.03, -0.1, 0.55, 0.03, C.dead, 0, 0, -0.7);
    m.box(0.2, 0.03, 0.03, 0.05, 0.62, -0.08, C.dead, 1, 0, 0.5);
  }
  return m.build();
}

export function depositGeometry(type: number): THREE.BufferGeometry {
  const m = new MB();
  const rock = (c: number, r = 1) => {
    m.sph(0.22 * r, 0, 0.12 * r, 0, c, 0.75, 5);
    m.sph(0.15 * r, 0.2 * r, 0.08 * r, 0.1 * r, c - 0x0a0a0a, 0.7, 5);
    m.sph(0.13 * r, -0.17 * r, 0.07 * r, -0.12 * r, c + 0x0a0a0a, 0.7, 5);
  };
  switch (type) {
    case 1: rock(0x9a9a94); break;
    case 2: rock(0x8a8a84); m.box(0.08, 0.06, 0.08, 0.08, 0.2, 0.05, 0xd0743a, 0.5); m.box(0.07, 0.05, 0.07, -0.1, 0.17, 0.0, 0x40b090, 0.2); m.box(0.06, 0.05, 0.06, 0.2, 0.15, 0.12, 0xd0743a); break;
    case 3: rock(0x8a8a90); m.box(0.08, 0.06, 0.08, 0.05, 0.2, 0.0, 0xdde4f0, 0.5); m.box(0.06, 0.05, 0.06, -0.12, 0.16, 0.05, 0xc8d0e0); break;
    case 4: rock(0x6a4a44); m.box(0.08, 0.06, 0.08, 0.07, 0.2, 0.03, 0x9a4a30, 0.4); m.box(0.07, 0.05, 0.07, -0.1, 0.16, -0.04, 0xb05a38); break;
    case 5: m.cone(0.07, 0.3, 0, 0, 0, 0xf4f4f4, 5); m.cone(0.06, 0.22, 0.12, 0, 0.05, 0xe8f0f0, 5); m.cone(0.06, 0.2, -0.1, 0, 0.1, 0xffffff, 5); m.box(0.4, 0.04, 0.4, 0, 0, 0, 0xe8e8e0); break;
    case 6: rock(0x5a5a60, 0.9); m.cone(0.05, 0.25, 0.04, 0.15, 0, 0x40e0e0, 5); m.cone(0.04, 0.2, -0.1, 0.1, 0.03, 0x30c0d8, 5); m.cone(0.04, 0.18, 0.12, 0.1, -0.05, 0xd070e0, 5); break;
    case 7: m.sph(0.34, 0, 0, 0, 0xb8683a, 0.3, 7); m.sph(0.2, 0.15, 0, 0.1, 0xc07844, 0.4, 6); break;
    case 8: m.cone(0.07, 0.5, 0, 0, 0, 0xf080ff, 5); m.cone(0.06, 0.38, 0.13, 0, 0.05, 0xd060f0, 5); m.cone(0.05, 0.3, -0.12, 0, 0.0, 0xff9aff, 5); m.cone(0.045, 0.25, 0.02, 0, -0.15, 0xe070ff, 5); m.sph(0.2, 0, 0.05, 0, 0x6a4a7a, 0.4, 5); break;
    case 9: m.sph(0.26, 0, 0.2, 0, 0x3f8a3a, 0.8); m.sph(0.18, 0.2, 0.15, 0.1, 0x4a9a42, 0.8); for (let i = 0; i < 7; i++) m.sph(0.035, Math.cos(i * 1.9) * 0.26, 0.2 + Math.sin(i * 2.7) * 0.1, Math.sin(i * 1.9) * 0.24, 0x8a2aa0, 1, 4); break;
    default: for (let i = 0; i < 9; i++) { const a = i * 0.9; m.cone(0.03, 0.35 + (i % 3) * 0.08, Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14, i % 2 ? 0xb8cc58 : 0xa0b840, 4); }
  }
  return m.build();
}

export function siteGeometry(kind: string): THREE.BufferGeometry {
  const m = new MB();
  if (kind === 'cave') {
    m.sph(0.8, 0, 0.1, 0, 0x6a655c, 0.8, 6);
    m.sph(0.5, 0.6, 0.1, 0.3, 0x756f66, 0.8, 6);
    m.box(0.55, 0.65, 0.3, 0, 0, 0.55, 0x15110e);
    m.box(0.15, 0.8, 0.2, -0.38, 0, 0.5, 0x8a8478);
    m.box(0.15, 0.8, 0.2, 0.38, 0, 0.5, 0x8a8478);
    m.box(0.9, 0.18, 0.25, 0, 0.62, 0.5, 0x7a746a);
  } else if (kind === 'ruin') {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; const h = 0.5 + ((i * 37) % 5) * 0.12; m.box(0.2, i % 3 === 0 ? 0.25 : h, 0.2, Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9, 0xb4ad9e - i * 0x040404, a); }
    m.box(0.9, 0.12, 0.3, 0.1, 0, 0.1, 0xa49d8e, 0.5);
    m.box(0.3, 0.2, 0.3, -0.3, 0, -0.2, 0xa49d8e, 0.2);
    m.box(0.25, 0.1, 0.5, 0.4, 0, -0.3, 0x9a9384, 1.2, 0, 0);
  } else {
    m.box(0.55, 0.12, 0.55, 0, 0, 0, 0x8a857a);
    m.box(0.3, 1.7, 0.2, 0, 0.1, 0, 0x9a968c, 0.3);
    m.pyr(0.2, 0.25, 0, 1.78, 0, 0x8a867c);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; m.box(0.16, 0.3, 0.12, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0x8a857a, a); }
  }
  return m.build();
}

export function citizenGeometry(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry; bundle: THREE.BufferGeometry } {
  const b = new MB();
  b.cyl(0.075, 0.1, 0.24, 0, 0.13, 0, 0xffffff, 6);
  b.box(0.045, 0.14, 0.06, -0.04, 0, 0, 0x6a4a30);
  b.box(0.045, 0.14, 0.06, 0.04, 0, 0, 0x6a4a30);
  b.box(0.04, 0.16, 0.05, -0.11, 0.2, 0, 0xe8e0d8);
  b.box(0.04, 0.16, 0.05, 0.11, 0.2, 0, 0xe8e0d8);
  const h = new MB();
  h.sph(0.075, 0, 0.45, 0, 0xe0b090, 1, 6);
  h.sph(0.08, 0, 0.47, -0.012, 0x3a2a1c, 0.7, 5);
  const bu = new MB();
  bu.box(0.16, 0.12, 0.12, 0, 0.37, -0.1, 0xffffff);
  return { body: b.build(), head: h.build(), bundle: bu.build() };
}

export function animalGeometry(type: number): THREE.BufferGeometry {
  const m = new MB();
  if (type === 0) {
    const c = 0xb08050;
    m.box(0.5, 0.26, 0.2, 0, 0.3, 0, c);
    for (const [x, z] of [[-0.18, -0.07], [-0.18, 0.07], [0.18, -0.07], [0.18, 0.07]]) m.box(0.05, 0.3, 0.05, x, 0, z, 0x7a5a38);
    m.box(0.12, 0.3, 0.1, 0.27, 0.45, 0, c, 0, 0, -0.4);
    m.box(0.16, 0.1, 0.1, 0.4, 0.68, 0, c);
    m.box(0.03, 0.18, 0.03, 0.4, 0.76, -0.04, 0xe8dcc0, 0, 0.3, 0);
    m.box(0.03, 0.18, 0.03, 0.4, 0.76, 0.04, 0xe8dcc0, 0, -0.3, 0);
    m.box(0.08, 0.08, 0.06, -0.28, 0.4, 0, 0xf0e8d8);
  } else if (type === 1) {
    const c = 0x5a4434;
    m.box(0.46, 0.28, 0.26, 0, 0.22, 0, c);
    for (const [x, z] of [[-0.15, -0.08], [-0.15, 0.08], [0.15, -0.08], [0.15, 0.08]]) m.box(0.05, 0.2, 0.05, x, 0, z, 0x3a2c20);
    m.box(0.2, 0.2, 0.2, 0.3, 0.2, 0, 0x4a3828);
    m.box(0.07, 0.07, 0.06, 0.42, 0.22, 0, 0x2a2018);
    m.box(0.02, 0.07, 0.02, 0.4, 0.3, -0.06, 0xf0e8d0, 0, 0, 0);
    m.box(0.02, 0.07, 0.02, 0.4, 0.3, 0.06, 0xf0e8d0);
  } else if (type === 2) {
    const c = 0x6a4a34;
    m.box(0.9, 0.55, 0.5, 0, 0.45, 0, c);
    m.sph(0.3, 0.1, 1.0, 0, c, 0.7);
    for (const [x, z] of [[-0.3, -0.18], [-0.3, 0.18], [0.3, -0.18], [0.3, 0.18]]) m.box(0.16, 0.5, 0.16, x, 0, z, 0x4a3224);
    m.box(0.3, 0.3, 0.3, 0.58, 0.62, 0, c);
    m.box(0.12, 0.5, 0.12, 0.74, 0.15, 0, c, 0, 0, 0.1);
    m.box(0.05, 0.5, 0.05, 0.68, 0.35, -0.16, 0xf0e8d0, 0, 0, -0.6);
    m.box(0.05, 0.5, 0.05, 0.68, 0.35, 0.16, 0xf0e8d0, 0, 0, -0.6);
  } else {
    const c = 0x6e7076;
    m.box(0.44, 0.2, 0.16, 0, 0.26, 0, c);
    for (const [x, z] of [[-0.16, -0.06], [-0.16, 0.06], [0.16, -0.06], [0.16, 0.06]]) m.box(0.04, 0.26, 0.04, x, 0, z, 0x4a4c52);
    m.box(0.15, 0.15, 0.13, 0.28, 0.32, 0, c);
    m.box(0.1, 0.07, 0.08, 0.4, 0.3, 0, 0x5a5c62);
    m.box(0.04, 0.06, 0.03, 0.28, 0.46, -0.04, c); m.box(0.04, 0.06, 0.03, 0.28, 0.46, 0.04, c);
    m.box(0.22, 0.05, 0.05, -0.28, 0.32, 0, c, 0, 0, 0.4);
  }
  return m.build();
}
