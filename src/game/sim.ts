import {
  N, V, DAY_SEC, DAYS_PER_YEAR, BMAP, BIO, DEP, DEP_INFO, FOOD_RES, RES, RES_LIST, JOB_SKILL, SKILLS, NAMES_F, NAMES_M, TECH_MAP, emptyRes,
  type Res, type ResMap, type Cost, type Skill, type BDef, type Work,
} from './data';
import type { Citizen, Building, Animal, Tribe, TradeRoute, Caravan, Raid, Ambient, Alert, GameEvent, Settlement } from './types';
import { World, generateWorld, heightAt, slopeAt, tileIdx } from './world';
import { Rand, rnd, clamp } from './rng';
import * as T from './tribes';
import * as E from './events';

export const ANIMAL_INFO = [
  { name: 'Deer', meat: 12, speed: 0.9 },
  { name: 'Wild Boar', meat: 14, speed: 0.8 },
  { name: 'Mammoth', meat: 45, speed: 0.5 },
  { name: 'Wolf', meat: 3, speed: 1.5 },
];
const OFFS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, 3.0];

export class Game {
  world: World;
  seed: number;
  rand: Rand;
  started = false;
  time = 0; day = 0; year = 0; season = 0; dayFrac = 0.03; speed = 1; secAcc = 0; terrAcc = 0;
  res: ResMap = emptyRes();
  capGen = 200; capFood = 150;
  citizens: Citizen[] = [];
  cById = new Map<number, Citizen>();
  buildings: Building[] = [];
  bById = new Map<number, Building>();
  occ = new Int32Array(N * N);
  road = new Uint8Array(N * N);
  owner = new Uint8Array(N * N).fill(255);
  siteAt = new Map<number, number>();
  settlements: Settlement[] = [];
  tribes: Tribe[] = [];
  animals: Animal[] = [];
  caravans: Caravan[] = [];
  raids: Raid[] = [];
  ambients: Ambient[] = [];
  routes: TradeRoute[] = [];
  alerts: Alert[] = [];
  events: GameEvent[] = [];
  techs = new Set<string>(['survival']);
  research: { id: string; progress: number } | null = null;
  prio: Record<string, number> = { food: 2, water: 2, materials: 2, build: 2, craft: 2, knowledge: 2, trade: 2, defense: 2 };
  rations = 1;
  tribute = 0;
  prestige = 0;
  happyMod = 0;
  playerName = 'Your Tribe';
  playerColor = 0xe8c060;
  tool = { mode: 'none', type: '', rot: 0 };
  selected: { kind: string; id: number } | null = null;
  overlay = 'none';
  nextId = 1;
  poll = new Float32Array(N * N);
  fires = new Map<number, number>();
  fxq: { k: string; x: number; z: number; n?: number }[] = [];
  treeDirty: number[] = [];
  depDirty: number[] = [];
  terrainDirty = false; roadDirty = true; terrDirty = true; routeDirty = true;
  cutTrees = 0;
  mod = { farm: 1, gather: 1, hunt: 1, water: 1, cold: 0, flood: 0, drought: false, rain: false, eclipse: 0, aurora: 0, plague: 0, sun: 1 };
  flowNow: { prod: ResMap; cons: ResMap } = { prod: emptyRes(), cons: emptyRes() };
  flowLast: { prod: ResMap; cons: ResMap } = { prod: emptyRes(), cons: emptyRes() };
  hist: { year: number; day: number; pop: number; food: number; happy: number; wood: number; stone: number; bronze: number; knowledge: number }[] = [];
  info = { pop: 0, adults: 0, children: 0, housing: 0, happy: 50, foodDays: 99, waterOk: 1, jobs: {} as Record<string, number>, homeless: 0, sick: 0, warriors: 0, defense: 0, kRate: 0, farmY: 0, foodIn: 0, foodOut: 0, unemployed: 0, avgHealth: 100 };
  stats = { births: 0, deaths: 0, starved: 0, raidsRepelled: 0, raidsLost: 0, built: 0, trades: 0 };
  toasts: { id: number; text: string; t: number }[] = [];
  version = 0;
  knowledgeAcc = 0;
  usedCaves = 0;
  defCache = { t: -1, v: 0 };

  constructor(seed: number) {
    this.seed = seed;
    this.world = generateWorld(seed);
    this.rand = new Rand(seed * 13 + 5);
    for (const a of this.world.animals) this.addAnimal(a.type, a.x, a.z);
    this.world.sites.forEach((s, i) => this.siteAt.set(s.tile, i));
    T.initTribes(this);
    this.recomputeTerritory();
  }

