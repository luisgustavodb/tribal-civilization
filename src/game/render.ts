import * as THREE from 'three';
import { N, V, BMAP, JOBS, RES, DEP, BIO } from './data';
import type { Game } from './sim';
import { heightAt, tileIdx } from './world';
import { treeGeometry, depositGeometry, siteGeometry, citizenGeometry, animalGeometry } from './models';
import { buildingGeometry, scaffoldGeometry, buildingHeight } from './buildings3d';
import { computeOverlay } from './overlays';
import { clamp, lerp, smooth } from './rng';
import { dangerAt } from './tribes';

const SMOKERS: Record<string, number> = { campfire: 2.5, hearth: 4, cooking: 1.5, potter: 2, foundry: 4, ironworks: 5, workshop: 1, elders: 1.5, salt_works: 0.3 };
const ANIMAL_SCALE = [0.95, 0.85, 1.7, 0.9];
const OPEN = new Set(['farm', 'pen', 'campfire', 'hearth', 'meeting', 'market', 'elders', 'totem', 'great_hall', 'monument', 'temple', 'quarry', 'clay_pit', 'salt_works', 'water_spot', 'fishing', 'storage_pile', 'trading_post', 'hunting_camp', 'gatherer', 'woodcutter', 'outpost', 'resource_camp', 'palisade', 'stone_wall', 'irrigation', 'well', 'cooking', 'lookout']);

export interface Hover { x: number; z: number; tile: number; valid: boolean; msg: string; tiles: { x: number; z: number; ok: boolean }[]; bx: number; bz: number; cost: boolean }