  // ---------- helpers ----------
  id() { return this.nextId++; }
  toast(text: string) { this.toasts.push({ id: this.id(), text, t: this.time }); if (this.toasts.length > 4) this.toasts.shift(); this.version++; }
  alert(kind: Alert['kind'], title: string, text: string, x?: number, z?: number) {
    this.alerts.unshift({ id: this.id(), kind, title, text, year: this.year, day: this.day, x, z });
    if (this.alerts.length > 80) this.alerts.pop();
    this.version++;
  }
  fx(k: string, x: number, z: number, n = 1) { if (this.fxq.length < 200) this.fxq.push({ k, x, z, n }); }
  hasTech(t: string) { return this.techs.has(t); }
  get seasonName() { return ['Spring', 'Summer', 'Autumn', 'Winter'][this.season]; }
  isNight() { return this.dayFrac > 0.78; }
  adults() { return this.citizens.filter((c) => c.alive && c.age >= 12); }
  playerBuildings() { return this.buildings.filter((b) => b.owner === 0); }
  foodTotal() { let s = 0; for (const r of FOOD_RES) s += this.res[r]; return s; }
  add(r: Res, a: number) {
    if (a <= 0) return 0;
    let acc = a;
    if (FOOD_RES.includes(r)) acc = Math.min(a, Math.max(0, this.capFood - this.foodTotal()));
    else acc = Math.min(a, Math.max(0, this.capGen - this.res[r]));
    this.res[r] += acc;
    this.flowNow.prod[r] += acc;
    return acc;
  }
  take(r: Res, a: number) { const t = Math.min(a, this.res[r]); this.res[r] -= t; this.flowNow.cons[r] += t; return t; }
  afford(c: Cost) { for (const k in c) if (this.res[k as Res] < (c as any)[k] - 1e-6) return false; return true; }
  missing(c: Cost) { const m: string[] = []; for (const k in c) if (this.res[k as Res] < (c as any)[k]) m.push(RES[k as Res].name); return m; }
  spend(c: Cost) { for (const k in c) { this.res[k as Res] -= (c as any)[k]; this.flowNow.cons[k as Res] += (c as any)[k]; } }
  refund(c: Cost, f: number) { for (const k in c) this.res[k as Res] = Math.min(this.capGen + 400, this.res[k as Res] + Math.floor((c as any)[k] * f)); }
  campfire(): Building | undefined { return this.buildings.find((b) => b.owner === 0 && BMAP[b.type].settle === 'camp' && b.state !== 'building'); }
  basePoint() { const c = this.campfire() || this.buildings.find((b) => b.owner === 0); return c ? { x: c.cx, z: c.cz } : { x: N / 2, z: N / 2 }; }
  scan(cx: number, cz: number, r: number, fn: (t: number, x: number, z: number) => void) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(N - 1, Math.ceil(cz + r));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) fn(z * N + x, x, z);
  }
  freshNear(cx: number, cz: number, r: number) {
    let found = false;
    this.scan(cx, cz, r, (t) => { if (!found && (this.world.biome[t] === BIO.LAKE || this.world.biome[t] === BIO.RIVER)) found = true; });
    return found;
  }

  // ---------- founding ----------
  found(x: number, z: number, name: string, color: number) {
    this.playerName = name || 'Your Tribe';
    this.playerColor = color;
    this.started = true;
    this.res.wood = 90; this.res.stone = 20; this.res.fiber = 40; this.res.berries = 30; this.res.meat = 20; this.res.water = 60;
    const cx = Math.floor(x) - 1, cz = Math.floor(z) - 1;
    let cf: Building | null = null;
    outer: for (let r = 0; r < 8; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.check('campfire', cx + dx, cz + dz, 0, 0, true, true).ok) { cf = this.createBuilding('campfire', cx + dx, cz + dz, 0, 0, true); break outer; }
        }
    if (!cf) cf = this.createBuilding('campfire', cx, cz, 0, 0, true);
    cf.name = this.playerName + ' Camp';
    this.settlements.push({ id: this.id(), name: cf.name, x: cf.cx, z: cf.cz, kind: 'camp', bid: cf.id, pop: 0 });
    cf.settle = this.settlements[0].id;
    let placed = 0;
    for (let r = 2; r < 9 && placed < 2; r++)
      for (let k = 0; k < 14 && placed < 2; k++) {
        const a = rnd.range(0, 6.28);
        const bx = Math.floor(cf.cx + Math.cos(a) * r), bz = Math.floor(cf.cz + Math.sin(a) * r);
        if (this.check('sleep', bx, bz, 0, 0, true, true).ok) { this.createBuilding('sleep', bx, bz, 0, 0, true); placed++; }
      }
    this.recomputeTerritory();
    // initial families
    const mk = (female: boolean, age: number, partner: number, parents: number[]) => {
      const c = this.makeCitizen(cf!.cx + rnd.range(-2, 2), cf!.cz + rnd.range(-2, 2), female, age);
      c.partner = partner; c.parents = parents; return c;
    };
    const a1 = mk(false, 26, -1, []), a2 = mk(true, 24, a1.id, []);
    a1.partner = a2.id;
    const b1 = mk(false, 30, -1, []), b2 = mk(true, 28, b1.id, []);
    b1.partner = b2.id;
    const k1 = mk(rnd.f() < 0.5, 5, -1, [a1.id, a2.id]), k2 = mk(rnd.f() < 0.5, 8, -1, [b1.id, b2.id]);
    a1.children = [k1.id]; a2.children = [k1.id]; b1.children = [k2.id]; b2.children = [k2.id];
    const el = mk(true, 52, -1, []);
    el.skills.lore += 0.4;
    // start tribe knowledge nudge
    this.alert('good', 'A new tribe', `${this.playerName} lights its first campfire. Research Fire to unlock the Storyteller's Circle, then gather food and build huts.`, cf.cx, cf.cz);
    this.alert('info', 'Tip', 'Open the Technology panel and pick a research goal. Foragers from the campfire will gather berries; builders will raise anything you place.');
    this.info.pop = this.citizens.length;
    T.afterFound(this);
    this.version++;
  }

  makeCitizen(x: number, z: number, female: boolean, age: number): Citizen {
    const skills: any = {};
    for (const s of SKILLS) skills[s] = rnd.range(0, 0.3);
    skills[rnd.pick([...SKILLS])] += 0.3;
    const c: Citizen = {
      id: this.id(), name: rnd.pick(female ? NAMES_F : NAMES_M), female, age, job: 'none', workId: -1, homeId: -1, settlement: 0,
      partner: -1, parents: [], children: [], health: 90 + rnd.f() * 10, happy: 60, needs: { food: 80, water: 80, rest: 80, social: 60 },
      skills, x, z, tx: x, tz: z, act: 'work', phase: 0, timer: 0, walkT: 0, carry: null, carryAmt: 0, tgt: -1, alive: true, hidden: false,
      stuck: 0, sick: false, ang: rnd.range(0, 6.28), lastMeal: 0, working: false, fed: true, born: this.year, lastAct: '', speedMul: 0.9 + rnd.f() * 0.25, dOff: 0, dT: 0,
    };
    this.citizens.push(c);
    this.cById.set(c.id, c);
    return c;
  }
  specialization(c: Citizen): Skill {
    let best: Skill = 'gathering', bv = -1;
    for (const s of SKILLS) if (c.skills[s] > bv) { bv = c.skills[s]; best = s; }
    return best;
  }

  addAnimal(type: number, x: number, z: number) {
    this.animals.push({ id: this.id(), type, x, z, tx: x, tz: z, timer: rnd.range(0, 5), alive: true, respawn: 0, hx: x, hz: z, ang: rnd.range(0, 6.28), flee: 0, migrate: false, atk: 0 });
  }

  // ---------- placement ----------
  nearOwned(tx: number, tz: number, r: number) {
    let ok = false;
    this.scan(tx, tz, r, (t) => { if (this.owner[t] === 0) ok = true; });
    return ok;
  }
  rotDims(def: BDef, rot: number) { return rot ? { w: def.d, d: def.w } : { w: def.w, d: def.d }; }
  check(type: string, x: number, z: number, rot: number, owner = 0, ignoreCost = false, ignoreTerr = false) {
    const def = BMAP[type];
    const { w, d } = this.rotDims(def, rot);
    const tiles: { x: number; z: number; ok: boolean }[] = [];
    let msg = '';
    let ok = true;
    let hmin = 1e9, hmax = -1e9, fert = 0;
    const W = this.world;
    const expand = !!def.settle && def.settle !== 'camp';
    const hasPlayer = this.buildings.some((b) => b.owner === 0);
    for (let j = 0; j < d; j++)
      for (let i = 0; i < w; i++) {
        const tx = x + i, tz = z + j;
        let tok = true;
        if (tx < 1 || tz < 1 || tx >= N - 1 || tz >= N - 1) { tok = false; msg = 'Out of bounds'; }
        else {
          const t = tz * N + tx;
          if (W.tileWater[t] || W.wet[tz * V + tx] || W.wet[tz * V + tx + 1] || W.wet[(tz + 1) * V + tx] || W.wet[(tz + 1) * V + tx + 1]) { tok = false; msg = 'Cannot build on water'; }
          else if (this.occ[t]) { tok = false; msg = 'Space is occupied'; }
          else if (this.road[t]) { tok = false; msg = 'A path is in the way'; }
          else if (this.siteAt.has(t)) { tok = false; msg = 'Sacred ground'; }
          else if (slopeAt(W, t) > 1.2) { tok = false; msg = 'Terrain too steep'; }
          else if (owner === 0 && hasPlayer && !ignoreTerr) {
            const o = this.owner[t];
            if (o !== 0) {
              if (!(expand && o === 255 && this.nearOwned(tx, tz, 10))) { tok = false; msg = o === 255 ? 'Outside your territory' : 'Land claimed by another tribe'; }
            }
          }
          if (tok) { fert += W.fert[t]; hmin = Math.min(hmin, W.h[tz * V + tx]); hmax = Math.max(hmax, W.h[tz * V + tx]); }
        }
        if (!tok) ok = false;
        tiles.push({ x: tx, z: tz, ok: tok });
      }
    if (ok && hmax - hmin > 2.4) { ok = false; msg = 'Terrain too steep'; for (const t of tiles) t.ok = false; }
    const cx = x + w / 2, cz = z + d / 2;
    if (ok && def.req) {
      const q = this.reqCheck(type, def.req, cx, cz, fert / (w * d));
      if (q) { ok = false; msg = q; }
    }
    if (ok && owner === 0 && !ignoreCost && !this.afford(def.cost)) { ok = false; msg = 'Need ' + this.missing(def.cost).join(', '); }
    return { ok, msg, tiles, w, d };
  }
  reqCheck(type: string, req: string, cx: number, cz: number, fert: number): string {
    const W = this.world;
    if (req === 'water') {
      const any = type === 'fishing';
      let f = false;
      this.scan(cx, cz, 7, (t) => { if (W.tileWater[t] && (any || W.biome[t] === BIO.LAKE || W.biome[t] === BIO.RIVER)) f = true; });
      if (!f) return any ? 'Needs water within 7 tiles' : 'Needs a river or lake within 7 tiles';
    } else if (req === 'forest') {
      let n = 0;
      this.scan(cx, cz, 8, (t) => { n += W.treeCount[t]; });
      if (n < 8) return 'Needs forest nearby';
    } else if (req.startsWith('dep')) {
      const ty = parseInt(req.slice(3));
      let f = false;
      this.scan(cx, cz, 7, (t) => { if (W.dep[t] === ty && W.depAmt[t] > 1) f = true; });
      if (!f) return `Needs ${DEP_INFO[ty].name} deposit within 7 tiles`;
    } else if (req === 'fertile') {
      if (fert < 0.28) return 'Soil is too poor for crops';
    }
    return '';
  }

  flatten(b: Building) {
    const W = this.world;
    let sum = 0, n = 0;
    for (let vz = b.z; vz <= b.z + b.d; vz++) for (let vx = b.x; vx <= b.x + b.w; vx++) { sum += W.h[vz * V + vx]; n++; }
    const avg = sum / n;
    for (let vz = b.z - 1; vz <= b.z + b.d + 1; vz++)
      for (let vx = b.x - 1; vx <= b.x + b.w + 1; vx++) {
        if (vx < 0 || vz < 0 || vx >= V || vz >= V) continue;
        const inside = vx >= b.x && vx <= b.x + b.w && vz >= b.z && vz <= b.z + b.d;
        const i = vz * V + vx;
        if (W.wet[i]) continue;
        W.h[i] = inside ? avg : W.h[i] + (avg - W.h[i]) * 0.5;
      }
    b.y = avg;
    this.terrainDirty = true;
  }
  clearTile(t: number) {
    const W = this.world;
    const st = W.treeStart[t];
    for (let k = 0; k < W.treeCount[t]; k++) if (W.treeAlive[st + k]) { W.treeAlive[st + k] = 0; this.treeDirty.push(st + k); }
    W.treeCount[t] = 0;
    if (W.dep[t] === DEP.BERRIES || W.dep[t] === DEP.FIBER) { W.dep[t] = 0; this.depDirty.push(t); }
  }

  createBuilding(type: string, x: number, z: number, rot: number, owner: number, instant: boolean, style = 0): Building {
    const def = BMAP[type];
    const { w, d } = this.rotDims(def, rot);
    const b: Building = {
      id: this.id(), type, x, z, w, d, rot, cx: x + w / 2, cz: z + d / 2, y: 0, progress: instant ? 1 : 0, state: instant ? 'ready' : 'building',
      owner, workers: [], maxW: def.workers || 0, enabled: true, craftProg: 0, upTo: null, downUntil: 0, burning: 0, flooded: 0, mask: 0,
      style, ver: 0, auto: owner !== 0, status: '', settle: -1, builtYear: this.year, out: 0, fert: 0, wf: 1, name: '',
    };
    this.flatten(b);
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const t = (z + j) * N + x + i; this.occ[t] = b.id; this.clearTile(t); }
    this.buildings.push(b);
    this.bById.set(b.id, b);
    if (def.wall) this.updateWallMasks(b);
    if (instant) this.onBuilt(b, true);
    this.terrDirty = true;
    return b;
  }
  updateWallMasks(b: Building) {
    const dirs = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
    const calc = (q: Building) => {
      let m = 0;
      for (const [dx, dz, bit] of dirs) {
        const nx = q.x + dx, nz = q.z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const o = this.bById.get(this.occ[nz * N + nx]);
        if (o && BMAP[o.type].wall) m |= bit;
      }
      if (q.mask !== m) { q.mask = m; q.ver++; }
    };
    calc(b);
    for (const [dx, dz] of dirs) {
      const nx = b.x + dx, nz = b.z + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const o = this.bById.get(this.occ[nz * N + nx]);
      if (o && BMAP[o.type].wall) calc(o);
    }
  }
  place(type: string, x: number, z: number, rot: number) {
    const def = BMAP[type];
    if (!this.hasTech(def.tech) || def.noPlace) return false;
    const c = this.check(type, x, z, rot, 0);
    if (!c.ok) { this.toast(c.msg); return false; }
    this.spend(def.cost);
    this.createBuilding(type, x, z, rot, 0, false);
    this.version++;
    return true;
  }
  onBuilt(b: Building, silent = false) {
    const def = BMAP[b.type];
    b.state = 'ready'; b.progress = 1; b.upTo = null; b.maxW = Math.min(b.maxW || 0, def.workers || 0) || def.workers || 0;
    b.builtYear = this.year;
    if (def.work && def.work.k === 'field') {
      let f = 0, n = 0;
      for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) { f += this.world.fert[(b.z + j) * N + b.x + i]; n++; }
      b.fert = f / n;
      b.wf = this.freshNear(b.cx, b.cz, 9) ? 1 : 0.65;
    }
    if (b.owner === 0) {
      this.stats.built++;
      if (def.settle && def.settle !== 'camp' && b.settle < 0) {
        const kind = def.settle;
        const nm = kind === 'village' ? T.villageName(this) : kind === 'outpost' ? 'Outpost ' + (this.settlements.length + 1) : 'Camp ' + (this.settlements.length + 1);
        const s: Settlement = { id: this.id(), name: nm, x: b.cx, z: b.cz, kind, bid: b.id, pop: 0 };
        this.settlements.push(s); b.settle = s.id; b.name = nm;
        if (!silent) this.alert('good', kind === 'village' ? 'New village founded' : 'Territory claimed', `${nm} claims new land for ${this.playerName}.`, b.cx, b.cz);
      }
      if (def.terr) this.terrDirty = true;
      if (!silent) this.fx('dust', b.cx, b.cz, 10);
    }
    if (def.terr) this.terrDirty = true;
    this.version++;
  }
  demolish(id: number) {
    const b = this.bById.get(id);
    if (!b || b.owner !== 0) return;
    const def = BMAP[b.type];
    if (def.settle === 'camp' && this.buildings.filter((q) => q.owner === 0 && BMAP[q.type].settle === 'camp').length <= 1) { this.toast('You cannot abandon your last settlement hearth'); return; }
    this.removeBuilding(b);
    this.refund(def.cost, b.state === 'ready' ? 0.4 : 0.8);
    this.fx('dust', b.cx, b.cz, 12);
    if (this.selected && this.selected.id === id) this.selected = null;
    this.version++;
  }
  removeBuilding(b: Building) {
    for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) { const t = (b.z + j) * N + b.x + i; if (this.occ[t] === b.id) this.occ[t] = 0; }
    this.buildings = this.buildings.filter((q) => q !== b);
    this.bById.delete(b.id);
    for (const cid of b.workers) { const c = this.cById.get(cid); if (c) { c.job = 'none'; c.workId = -1; } }
    for (const c of this.citizens) if (c.homeId === b.id) c.homeId = -1;
    if (BMAP[b.type].wall) this.updateWallMasks(b);
    this.settlements = this.settlements.filter((s) => s.bid !== b.id);
    this.terrDirty = true;
  }
  upgrade(id: number) {
    const b = this.bById.get(id);
    if (!b || b.state !== 'ready' || b.owner !== 0) return false;
    const def = BMAP[b.type];
    if (!def.upgrade) return false;
    const nd = BMAP[def.upgrade];
    if (!this.hasTech(nd.tech)) { this.toast('Requires ' + TECH_MAP[nd.tech].name); return false; }
    if (!this.afford(nd.cost)) { this.toast('Need ' + this.missing(nd.cost).join(', ')); return false; }
    // footprint check
    const nw = nd.w, ndp = nd.d;
    const nx = Math.round(b.cx - nw / 2), nz = Math.round(b.cz - ndp / 2);
    for (let j = 0; j < ndp; j++) for (let i = 0; i < nw; i++) {
      const t = (nz + j) * N + nx + i;
      if (t < 0 || t >= N * N) return false;
      if ((this.occ[t] && this.occ[t] !== b.id) || this.world.tileWater[t] || this.road[t] || this.siteAt.has(t)) { this.toast('Not enough room to upgrade here'); return false; }
    }
    this.spend(nd.cost);
    b.state = 'upgrading'; b.progress = 0; b.upTo = nd.id;
    this.version++;
    return true;
  }
  finishUpgrade(b: Building) {
    const nd = BMAP[b.upTo!];
    for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) { const t = (b.z + j) * N + b.x + i; if (this.occ[t] === b.id) this.occ[t] = 0; }
    const nx = Math.round(b.cx - nd.w / 2), nz = Math.round(b.cz - nd.d / 2);
    b.type = nd.id; b.x = nx; b.z = nz; b.w = nd.w; b.d = nd.d; b.rot = 0; b.cx = nx + nd.w / 2; b.cz = nz + nd.d / 2;
    this.flatten(b);
    for (let j = 0; j < b.d; j++) for (let i = 0; i < b.w; i++) { const t = (nz + j) * N + nx + i; this.occ[t] = b.id; this.clearTile(t); }
    b.maxW = nd.workers || 0; b.ver++;
    this.onBuilt(b);
    this.alert('good', 'Upgrade complete', `${nd.name} has been completed.`, b.cx, b.cz);
    this.fx('sparkle', b.cx, b.cz, 14);
  }
  setRoad(tiles: { x: number; z: number }[], kind: number) {
    let n = 0, cost = 0;
    for (const t of tiles) {
      if (t.x < 1 || t.z < 1 || t.x >= N - 1 || t.z >= N - 1) continue;
      const i = t.z * N + t.x;
      if (this.world.tileWater[i] === 1 || this.occ[i] || this.road[i] === kind || this.siteAt.has(i)) continue;
      const o = this.owner[i];
      if (o !== 0 && o !== 255) continue;
      if (kind === 2) { if (this.res.stone < 1) { this.toast('Need stone for stone road'); break; } this.res.stone -= 1; this.flowNow.cons.stone++; cost++; }
      this.road[i] = kind; n++;
    }
    if (n) { this.roadDirty = true; this.version++; }
    return n;
  }
  removeRoad(tiles: { x: number; z: number }[]) {
    let n = 0;
    for (const t of tiles) { const i = t.z * N + t.x; if (i >= 0 && i < N * N && this.road[i]) { this.road[i] = 0; n++; } }
    if (n) { this.roadDirty = true; this.version++; }
  }
  setMaxWorkers(id: number, v: number) {
    const b = this.bById.get(id); if (!b) return;
    b.maxW = clamp(v, 0, BMAP[b.type].workers || 0);
    this.version++;
  }

  // ---------- territory ----------
  settlementPop(kind: string) { return Math.sqrt(this.citizens.length) * (kind === 'village' ? 0.7 : 1.0); }
  recomputeTerritory() {
    const best = new Float32Array(N * N);
    this.owner.fill(255);
    const apply = (cx: number, cz: number, r: number, o: number) => {
      this.scan(cx, cz, r, (t, x, z) => {
        const s = r - Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (s > 0 && (s > best[t] || (s === best[t] && o === 0))) { best[t] = s; this.owner[t] = o; }
      });
    };
    for (const b of this.buildings) {
      if (b.state === 'building') continue;
      const def = BMAP[b.type];
      if (!def.terr) continue;
      if (b.owner === 0 && b.downUntil > this.time) continue;
      let r = def.terr;
      if (b.owner === 0 && (def.settle === 'camp' || def.settle === 'village')) r += this.settlementPop(def.settle);
      apply(b.cx, b.cz, r, b.owner);
    }
    for (const t of this.tribes) {
      const r = 9 + Math.sqrt(t.pop) * 1.6 + t.tech;
      apply(t.x, t.z, r, t.id);
      for (const c of t.claims) if (c.until > this.year + this.day / DAYS_PER_YEAR) apply(c.x, c.z, c.r, t.id);
    }
    this.terrDirty = true;
  }

  // ---------- movement ----------
  moveObj(o: any, tx: number, tz: number, dt: number, sp: number): boolean {
    const dx = tx - o.x, dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    const t0 = tileIdx(o.x, o.z);
    if (t0 >= 0) {
      const r = this.road[t0];
      if (r === 1) sp *= 1.35; else if (r === 2) sp *= 1.7;
      if (this.world.tileWater[t0] === 2) sp *= 0.55;
    }
    const step = Math.min(d, sp * dt);
    const base = Math.atan2(dz, dx);
    if (o.dT > 0) o.dT -= dt;
    const tryAng = (a: number) => {
      const nx = o.x + Math.cos(a) * Math.max(step, 0.05), nz = o.z + Math.sin(a) * Math.max(step, 0.05);
      const nt = tileIdx(nx, nz);
      return nt >= 0 && this.world.tileWater[nt] !== 1;
    };
    if (o.dT > 0 && tryAng(base + o.dOff)) {
      o.x += Math.cos(base + o.dOff) * step; o.z += Math.sin(base + o.dOff) * step; o.ang = base + o.dOff; return false;
    }
    for (const off of OFFS) {
      for (const sgn of off === 0 ? [1] : [1, -1]) {
        const a = base + off * sgn;
        if (tryAng(a)) {
          o.x += Math.cos(a) * step; o.z += Math.sin(a) * step; o.ang = a;
          if (off !== 0) { o.dOff = off * sgn; o.dT = 1.6; } else o.dT = 0;
          o.stuck = 0;
          return false;
        }
      }
    }
    o.stuck = (o.stuck || 0) + dt;
    if (o.stuck > 3) { o.x = tx; o.z = tz; o.stuck = 0; return true; }
    return false;
  }
  goTo(c: Citizen, x: number, z: number) { c.tx = clamp(x, 1, N - 1); c.tz = clamp(z, 1, N - 1); c.walkT = 0; }
  walk(c: Citizen, dt: number) {
    c.walkT += dt;
    if (c.walkT > 60) { c.x = c.tx; c.z = c.tz; return true; }
    return this.moveObj(c, c.tx, c.tz, dt, 1.5 * c.speedMul * (c.age < 12 ? 0.8 : 1) * (c.health < 40 ? 0.7 : 1));
  }
  edgePoint(b: Building) {
    const a = rnd.range(0, 6.28);
    const rx = b.w / 2 + 0.7, rz = b.d / 2 + 0.7;
    return { x: b.cx + Math.cos(a) * rx, z: b.cz + Math.sin(a) * rz };
  }
  nearestB(x: number, z: number, pred: (b: Building) => boolean): Building | null {
    let best: Building | null = null, bd = 1e9;
    for (const b of this.buildings) {
      if (b.owner !== 0 || b.state === 'building' || !pred(b)) continue;
      const d = Math.hypot(b.cx - x, b.cz - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------- main update ----------
  update(dtReal: number) {
    if (!this.started || this.speed === 0) return;
    this.step(Math.min(dtReal, 0.1) * this.speed);
  }
  step(dt: number) {
    this.time += dt;
    const d = Math.floor(this.time / DAY_SEC);
    this.dayFrac = (this.time % DAY_SEC) / DAY_SEC;
    while (this.day < d) { this.day++; this.year = Math.floor(this.day / DAYS_PER_YEAR); this.season = Math.floor((this.day % DAYS_PER_YEAR) / 2); this.dailyTick(); }
    this.secAcc += dt;
    if (this.secAcc >= 1) { this.secAcc -= 1; this.secondTick(); }
    for (const c of this.citizens) if (c.alive) { c.age += dt / (DAY_SEC * DAYS_PER_YEAR); this.stepCitizen(c, dt); }
    this.updateAnimals(dt);
    this.updateBuildings(dt);
    T.updateWorldTribes(this, dt);
    E.updateEvents(this, dt);
  }

  // ---------- citizens ----------
  schedule(): string {
    const f = this.dayFrac;
    if (f >= 0.8) return 'sleep';
    if (f >= 0.7) return 'social';
    if (f >= 0.42 && f < 0.5) return 'eat';
    return 'work';
  }
  stepCitizen(c: Citizen, dt: number) {
    const act = this.schedule();
    if (c.act !== act) {
      if (c.act === 'sleep') c.hidden = false;
      c.act = act; c.phase = 0; c.timer = 0; c.carry = null;
      if (act === 'eat') { const b = this.nearestB(c.x, c.z, (q) => !!BMAP[q.type].capFood || BMAP[q.type].settle === 'camp'); if (b) { const p = this.edgePoint(b); this.goTo(c, p.x, p.z); } }
      else if (act === 'social') { const b = this.nearestB(c.x, c.z, (q) => !!BMAP[q.type].happy && q.state === 'ready'); if (b) { const p = this.edgePoint(b); this.goTo(c, p.x, p.z); } }
      else if (act === 'sleep') {
        const h = this.bById.get(c.homeId);
        if (h) this.goTo(c, h.cx, h.cz);
        else { const b = this.campfire(); if (b) { const p = this.edgePoint(b); this.goTo(c, p.x, p.z); } }
      }
    }
    c.working = false;
    const sick = c.sick || c.health < 25;
    if (act === 'sleep') {
      if (!c.hidden) { if (this.walk(c, dt)) { const h = this.bById.get(c.homeId); if (h && h.state === 'ready') c.hidden = true; } }
      return;
    }
    if (act === 'eat' || act === 'social') {
      if (this.walk(c, dt)) {
        c.timer += dt;
        if (c.timer > 2.5 && c.phase === 0) { c.phase = 1; if (act === 'social') c.needs.social = Math.min(100, c.needs.social + 25); }
      }
      return;
    }
    if (c.age < 12 || sick) { this.wander(c, dt, 4); return; }
    if (c.job === 'builder') { this.builderStep(c, dt); return; }
    const b = c.workId >= 0 ? this.bById.get(c.workId) : undefined;
    if (!b || b.state !== 'ready' || !b.enabled || b.downUntil > this.time) { this.wander(c, dt, 5); return; }
    const w = BMAP[b.type].work;
    if (!w) { this.wander(c, dt, 4); return; }
    if (w.k === 'node' || w.k === 'tree' || w.k === 'hunt' || w.k === 'fish' || w.k === 'water') this.tripStep(c, b, w, dt);
    else this.stationStep(c, b, dt);
  }
  wander(c: Citizen, dt: number, r: number) {
    const a = c as any;
    if (!a.wp) {
      const home = this.bById.get(c.homeId) || this.campfire();
      const bx = home ? home.cx : this.basePoint().x, bz = home ? home.cz : this.basePoint().z;
      this.goTo(c, bx + rnd.range(-r, r), bz + rnd.range(-r, r)); a.wp = 1;
    } else if (a.wp === 1) { if (this.walk(c, dt)) { a.wp = 2; a.wt = rnd.range(1, 5); } }
    else { a.wt -= dt; if (a.wt <= 0) a.wp = 0; }
  }
  toolMult() {
    let m = 1;
    if (this.hasTech('tools')) m += 0.15;
    if (this.hasTech('bronze')) m += 0.2;
    if (this.hasTech('iron')) m += 0.3;
    if (this.res.tools > 0) m += 0.1;
    return m;
  }
  effOf(c: Citizen, b: Building) {
    const sk = c.skills[JOB_SKILL[c.job] || 'gathering'] || 0;
    let e = this.toolMult() * (1 + sk * 0.6) * (0.5 + c.health / 200);
    if (this.roadNear(b)) e *= 1.1;
    return e;
  }
  roadNear(b: Building) {
    for (let dz = -1; dz <= b.d; dz++) for (let dx = -1; dx <= b.w; dx++) { const x = b.x + dx, z = b.z + dz; if (x >= 0 && z >= 0 && x < N && z < N && this.road[z * N + x]) return true; }
    return false;
  }
  gainSkill(c: Citizen, amt = 0.004) { const s = JOB_SKILL[c.job]; if (s) c.skills[s] = Math.min(1.5, c.skills[s] + amt); }

  tripStep(c: Citizen, b: Building, w: Work, dt: number) {
    if (c.phase === 0) {
      if (c.timer > 0) { c.timer -= dt; this.wander(c, dt, 3); return; }
      c.tgt = -1;
      let tx = -1, tz = -1;
      if (w.k === 'node') {
        let best = 1e9;
        this.scan(b.cx, b.cz, w.r, (t, x, z) => {
          const dp = this.world.dep[t];
          if (dp && w.deps.includes(dp) && this.world.depAmt[t] > 2) {
            const dd = Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz) + rnd.f() * 3;
            if (dd < best) { best = dd; c.tgt = t; tx = x + 0.5; tz = z + 0.5; }
          }
        });
      } else if (w.k === 'tree') {
        let best = 1e9;
        this.scan(b.cx, b.cz, w.r, (t, x, z) => {
          if (this.world.treeCount[t] > 0) {
            const dd = Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz) + rnd.f() * 4;
            if (dd < best) { best = dd; c.tgt = t; tx = x + 0.5; tz = z + 0.5; }
          }
        });
      } else if (w.k === 'hunt') {
        let best = 1e9;
        const rr = w.r * (this.hasTech('hunting') ? 1 : 0.5);
        for (const a of this.animals) {
          if (!a.alive || a.type === 3) continue;
          const dd = Math.hypot(a.x - b.cx, a.z - b.cz);
          if (dd < rr && dd + rnd.f() * 6 < best) { best = dd + rnd.f() * 6; c.tgt = a.id; tx = a.x; tz = a.z; }
        }
      } else {
        // shore tile (fish / water)
        let best = 1e9;
        const fresh = w.k === 'water';
        for (let k = 0; k < 70; k++) {
          const wr = (w as any).r as number;
          const x = Math.floor(b.cx + rnd.range(-wr, wr)), z = Math.floor(b.cz + rnd.range(-wr, wr));
          if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue;
          const t = z * N + x;
          if (this.world.tileWater[t]) continue;
          let wt = -1;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = (z + dz) * N + x + dx;
            if (this.world.tileWater[n] && (!fresh || this.world.biome[n] === BIO.LAKE || this.world.biome[n] === BIO.RIVER)) wt = n;
          }
          if (wt < 0) continue;
          const dd = Math.hypot(x + 0.5 - b.cx, z + 0.5 - b.cz);
          if (dd < best) { best = dd; c.tgt = wt; tx = x + 0.5; tz = z + 0.5; }
        }
      }
      if (c.tgt < 0) { this.wander(c, dt, 3); c.phase = 0; c.timer = 2.5; return; }
      this.goTo(c, tx, tz); c.phase = 1;
    } else if (c.phase === 1) {
      if (w.k === 'hunt') {
        const a = this.animals.find((q) => q.id === c.tgt);
        if (!a || !a.alive) { c.phase = 0; return; }
        this.goTo(c, a.x, a.z); c.walkT = 0;
        if (Math.hypot(a.x - c.x, a.z - c.z) < 1.0) { c.phase = 2; c.timer = 0; }
        else this.moveObj(c, a.x, a.z, dt, 1.9 * c.speedMul);
        return;
      }
      if (this.walk(c, dt)) { c.phase = 2; c.timer = 0; }
    } else if (c.phase === 2) {
      c.timer += dt; c.working = true;
      c.ang += 0;
      const dur = w.k === 'hunt' ? 1.2 : w.k === 'tree' ? 3 : 2.5;
      if (c.timer < dur) return;
      const e = this.effOf(c, b);
      let res: Res | null = null, amt = 0;
      if (w.k === 'node') {
        const dp = this.world.dep[c.tgt];
        if (!dp) { c.phase = 0; return; }
        const info = DEP_INFO[dp];
        res = info.res!;
        amt = Math.min(w.per * 2 * e * (dp === DEP.BERRIES || dp === DEP.FIBER ? this.mod.gather : 1), this.world.depAmt[c.tgt]);
        this.world.depAmt[c.tgt] -= amt;
        if (this.world.depAmt[c.tgt] < 1 && dp !== DEP.BERRIES && dp !== DEP.FIBER) { this.world.dep[c.tgt] = 0; this.depDirty.push(c.tgt); }
        if (dp !== DEP.BERRIES && dp !== DEP.FIBER && rnd.f() < 0.5) this.fx('dust', c.x, c.z, 2);
      } else if (w.k === 'tree') {
        const t = c.tgt, st = this.world.treeStart[t];
        let idx = -1;
        for (let k = 0; k < 6; k++) { const ti = st + k; if (ti < this.world.trees.length && this.world.trees[ti].tile === t && this.world.treeAlive[ti]) idx = ti; }
        if (idx < 0 || this.world.treeCount[t] <= 0) { c.phase = 0; return; }
        this.world.treeAlive[idx] = 0; this.world.treeCount[t]--; this.treeDirty.push(idx); this.cutTrees++;
        res = 'wood'; amt = 6 * e;
        this.fx('dust', c.x, c.z, 3);
      } else if (w.k === 'hunt') {
        const a = this.animals.find((q) => q.id === c.tgt);
        if (!a || !a.alive) { c.phase = 0; return; }
        a.alive = false; a.respawn = 70 + rnd.f() * 60;
        res = 'meat'; amt = ANIMAL_INFO[a.type].meat * e * this.mod.hunt;
        this.fx('dust', a.x, a.z, 4);
      } else if (w.k === 'fish') {
        res = 'fish'; amt = 6 * e * (this.world.biome[c.tgt] === BIO.RIVER ? 0.8 : 1) * (this.season === 3 ? 0.8 : 1);
      } else {
        res = 'water'; amt = 10 * e * this.mod.water;
      }
      c.carry = res; c.carryAmt = amt; c.phase = 3; c.timer = 0;
      this.gainSkill(c);
      const p = this.edgePoint(b);
      this.goTo(c, p.x, p.z);
    } else if (c.phase === 3) {
      if (this.walk(c, dt)) { this.deliver(c); c.phase = 0; }
    }
  }
  deliver(c: Citizen) {
    if (!c.carry) return;
    const net = c.carryAmt * (1 - this.tribute / 100);
    this.add(c.carry, net);
    this.prestige += c.carryAmt * (this.tribute / 100) * 0.05;
    c.carry = null; c.carryAmt = 0;
  }
  stationStep(c: Citizen, b: Building, dt: number) {
    const w = BMAP[b.type].work!;
    if (c.phase === 0) {
      let x: number, z: number;
      if (w.k === 'field' || w.k === 'pen') { x = b.x + 0.5 + rnd.f() * (b.w - 1); z = b.z + 0.5 + rnd.f() * (b.d - 1); }
      else if (w.k === 'warrior') { x = b.cx + rnd.range(-4, 4); z = b.cz + rnd.range(-4, 4); }
      else if (w.k === 'trade') { x = b.cx + rnd.range(-3, 3); z = b.cz + rnd.range(-3, 3); }
      else if (w.k === 'guard') { x = b.cx + 0.2 * Math.cos(c.id); z = b.cz + b.d / 2 + 0.6; }
      else { const p = this.edgePoint(b); x = p.x; z = p.z; }
      this.goTo(c, x, z); c.phase = 1;
    } else if (c.phase === 1) { if (this.walk(c, dt)) { c.phase = 2; c.timer = rnd.range(3, 7); } }
    else { c.timer -= dt; c.working = w.k !== 'guard' && w.k !== 'trade'; if (c.timer <= 0) c.phase = w.k === 'guard' ? 2 : 0; if (w.k === 'guard') c.timer = 5; this.gainSkill(c, 0.0004); }
  }
  builderStep(c: Citizen, dt: number) {
    if (c.phase === 0) {
      let best: Building | null = null, bd = 1e9;
      for (const b of this.buildings) {
        if (b.owner !== 0 || b.state === 'ready') continue;
        const d = Math.hypot(b.cx - c.x, b.cz - c.z) + b.workers.length * 3;
        if (d < bd) { bd = d; best = b; }
      }
      if (!best) { this.wander(c, dt, 4); return; }
      c.tgt = best.id;
      c.carry = 'wood'; c.carryAmt = 1;
      const p = this.edgePoint(best);
      this.goTo(c, p.x, p.z); c.phase = 1;
    } else if (c.phase === 1) {
      const b = this.bById.get(c.tgt);
      if (!b || b.state === 'ready') { c.phase = 0; c.carry = null; return; }
      if (this.walk(c, dt)) { c.phase = 2; c.timer = 0; c.carry = null; }
    } else if (c.phase === 2) {
      const b = this.bById.get(c.tgt);
      if (!b || b.state === 'ready') { c.phase = 0; return; }
      c.timer += dt; c.working = true;
      const def = BMAP[b.state === 'upgrading' && b.upTo ? b.upTo : b.type];
      const rate = (1 + c.skills.building * 0.6) * this.toolMult() * (0.5 + c.health / 200);
      b.progress += (dt * rate) / def.time;
      if (Math.floor(c.timer * 2) % 3 === 0 && rnd.f() < dt * 2) this.fx('dust', b.cx + rnd.range(-b.w / 2, b.w / 2), b.cz + rnd.range(-b.d / 2, b.d / 2), 1);
      this.gainSkill(c, 0.0008);
      if (b.progress >= 1) {
        b.progress = 1;
        if (b.state === 'upgrading') this.finishUpgrade(b); else this.onBuilt(b);
        c.phase = 0;
      } else if (c.timer > 9) c.phase = 0;
    }
  }

  // ---------- animals ----------
  updateAnimals(dt: number) {
    const W = this.world;
    for (const a of this.animals) {
      if (!a.alive) {
        a.respawn -= dt;
        if (a.respawn <= 0) { a.alive = true; a.x = a.hx + rnd.range(-2, 2); a.z = a.hz + rnd.range(-2, 2); if (W.tileWater[tileIdx(a.x, a.z)]) { a.x = a.hx; a.z = a.hz; } a.tx = a.x; a.tz = a.z; }
        continue;
      }
      const info = ANIMAL_INFO[a.type];
      a.timer -= dt;
      if (a.type === 3) {
        // wolf: hunt citizens nearby
        let near: Citizen | null = null, nd = 9;
        for (const c of this.citizens) { if (!c.alive || c.hidden) continue; const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < nd) { nd = d; near = c; } }
        if (near) {
          let guard = 0;
          for (const b of this.buildings) if (b.owner === 0 && (BMAP[b.type].work?.k === 'warrior' || BMAP[b.type].work?.k === 'guard') && Math.hypot(b.cx - a.x, b.cz - a.z) < 10 && b.state === 'ready') guard++;
          a.tx = near.x; a.tz = near.z; a.timer = 1;
          a.atk -= dt;
          if (nd < 1.0 && a.atk <= 0) {
            a.atk = 3;
            if (guard > 0 || rnd.f() < 0.15) { a.alive = false; a.respawn = 120; this.fx('clash', a.x, a.z, 4); }
            else { near.health -= 14; this.fx('clash', near.x, near.z, 3); if (rnd.f() < 0.3) this.alert('warn', 'Wolf attack', `${near.name} was bitten by a wolf near ${this.nearestSettlementName(near.x, near.z)}. Build a lookout or warriors' lodge nearby.`, near.x, near.z); }
          }
        }
      } else {
        for (const c of this.citizens) { if (c.hidden) continue; const d = Math.hypot(c.x - a.x, c.z - a.z); if (d < 2.5) { a.flee = 2; a.tx = a.x + (a.x - c.x) * 4; a.tz = a.z + (a.z - c.z) * 4; break; } }
      }
      if (a.timer <= 0 && a.flee <= 0 && a.type !== 3 || (a.type === 3 && a.timer <= 0 && Math.hypot(a.tx - a.x, a.tz - a.z) < 1)) {
        if (a.migrate) { a.timer = 5; }
        else {
          a.tx = a.hx + rnd.range(-6, 6); a.tz = a.hz + rnd.range(-6, 6);
          a.timer = rnd.range(3, 10);
          if (rnd.f() < 0.45) { a.tx = a.x; a.tz = a.z; } // graze
        }
      }
      a.flee -= dt;
      const sp = info.speed * (a.flee > 0 ? 2.4 : 1);
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const step = Math.min(d, sp * dt * (a.type === 3 ? 1.6 : 0.8));
        const nx = a.x + (dx / d) * step, nz = a.z + (dz / d) * step;
        const nt = tileIdx(nx, nz);
        if (nt >= 0 && !W.tileWater[nt] && W.h[Math.floor(nz) * V + Math.floor(nx)] < 11) { a.x = nx; a.z = nz; a.ang = Math.atan2(dz, dx); }
        else { a.tx = a.x; a.tz = a.z; }
      }
      if (a.migrate && Math.hypot(a.tx - a.x, a.tz - a.z) < 1.5) { a.alive = false; a.respawn = 1e9; a.migrate = false; }
    }
  }
  nearestSettlementName(x: number, z: number) {
    let best = 'the camp', bd = 1e9;
    for (const s of this.settlements) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s.name; } }
    return best;
  }

  // ---------- buildings ----------
  updateBuildings(dt: number) {
    const dd = dt / DAY_SEC;
    const farmSeason = [1.0, 1.15, 1.3, 0.15][this.season];
    const adv = this.hasTech('advagri');
    for (const b of this.buildings) {
      if (b.owner !== 0) {
        if (b.auto && b.state === 'building') { b.progress += dt / (BMAP[b.type].time * 1.5); if (b.progress >= 1) { b.progress = 1; this.onBuilt(b, true); } }
        continue;
      }
      if (b.state !== 'ready' || !b.enabled || b.downUntil > this.time) continue;
      const def = BMAP[b.type];
      if (def.terr || def.capGen) { /* passive */ }
      const w = def.work;
      if (!w) continue;
      const act = b.out;
      if (act <= 0) { b.status = def.workers ? 'No workers' : ''; continue; }
      b.status = 'Working';
      if (w.k === 'field') {
        let irr = 1;
        if (adv) for (const o of this.buildings) if (o.owner === 0 && o.type === 'irrigation' && o.state === 'ready' && Math.hypot(o.cx - b.cx, o.cz - b.cz) < 9) { irr = 1.35; break; }
        let mod = this.mod.farm;
        if (this.mod.drought && irr === 1) mod *= 0.4; else if (this.mod.drought) mod *= 0.85;
        const y = act * 9 * (0.25 + b.fert) * b.wf * farmSeason * irr * mod * (1 + this.toolMult() * 0.1) * dd * (this.roadNear(b) ? 1.1 : 1) * (1 - Math.min(0.5, this.poll[(b.z) * N + b.x] * 0.1));
        this.add('grain', y);
        this.info.farmY += y;
      } else if (w.k === 'pen') {
        this.add('meat', act * 6 * dd); this.add('fiber', act * 2 * dd);
      } else if (w.k === 'well') {
        this.add('water', act * 14 * dd * this.mod.water);
      } else if (w.k === 'lore') {
        this.knowledgeAcc += act * w.rate * dd * (1 + this.avgSkill(b, 'lore') * 0.5);
      } else if (w.k === 'craft') {
        let have = true;
        for (const k in w.inp) if (this.res[k as Res] < (w.inp as any)[k]) { have = false; b.status = 'Missing ' + RES[k as Res].name; }
        if (have) {
          b.craftProg += act * this.toolMult() * dt;
          if (b.craftProg >= w.time) {
            b.craftProg = 0;
            for (const k in w.inp) this.take(k as Res, (w.inp as any)[k]);
            for (const k in w.out) this.add(k as Res, (w.out as any)[k]);
            this.fx('smoke', b.cx, b.cz, 3);
          }
        }
      }
    }
  }
  avgSkill(b: Building, sk: Skill) {
    let s = 0, n = 0;
    for (const id of b.workers) { const c = this.cById.get(id); if (c) { s += c.skills[sk]; n++; } }
    return n ? s / n : 0;
  }

  // ---------- per-second logic ----------
  secondTick() {
    // capacities
    let cg = 120, cf = 100, housing = 0;
    for (const b of this.buildings) {
      if (b.owner !== 0 || b.state === 'building') continue;
      const d = BMAP[b.type];
      cg += d.capGen || 0; cf += d.capFood || 0; housing += d.housing || 0;
    }
    for (const s of this.world.sites) if (s.found && s.kind === 'cave' && this.owner[s.tile] === 0) housing += 5;
    this.capGen = cg; this.capFood = cf; this.info.housing = housing;
    // active workers per building
    for (const b of this.buildings) b.out = 0;
    for (const c of this.citizens) if (c.alive && c.workId >= 0 && c.act === 'work' && c.job !== 'builder') { const b = this.bById.get(c.workId); if (b) b.out++; }
    this.terrAcc++;
    if (this.terrDirty || this.terrAcc >= 6) { this.terrAcc = 0; this.recomputeTerritory(); this.terrDirty = false; }
    this.assignHousing();
    this.assignJobs();
    this.updateInfo();
    this.modsTick();
    T.secondTribes(this);
    // discover sites
    for (const s of this.world.sites) {
      if (s.found) continue;
      const near = this.citizens.some((c) => c.alive && Math.abs(c.x - s.x) < 4 && Math.abs(c.z - s.z) < 4) || this.owner[s.tile] === 0;
      if (!near) continue;
      s.found = true;
      if (s.kind === 'cave') { this.knowledgeAcc += 15; this.add('gems', 2); this.alert('good', 'Cave discovered', 'Your people found a dry cave with ancient paintings. It offers natural shelter for 5, and the paintings inspire the elders (+15 knowledge, +2 gems).', s.x, s.z); }
      else if (s.kind === 'ruin') { this.knowledgeAcc += 30; this.add('pottery', 5); this.add('bronze', 3); this.alert('good', 'Ancient ruin found', 'Crumbled walls of a forgotten people. Scholars study the carvings (+30 knowledge, relics recovered).', s.x, s.z); }
      else { this.knowledgeAcc += 20; this.prestige += 2; this.alert('good', 'Standing stone found', 'A great monolith aligned with the stars. Your elders are awed (+20 knowledge, +2 prestige).', s.x, s.z); }
    }
    this.version++;
  }
  modsTick() {
    E.applyMods(this);
  }
  defenseAt(x: number, z: number) {
    let r = 0;
    for (const c of this.citizens) if (c.alive && c.job === 'warrior' && Math.hypot(c.x - x, c.z - z) < 28) r += (1 + c.skills.combat) * (0.8 + this.toolMult() * 0.3) * 1.4;
    let walls = 0;
    for (const b of this.buildings) {
      if (b.owner !== 0 || b.state !== 'ready') continue;
      const d = Math.hypot(b.cx - x, b.cz - z);
      if (b.type === 'lookout' && d < 22) r += 2 + b.out * 0.8;
      else if (b.type === 'stone_tower' && d < 24) r += 6 + b.out;
      else if (BMAP[b.type].wall && d < 14) walls += b.type === 'stone_wall' ? 0.5 : 0.25;
    }
    r += Math.min(14, walls);
    r += this.citizens.length * 0.04;
    return r;
  }
  updateInfo() {
    const I = this.info;
    const cs = this.citizens.filter((c) => c.alive);
    I.pop = cs.length;
    I.adults = cs.filter((c) => c.age >= 12).length;
    I.children = I.pop - I.adults;
    let hs = 0, hl = 0, sick = 0;
    const jobs: Record<string, number> = {};
    for (const c of cs) { hs += c.happy; hl += c.health; if (c.sick) sick++; jobs[c.job] = (jobs[c.job] || 0) + 1; }
    I.happy = I.pop ? hs / I.pop : 50; I.avgHealth = I.pop ? hl / I.pop : 100; I.sick = sick; I.jobs = jobs;
    I.homeless = cs.filter((c) => c.homeId < 0).length;
    I.unemployed = cs.filter((c) => c.age >= 12 && c.age < 56 && c.job === 'none').length;
    I.warriors = jobs['warrior'] || 0;
    const per = this.dailyFoodNeed();
    I.foodDays = per > 0 ? this.foodTotal() / per : 99;
    const bp = this.basePoint();
    I.defense = this.defenseAt(bp.x, bp.z);
    for (const s of this.settlements) s.pop = 0;
    for (const c of cs) {
      let bs: Settlement | null = null, bd = 1e9;
      for (const s of this.settlements) { const d = Math.hypot(s.x - c.x, s.z - c.z); if (d < bd) { bd = d; bs = s; } }
      if (bs) { bs.pop++; c.settlement = bs.id; }
    }
    I.kRate = this.knowledgeRate();
  }
  dailyFoodNeed() {
    let n = 0;
    for (const c of this.citizens) if (c.alive) n += c.age < 12 ? 0.6 : 1;
    let foodSave = 0;
    for (const b of this.buildings) if (b.owner === 0 && b.state === 'ready') foodSave += BMAP[b.type].foodSave || 0;
    return n * this.rations * (1 - Math.min(0.2, foodSave)) * (this.season === 3 ? 1.1 : 1) * (this.mod.cold ? 1.2 : 1);
  }
  knowledgeRate() {
    let lore = 0;
    for (const b of this.buildings) if (b.owner === 0 && b.state === 'ready' && b.enabled) { const w = BMAP[b.type].work; if (w && w.k === 'lore') lore += b.out * w.rate; }
    return this.citizens.length * 0.2 + lore;
  }
  assignHousing() {
    const occ = new Map<number, number>();
    for (const c of this.citizens) if (c.alive && c.homeId >= 0) {
      const b = this.bById.get(c.homeId);
      if (!b || b.state === 'building' || !BMAP[b.type].housing) c.homeId = -1; else occ.set(b.id, (occ.get(b.id) || 0) + 1);
    }
    const homes = this.buildings.filter((b) => b.owner === 0 && b.state !== 'building' && BMAP[b.type].housing && b.downUntil <= this.time);
    const free = (b: Building) => (BMAP[b.type].housing || 0) - (occ.get(b.id) || 0);
    for (const c of this.citizens) {
      if (!c.alive || c.homeId >= 0) continue;
      let target: Building | undefined;
      const kin = [c.partner, ...c.parents];
      for (const k of kin) { const o = this.cById.get(k); if (o && o.homeId >= 0) { const hb = this.bById.get(o.homeId); if (hb && free(hb) > 0) { target = hb; break; } } }
      if (!target) {
        let best = -1;
        for (const b of homes) { const f = free(b); if (f > 0) { const sc = (BMAP[b.type].housing || 0) * 0.1 + f * 0.2 - Math.hypot(b.cx - c.x, b.cz - c.z) * 0.02; if (sc > best || !target) { best = sc; target = b; } } }
      }
      if (target) { c.homeId = target.id; occ.set(target.id, (occ.get(target.id) || 0) + 1); }
    }
  }
  release(c: Citizen) {
    const b = this.bById.get(c.workId);
    if (b) b.workers = b.workers.filter((x) => x !== c.id);
    c.workId = -1; c.job = 'none'; c.phase = 0; c.carry = null;
  }
  assignJobs() {
    const adultsW = this.citizens.filter((c) => c.alive && c.age >= 12 && c.age < 56);
    for (const c of this.citizens) {
      if (!c.alive || c.job === 'none' || c.job === 'builder') continue;
      const b = this.bById.get(c.workId);
      if (!b || b.state !== 'ready' || !b.enabled || !b.workers.includes(c.id)) this.release(c);
    }
    for (const b of this.buildings) {
      if (b.owner !== 0) continue;
      b.workers = b.workers.filter((id) => { const c = this.cById.get(id); return c && c.alive && c.workId === b.id; });
      while (b.workers.length > b.maxW) { const id = b.workers.pop()!; const c = this.cById.get(id); if (c) this.release(c); }
    }
    const sites = this.buildings.filter((b) => b.owner === 0 && b.state !== 'ready').length;
    let desired = this.prio.build === 0 || sites === 0 ? 0 : Math.min(sites * 2, Math.max(2, Math.floor(adultsW.length * (0.35 + this.prio.build * 0.1))));
    const builders = this.citizens.filter((c) => c.alive && c.job === 'builder');
    while (builders.length > desired) { const c = builders.pop()!; c.job = 'none'; c.phase = 0; c.carry = null; }
    const pool = adultsW.filter((c) => c.job === 'none');
    const elders = this.citizens.filter((c) => c.alive && c.age >= 56 && c.job === 'none');
    const needB = desired - builders.length;
    for (let i = 0; i < needB; i++) {
      let c = pool.pop();
      if (!c) {
        // draft from least important workplace
        const cand = adultsW.filter((q) => q.job !== 'builder' && q.job !== 'none' && !['hunter', 'farmer', 'gatherer', 'fisher', 'water', 'herder'].includes(q.job));
        c = cand[Math.floor(Math.random() * cand.length)];
        if (!c) break;
        this.release(c);
      }
      c.job = 'builder'; c.workId = -1; c.phase = 0;
    }
    // slots
    const fd = this.info.foodDays;
    const need = (cat: string) => {
      if (cat === 'food') return fd < 2 ? 3 : fd < 5 ? 1.5 : fd < 10 ? 0.4 : 0;
      if (cat === 'water') return this.res.water < 30 ? 1.5 : 0;
      if (cat === 'materials') return this.res.wood < 30 ? 0.9 : this.res.stone < 20 ? 0.4 : 0;
      if (cat === 'defense') return this.raids.length ? 3 : 0.2;
      if (cat === 'knowledge') return 0.5;
      return 0.2;
    };
    const slotB = this.buildings.filter((b) => b.owner === 0 && b.state === 'ready' && b.enabled && BMAP[b.type].job && b.workers.length < b.maxW);
    const fill = (c: Citizen, isElder: boolean) => {
      let best: Building | null = null, bs = -1e9;
      for (const b of slotB) {
        if (b.workers.length >= b.maxW) continue;
        const def = BMAP[b.type];
        const w = this.prio[def.prio || 'craft'];
        if (!w) continue;
        if (isElder && !['shaman', 'scribe', 'trader', 'healer', 'guard'].includes(def.job!)) continue;
        const sk = c.skills[JOB_SKILL[def.job!] || 'gathering'] || 0;
        const sc = w * 1.0 + need(def.prio || 'craft') + sk * 1.5 + Math.random() * 0.4 - (b.workers.length / Math.max(1, b.maxW)) * 0.5 - Math.hypot(b.cx - c.x, b.cz - c.z) * 0.01;
        if (sc > bs) { bs = sc; best = b; }
      }
      if (best) { c.job = BMAP[best.type].job!; c.workId = best.id; best.workers.push(c.id); c.phase = 0; c.carry = null; return true; }
      return false;
    };
    for (const c of pool) fill(c, false);
    for (const c of elders) fill(c, true);
    // emergency food rebalancing
    if (fd < 3 && this.citizens.length > 6) {
      const foodSlot = slotB.find((b) => BMAP[b.type].prio === 'food' && b.workers.length < b.maxW);
      if (foodSlot) {
        const cand = adultsW.filter((q) => q.job !== 'none' && q.job !== 'builder' && !['hunter', 'farmer', 'gatherer', 'fisher', 'herder'].includes(q.job));
        const c = cand[Math.floor(Math.random() * cand.length)];
        if (c) { this.release(c); fill(c, false); }
      }
    }
    // trim: priority off
    for (const b of this.buildings) {
      if (b.owner !== 0) continue;
      const def = BMAP[b.type];
      if (def.prio && this.prio[def.prio] === 0) for (const id of [...b.workers]) { const c = this.cById.get(id); if (c) this.release(c); }
    }
  }

  // ---------- daily ----------
  dailyTick() {
    this.flowLast = this.flowNow;
    this.flowNow = { prod: emptyRes(), cons: emptyRes() };
    this.info.farmY = 0;
    const cs = this.citizens.filter((c) => c.alive);
    const pop = cs.length;
    // food
    const need = this.dailyFoodNeed();
    const F = this.foodTotal();
    let hungerFrac = 0, variety = 0;
    if (need > 0) {
      if (F >= need) {
        for (const r of FOOD_RES) { const t = (need * this.res[r]) / F; if (this.res[r] > need * 0.08) variety++; this.take(r, t); }
      } else {
        for (const r of FOOD_RES) { if (this.res[r] > 0.5) variety++; this.take(r, this.res[r]); }
        hungerFrac = 1 - F / need;
      }
    }
    // water
    let thirstyFrac = 0;
    {
      let unmet = 0;
      for (const c of cs) {
        const h = this.bById.get(c.homeId);
        const px = h ? h.cx : c.x, pz = h ? h.cz : c.z;
        if (!this.freshNear(px, pz, 8)) unmet += c.age < 12 ? 0.3 : 0.5;
      }
      const wn = unmet * this.mod.water * (this.mod.drought ? 1.3 : 1);
      if (wn > 0) { const t = this.take('water', wn); thirstyFrac = wn > 0 ? 1 - t / wn : 0; }
      for (const b of this.buildings) if (b.owner === 0 && b.state === 'ready' && b.type === 'aqueduct') this.add('water', 60);
    }
    // winter warmth
    let coldFrac = 0;
    if (this.season === 3 || this.mod.cold) {
      const wn = pop * (this.mod.cold ? 0.3 : 0.12);
      const t = this.take('wood', wn);
      coldFrac = wn > 0 ? 1 - t / wn : 0;
    }
    // spoilage
    const granaries = this.buildings.filter((b) => b.owner === 0 && b.type === 'granary' && b.state === 'ready').length;
    const sp = (1 / (1 + 0.35 * granaries)) * (this.hasTech('pottery') ? 0.8 : 1) * (this.season === 1 ? 1.3 : 1);
    this.res.berries *= 1 - 0.05 * sp; this.res.meat *= 1 - 0.035 * sp; this.res.fish *= 1 - 0.04 * sp; this.res.grain *= 1 - 0.006 * sp;
    // knowledge
    const base = pop * 0.2;
    this.knowledgeAcc += base;
    if (this.research) {
      this.research.progress += this.knowledgeAcc; this.knowledgeAcc = 0;
      const t = TECH_MAP[this.research.id];
      if (this.research.progress >= t.cost) {
        this.techs.add(t.id);
        this.alert('good', `Discovery: ${t.name}`, `${t.desc} Unlocks: ${t.bonus}.`);
        this.research = null;
        this.prestige += 1;
      }
    } else if (this.knowledgeAcc > 400) this.knowledgeAcc = 400;
    // per-citizen
    const homeless = cs.filter((c) => c.homeId < 0).length;
    let deaths = 0, starved = 0;
    const healers = this.buildings.filter((b) => b.owner === 0 && b.type === 'herbalist' && b.state === 'ready' && b.out > 0).length;
    for (const c of cs) {
      const h = this.bById.get(c.homeId);
      // needs
      c.needs.food = clamp(c.needs.food + (hungerFrac > 0 ? -hungerFrac * 45 : 22), 0, 100);
      c.needs.water = clamp(c.needs.water + (thirstyFrac > 0 ? -thirstyFrac * 50 : 25), 0, 100);
      c.needs.rest = clamp(c.needs.rest + (c.homeId >= 0 ? 30 : 10) - 20, 0, 100);
      c.needs.social = clamp(c.needs.social - 8, 0, 100);
      // health
      let dh = 3;
      if (c.needs.food < 25) dh -= 14 * (1 - c.needs.food / 25);
      if (c.needs.water < 25) dh -= 18 * (1 - c.needs.water / 25);
      if (coldFrac > 0) dh -= coldFrac * (c.homeId >= 0 ? 4 : 10);
      if (c.sick) { dh -= 6; if (Math.random() < 0.2 + healers * 0.2) c.sick = false; }
      const pl = this.poll[tileIdx(c.x, c.z) < 0 ? 0 : tileIdx(c.x, c.z)] || 0;
      if (pl > 3) dh -= Math.min(4, (pl - 3) * 0.5);
      if (healers && c.health < 70) dh += 2 * healers;
      c.health = clamp(c.health + dh, 0, 100);
      if (this.mod.plague && !c.sick && Math.random() < 0.05 * this.mod.plague) c.sick = true;
      // happiness
      let t = 38;
      t += c.needs.food > 70 ? 12 : c.needs.food < 30 ? -20 : 0;
      t += c.needs.water > 70 ? 6 : c.needs.water < 30 ? -14 : 0;
      t += h ? 6 + Math.min(8, (BMAP[h.type].housing || 0) * 0.5) : -12;
      t += Math.min(9, Math.max(0, variety - 1) * 3);
      let com = 0;
      const px = h ? h.cx : c.x, pz = h ? h.cz : c.z;
      for (const b of this.buildings) if (b.owner === 0 && b.state === 'ready') { const hp = BMAP[b.type].happy; if (hp && Math.hypot(b.cx - px, b.cz - pz) < 16) com += hp; }
      t += Math.min(30, com * 0.8);
      if (coldFrac > 0.1) t -= 10;
      if (c.health < 50) t -= 8;
      if (c.sick) t -= 12;
      t -= Math.min(10, pl * 1.5);
      t -= this.tribute * 0.4;
      t += this.happyMod;
      if (this.rations > 1) t += 4; else if (this.rations < 1) t -= 6;
      c.happy += (clamp(t, 0, 100) - c.happy) * 0.35;
      // death
      let die = '';
      if (c.health <= 0) die = c.needs.food < 25 ? 'starvation' : c.sick ? 'disease' : 'exposure';
      else if (c.age > 52 && Math.random() < (c.age - 52) * 0.012) die = 'old age';
      if (die) { deaths++; if (die === 'starvation') starved++; this.die(c, die); }
    }
    // disease spread
    if (cs.some((c) => c.sick)) {
      for (const c of cs) if (c.alive && !c.sick) {
        const sickMate = cs.some((o) => o.sick && o.alive && ((o.homeId >= 0 && o.homeId === c.homeId) || Math.hypot(o.x - c.x, o.z - c.z) < 3));
        if (sickMate && Math.random() < 0.18) c.sick = true;
      }
    }
    if (deaths > 0 && starved > 0) this.alert('danger', 'Famine', `${starved} people died of hunger. Build more food sources, or lower rations, quickly!`);
    else if (deaths > 2) this.alert('warn', 'Deaths in the tribe', `${deaths} people died today.`);
    this.stats.deaths += deaths; this.stats.starved += starved;
    // pairing & births
    const singles = cs.filter((c) => c.alive && c.partner < 0 && c.age >= 16 && c.age < 45);
    for (const a of singles) {
      if (a.partner >= 0 || Math.random() > 0.1) continue;
      const m = singles.find((o) => o.alive && o.partner < 0 && o.female !== a.female && o.id !== a.id && !a.parents.includes(o.id) && !o.parents.includes(a.id));
      if (m) { a.partner = m.id; m.partner = a.id; }
    }
    const foodOk = this.info.foodDays > 4 && this.res.water > 5 || this.info.foodDays > 8;
    const housingFree = this.info.housing - pop;
    for (const w of cs) {
      if (!w.alive || !w.female || w.partner < 0 || w.age < 16 || w.age > 40 || w.children.length >= 5) continue;
      const m = this.cById.get(w.partner);
      if (!m || !m.alive) continue;
      const boom = this.events.some((e) => e.kind === 'boom') ? 2.2 : 1;
      if (foodOk && housingFree > -1 && w.health > 50 && Math.random() < 0.055 * boom) {
        const kid = this.makeCitizen(w.x, w.z, Math.random() < 0.5, 0);
        kid.parents = [w.id, m.id]; w.children.push(kid.id); m.children.push(kid.id);
        kid.homeId = w.homeId;
        this.stats.births++;
      }
    }
    // immigration
    if (this.started && this.info.happy > 52 && foodOk && housingFree >= 2 && Math.random() < 0.16 + (this.prestige > 10 ? 0.05 : 0)) {
      const b = this.campfire();
      if (b) {
        const n = Math.min(3, housingFree);
        const px = b.cx + (Math.random() - 0.5) * 30, pz = b.cz + (Math.random() - 0.5) * 30;
        const f = this.rand.f() < 0.5;
        for (let i = 0; i < n; i++) { const c = this.makeCitizen(clamp(px, 2, N - 2), clamp(pz, 2, N - 2), i % 2 === 0 ? f : !f, 17 + Math.random() * 15); this.goTo(c, b.cx, b.cz); }
        this.alert('good', 'Newcomers arrive', `${n} wanderers were drawn by your fires and full stores. They join your tribe.`, b.cx, b.cz);
      }
    }
    // deposit regen
    const W = this.world;
    for (let t = 0; t < N * N; t += 1) { const d = W.dep[t]; if ((d === DEP.BERRIES || d === DEP.FIBER) && W.depAmt[t] < W.depMax[t]) W.depAmt[t] = Math.min(W.depMax[t], W.depAmt[t] + 0.8 * (this.season === 3 ? 0 : 1)); }
    // pollution
    for (const b of this.buildings) if (b.owner === 0 && b.state === 'ready' && b.out > 0) { const p = BMAP[b.type].poll; if (p) this.addPoll(b.cx, b.cz, p * (1 + b.out * 0.2)); }
    for (let t = 0; t < N * N; t++) if (this.poll[t] > 0) this.poll[t] = Math.max(0, this.poll[t] * 0.92 - 0.02);
    // cleanup
    this.citizens = this.citizens.filter((c) => c.alive);
    // history
    this.hist.push({ year: this.year + this.day / DAYS_PER_YEAR, day: this.day, pop: pop, food: this.foodTotal(), happy: this.info.happy, wood: this.res.wood, stone: this.res.stone, bronze: this.res.bronze, knowledge: this.research ? this.research.progress : 0 });
    if (this.hist.length > 240) this.hist.shift();
    // food alerts
    if (this.info.foodDays < 3 && pop > 5 && this.day % 2 === 0) this.alert('danger', 'Food shortage', `Only ${this.info.foodDays.toFixed(1)} days of food remain for ${pop} people. Assign more hunters, gatherers or farmers.`);
    if (homeless > 2 && this.day % 4 === 0) this.alert('warn', 'People without shelter', `${homeless} people have no home. Build huts or other housing.`);
    T.dailyTribes(this);
    E.dailyEvents(this);
    this.happyMod *= 0.8;
    if (Math.abs(this.happyMod) < 0.3) this.happyMod = 0;
    this.version++;
  }
  addPoll(cx: number, cz: number, amt: number) {
    this.scan(cx, cz, 5, (t, x, z) => { const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (d < 5) this.poll[t] += amt * (1 - d / 5); });
  }
  die(c: Citizen, cause: string) {
    c.alive = false; c.hidden = true;
    const b = this.bById.get(c.workId);
    if (b) b.workers = b.workers.filter((x) => x !== c.id);
    const p = this.cById.get(c.partner); if (p) p.partner = -1;
    this.cById.delete(c.id);
    if (cause === 'old age' && c.age > 55 && Math.random() < 0.3) this.alert('info', 'An elder passes', `${c.name} died of old age at ${Math.floor(c.age)}.`, c.x, c.z);
  }
  startResearch(id: string) {
    const t = TECH_MAP[id];
    if (!t || this.techs.has(id) || !t.req.every((r) => this.techs.has(r))) return false;
    if (t.res && !this.afford(t.res)) { this.toast('Need ' + this.missing(t.res).join(', ')); return false; }
    if (this.research) { this.toast('Already researching ' + TECH_MAP[this.research.id].name); return false; }
    if (t.res) this.spend(t.res);
    this.research = { id, progress: 0 };
    this.version++;
    return true;
  }
  setSpeed(s: number) { this.speed = s; this.version++; }
  tileInfo(x: number, z: number) {
    const t = tileIdx(x, z);
    if (t < 0) return null;
    const W = this.world;
    return { t, biome: W.biome[t], fert: W.fert[t], dep: W.dep[t], depAmt: W.depAmt[t], owner: this.owner[t], trees: W.treeCount[t], h: heightAt(W, x, z), road: this.road[t] };
  }
  yearsText() { return `Year ${this.year + 1}`; }
  era() {
    const h = (t: string) => this.techs.has(t);
    if (h('construction')) return 'Age of Monuments';
    if (h('engineering')) return 'Age of Builders';
    if (h('iron')) return 'Iron Age';
    if (h('bronze')) return 'Bronze Age';
    if (h('pottery')) return 'Late Neolithic';
    if (h('agriculture')) return 'Neolithic';
    if (h('hunting')) return 'Hunter Age';
    return 'Stone Age';
  }
  stage() {
    const p = this.citizens.length;
    if (p < 20) return 'Small Camp';
    if (p < 60) return 'Village';
    if (p < 150) return 'Large Tribe';
    return 'Regional Civilization';
  }
}