export class Renderer {
  g: Game;
  el: HTMLElement;
  r: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(50, 1, 0.3, 700);
  labels: HTMLDivElement;
  raf = 0;
  last = performance.now();
  time = 0;
  // camera state
  tgt = new THREE.Vector3(N / 2, 0, N / 2);
  tgtGoal = new THREE.Vector3(N / 2, 0, N / 2);
  dist = 230; distGoal = 230; yaw = 0.6; yawGoal = 0.6; tilt = 0; tiltGoal = 0;
  keys = new Set<string>();
  drag: { btn: number; x: number; y: number; moved: number; sx: number; sy: number } | null = null;
  mouse = { x: 0, y: 0, in: false };
  hover: Hover | null = null;
  dragStart: { x: number; z: number } | null = null;
  lineTiles: { x: number; z: number }[] = [];
  onClickGround: ((x: number, z: number) => void) | null = null;
  autoOrbit = true;
  // meshes
  terrain!: THREE.Mesh; water!: THREE.Mesh;
  tUni: any; wUni: any;
  roadCanvas = document.createElement('canvas');
  roadTex!: THREE.CanvasTexture;
  overTex!: THREE.DataTexture;
  overData = new Uint8ClampedArray(N * N * 4);
  sun = new THREE.DirectionalLight(0xffffff, 2);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a6a3a, 0.8);
  treeMeshes: THREE.InstancedMesh[] = [];
  treeSlot: Int32Array = new Int32Array(0);
  depMeshes: THREE.InstancedMesh[] = [];
  depSlot = new Map<number, { t: number; i: number }>();
  depCount: number[] = [];
  bMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  bEntries = new Map<number, { group: THREE.Group; mesh: THREE.Mesh; scaf: THREE.Mesh | null; key: string; state: string; type: string }>();
  geoCache = new Map<string, THREE.BufferGeometry>();
  scafCache = new Map<string, THREE.BufferGeometry>();
  cBody!: THREE.InstancedMesh; cHead!: THREE.InstancedMesh; cBundle!: THREE.InstancedMesh;
  aMeshes: THREE.InstancedMesh[] = [];
  siteMeshes: THREE.Mesh[] = [];
  banners: THREE.Group[] = [];
  ghost: THREE.Mesh | null = null; ghostType = ''; ghostRot = -1;
  ghostMat = new THREE.MeshLambertMaterial({ color: 0x66ff88, transparent: true, opacity: 0.6, flatShading: true, side: THREE.DoubleSide });
  tileQuads: THREE.Mesh;
  marker: THREE.Mesh;
  routeLines: THREE.Group = new THREE.Group();
  // particles
  P = { max: 3500, n: 0, pos: new Float32Array(3500 * 3), vel: new Float32Array(3500 * 3), age: new Float32Array(3500), life: new Float32Array(3500), s0: new Float32Array(3500), s1: new Float32Array(3500), col: new Float32Array(3500 * 3), a0: new Float32Array(3500), aSize: new Float32Array(3500), aAlpha: new Float32Array(3500), aCol: new Float32Array(3500 * 3), geo: new THREE.BufferGeometry(), pts: null as any };
  weather: { pts: THREE.Points; lx: Float32Array; ly: Float32Array; lz: Float32Array; mat: THREE.PointsMaterial };
  emitAcc = new Map<number, number>();
  snow = 0; dry = 0; auto = 0; flood = 0; shade = 1;
  overlayAcc = 0; lastOverlay = '';
  labelEls = new Map<string, HTMLDivElement>();
  dummy = new THREE.Object3D();
  tmpV = new THREE.Vector3();
  resize: ResizeObserver;
  lastTrees = 0;

  constructor(el: HTMLElement, g: Game) {
    this.g = g; this.el = el;
    this.r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(this.r.domElement);
    this.r.domElement.style.display = 'block';
    this.labels = document.createElement('div');
    this.labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    el.appendChild(this.labels);
    this.scene.background = new THREE.Color(0x9ac8e8);
    this.scene.fog = new THREE.Fog(0x9ac8e8, 80, 380);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.buildTerrain();
    this.buildWater();
    this.oceanMat = new THREE.MeshBasicMaterial({ color: 0x1a5a8a });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), this.oceanMat);
    ocean.position.set(N / 2, -0.3, N / 2);
    this.scene.add(ocean);
    this.buildVegetation();
    this.buildSites();
    this.buildCreatures();
    this.buildBanners();
    this.buildParticles();
    this.weather = this.buildWeather();
    // tile quads (placement preview)
    this.tileQuads = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.tileQuads.frustumCulled = false; this.tileQuads.renderOrder = 3;
    this.scene.add(this.tileQuads);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.9, depthTest: false }));
    this.marker.visible = false; this.marker.renderOrder = 5;
    this.scene.add(this.marker);
    this.scene.add(this.routeLines);
    // events
    const d = this.r.domElement;
    d.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    d.addEventListener('wheel', this.onWheel, { passive: false });
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerleave', () => { this.mouse.in = false; });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.resize = new ResizeObserver(() => this.onResize());
    this.resize.observe(el);
    this.onResize();
    this.updateCamera(1);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.r.dispose();
    this.r.domElement.remove();
    this.labels.remove();
  }
  onResize = () => {
    const w = this.el.clientWidth || 800, h = this.el.clientHeight || 600;
    this.r.setSize(w, h);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  };

  // ---------------- terrain ----------------
  buildTerrain() {
    const W = this.g.world;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3);
    for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
      const i = z * V + x;
      pos[i * 3] = x; pos[i * 3 + 1] = W.h[i]; pos[i * 3 + 2] = z;
      col[i * 3] = Math.pow(W.vcolor[i * 3], 2.2); col[i * 3 + 1] = Math.pow(W.vcolor[i * 3 + 1], 2.2); col[i * 3 + 2] = Math.pow(W.vcolor[i * 3 + 2], 2.2);
    }
    const idx = new Uint32Array(N * N * 6);
    let k = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const a = z * V + x, b = a + 1, c = a + V, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    // textures
    this.roadCanvas.width = this.roadCanvas.height = N * 8;
    this.roadTex = new THREE.CanvasTexture(this.roadCanvas);
    this.roadTex.flipY = false; this.roadTex.colorSpace = THREE.SRGBColorSpace; this.roadTex.anisotropy = 8;
    this.overTex = new THREE.DataTexture(new Uint8Array(N * N * 4), N, N, THREE.RGBAFormat);
    this.overTex.colorSpace = THREE.SRGBColorSpace; this.overTex.magFilter = THREE.LinearFilter; this.overTex.minFilter = THREE.LinearFilter; this.overTex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.tUni = { uRoad: { value: this.roadTex }, uOver: { value: this.overTex }, uSnow: { value: 0 }, uDry: { value: 0 }, uAuto: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.tUni);
      sh.vertexShader = 'varying vec2 vTUv; varying float vH; varying float vUp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vTUv = position.xz / ${N}.0; vH = position.y; vUp = normal.y;`);
      sh.fragmentShader = 'varying vec2 vTUv; varying float vH; varying float vUp; uniform sampler2D uRoad; uniform sampler2D uOver; uniform float uSnow; uniform float uDry; uniform float uAuto;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float grassy = smoothstep(0.82, 0.95, vUp) * (1.0 - smoothstep(6.0, 9.0, vH)) * step(0.4, vH);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.22, 0.86, 0.58), uAuto * 0.55 * grassy);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.5, 0.26), uDry * 0.5 * grassy);
        float snow = uSnow * smoothstep(0.55, 0.8, vUp) * step(0.25, vH);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.98), snow * 0.9);
        vec4 rd = texture2D(uRoad, vTUv);
        diffuseColor.rgb = mix(diffuseColor.rgb, rd.rgb, rd.a);
        vec4 ov = texture2D(uOver, vTUv);
        diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a);`);
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.drawRoads();
  }
  updateTerrainHeights() {
    const W = this.g.world;
    const p = this.terrain.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < V * V; i++) p.setY(i, W.h[i]);
    p.needsUpdate = true;
    this.terrain.geometry.computeVertexNormals();
    const wp = this.water.geometry.attributes.position as THREE.BufferAttribute;
    const dp = this.water.geometry.attributes.depth as THREE.BufferAttribute;
    for (let i = 0; i < V * V; i++) { if (W.wet[i]) { wp.setY(i, W.surf[i]); dp.setX(i, W.surf[i] - W.h[i]); } else wp.setY(i, W.h[i] - 0.25); }
    wp.needsUpdate = true; dp.needsUpdate = true;
  }
  drawRoads() {
    const ctx = this.roadCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, N * 8, N * 8);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const road = this.g.road;
    const links: [number, number][] = [[1, 0], [0, 1], [1, 1], [-1, 1]];
    for (const pass of [0, 1]) {
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const k = road[z * N + x];
        if (!k) continue;
        const cx = x * 8 + 4, cz = z * 8 + 4;
        const col = pass === 0 ? (k === 2 ? '#5f5b54' : '#6a4e30') : k === 2 ? '#a29d92' : '#9a7a52';
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.lineWidth = pass === 0 ? 8.5 : 6;
        ctx.beginPath(); ctx.arc(cx, cz, ctx.lineWidth / 2, 0, 7); ctx.fill();
        for (const [dx, dz] of links) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N || !road[nz * N + nx]) continue;
          ctx.beginPath(); ctx.moveTo(cx, cz); ctx.lineTo(nx * 8 + 4, nz * 8 + 4); ctx.stroke();
        }
      }
    }
    this.roadTex.needsUpdate = true;
  }
  buildWater() {
    const W = this.g.world;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(V * V * 3), depth = new Float32Array(V * V), flow = new Float32Array(V * V * 2), isR = new Float32Array(V * V);
    for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
      const i = z * V + x;
      pos[i * 3] = x; pos[i * 3 + 2] = z;
      if (W.wet[i]) { pos[i * 3 + 1] = W.surf[i]; depth[i] = Math.max(0.02, W.surf[i] - W.h[i]); }
      else { pos[i * 3 + 1] = W.h[i] - 0.25; depth[i] = -0.3; }
      flow[i * 2] = W.flow[i * 2]; flow[i * 2 + 1] = W.flow[i * 2 + 1];
      isR[i] = W.wet[i] === 3 ? 1 : 0;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
    geo.setAttribute('flow', new THREE.BufferAttribute(flow, 2));
    geo.setAttribute('isRiver', new THREE.BufferAttribute(isR, 1));
    geo.setIndex((this.terrain.geometry.index as THREE.BufferAttribute).clone());
    this.wUni = { uTime: { value: 0 }, uFlood: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 80 }, uFogFar: { value: 380 }, uLight: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.wUni, transparent: true, depthWrite: false,
      vertexShader: `attribute float depth; attribute vec2 flow; attribute float isRiver; uniform float uFlood;
        varying vec3 vW; varying float vD; varying vec2 vF; varying float vR; varying float vZ;
        void main(){ vec3 p = position; float fl = uFlood * isRiver; p.y += fl * 0.7; vec4 mv = modelViewMatrix * vec4(p,1.0);
          vZ = -mv.z; vW = p; vD = depth + fl * 0.7 + fl * 0.0; vF = flow; vR = isRiver; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLight;
        varying vec3 vW; varying float vD; varying vec2 vF; varying float vR; varying float vZ;
        void main(){
          float a = smoothstep(0.0, 0.3, vD); if (a < 0.01) discard;
          float dp = clamp(vD / 5.0, 0.0, 1.0);
          vec3 col = mix(vec3(0.3,0.74,0.76), vec3(0.08,0.3,0.55), smoothstep(0.0, 1.0, dp));
          col = mix(col, vec3(0.27,0.62,0.72), vR * 0.6);
          float fl = length(vF); float st = 0.0;
          if (fl > 0.01) { vec2 fd = vF / fl; float s = dot(vW.xz, fd) * 3.2 - uTime * 2.4; float c = dot(vW.xz, vec2(-fd.y, fd.x)) * 2.3;
            st = smoothstep(0.72, 1.0, sin(s + sin(c * 1.7) * 1.6)); }
          else { st = smoothstep(0.84, 1.0, sin(vW.x*1.7 + uTime*0.9 + sin(vW.z*1.3 + uTime*0.6)*1.5) * sin(vW.z*1.9 - uTime*0.7 + sin(vW.x*1.1)*1.2)); }
          col += st * 0.2;
          float foam = (1.0 - smoothstep(0.0, 0.25, vD)) * (0.55 + 0.45 * sin(vW.x*3.0 + vW.z*3.0 + uTime*2.0));
          col = mix(col, vec3(1.0), foam * 0.5);
          col *= uLight;
          float f = clamp((vZ - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
          col = mix(col, uFogColor, f);
          gl_FragColor = vec4(col, a * 0.85 + 0.1 * dp);
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.renderOrder = 1;
    this.water.frustumCulled = false;
    this.scene.add(this.water);
  }

  // ---------------- vegetation ----------------
  buildVegetation() {
    const W = this.g.world;
    const counts = [0, 0, 0, 0, 0];
    for (const t of W.trees) counts[t.type]++;
    this.treeSlot = new Int32Array(W.trees.length);
    const geos = [0, 1, 2, 3, 4].map((t) => treeGeometry(t));
    const mats = [0, 1, 2, 3, 4].map(() => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.treeMeshes = geos.map((geo, i) => {
      const m = new THREE.InstancedMesh(geo, mats[i], Math.max(1, counts[i]));
      m.castShadow = true; m.frustumCulled = false; m.count = counts[i];
      this.scene.add(m);
      return m;
    });
    const fill = [0, 0, 0, 0, 0];
    const d = this.dummy;
    W.trees.forEach((t, idx) => {
      const y = heightAt(W, t.x, t.z);
      d.position.set(t.x, y - 0.02, t.z); d.rotation.set(0, t.r, 0);
      const s = t.s * (t.type === 3 ? 0.9 : 1.1);
      d.scale.set(s, s * (0.9 + (t.r % 1) * 0.3), s);
      if (!W.treeAlive[idx]) d.scale.setScalar(0);
      d.updateMatrix();
      const m = this.treeMeshes[t.type];
      m.setMatrixAt(fill[t.type], d.matrix);
      const c = new THREE.Color().setHSL(0.0, 0, 0.9 + (t.r % 1) * 0.18);
      m.setColorAt(fill[t.type], c);
      this.treeSlot[idx] = fill[t.type]++;
    });
    this.treeMeshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    // deposits
    const dc = new Array(11).fill(0);
    for (let t = 0; t < N * N; t++) if (W.dep[t]) dc[W.dep[t]]++;
    this.depCount = new Array(11).fill(0);
    for (let ty = 1; ty <= 10; ty++) {
      const m = new THREE.InstancedMesh(depositGeometry(ty), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), dc[ty] + 200);
      m.castShadow = true; m.frustumCulled = false; m.count = 0;
      this.scene.add(m);
      this.depMeshes[ty] = m;
    }
    for (let t = 0; t < N * N; t++) if (W.dep[t]) this.addDeposit(t);
    this.flushDeposits();
  }
  addDeposit(t: number) {
    const W = this.g.world;
    const ty = W.dep[t];
    const m = this.depMeshes[ty];
    if (!m || this.depCount[ty] >= m.instanceMatrix.count) return;
    const i = this.depCount[ty]++;
    const x = (t % N) + 0.5 + ((t * 7919) % 100) / 400 - 0.12, z = Math.floor(t / N) + 0.5 + ((t * 104729) % 100) / 400 - 0.12;
    const s = 0.8 + clamp(W.depMax[t] / 200, 0, 1) * 0.5 + (ty >= 9 ? 0.15 : 0);
    this.dummy.position.set(x, heightAt(W, x, z), z); this.dummy.rotation.set(0, (t * 13) % 6.28, 0); this.dummy.scale.setScalar(s); this.dummy.updateMatrix();
    m.setMatrixAt(i, this.dummy.matrix);
    m.count = this.depCount[ty];
    this.depSlot.set(t, { t: ty, i });
  }
  flushDeposits() { for (let ty = 1; ty <= 10; ty++) if (this.depMeshes[ty]) this.depMeshes[ty].instanceMatrix.needsUpdate = true; }
  buildSites() {
    const W = this.g.world;
    for (const s of W.sites) {
      const m = new THREE.Mesh(siteGeometry(s.kind), this.bMat);
      m.position.set(s.x, heightAt(W, s.x, s.z), s.z);
      m.rotation.y = (s.tile * 17) % 6.28;
      m.scale.setScalar(s.kind === 'cave' ? 1.3 : 1);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      this.siteMeshes.push(m);
    }
  }
  buildCreatures() {
    const cg = citizenGeometry();
    const bm = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.cBody = new THREE.InstancedMesh(cg.body, bm, 2500);
    this.cHead = new THREE.InstancedMesh(cg.head, bm, 2500);
    this.cBundle = new THREE.InstancedMesh(cg.bundle, bm, 2500);
    for (const m of [this.cBody, this.cHead, this.cBundle]) { m.castShadow = true; m.frustumCulled = false; m.count = 0; this.scene.add(m); }
    this.cBody.setColorAt(0, new THREE.Color(1, 1, 1)); this.cBundle.setColorAt(0, new THREE.Color(1, 1, 1));
    for (let t = 0; t < 4; t++) {
      const m = new THREE.InstancedMesh(animalGeometry(t), bm, 260);
      m.castShadow = true; m.frustumCulled = false; m.count = 0;
      this.scene.add(m); this.aMeshes.push(m);
    }
  }
  buildBanners() {
    for (const t of this.g.tribes) {
      const gr = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a20 }));
      pole.position.y = 2.1;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.05), new THREE.MeshLambertMaterial({ color: t.color }));
      flag.position.set(0.8, 3.7, 0);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 0.06), new THREE.MeshLambertMaterial({ color: t.accent }));
      stripe.position.set(0.8, 3.7, 0);
      gr.add(pole, flag, stripe);
      gr.traverse((o) => { o.castShadow = true; });
      this.scene.add(gr);
      this.banners.push(gr);
    }
  }
  buildParticles() {
    const P = this.P;
    P.geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
    P.geo.setAttribute('aSize', new THREE.BufferAttribute(P.aSize, 1));
    P.geo.setAttribute('aAlpha', new THREE.BufferAttribute(P.aAlpha, 1));
    P.geo.setAttribute('aColor', new THREE.BufferAttribute(P.aCol, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC;
        void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * (320.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.05, r)); }`,
    });
    P.pts = new THREE.Points(P.geo, mat);
    P.pts.frustumCulled = false; P.pts.renderOrder = 4;
    this.scene.add(P.pts);
  }
  buildWeather() {
    const n = 1800;
    const lx = new Float32Array(n), ly = new Float32Array(n), lz = new Float32Array(n);
    for (let i = 0; i < n; i++) { lx[i] = Math.random() * 80; ly[i] = Math.random() * 40; lz[i] = Math.random() * 80; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0xbfd4e8, size: 0.14, transparent: true, opacity: 0.7, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.visible = false;
    this.scene.add(pts);
    return { pts, lx, ly, lz, mat };
  }

  // particles
  spawn(kind: string, x: number, y: number, z: number) {
    const P = this.P;
    if (P.n >= P.max) return;
    const i = P.n++;
    const r = Math.random;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z; P.age[i] = 0;
    let c = [0.7, 0.7, 0.7];
    switch (kind) {
      case 'smoke': P.vel[i * 3] = (r() - 0.5) * 0.2 + 0.15; P.vel[i * 3 + 1] = 0.6 + r() * 0.3; P.vel[i * 3 + 2] = (r() - 0.5) * 0.2; P.life[i] = 3 + r() * 2; P.s0[i] = 0.25; P.s1[i] = 1.3; P.a0[i] = 0.5; c = [0.62, 0.62, 0.64]; break;
      case 'dust': P.vel[i * 3] = (r() - 0.5) * 0.9; P.vel[i * 3 + 1] = 0.3 + r() * 0.5; P.vel[i * 3 + 2] = (r() - 0.5) * 0.9; P.life[i] = 0.9 + r() * 0.6; P.s0[i] = 0.25; P.s1[i] = 0.7; P.a0[i] = 0.55; c = [0.78, 0.68, 0.5]; break;
      case 'fire': P.vel[i * 3] = (r() - 0.5) * 0.3; P.vel[i * 3 + 1] = 1.2 + r() * 0.8; P.vel[i * 3 + 2] = (r() - 0.5) * 0.3; P.life[i] = 0.8 + r() * 0.5; P.s0[i] = 0.5; P.s1[i] = 0.15; P.a0[i] = 0.9; c = r() < 0.5 ? [1, 0.55, 0.1] : [1, 0.8, 0.2]; break;
      case 'clash': P.vel[i * 3] = (r() - 0.5) * 2.5; P.vel[i * 3 + 1] = 0.5 + r() * 1.5; P.vel[i * 3 + 2] = (r() - 0.5) * 2.5; P.life[i] = 0.5 + r() * 0.3; P.s0[i] = 0.25; P.s1[i] = 0.05; P.a0[i] = 1; c = [1, 0.95, 0.6]; break;
      default: P.vel[i * 3] = (r() - 0.5) * 0.7; P.vel[i * 3 + 1] = 0.8 + r() * 1.0; P.vel[i * 3 + 2] = (r() - 0.5) * 0.7; P.life[i] = 1.2 + r(); P.s0[i] = 0.2; P.s1[i] = 0.05; P.a0[i] = 1; c = [1, 0.85, 0.35];
    }
    P.col[i * 3] = c[0]; P.col[i * 3 + 1] = c[1]; P.col[i * 3 + 2] = c[2];
  }
  updateParticles(dt: number) {
    const P = this.P;
    for (let i = 0; i < P.n; i++) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) {
        const l = --P.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { P.pos[i * 3 + k] = P.pos[l * 3 + k]; P.vel[i * 3 + k] = P.vel[l * 3 + k]; P.col[i * 3 + k] = P.col[l * 3 + k]; }
          P.age[i] = P.age[l]; P.life[i] = P.life[l]; P.s0[i] = P.s0[l]; P.s1[i] = P.s1[l]; P.a0[i] = P.a0[l];
        }
        i--; continue;
      }
      const t = P.age[i] / P.life[i];
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      P.aSize[i] = lerp(P.s0[i], P.s1[i], t);
      P.aAlpha[i] = P.a0[i] * (1 - t) * Math.min(1, t * 8);
      P.aCol[i * 3] = P.col[i * 3]; P.aCol[i * 3 + 1] = P.col[i * 3 + 1]; P.aCol[i * 3 + 2] = P.col[i * 3 + 2];
    }
    P.geo.setDrawRange(0, P.n);
    (P.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (P.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (P.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (P.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }

  // ---------------- buildings ----------------
  geoFor(type: string, style: number, mask: number) {
    const k = `${type}|${style}|${mask}`;
    let g = this.geoCache.get(k);
    if (!g) { g = buildingGeometry(type, style, mask); this.geoCache.set(k, g); }
    return g;
  }
  scafFor(w: number, d: number, h: number) {
    const k = `${w}|${d}|${h}`;
    let g = this.scafCache.get(k);
    if (!g) { g = scaffoldGeometry(w, d, h); this.scafCache.set(k, g); }
    return g;
  }
  syncBuildings() {
    const g = this.g;
    const seen = new Set<number>();
    for (const b of g.buildings) {
      seen.add(b.id);
      const style = b.owner === 0 ? -1 : b.style;
      const def = BMAP[b.type];
      const key = `${b.type}|${style}|${def.wall ? b.mask : 0}|${b.rot}|${b.ver}`;
      let e = this.bEntries.get(b.id);
      if (!e) {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(this.geoFor(b.type, style, def.wall ? b.mask : 0), this.bMat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        this.scene.add(group);
        e = { group, mesh, scaf: null, key, state: '', type: b.type };
        this.bEntries.set(b.id, e);
      } else if (e.key !== key) {
        e.mesh.geometry = this.geoFor(b.type, style, def.wall ? b.mask : 0);
        e.key = key; e.type = b.type;
        if (e.scaf) { e.group.remove(e.scaf); e.scaf = null; }
      }
      e.group.position.set(b.cx, b.y, b.cz);
      e.group.rotation.y = b.rot ? Math.PI / 2 : 0;
      const building = b.state !== 'ready';
      if (b.state === 'building') {
        const p = b.progress;
        e.mesh.scale.set(0.9 + 0.1 * p, 0.1 + 0.9 * (1 - Math.pow(1 - p, 2)), 0.9 + 0.1 * p);
      } else e.mesh.scale.set(1, 1, 1);
      if (building) {
        if (!e.scaf) {
          const h = buildingHeight(b.state === 'upgrading' && b.upTo ? b.upTo : b.type);
          const nd = b.state === 'upgrading' && b.upTo ? BMAP[b.upTo] : def;
          e.scaf = new THREE.Mesh(this.scafFor(b.rot ? nd.d : nd.w, b.rot ? nd.w : nd.d, h), this.bMat);
          e.scaf.castShadow = true;
          e.group.add(e.scaf);
        }
        e.scaf.scale.y = 0.35 + 0.65 * Math.min(1, b.progress * 1.5 + 0.1);
      } else if (e.scaf) { e.group.remove(e.scaf); e.scaf = null; }
      e.state = b.state;
    }
    for (const [id, e] of this.bEntries) if (!seen.has(id)) { this.scene.remove(e.group); this.bEntries.delete(id); }
  }

  // ---------------- creatures ----------------
  syncCreatures(dt: number) {
    const g = this.g, W = g.world, d = this.dummy;
    let n = 0, nb = 0;
    const col = new THREE.Color();
    const place = (x: number, z: number, ang: number, scale: number, color: number, moving: boolean, working: boolean, id: number, carry: string | null) => {
      if (n >= 2400) return;
      const bob = moving || working ? Math.abs(Math.sin(this.time * 9 + id)) * 0.035 : 0;
      d.position.set(x, heightAt(W, x, z) + bob, z);
      d.rotation.set(working ? 0.35 + Math.sin(this.time * 6 + id) * 0.2 : 0, -ang + Math.PI / 2 * 0, 0);
      d.scale.setScalar(scale); d.updateMatrix();
      this.cBody.setMatrixAt(n, d.matrix); this.cHead.setMatrixAt(n, d.matrix);
      col.setHex(color); this.cBody.setColorAt(n, col);
      if (carry && nb < 2400) { this.cBundle.setMatrixAt(nb, d.matrix); col.set(carry === 'builder' ? 0x8a6a40 : (RES as any)[carry]?.color || '#aa8844'); this.cBundle.setColorAt(nb, col); nb++; }
      n++;
    };
    const sel = g.selected;
    let selPos: { x: number; z: number } | null = null;
    for (const c of g.citizens) {
      if (!c.alive || c.hidden) continue;
      const t = tileIdx(c.x, c.z);
      if (t >= 0 && g.occ[t]) { const bb = g.bById.get(g.occ[t]); if (bb && bb.state !== 'building' && !OPEN.has(bb.type)) continue; }
      const moving = Math.hypot(c.tx - c.x, c.tz - c.z) > 0.3 && c.act !== 'sleep';
      let color = JOBS[c.job]?.color ?? 0xb8a98a;
      if (c.age < 12) color = 0xf0d890;
      else if (c.age > 55) color = 0xd8d8e0;
      place(c.x, c.z, c.ang, c.age < 12 ? 0.62 + Math.min(0.2, c.age * 0.02) : c.age > 55 ? 0.95 : 1, color, moving, c.working, c.id, c.carry ? (c.job === 'builder' ? 'builder' : c.carry) : null);
      if (sel && sel.kind === 'citizen' && sel.id === c.id) selPos = { x: c.x, z: c.z };
    }
    for (const a of g.ambients) { if (a.hide) continue; const t = g.tribes[a.tribe - 1]; place(a.x, a.z, Math.atan2(a.tz - a.z, a.tx - a.x), 1, t.color, Math.hypot(a.tx - a.x, a.tz - a.z) > 0.3, false, a.id, null); }
    for (const c of g.caravans) {
      const t = g.tribes[(c.amb ? c.fromTribe : 0) - 1];
      const ang = Math.atan2(c.tz - c.z, c.tx - c.x);
      const mv = c.state !== 'wait';
      const col2 = c.amb ? (t?.color ?? 0xd0a060) : 0xd04aa0;
      const ca = c.state === 'back' ? Math.atan2(c.oz - c.z, c.ox - c.x) : ang;
      for (let k = 0; k < 3; k++) place(c.x - Math.cos(ca) * k * 0.55 + Math.sin(ca) * (k % 2 ? 0.2 : -0.2), c.z - Math.sin(ca) * k * 0.55, ca, 1, col2, mv, false, c.id + k, k > 0 ? (c.state === 'out' ? c.give : c.get) : null);
    }
    for (const r of g.raids) {
      const ang = Math.atan2(r.tz - r.z, r.tx - r.x);
      const t = g.tribes[r.tribe - 1];
      r.members.forEach((m, k) => place(r.x + m.dx, r.z + m.dz, r.state === 'fight' ? ang + Math.sin(this.time * 4 + k) : ang, 1.08, t.color, r.state !== 'fight', r.state === 'fight', r.id + k, null));
    }
    this.cBody.count = n; this.cHead.count = n; this.cBundle.count = nb;
    this.cBody.instanceMatrix.needsUpdate = true; this.cHead.instanceMatrix.needsUpdate = true; this.cBundle.instanceMatrix.needsUpdate = true;
    if (this.cBody.instanceColor) this.cBody.instanceColor.needsUpdate = true;
    if (this.cBundle.instanceColor) this.cBundle.instanceColor.needsUpdate = true;
    // animals
    const cnt = [0, 0, 0, 0];
    for (const a of g.animals) {
      if (!a.alive) continue;
      const m = this.aMeshes[a.type];
      if (cnt[a.type] >= 255) continue;
      const mv = Math.hypot(a.tx - a.x, a.tz - a.z) > 0.2;
      d.position.set(a.x, heightAt(W, a.x, a.z) + (mv ? Math.abs(Math.sin(this.time * 7 + a.id)) * 0.03 : 0), a.z);
      const graze = !mv && a.type !== 3 && (Math.floor(this.time * 0.4 + a.id) % 3 === 0);
      d.rotation.set(0, -a.ang, graze ? 0.0 : 0);
      if (graze) d.rotation.z = -0.08;
      d.scale.setScalar(ANIMAL_SCALE[a.type]); d.updateMatrix();
      m.setMatrixAt(cnt[a.type]++, d.matrix);
    }
    this.aMeshes.forEach((m, i) => { m.count = cnt[i]; m.instanceMatrix.needsUpdate = true; });
    // selection ring
    if (selPos) { this.marker.visible = true; this.marker.position.set(selPos.x, heightAt(W, selPos.x, selPos.z) + 0.08, selPos.z); this.marker.scale.setScalar(0.35); }
    else if (sel && sel.kind === 'building') {
      const b = g.bById.get(sel.id);
      if (b) { this.marker.visible = true; this.marker.position.set(b.cx, b.y + 0.08, b.cz); this.marker.scale.setScalar(Math.max(b.w, b.d) * 0.75 + 0.3 + Math.sin(this.time * 4) * 0.05); }
    } else if (!this.markerOverride) this.marker.visible = false;
    void dt;
  }
  markerOverride = false;
  oceanMat!: THREE.MeshBasicMaterial;
  setMarker(x: number | null, z = 0, r = 1.5, color = 0xffe080) {
    if (x === null) { this.markerOverride = false; this.marker.visible = false; return; }
    this.markerOverride = true;
    this.marker.visible = true;
    this.marker.position.set(x, heightAt(this.g.world, x, z) + 0.15, z);
    this.marker.scale.setScalar(r);
    (this.marker.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  // ---------------- input ----------------
  onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === 'r' && this.g.tool.mode === 'build') { this.g.tool.rot = 1 - this.g.tool.rot; }
    if (k === 'escape' && this.g.tool.mode !== 'settle') { this.g.tool = { mode: 'none', type: '', rot: 0 }; this.g.version++; }
    this.autoOrbit = false;
  };
  onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  onDown = (e: PointerEvent) => {
    this.autoOrbit = false;
    this.mouse.x = e.offsetX; this.mouse.y = e.offsetY;
    this.drag = { btn: e.button, x: e.clientX, y: e.clientY, moved: 0, sx: e.clientX, sy: e.clientY };
    const g = this.g;
    if (e.button === 0 && (g.tool.mode === 'road' || g.tool.mode === 'wall' || g.tool.mode === 'erase')) {
      const p = this.pickGround(e.offsetX, e.offsetY);
      if (p) { this.dragStart = { x: Math.floor(p.x), z: Math.floor(p.z) }; this.lineTiles = [this.dragStart]; }
    }
  };
  onMove = (e: PointerEvent) => {
    const rect = this.r.domElement.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left; this.mouse.y = e.clientY - rect.top;
    this.mouse.in = e.target === this.r.domElement || !!this.drag;
    const dr = this.drag;
    if (dr) {
      const dx = e.clientX - dr.x, dy = e.clientY - dr.y;
      dr.moved += Math.abs(dx) + Math.abs(dy);
      dr.x = e.clientX; dr.y = e.clientY;
      const g = this.g;
      const lineTool = g.tool.mode === 'road' || g.tool.mode === 'wall' || g.tool.mode === 'erase';
      if (dr.btn === 2) { this.yawGoal -= dx * 0.006; this.tiltGoal = clamp(this.tiltGoal + dy * 0.004, -0.5, 0.5); }
      else if (dr.btn === 1 || (dr.btn === 0 && !lineTool && g.tool.mode !== 'build' && dr.moved > 5)) {
        const s = this.dist * 0.0017;
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        this.tgtGoal.x += (-dx * cy - dy * sy) * s * -1 * -1 * 1;
        this.tgtGoal.z += (dx * sy - dy * cy) * s * -1 * -1 * 1;
        this.tgtGoal.x = clamp(this.tgtGoal.x, 0, N); this.tgtGoal.z = clamp(this.tgtGoal.z, 0, N);
      }
    }
  };
  onUp = (e: PointerEvent) => {
    const dr = this.drag;
    this.drag = null;
    if (!dr) return;
    const g = this.g;
    if (e.target !== this.r.domElement && !this.dragStart) return;
    const rect = this.r.domElement.getBoundingClientRect();
    const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
    if (dr.btn === 0) {
      if (this.dragStart && (g.tool.mode === 'road' || g.tool.mode === 'wall' || g.tool.mode === 'erase')) {
        const tiles = this.lineTiles.slice();
        this.dragStart = null; this.lineTiles = [];
        if (g.tool.mode === 'road') { const n = g.setRoad(tiles, g.tool.type === 'stone' ? 2 : 1); if (!n) g.toast('Nothing built (blocked or water)'); }
        else if (g.tool.mode === 'wall') { let n = 0; for (const t of tiles) { if (g.check(g.tool.type, t.x, t.z, 0, 0).ok && g.place(g.tool.type, t.x, t.z, 0)) n++; } if (!n) g.toast('Cannot build walls here'); }
        else g.removeRoad(tiles);
        return;
      }
      if (dr.moved > 6) return;
      const p = this.pickGround(ox, oy);
      if (!p) return;
      if (g.tool.mode === 'build') {
        const h = this.hover;
        if (h) { if (g.place(g.tool.type, h.bx, h.bz, g.tool.rot)) { /* keep tool */ } }
      } else if (g.tool.mode === 'settle') { this.onClickGround?.(p.x, p.z); }
      else if (g.tool.mode === 'demolish') {
        const b = g.bById.get(g.occ[tileIdx(p.x, p.z)]);
        if (b && b.owner === 0) g.demolish(b.id);
      } else if (g.tool.mode === 'none') this.select(p.x, p.z);
    } else if (dr.btn === 2 && dr.moved < 6) {
      if (g.tool.mode !== 'none' && g.tool.mode !== 'settle') { g.tool = { mode: 'none', type: '', rot: 0 }; g.version++; }
      else { g.selected = null; g.version++; }
    }
  };
  select(x: number, z: number) {
    const g = this.g;
    let best: number = -1, bd = Math.max(0.7, this.dist * 0.012);
    for (const c of g.citizens) { if (!c.alive || c.hidden) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c.id; } }
    if (best >= 0) { g.selected = { kind: 'citizen', id: best }; g.version++; return; }
    const t = tileIdx(x, z);
    const b = t >= 0 ? g.bById.get(g.occ[t]) : undefined;
    if (b) {
      if (b.owner === 0) g.selected = { kind: 'building', id: b.id };
      else g.selected = { kind: 'tribe', id: b.owner };
      g.version++; return;
    }
    for (const tr of g.tribes) if (Math.hypot(tr.x - x, tr.z - z) < 7) { g.selected = { kind: 'tribe', id: tr.id }; g.version++; return; }
    g.selected = null; g.version++;
  }
  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.autoOrbit = false;
    const f = Math.exp(e.deltaY * 0.0011);
    const nd = clamp(this.distGoal * f, 5, 290);
    if (f < 1) {
      const p = this.pickGround(this.mouse.x, this.mouse.y);
      if (p) { const k = (1 - nd / this.distGoal) * 0.7; this.tgtGoal.x += (p.x - this.tgtGoal.x) * k; this.tgtGoal.z += (p.z - this.tgtGoal.z) * k; }
    }
    this.distGoal = nd;
  };
  focus(x: number, z: number, dist = 38) { this.tgtGoal.set(clamp(x, 0, N), 0, clamp(z, 0, N)); this.distGoal = dist; this.autoOrbit = false; }
  zoomLevel() { const d = this.distGoal; return d > 170 ? 'WORLD MAP' : d > 75 ? 'REGION' : d > 24 ? 'SETTLEMENT' : 'STREET LEVEL'; }
  zoomBy(f: number) { this.distGoal = clamp(this.distGoal * f, 5, 290); }
  rotateBy(a: number) { this.yawGoal += a; }

  pickGround(ox: number, oy: number): { x: number; z: number } | null {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const nx = (ox / w) * 2 - 1, ny = -(oy / h) * 2 + 1;
    const o = this.cam.position;
    const dir = this.tmpV.set(nx, ny, 0.5).unproject(this.cam).sub(o).normalize();
    const W = this.g.world;
    let t = 0, step = 1;
    let px = 0, pz = 0, py = 0, prevT = 0;
    for (let i = 0; i < 700; i++) {
      px = o.x + dir.x * t; py = o.y + dir.y * t; pz = o.z + dir.z * t;
      if (px < -5 || pz < -5 || px > N + 5 || pz > N + 5) { if (i > 3 && dir.y >= 0) return null; }
      else if (py < Math.max(0, heightAt(W, px, pz))) {
        // refine
        let lo = prevT, hi = t;
        for (let k = 0; k < 8; k++) { const mid = (lo + hi) / 2; const qx = o.x + dir.x * mid, qy = o.y + dir.y * mid, qz = o.z + dir.z * mid; if (qy < Math.max(0, heightAt(W, qx, qz))) hi = mid; else lo = mid; }
        const fx = o.x + dir.x * hi, fz = o.z + dir.z * hi;
        return { x: clamp(fx, 0.01, N - 0.01), z: clamp(fz, 0.01, N - 0.01) };
      }
      prevT = t;
      step = Math.max(0.35, t * 0.012);
      t += step;
      if (t > 900) break;
    }
    return null;
  }

  updateHover() {
    const g = this.g;
    this.hover = null;
    if (!this.mouse.in) return;
    const p = this.pickGround(this.mouse.x, this.mouse.y);
    if (!p) return;
    const t = tileIdx(p.x, p.z);
    const base: Hover = { x: p.x, z: p.z, tile: t, valid: true, msg: '', tiles: [], bx: 0, bz: 0, cost: true };
    if (g.tool.mode === 'build' && g.tool.type) {
      const def = BMAP[g.tool.type];
      const w = g.tool.rot ? def.d : def.w, d = g.tool.rot ? def.w : def.d;
      const bx = Math.round(p.x - w / 2), bz = Math.round(p.z - d / 2);
      const c = g.check(g.tool.type, bx, bz, g.tool.rot, 0);
      base.bx = bx; base.bz = bz; base.valid = c.ok; base.msg = c.msg; base.tiles = c.tiles;
    } else if (this.dragStart && (g.tool.mode === 'road' || g.tool.mode === 'wall' || g.tool.mode === 'erase')) {
      const a = this.dragStart, b = { x: Math.floor(p.x), z: Math.floor(p.z) };
      const tiles: { x: number; z: number }[] = [];
      let x = a.x, z = a.z;
      const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z), sx = a.x < b.x ? 1 : -1, sz = a.z < b.z ? 1 : -1;
      let err = dx - dz;
      for (let i = 0; i < 400; i++) {
        tiles.push({ x, z });
        if (x === b.x && z === b.z) break;
        const e2 = 2 * err;
        if (e2 > -dz) { err -= dz; x += sx; }
        if (e2 < dx) { err += dx; z += sz; }
      }
      this.lineTiles = tiles;
      base.tiles = tiles.map((q) => {
        const i = q.z * N + q.x;
        let ok = q.x > 0 && q.z > 0 && q.x < N - 1 && q.z < N - 1 && g.world.tileWater[i] !== 1 && !g.occ[i];
        if (g.tool.mode === 'wall') ok = ok && g.check(g.tool.type, q.x, q.z, 0, 0).ok;
        if (g.tool.mode === 'erase') ok = !!g.road[i];
        return { x: q.x, z: q.z, ok: !!ok };
      });
    } else if (g.tool.mode === 'road' || g.tool.mode === 'wall' || g.tool.mode === 'erase') {
      const q = { x: Math.floor(p.x), z: Math.floor(p.z) };
      base.tiles = [{ ...q, ok: t >= 0 && !g.world.tileWater[t] }];
    }
    this.hover = base;
  }
  updateGhostVisuals() {
    const g = this.g, h = this.hover;
    // tile quads
    if (h && h.tiles.length) {
      const W = g.world;
      const MAXQ = 500;
      const geo = this.tileQuads.geometry;
      if (!geo.attributes.position) {
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXQ * 12), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXQ * 12), 3));
        const ix = new Uint32Array(MAXQ * 6);
        for (let i = 0; i < MAXQ; i++) { const b = i * 4; ix.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6); }
        geo.setIndex(new THREE.BufferAttribute(ix, 1));
      }
      const pos = geo.attributes.position.array as Float32Array, col = geo.attributes.color.array as Float32Array;
      const n = Math.min(MAXQ, h.tiles.length);
      for (let i = 0; i < n; i++) {
        const q = h.tiles[i];
        for (let k = 0; k < 4; k++) {
          const x = q.x + (k & 1), z = q.z + (k >> 1);
          const vx = clamp(x, 0, N), vz = clamp(z, 0, N);
          const o = i * 12 + k * 3;
          pos[o] = x; pos[o + 1] = W.h[vz * V + vx] + 0.08; pos[o + 2] = z;
          col[o] = q.ok ? 0.3 : 1; col[o + 1] = q.ok ? 1 : 0.25; col[o + 2] = q.ok ? 0.45 : 0.2;
        }
      }
      geo.setDrawRange(0, n * 6);
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      this.tileQuads.visible = true;
    } else this.tileQuads.visible = false;
    // ghost mesh
    if (h && g.tool.mode === 'build' && g.tool.type) {
      if (!this.ghost) { this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat); this.ghost.renderOrder = 2; this.scene.add(this.ghost); }
      if (this.ghostType !== g.tool.type) { this.ghost.geometry = this.geoFor(g.tool.type, -1, 0); this.ghostType = g.tool.type; }
      const def = BMAP[g.tool.type];
      const w = g.tool.rot ? def.d : def.w, d = g.tool.rot ? def.w : def.d;
      let sum = 0, cnt = 0;
      for (let vz = h.bz; vz <= h.bz + d; vz++) for (let vx = h.bx; vx <= h.bx + w; vx++) { sum += g.world.h[clamp(vz, 0, N) * V + clamp(vx, 0, N)]; cnt++; }
      this.ghost.position.set(h.bx + w / 2, sum / cnt, h.bz + d / 2);
      this.ghost.rotation.y = g.tool.rot ? Math.PI / 2 : 0;
      this.ghostMat.color.setHex(h.valid ? 0x66ff88 : 0xff5a4a);
      this.ghost.visible = true;
    } else if (this.ghost) this.ghost.visible = false;
  }

  // ---------------- per-frame ----------------
  updateCamera(dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    if (this.autoOrbit) { this.yawGoal += dt * 0.04; }
    // keys
    let mx = 0, mz = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (mx || mz) {
      const sp = this.dist * 0.95 * dt * (this.keys.has('shift') ? 2 : 1);
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      this.tgtGoal.x += (mx * cy + mz * sy) * sp;
      this.tgtGoal.z += (-mx * sy + mz * cy) * sp;
      this.tgtGoal.x = clamp(this.tgtGoal.x, 0, N); this.tgtGoal.z = clamp(this.tgtGoal.z, 0, N);
    }
    if (this.keys.has('q')) this.yawGoal -= dt * 1.6;
    if (this.keys.has('e')) this.yawGoal += dt * 1.6;
    if (this.keys.has('+') || this.keys.has('=')) this.distGoal = clamp(this.distGoal * Math.exp(-dt * 1.5), 5, 290);
    if (this.keys.has('-')) this.distGoal = clamp(this.distGoal * Math.exp(dt * 1.5), 5, 290);
    this.tgt.lerp(this.tgtGoal, k);
    this.dist += (this.distGoal - this.dist) * k;
    this.yaw += (this.yawGoal - this.yaw) * k;
    this.tilt += (this.tiltGoal - this.tilt) * k;
    const W = this.g.world;
    const th = Math.max(0, heightAt(W, this.tgt.x, this.tgt.z));
    this.tgt.y += (th - this.tgt.y) * Math.min(1, dt * 6 + 0.01);
    const pitch = clamp(lerp(0.32, 1.32, smooth(6, 210, this.dist)) + this.tilt * (1 - smooth(100, 250, this.dist)), 0.12, 1.5);
    const cp = Math.cos(pitch);
    const px = this.tgt.x + Math.sin(this.yaw) * cp * this.dist, pz = this.tgt.z + Math.cos(this.yaw) * cp * this.dist;
    let py = this.tgt.y + Math.sin(pitch) * this.dist;
    py = Math.max(py, heightAt(W, px, pz) + 1.4);
    this.cam.position.set(px, py, pz);
    this.cam.lookAt(this.tgt.x, this.tgt.y + 0.3, this.tgt.z);
    this.cam.near = Math.max(0.2, this.dist * 0.02);
    this.cam.far = 600 + this.dist * 2;
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
  }

  updateLighting(dt: number) {
    const g = this.g;
    const f = g.dayFrac;
    const night = Math.max(smooth(0.72, 0.84, f), 1 - smooth(0.0, 0.06, f));
    const phase = clamp(f / 0.75, 0, 1);
    const elev = Math.sin(Math.PI * phase);
    const sunDir = new THREE.Vector3(Math.cos(Math.PI * phase) * -1, 0.25 + elev * 0.95, 0.45).normalize();
    const eclipse = g.mod.eclipse ? 0.35 : 1;
    const dayI = (0.35 + elev * 1.8) * (1 - night * 0.9) * eclipse;
    this.sun.intensity = Math.max(0.12, dayI);
    const warm = 1 - smooth(0.0, 0.4, elev);
    this.sun.color.setRGB(1, 0.86 + 0.14 * (1 - warm) - 0.15 * warm, 0.72 + 0.28 * (1 - warm) - 0.2 * warm);
    if (night > 0.5) this.sun.color.lerp(new THREE.Color(0.5, 0.6, 1.0), night * 0.8);
    this.hemi.intensity = lerp(0.95, 0.38, night) * (eclipse < 1 ? 0.6 : 1);
    this.hemi.color.setRGB(0.75, 0.86, 1).lerp(new THREE.Color(0.28, 0.35, 0.65), night);
    this.hemi.groundColor.setRGB(0.4, 0.44, 0.25).lerp(new THREE.Color(0.12, 0.13, 0.22), night);
    // sky
    const sky = new THREE.Color(0.55, 0.78, 0.93);
    if (g.season === 3) sky.lerp(new THREE.Color(0.75, 0.82, 0.88), 0.5);
    if (g.mod.drought) sky.lerp(new THREE.Color(0.85, 0.78, 0.6), 0.4);
    if (g.mod.rain) sky.lerp(new THREE.Color(0.5, 0.55, 0.6), 0.6);
    sky.lerp(new THREE.Color(0.95, 0.55, 0.32), warm * (night < 0.5 ? 0.35 : 0.1));
    sky.lerp(new THREE.Color(0.04, 0.06, 0.14), night);
    if (g.mod.eclipse) sky.multiplyScalar(0.4);
    if (g.mod.aurora && night > 0.4) sky.lerp(new THREE.Color(0.15, 0.4, 0.35), 0.4);
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    fog.near = 30 + this.dist * 0.6;
    fog.far = 260 + this.dist * 2.4 - (g.mod.rain ? 80 : 0);
    this.wUni.uFogColor.value.copy(sky); this.wUni.uFogNear.value = fog.near; this.wUni.uFogFar.value = fog.far;
    this.wUni.uLight.value = lerp(1, 0.35, night) * (eclipse < 1 ? 0.6 : 1);
    const ol = this.wUni.uLight.value;
    this.oceanMat.color.setRGB(0.08 * ol, 0.3 * ol, 0.55 * ol, THREE.SRGBColorSpace);
    // shadow follow
    const S = clamp(this.dist * 1.15, 26, 120);
    this.sun.position.set(this.tgt.x + sunDir.x * 90, this.tgt.y + sunDir.y * 90, this.tgt.z + sunDir.z * 90);
    this.sun.target.position.copy(this.tgt);
    const sc = this.sun.shadow.camera;
    if (sc.right !== S) { sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 1; sc.far = 260; sc.updateProjectionMatrix(); }
    this.sun.castShadow = this.dist < 185 && night < 0.9;
    // seasons
    const tSnow = g.season === 3 ? (g.mod.cold ? 1 : 0.8) : 0;
    this.snow += (tSnow - this.snow) * Math.min(1, dt * 0.5);
    this.dry += ((g.mod.drought ? 1 : 0) - this.dry) * Math.min(1, dt * 0.4);
    this.auto += ((g.season === 2 ? 1 : 0) - this.auto) * Math.min(1, dt * 0.4);
    this.flood += ((g.mod.flood ? 1 : 0) - this.flood) * Math.min(1, dt * 0.5);
    this.tUni.uSnow.value = this.snow; this.tUni.uDry.value = this.dry; this.tUni.uAuto.value = this.auto;
    this.wUni.uFlood.value = this.flood;
    const tc = [0, 1, 2, 3, 4].map((t) => {
      const c = new THREE.Color(1, 1, 1);
      if (t === 1 || t === 4 || t === 2) c.lerp(new THREE.Color(1.3, 0.8, 0.45), this.auto * (t === 1 ? 0.9 : 0.3));
      if (t === 0 || t === 1) c.lerp(new THREE.Color(0.85, 0.92, 1.0), this.snow * 0.55);
      if (this.dry > 0.1) c.lerp(new THREE.Color(1.15, 1.0, 0.6), this.dry * 0.4);
      return c;
    });
    this.treeMeshes.forEach((m, i) => (m.material as THREE.MeshLambertMaterial).color.copy(tc[i]));
  }

  updateWeather(dt: number) {
    const g = this.g, w = this.weather;
    const rain = g.mod.rain, snow = !rain && g.season === 3;
    w.pts.visible = rain || snow;
    if (!w.pts.visible) return;
    const pos = w.pts.geometry.attributes.position as THREE.BufferAttribute;
    const n = rain ? 1800 : 1000;
    w.mat.color.setHex(rain ? 0xaec4e0 : 0xffffff);
    w.mat.size = rain ? 0.12 : 0.2; w.mat.opacity = rain ? 0.65 : 0.85;
    const sp = rain ? 26 : 2.5;
    const reach = clamp(this.dist * 0.5, 12, 45);
    for (let i = 0; i < n; i++) {
      w.ly[i] -= sp * dt * (0.8 + (i % 5) * 0.1);
      if (w.ly[i] < 0) { w.ly[i] += 40; w.lx[i] = Math.random() * 80; w.lz[i] = Math.random() * 80; }
      const sway = snow ? Math.sin(this.time + i) * 0.5 : 0;
      pos.setXYZ(i, this.tgt.x + (w.lx[i] - 40) * (reach / 40) + sway, this.tgt.y + w.ly[i] * (reach / 40) * 0.8 - 2, this.tgt.z + (w.lz[i] - 40) * (reach / 40));
    }
    w.pts.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
  }

  updateLabels() {
    const g = this.g;
    const mk = (key: string, html: string, cls: string) => {
      let el = this.labelEls.get(key);
      if (!el) { el = document.createElement('div'); el.className = cls; el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform'; this.labels.appendChild(el); this.labelEls.set(key, el); }
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
      return el;
    };
    const place = (el: HTMLDivElement, x: number, y: number, z: number, show: boolean) => {
      this.tmpV.set(x, y, z).project(this.cam);
      if (!show || this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1.1 || Math.abs(this.tmpV.y) > 1.1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.transform = `translate(${((this.tmpV.x + 1) / 2) * this.el.clientWidth}px, ${((1 - this.tmpV.y) / 2) * this.el.clientHeight}px) translate(-50%,-100%)`;
    };
    for (const t of g.tribes) {
      const label = t.met || !g.started ? `<span style="color:#${t.color.toString(16).padStart(6, '0')}">⚑</span> ${t.name}` : '❔ Unknown tribe';
      const sub = t.met ? `<small>${t.status === 'unmet' ? 'neutral' : t.status} · pop ${t.pop}</small>` : '';
      const el = mk('t' + t.id, `<div class="map-label tribe"><b>${label}</b>${sub}</div>`, '');
      place(el, t.x, heightAt(g.world, t.x, t.z) + 5.4, t.z, this.dist > 28);
    }
    for (const s of g.settlements) {
      const el = mk('s' + s.id, `<div class="map-label mine"><b>🔥 ${s.name}</b><small>pop ${s.pop}</small></div>`, '');
      place(el, s.x, heightAt(g.world, s.x, s.z) + 3.2, s.z, this.dist > 22 && g.started);
    }
    for (const [k, el] of this.labelEls) {
      if (k[0] === 's' && !g.settlements.some((s) => 's' + s.id === k)) { el.remove(); this.labelEls.delete(k); }
    }
    // selected labels for caravans/raids
    g.raids.forEach((r) => { const el = mk('r' + r.id, `<div class="map-label raid"><b>⚔ ${g.tribes[r.tribe - 1].name} raiders</b></div>`, ''); place(el, r.x, heightAt(g.world, r.x, r.z) + 2, r.z, true); });
    for (const [k, el] of this.labelEls) if (k[0] === 'r' && !g.raids.some((r) => 'r' + r.id === k)) { el.remove(); this.labelEls.delete(k); }
  }

  updateRouteLines() {
    const g = this.g;
    while (this.routeLines.children.length) { const c = this.routeLines.children[0] as THREE.Line; this.routeLines.remove(c); c.geometry.dispose(); }
    const W = g.world;
    for (const r of g.routes) {
      const t = g.tribes[r.tribe - 1];
      let m: any = null, bd = 1e9;
      for (const b of g.buildings) if (b.owner === 0 && BMAP[b.type].slots && Math.hypot(b.cx - t.x, b.cz - t.z) < bd) { bd = Math.hypot(b.cx - t.x, b.cz - t.z); m = b; }
      if (!m) continue;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 50; i++) { const f = i / 50, x = lerp(m.cx, t.x, f), z = lerp(m.cz, t.z, f); pts.push(new THREE.Vector3(x, Math.max(0, heightAt(W, x, z)) + 0.5, z)); }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: r.active ? 0xe8c050 : 0x777777, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.8 }));
      line.computeLineDistances();
      this.routeLines.add(line);
    }
  }

  emitters(dt: number) {
    const g = this.g, W = g.world;
    for (const b of g.buildings) {
      if (Math.abs(b.cx - this.tgt.x) > 100 || Math.abs(b.cz - this.tgt.z) > 100) continue;
      let rate = 0;
      if (b.state === 'ready' || b.state === 'upgrading') {
        rate = SMOKERS[b.type] || 0;
        if ((b.type === 'potter' || b.type === 'foundry' || b.type === 'ironworks' || b.type === 'workshop') && b.owner === 0 && b.out === 0) rate *= 0.2;
        if (b.owner === 0 && b.downUntil > g.time) rate = 3;
        if (b.owner !== 0 && b.type === 'campfire') rate = 1.5;
      }
      if (b.type === 'campfire' && (g.isNight() || true)) { /* flames flicker via fire particles */ }
      if (rate <= 0) continue;
      const acc = (this.emitAcc.get(b.id) || 0) + rate * dt;
      const n = Math.floor(acc);
      this.emitAcc.set(b.id, acc - n);
      for (let i = 0; i < n; i++) {
        const isFire = (b.type === 'campfire' || b.type === 'hearth' || b.type === 'cooking') && Math.random() < 0.5;
        const h = b.type === 'foundry' ? 2.4 : b.type === 'ironworks' ? 2.6 : b.type === 'potter' ? 1.5 : b.type === 'workshop' ? 1.5 : 0.5;
        this.spawn(isFire ? 'fire' : 'smoke', b.cx + (Math.random() - 0.5) * 0.3 + (b.type === 'foundry' ? -0.35 : 0), b.y + (isFire ? 0.3 : h), b.cz + (Math.random() - 0.5) * 0.3 + (b.type === 'foundry' ? -0.2 : 0));
      }
    }
    for (const [t] of g.fires) { if (Math.random() < dt * 6) { const x = (t % N) + Math.random(), z = Math.floor(t / N) + Math.random(); this.spawn('fire', x, heightAt(W, x, z) + 0.3, z); if (Math.random() < 0.4) this.spawn('smoke', x, heightAt(W, x, z) + 1.2, z); } }
    for (const f of g.fxq) {
      const y = heightAt(W, f.x, f.z) + 0.3;
      const n = f.n || 1;
      for (let i = 0; i < n; i++) this.spawn(f.k, f.x + (Math.random() - 0.5) * 0.6, y, f.z + (Math.random() - 0.5) * 0.6);
    }
    g.fxq.length = 0;
  }

  loop() {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const g = this.g;
    g.update(dt);
    this.wUni.uTime.value = this.time;
    // dirty flags
    if (g.terrainDirty) { g.terrainDirty = false; this.updateTerrainHeights(); }
    if (g.roadDirty) { g.roadDirty = false; this.drawRoads(); }
    if (g.treeDirty.length) {
      const W = g.world;
      this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
      const touched = new Set<number>();
      for (const i of g.treeDirty) { const t = W.trees[i]; this.treeMeshes[t.type].setMatrixAt(this.treeSlot[i], this.dummy.matrix); touched.add(t.type); }
      touched.forEach((t) => (this.treeMeshes[t].instanceMatrix.needsUpdate = true));
      g.treeDirty.length = 0;
    }
    if (g.depDirty.length) {
      const W = g.world;
      this.dummy.scale.setScalar(0); this.dummy.updateMatrix();
      for (const t of g.depDirty) {
        const s = this.depSlot.get(t);
        if (W.dep[t] === 0 && s) { this.depMeshes[s.t].setMatrixAt(s.i, this.dummy.matrix); this.depSlot.delete(t); }
        else if (W.dep[t] !== 0 && !s) this.addDeposit(t);
      }
      this.flushDeposits();
      g.depDirty.length = 0;
    }
    if (g.routeDirty) { g.routeDirty = false; this.updateRouteLines(); }
    this.routeLines.visible = g.overlay === 'trade' || g.routes.length > 0;
    // overlay
    this.overlayAcc += dt;
    if (this.overlayAcc > (g.overlay === 'none' || g.overlay === 'territory' ? 1.5 : 1.0) || this.lastOverlay !== g.overlay) {
      this.overlayAcc = 0; this.lastOverlay = g.overlay;
      computeOverlay(g, g.overlay, this.overData);
      (this.overTex.image.data as unknown as Uint8ClampedArray).set(this.overData);
      this.overTex.needsUpdate = true;
    }
    this.updateCamera(dt);
    this.updateLighting(dt);
    this.updateHover();
    this.updateGhostVisuals();
    this.syncBuildings();
    this.syncCreatures(dt);
    // banners
    this.g.tribes.forEach((t, i) => { const b = this.banners[i]; b.position.set(t.x + 1.6, heightAt(g.world, t.x + 1.6, t.z + 1.6), t.z + 1.6); b.rotation.y = Math.sin(this.time * 0.8 + i) * 0.1; });
    const sp = g.speed === 0 ? 0 : g.speed;
    this.emitters(dt * sp);
    this.updateParticles(dt * Math.max(0.5, sp));
    this.updateWeather(dt);
    this.updateLabels();
    this.r.render(this.scene, this.cam);
  }
}

export { dangerAt, DEP, BIO };
