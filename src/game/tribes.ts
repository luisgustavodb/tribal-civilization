import { N, BMAP, RES, RES_LIST, FOOD_RES, TRIBE_TEMPLATES, BIO, DAYS_PER_YEAR, emptyRes, type Res } from './data';
import type { Game } from './sim';
import type { Tribe, Opinion, Caravan, Raid, Ambient } from './types';
import { findTribeSite } from './world';
import { rnd, clamp } from './rng';

const VILLAGE_NAMES = ['Oakhollow', 'Riverbend', 'Stonecrest', 'Highmeadow', 'Fernwatch', 'Amberfield', 'Greywater', 'Sunhaven', 'Thornford', 'Mistvale'];
export function villageName(g: Game) {
  const used = g.settlements.map((s) => s.name);
  const free = VILLAGE_NAMES.filter((n) => !used.includes(n));
  return free.length ? rnd.pick(free) : 'Village ' + (g.settlements.length + 1);
}

const PLANS: Record<string, string[]> = {
  riverfolk: ['campfire', 'hut', 'hut', 'farm', 'hut', 'granary', 'farm', 'fishing', 'hut', 'storage_pile', 'farm', 'timber', 'pen', 'timber', 'market', 'timber', 'potter', 'farm', 'timber', 'temple', 'timber', 'warehouse'],
  stonehammer: ['campfire', 'hut', 'hut', 'quarry', 'storage_pile', 'hut', 'copper_mine', 'hut', 'workshop', 'stone_house', 'foundry', 'stone_house', 'stone_tower', 'stone_house', 'tin_mine', 'stone_house', 'warehouse', 'stone_house', 'temple'],
  mariners: ['campfire', 'hut', 'fishing', 'hut', 'fishing', 'storage_pile', 'hut', 'market', 'salt_works', 'hut', 'potter', 'timber', 'fishing', 'timber', 'market', 'timber', 'lookout', 'timber', 'warehouse', 'temple'],
  wanderers: ['campfire', 'sleep', 'hut', 'hut', 'pen', 'sleep', 'hut', 'hunting_camp', 'hut', 'pen', 'sleep', 'hut', 'trading_post', 'hut', 'sleep', 'hut'],
  raiders: ['campfire', 'hut', 'hut', 'warrior_lodge', 'hut', 'palisade', 'hunting_camp', 'hut', 'lookout', 'hut', 'warrior_lodge', 'storage_pile', 'timber', 'stone_tower', 'timber', 'workshop', 'timber'],
  mossbound: ['campfire', 'hut', 'elders', 'hut', 'herbalist', 'hut', 'gatherer', 'clay_pit', 'hut', 'elders', 'potter', 'hut', 'meeting', 'timber', 'temple', 'timber'],
};

function localScan(g: Game, t: Tribe) {
  const W = g.world;
  const loc = { water: 0, forest: 0, fert: 0, hill: 0, n: 0, dep: {} as Record<number, number> };
  g.scan(t.x, t.z, 14, (i) => {
    loc.n++; loc.fert += W.fert[i];
    if (W.tileWater[i]) loc.water++;
    loc.forest += W.treeCount[i];
    if (W.biome[i] === BIO.MOUNTAIN) loc.hill++;
    if (W.dep[i]) loc.dep[W.dep[i]] = (loc.dep[W.dep[i]] || 0) + 1;
  });
  (t as any).loc = loc;
}

function prodFor(t: Tribe, r: Res): number {
  const loc = (t as any).loc;
  const isExp = t.exports.includes(r);
  let base = isExp ? 1.6 + t.pop * 0.1 : 0.05 * t.pop * 0.1;
  const depOf: Partial<Record<Res, number>> = { stone: 1, copper: 2, tin: 3, iron: 4, salt: 5, gems: 6, clay: 7, rare: 8, berries: 9, fiber: 10 };
  if (depOf[r]) { const n = loc.dep[depOf[r]!] || 0; base *= clamp(0.3 + n / 8, 0.3, 1.5); }
  if (r === 'fish') base *= clamp(loc.water / 20, 0.3, 1.5);
  if (r === 'wood') base *= clamp(loc.forest / 120, 0.3, 1.6);
  if (r === 'grain') base *= clamp((loc.fert / Math.max(1, loc.n)) * 1.6, 0.4, 1.5);
  if (r === 'bronze' || r === 'tools' || r === 'pottery') base *= 0.5 + t.tech * 0.15;
  return base;
}

export function initTribes(g: Game) {
  const avoid: { x: number; z: number }[] = [];
  const rand = g.rand;
  TRIBE_TEMPLATES.forEach((tpl, idx) => {
    const site = findTribeSite(g.world, rand, tpl.biome, avoid, 38);
    avoid.push(site);
    const res = emptyRes(), target = emptyRes();
    const t: Tribe = {
      id: idx + 1, key: tpl.key, name: rand.pick(tpl.names), title: tpl.title, color: tpl.color, accent: tpl.accent, culture: tpl.culture, desc: tpl.desc,
      biome: tpl.biome, x: site.x, z: site.z, pop: rand.int(14, 26), tech: tpl.tech, res, target, exports: tpl.exports, wants: tpl.wants,
      aggression: tpl.aggression, trade: tpl.trade, nomad: tpl.nomad, strength: 0, met: false, metYear: 0, status: 'unmet', opinion: 0, factors: [], memories: [],
      agreements: { trade: false, borders: false, alliance: false, defensive: false, resource: null, tribute: null, rivalry: false, dispute: false, war: false },
      tradeVol: 0, tradeRes: {}, firstTrade: 0, huntR: 20, style: tpl.style, sacred: tpl.sacred, nomadTimer: rand.range(5, 9), raidTimer: rand.range(240, 480),
      buildCount: 0, maxBuild: 0, lastAction: '', claims: [], lastTribute: 0, asked: 0,
    };
    for (const r of RES_LIST) {
      target[r] = 60;
      res[r] = t.exports.includes(r) ? rand.range(70, 150) : t.wants.includes(r) ? rand.range(2, 12) : rand.range(15, 40);
    }
    res.water = 100;
    (t as any).techProg = 0;
    localScan(g, t);
    t.huntR = 17 + t.pop * 0.15;
    t.strength = t.pop * 0.3 * (1 + t.aggression) + t.tech;
    g.tribes.push(t);
    t.maxBuild = Math.min(24, 6 + Math.floor(t.pop / 3));
    while (t.buildCount < t.maxBuild) growTribe(g, t, true);
    t.factors = [];
  });
}

export function growTribe(g: Game, t: Tribe, instant: boolean) {
  const plan = PLANS[t.key] || PLANS.riverfolk;
  const type = plan[t.buildCount % plan.length];
  const idx = t.buildCount;
  t.buildCount++;
  const def = BMAP[type];
  let ring = 2.8 + Math.sqrt(idx) * 1.7;
  for (let k = 0; k < 70; k++) {
    const a = rnd.range(0, 6.283), r = ring + k * 0.08 + rnd.range(-0.5, 0.5);
    const x = Math.round(t.x + Math.cos(a) * r - def.w / 2), z = Math.round(t.z + Math.sin(a) * r - def.d / 2);
    if (type === 'campfire') { const cx = Math.round(t.x - 1), cz = Math.round(t.z - 1); if (g.check(type, cx, cz, 0, t.id, true, true).ok) { const b = g.createBuilding(type, cx, cz, 0, t.id, instant, t.style); b.name = t.name; return b; } }
    const rot = rnd.f() < 0.5 ? 1 : 0;
    if (g.check(type, x, z, rot, t.id, true, true).ok) { return g.createBuilding(type, x, z, rot, t.id, instant, t.style); }
  }
  return null;
}

function clearTribeBuildings(g: Game, t: Tribe) {
  for (const b of g.buildings.filter((q) => q.owner === t.id)) g.removeBuilding(b);
  t.buildCount = 0;
}

export function afterFound(g: Game) {
  const bp = g.basePoint();
  for (const t of g.tribes) if (Math.hypot(t.x - bp.x, t.z - bp.z) < 36) meet(g, t, false);
  computeAll(g);
}
function meet(g: Game, t: Tribe, byEnvoy: boolean) {
  if (t.met) return;
  t.met = true; t.metYear = g.year + (g.day % DAYS_PER_YEAR) / DAYS_PER_YEAR;
  t.status = 'neutral';
  g.alert('info', `Contact: ${t.name}`, `${byEnvoy ? 'Your envoy returns with word of' : 'Your scouts report'} the ${t.title} — ${t.culture.toLowerCase()}. ${t.desc}`, t.x, t.z);
}
export function metTribe(g: Game, t: Tribe) { meet(g, t, true); computeOpinion(g, t); }

function yearNow(g: Game) { return g.year + (g.day % DAYS_PER_YEAR) / DAYS_PER_YEAR; }

export function computeOpinion(g: Game, t: Tribe) {
  const f: Opinion[] = [];
  const yn = yearNow(g);
  const pbs = g.buildings.filter((b) => b.owner === 0);
  f.push({ label: 'A new neighbour: cautious curiosity.', value: 4 });
  let enc = 0, nearest = 1e9;
  for (const b of pbs) { const d = Math.hypot(b.cx - t.x, b.cz - t.z); nearest = Math.min(nearest, d); if (d < t.huntR) enc++; }
  if (enc > 0) f.push({ label: `Your settlement occupies land near their hunting grounds (${enc} structure${enc > 1 ? 's' : ''}).`, value: -Math.min(32, 5 + enc * 4) * (t.agreements.borders ? 0.4 : 1) });
  else if (nearest < 60) f.push({ label: 'Your tribe keeps clear of their hunting grounds.', value: 5 });
  if (t.tradeVol > 0) {
    let top: Res = 'food' as any, tv = 0;
    for (const k in t.tradeRes) if ((t.tradeRes as any)[k] > tv) { tv = (t.tradeRes as any)[k]; top = k as Res; }
    const yrs = Math.max(0, yn - t.firstTrade);
    f.push({ label: `You have been trading ${RES[top]?.name.toLowerCase() || 'goods'} with them for ${yrs < 1 ? 'a few seasons' : Math.floor(yrs) + ' years'}.`, value: Math.min(34, 6 + t.tradeVol / 12) * (t.trade > 0.7 ? 1.3 : 1) });
  } else if (t.trade > 0.7 && t.met && yn - t.metYear > 1) f.push({ label: 'As born traders, they are disappointed you have not offered any trade.', value: -8 });
  for (const m of t.memories) if (m.until > yn) f.push({ label: m.label, value: m.value });
  const cut = g.cutTrees;
  const mine = pbs.filter((b) => ['quarry', 'copper_mine', 'tin_mine', 'iron_mine', 'gem_mine'].includes(b.type) && Math.hypot(b.cx - t.x, b.cz - t.z) < 30).length;
  const fishers = pbs.filter((b) => b.type === 'fishing' && Math.hypot(b.cx - t.x, b.cz - t.z) < 32).length;
  const hunters = pbs.filter((b) => b.type === 'hunting_camp' && Math.hypot(b.cx - t.x, b.cz - t.z) < 45).length;
  const pollTotal = pbs.reduce((s, b) => s + (BMAP[b.type].poll || 0) * (b.out > 0 ? 1 : 0), 0);
  const warriors = g.info.warriors, pop = Math.max(1, g.info.pop);
  const shrines = pbs.filter((b) => b.type === 'temple' || b.type === 'meeting' || b.type === 'monument').length;
  switch (t.sacred) {
    case 'forest':
      if (cut > 40) f.push({ label: `Your woodcutters have felled ${cut} trees; they hold the deep forests sacred.`, value: -Math.min(28, (cut - 40) / 10) });
      else f.push({ label: 'You leave the old forests mostly untouched.', value: 4 });
      break;
    case 'mountain':
      if (mine > 0) f.push({ label: 'You work ore veins in mountains they claim as their own.', value: -Math.min(26, mine * 6) });
      break;
    case 'river':
      if (pollTotal > 3) f.push({ label: 'Smoke and waste from your workshops foul the rivers they depend on.', value: -Math.min(20, pollTotal * 2) });
      else f.push({ label: 'Your clean workings do not trouble the river.', value: 3 });
      break;
    case 'coast':
      if (fishers > 0) f.push({ label: 'Your fishers are working waters they consider their own.', value: -Math.min(20, fishers * 5) });
      break;
    case 'herds':
      if (hunters > 2) f.push({ label: 'Your hunters are thinning the herds they follow.', value: -Math.min(16, (hunters - 2) * 5) });
      break;
    case 'strength':
      if (g.info.defense > t.strength * 0.9) f.push({ label: 'They respect your warriors, towers and palisades.', value: 9 });
      else f.push({ label: 'They see your settlement as weak and ripe for raiding.', value: -14 });
      break;
  }
  if (t.aggression < 0.3 && warriors > pop * 0.25) f.push({ label: 'Your large warrior band makes them uneasy.', value: -8 });
  if (t.aggression < 0.5 && shrines > 0) f.push({ label: 'They admire your shrines and gathering places.', value: 5 });
  const A = t.agreements;
  if (A.alliance) f.push({ label: 'You are bound together by an alliance.', value: 22 });
  if (A.defensive) f.push({ label: 'A defensive pact binds your warriors together.', value: 10 });
  if (A.borders) f.push({ label: 'Open borders show mutual trust.', value: 6 });
  if (A.trade) f.push({ label: 'A trade agreement benefits both peoples.', value: 5 });
  if (A.rivalry) f.push({ label: 'You declared a rivalry against them.', value: -30 });
  if (A.dispute) f.push({ label: 'A territorial dispute remains unresolved.', value: -14 });
  if (A.war) f.push({ label: 'You are at war.', value: -45 });
  if (A.tribute && A.tribute.dir === 'to') f.push({ label: 'You pay them tribute each year; they feel respected.', value: 10 });
  if (A.tribute && A.tribute.dir === 'from') f.push({ label: 'They resent paying tribute to you.', value: -8 });
  if (g.techs.size > t.tech + 2) f.push({ label: 'They are impressed by your tribe’s knowledge and tools.', value: 4 });
  if (g.prestige > 8) f.push({ label: 'Your tribe’s prestige is known far and wide.', value: Math.min(9, g.prestige / 5) });
  const sum = clamp(f.reduce((s, x) => s + x.value, 0), -100, 100);
  t.factors = f; t.opinion = sum;
  if (!t.met) t.status = 'unmet';
  else if (A.war) t.status = 'war';
  else if (A.alliance) t.status = 'allied';
  else if (sum < -25 || A.rivalry) t.status = 'hostile';
  else if (sum > 25) t.status = 'friendly';
  else t.status = 'neutral';
  return sum;
}
function computeAll(g: Game) { for (const t of g.tribes) computeOpinion(g, t); }

export function addMemory(g: Game, t: Tribe, label: string, value: number, years = 3) {
  t.memories.push({ label, value, until: yearNow(g) + years });
  if (t.memories.length > 12) t.memories.shift();
  computeOpinion(g, t);
}

// ---------------- prices & trade ----------------
export function tribePrice(t: Tribe, r: Res) {
  return RES[r].base * clamp(Math.pow(60 / (t.res[r] + 10), 0.6), 0.45, 3);
}
export function myPrice(g: Game, r: Res) {
  return RES[r].base * clamp(Math.pow(45 / (g.res[r] + 8), 0.5), 0.55, 2.6);
}
export function nearestMarket(g: Game, tx: number, tz: number) {
  let best: any = null, bd = 1e9;
  for (const b of g.buildings) {
    if (b.owner !== 0 || b.state !== 'ready' || !BMAP[b.type].slots) continue;
    const d = Math.hypot(b.cx - tx, b.cz - tz);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
export function routeQuote(g: Game, t: Tribe, give: Res, get: Res, qty: number) {
  const m = nearestMarket(g, t.x, t.z);
  const dist = m ? Math.hypot(m.cx - t.x, m.cz - t.z) : 60;
  const pg = tribePrice(t, give), pr = tribePrice(t, get) * 1.1;
  const loss = Math.min(0.35, dist / 450);
  let got = (qty * pg) / pr * (1 - loss);
  if (t.agreements.trade) got *= 1.08;
  else got *= 0.9;
  const avail = Math.max(0, t.res[get] - 5);
  const real = Math.floor(Math.min(got, avail));
  return { got: real, ideal: got, dist, loss, toll: t.agreements.trade ? 0 : 0.1, limited: got > avail };
}
export function addRoute(g: Game, tid: number, give: Res, get: Res, qty: number) {
  const t = g.tribes[tid - 1];
  if (!t || !t.met) return 'You have not met this tribe.';
  if (t.status === 'war') return 'You are at war with them.';
  if (t.opinion < -35) return 'They refuse to deal with you (opinion too low).';
  if (!nearestMarket(g, t.x, t.z)) return 'Build a Trading Post or Marketplace first.';
  if (give === get) return 'Choose different goods.';
  g.routes.push({ id: g.id(), tribe: tid, give, get, qty, active: true, trips: 0, timer: 2, gained: 0, spent: 0 });
  g.routeDirty = true; g.version++;
  return '';
}
export function removeRoute(g: Game, id: number) { g.routes = g.routes.filter((r) => r.id !== id); g.caravans = g.caravans.filter((c) => c.route !== id); g.routeDirty = true; g.version++; }

function tradeSlots(g: Game) {
  let s = 0;
  for (const b of g.buildings) if (b.owner === 0 && b.state === 'ready' && BMAP[b.type].slots && b.out > 0) s += BMAP[b.type].slots!;
  return s;
}

function spawnCaravan(g: Game, rid: number) {
  const r = g.routes.find((q) => q.id === rid)!;
  const t = g.tribes[r.tribe - 1];
  const m = nearestMarket(g, t.x, t.z);
  if (!m) return;
  if (g.res[r.give] < r.qty) { r.timer = 8; return; }
  g.spend({ [r.give]: r.qty } as any);
  r.spent += r.qty;
  g.caravans.push({ id: g.id(), route: rid, tribe: r.tribe, x: m.cx, z: m.cz, tx: t.x + rnd.range(-2.5, 2.5), tz: t.z + rnd.range(-2.5, 2.5), state: 'out', give: r.give, get: r.get, qty: r.qty, got: 0, wait: 0, ox: m.cx, oz: m.cz, amb: false, fromTribe: 0, hid: false });
}

function danger(g: Game, x: number, z: number) {
  let d = 0;
  for (const t of g.tribes) {
    if (t.status !== 'hostile' && t.status !== 'war') continue;
    d += Math.max(0, 1 - Math.hypot(t.x - x, t.z - z) / 50) * (0.4 + t.aggression);
  }
  for (const a of g.animals) if (a.alive && a.type === 3 && Math.hypot(a.x - x, a.z - z) < 8) d += 0.3;
  return d;
}
export function dangerAt(g: Game, x: number, z: number) { return danger(g, x, z); }

export function updateWorldTribes(g: Game, dt: number) {
  // caravans
  for (const c of g.caravans) {
    const sp = 1.3;
    if (c.state === 'out') {
      if (g.moveObj(c, c.tx, c.tz, dt, sp)) {
        c.state = 'wait'; c.wait = 2.5;
        if (!c.amb) {
          const t = g.tribes[c.tribe - 1];
          const r = g.routes.find((q) => q.id === c.route);
          if (t && r) {
            const q = routeQuote(g, t, c.give, c.get, c.qty);
            t.res[c.give] += c.qty; t.res[c.get] = Math.max(0, t.res[c.get] - q.got);
            c.got = Math.floor(q.got * (1 - q.toll));
            t.tradeVol += c.qty; t.tradeRes[c.give] = (t.tradeRes[c.give] || 0) + c.qty;
            if (!t.firstTrade) t.firstTrade = yearNow(g);
            if (q.limited) g.toast(`${t.name} had little ${RES[c.get].name.toLowerCase()} to sell.`);
          }
        }
      }
    } else if (c.state === 'wait') {
      c.wait -= dt;
      if (c.wait <= 0) c.state = 'back';
    } else {
      if (g.moveObj(c, c.ox, c.oz, dt, sp)) {
        c.hid = true;
        if (!c.amb) {
          const r = g.routes.find((q) => q.id === c.route);
          const got = g.add(c.get, c.got);
          if (r) { r.trips++; r.gained += got; r.timer = 6; }
          g.stats.trades++;
          const t = g.tribes[c.tribe - 1];
          if (t && r && r.trips % 3 === 1) g.toast(`Caravan from ${t.name} returned with ${Math.floor(got)} ${RES[c.get].name.toLowerCase()}.`);
        }
      }
    }
    if (!c.amb && !c.hid && Math.random() < dt * 0.003 * danger(g, c.x, c.z) / (1 + g.defenseAt(c.x, c.z) * 0.15)) {
      c.hid = true; c.state = 'back'; c.got = 0;
      g.alert('danger', 'Caravan ambushed', `A trade caravan was attacked on the road and its goods were lost. Build lookouts, warriors or open borders to protect trade routes.`, c.x, c.z);
      g.fx('clash', c.x, c.z, 5);
    }
  }
  g.caravans = g.caravans.filter((c) => !c.hid);
  // raids
  for (const r of g.raids) {
    const t = g.tribes[r.tribe - 1];
    if (r.state === 'march') {
      const b = g.bById.get(r.target);
      if (!b) { r.state = 'flee'; continue; }
      r.tx = b.cx; r.tz = b.cz;
      if (g.moveObj(r, r.tx, r.tz, dt, 1.5)) { r.state = 'fight'; r.timer = 6; }
    } else if (r.state === 'fight') {
      r.timer -= dt;
      if (Math.random() < dt * 3) g.fx('clash', r.x + rnd.range(-1.5, 1.5), r.z + rnd.range(-1.5, 1.5), 2);
      if (r.timer <= 0) resolveRaid(g, r, t);
    } else {
      if (g.moveObj(r, t.x, t.z, dt, 1.8)) r.n = 0;
    }
  }
  g.raids = g.raids.filter((r) => r.n > 0);
  // ambient citizens
  for (const t of g.tribes) {
    const want = Math.min(12, 3 + Math.floor(t.pop / 4));
    let have = 0;
    for (const a of g.ambients) if (a.tribe === t.id) have++;
    if (have < want && Math.random() < dt * 2) g.ambients.push({ id: g.id(), tribe: t.id, x: t.x + rnd.range(-3, 3), z: t.z + rnd.range(-3, 3), tx: t.x, tz: t.z, timer: rnd.range(1, 4), hx: t.x, hz: t.z, hide: false });
  }
  for (const a of g.ambients) {
    const t = g.tribes[a.tribe - 1];
    a.hx = t.x; a.hz = t.z;
    a.timer -= dt;
    if (a.timer <= 0) {
      const far = Math.random() < 0.12;
      const rad = far ? t.huntR * 0.8 : 6;
      a.tx = a.hx + rnd.range(-rad, rad); a.tz = a.hz + rnd.range(-rad, rad);
      a.timer = rnd.range(3, 9);
    }
    g.moveObj(a, a.tx, a.tz, dt, 1.0);
    a.hide = g.isNight();
  }
  // ambient caravans between tribes
  if (Math.random() < dt * 0.02 && g.caravans.filter((c) => c.amb).length < 3) {
    const a = rnd.pick(g.tribes), b = rnd.pick(g.tribes);
    if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 90) {
      g.caravans.push({ id: g.id(), route: -1, tribe: b.id, x: a.x, z: a.z, tx: b.x, tz: b.z, state: 'out', give: 'wood', get: 'wood', qty: 0, got: 0, wait: 0, ox: a.x, oz: a.z, amb: true, fromTribe: a.id, hid: false });
    }
  }
}

function resolveRaid(g: Game, r: Raid, t: Tribe) {
  const b = g.bById.get(r.target);
  if (!b) { r.state = 'flee'; return; }
  let def = g.defenseAt(b.cx, b.cz);
  for (const o of g.tribes) if (o.agreements.defensive || o.agreements.alliance) def += o.strength * 0.4;
  const place = g.nearestSettlementName(b.cx, b.cz);
  if (def >= r.str * 0.85) {
    g.alert('good', 'Raid repelled!', `${t.name} raiders were driven off at ${place}. Your defenders held the line.`, b.cx, b.cz);
    g.stats.raidsRepelled++;
    r.state = 'flee';
    addMemory(g, t, 'Their last raid on you was repelled; they now respect your defenses.', 3, 2);
    for (const c of g.citizens) if (c.job === 'warrior') c.skills.combat = Math.min(1.5, c.skills.combat + 0.05);
    g.happyMod += 2;
  } else {
    g.stats.raidsLost++;
    const loot: Res[] = ['berries', 'grain', 'meat', 'fish', 'tools', 'pottery', 'bronze', 'gems'];
    let msg = '';
    for (const k of loot) { const take = Math.floor(g.res[k] * rnd.range(0.12, 0.3)); if (take > 0) { g.res[k] -= take; t.res[k] += take; if (take > 8) msg += `${take} ${RES[k].name.toLowerCase()}, `; } }
    let dead = 0;
    for (const c of g.citizens) if (c.alive && Math.hypot(c.x - b.cx, c.z - b.cz) < 8 && Math.random() < 0.3) { c.health -= 60; if (c.health <= 0) { g.die(c, 'raid'); dead++; } }
    const capture = ['outpost', 'resource_camp', 'totem', 'lookout'].includes(b.type);
    if (capture) {
      t.claims.push({ x: b.cx, z: b.cz, r: 9, until: yearNow(g) + 1.5 });
      g.removeBuilding(b);
      g.alert('danger', 'Territory captured!', `${t.name} overran the ${BMAP[b.type].name} at ${place} and claimed the land. They stole ${msg || 'supplies'}${dead ? ' and killed ' + dead : ''}. Strengthen defenses to reclaim it.`, b.cx, b.cz);
    } else {
      b.downUntil = g.time + 160;
      g.alert('danger', 'Raid successful', `${t.name} raiders plundered ${place}: ${msg || 'supplies'}${dead ? ' ' + dead + ' people killed.' : ''} The ${BMAP[b.type].name} is ruined for a year. Build warriors' lodges, lookouts and palisades.`, b.cx, b.cz);
    }
    g.happyMod -= 8;
    r.state = 'flee';
    g.terrDirty = true;
    addMemory(g, t, 'Their raid on you succeeded; they think you are weak.', -4, 2);
  }
}

export function secondTribes(g: Game) {
  // meeting
  const pb = g.buildings.filter((b) => b.owner === 0);
  for (const t of g.tribes) {
    if (!t.met && pb.length) {
      let d = 1e9;
      for (const b of pb) d = Math.min(d, Math.hypot(b.cx - t.x, b.cz - t.z));
      for (const c of g.citizens) d = Math.min(d, Math.hypot(c.x - t.x, c.z - t.z));
      if (d < 34) { meet(g, t, false); computeOpinion(g, t); }
    }
  }
  // routes spawn
  const slots = tradeSlots(g);
  const active = g.caravans.filter((c) => !c.amb).length;
  if (active < slots) {
    for (const r of g.routes) {
      if (!r.active) continue;
      const t = g.tribes[r.tribe - 1];
      if (t.status === 'war') { r.active = false; continue; }
      if (g.caravans.some((c) => c.route === r.id)) continue;
      r.timer -= 1;
      if (r.timer <= 0) { spawnCaravan(g, r.id); break; }
    }
  }
  // raids
  for (const t of g.tribes) {
    t.raidTimer -= 1;
    if (t.raidTimer > 0 || !pb.length) continue;
    t.raidTimer = rnd.range(200, 420) / (0.5 + t.aggression);
    if (g.day < 20 || g.info.pop < 10) { t.raidTimer = 60; continue; }
    const A = t.agreements;
    const hostile = t.status === 'war' || t.status === 'hostile' || (t.aggression > 0.7 && t.opinion < 15);
    if (!hostile || A.alliance || (A.tribute && A.tribute.dir === 'to') || A.defensive) continue;
    // pick weakest nearby building
    let best: any = null, bs = 1e9;
    for (let k = 0; k < 8; k++) {
      const b = rnd.pick(pb);
      const d = Math.hypot(b.cx - t.x, b.cz - t.z);
      if (d > 85 || b.state === 'building' || BMAP[b.type].wall) continue;
      const sc = d * 0.5 + g.defenseAt(b.cx, b.cz) * 2;
      if (sc < bs) { bs = sc; best = b; }
    }
    if (!best) continue;
    if (g.raids.length >= 2) continue;
    const n = 3 + Math.floor(t.strength / 7);
    const str = n * (1.6 + t.tech * 0.12) * (t.status === 'war' ? 1.15 : 1);
    const members = Array.from({ length: n }, () => ({ dx: rnd.range(-1.2, 1.2), dz: rnd.range(-1.2, 1.2) }));
    if (!t.met) { meet(g, t, false); computeOpinion(g, t); }
    g.raids.push({ id: g.id(), tribe: t.id, x: t.x, z: t.z, tx: best.cx, tz: best.cz, n, state: 'march', timer: 0, target: best.id, str, members });
    const watch = g.buildings.some((b) => b.owner === 0 && b.state === 'ready' && BMAP[b.type].watch);
    g.alert('danger', 'Raiders approaching!', `${t.name} warriors (${n}) march toward ${g.nearestSettlementName(best.cx, best.cz)}. ${watch ? 'Your lookouts spotted them early. ' : ''}Current defense rating ${g.defenseAt(best.cx, best.cz).toFixed(0)} vs their strength ~${str.toFixed(0)}.`, t.x, t.z);
  }
}

export function dailyTribes(g: Game) {
  const doy = g.day % DAYS_PER_YEAR;
  for (const t of g.tribes) {
    // production / consumption
    for (const r of RES_LIST) {
      t.res[r] += prodFor(t, r) * (g.season === 3 && FOOD_RES.includes(r) ? 0.6 : 1);
      const use = t.wants.includes(r) ? 0.06 * t.pop : r === 'water' ? 0 : 0.02 * t.pop;
      t.res[r] = clamp(t.res[r] - use, 0, 400);
    }
    let food = 0;
    for (const r of FOOD_RES) food += t.res[r];
    const eat = t.pop * 0.45;
    for (const r of FOOD_RES) t.res[r] = Math.max(0, t.res[r] - (eat * t.res[r]) / Math.max(1, food));
    if (food > t.pop * 6 && Math.random() < 0.18 && t.pop < 85) t.pop++;
    else if (food < t.pop * 0.8 && Math.random() < 0.2 && t.pop > 8) t.pop--;
    t.strength = t.pop * 0.3 * (1 + t.aggression) + t.tech;
    t.huntR = 17 + t.pop * 0.15;
    (t as any).techProg += t.pop * 0.02 * (1 + t.tech * 0.3);
    if ((t as any).techProg > 12 * Math.pow(t.tech + 1, 1.6) && t.tech < 9) { (t as any).techProg = 0; t.tech++; if (t.met) g.alert('info', `${t.name} advance`, `The ${t.title} have mastered new crafts (technology level ${t.tech}).`, t.x, t.z); }
    t.maxBuild = Math.min(26, 6 + Math.floor(t.pop / 3) + Math.floor(t.tech / 2));
    if (t.buildCount < t.maxBuild && Math.random() < 0.4) growTribe(g, t, false);
    // nomads relocate
    if (t.nomad && doy === 0) {
      t.nomadTimer -= 1;
      if (t.nomadTimer <= 0) {
        t.nomadTimer = rnd.range(5, 9);
        const others = g.tribes.filter((o) => o !== t).map((o) => ({ x: o.x, z: o.z }));
        const bp = g.buildings.filter((b) => b.owner === 0).map((b) => ({ x: b.cx, z: b.cz }));
        const site = findTribeSite(g.world, g.rand, t.biome, [...others, ...bp.slice(0, 4)], 34);
        if (Math.hypot(site.x - t.x, site.z - t.z) > 12) {
          clearTribeBuildings(g, t);
          t.x = site.x; t.z = site.z;
          localScan(g, t);
          t.maxBuild = Math.min(12, t.maxBuild);
          while (t.buildCount < 4) growTribe(g, t, true);
          for (const a of g.ambients) if (a.tribe === t.id) { a.x = t.x; a.z = t.z; }
          if (t.met) g.alert('info', `${t.name} move camp`, `The nomadic ${t.title} have packed their tents and migrated to new pastures.`, t.x, t.z);
          g.terrDirty = true;
        }
      }
    }
    // claims cleanup
    t.claims = t.claims.filter((c) => c.until > yearNow(g));
  }
  // inter-tribe trade balancing
  for (let k = 0; k < 3; k++) {
    const a = rnd.pick(g.tribes), b = rnd.pick(g.tribes);
    if (a === b) continue;
    for (const r of a.exports) if (b.wants.includes(r) && a.res[r] > 50 && b.res[r] < 40) { const amt = 6; a.res[r] -= amt; b.res[r] += amt; }
  }
  // agreements
  for (const t of g.tribes) {
    const A = t.agreements;
    if (A.tribute && doy === 0) {
      const tr = A.tribute;
      if (tr.dir === 'to') {
        if (g.res[tr.res] >= tr.amt) { g.take(tr.res, tr.amt); t.res[tr.res] += tr.amt; g.toast(`Tribute of ${tr.amt} ${RES[tr.res].name.toLowerCase()} paid to ${t.name}.`); }
        else { A.tribute = null; addMemory(g, t, 'You failed to pay the agreed tribute.', -14, 3); g.alert('warn', 'Tribute unpaid', `You could not pay ${t.name} their tribute. They are insulted.`); }
      } else {
        const give = Math.min(tr.amt, t.res[tr.res]);
        t.res[tr.res] -= give; g.add(tr.res, give);
        if (give > 0) g.toast(`${t.name} delivered ${Math.floor(give)} ${RES[tr.res].name.toLowerCase()} as tribute.`);
      }
    }
    if (A.resource && g.day % 2 === 0) {
      const ra = A.resource;
      if (g.res[ra.give] >= ra.qty && t.res[ra.get] >= ra.qty) {
        g.take(ra.give, ra.qty); t.res[ra.give] += ra.qty; t.res[ra.get] -= ra.qty; g.add(ra.get, ra.qty);
        t.tradeVol += ra.qty;
        t.tradeRes[ra.give] = (t.tradeRes[ra.give] || 0) + ra.qty;
        if (!t.firstTrade) t.firstTrade = yearNow(g);
      } else if (g.res[ra.give] < ra.qty) {
        A.resource = null; addMemory(g, t, 'You broke the resource agreement by failing to deliver goods.', -8, 3);
        g.alert('warn', 'Agreement broken', `You could not deliver ${ra.qty} ${RES[ra.give].name.toLowerCase()} to ${t.name}. The agreement is void.`);
      }
    }
    // alliance help: gift
    if (A.alliance && doy === 3 && Math.random() < 0.3) { const r = rnd.pick(t.exports); const x = Math.min(10, t.res[r]); t.res[r] -= x; g.add(r, x); g.toast(`Your allies ${t.name} sent ${Math.floor(x)} ${RES[r].name.toLowerCase()}.`); }
  }
  computeAll(g);
}

// ---------------- diplomacy actions ----------------
export interface DipResult { ok: boolean; msg: string }
function topNegative(t: Tribe) { let w: Opinion | null = null; for (const f of t.factors) if (f.value < 0 && (!w || f.value < w.value)) w = f; return w ? w.label : 'They simply do not trust you yet.'; }

export const DIP_REQ: Record<string, number> = { trade: 0, borders: 12, resource: 8, defensive: 24, alliance: 38 };

export function diplomacy(g: Game, tid: number, action: string, p?: any): DipResult {
  const t = g.tribes[tid - 1];
  if (!t) return { ok: false, msg: 'Unknown tribe' };
  computeOpinion(g, t);
  const A = t.agreements;
  const deny = (why: string) => ({ ok: false, msg: `${t.name} refuse. ${why}` });
  let res: DipResult = { ok: true, msg: '' };
  if (action === 'envoy') {
    if (t.met) return { ok: false, msg: 'Already met.' };
    if (g.foodTotal() < 10) return { ok: false, msg: 'Your envoy needs 10 food for the journey.' };
    for (const r of FOOD_RES) { const x = Math.min(g.res[r], 10); g.take(r, x); if (x >= 10) break; }
    metTribe(g, t);
    return { ok: true, msg: `Your envoy has met the ${t.title}.` };
  }
  if (!t.met) return { ok: false, msg: 'You have not met this tribe.' };
  switch (action) {
    case 'gift': {
      const r = p as Res;
      const amt = RES[r].base >= 12 ? 5 : 20;
      if (g.res[r] < amt) return { ok: false, msg: `You need ${amt} ${RES[r].name.toLowerCase()}.` };
      g.take(r, amt); t.res[r] += amt;
      const want = t.wants.includes(r) ? 1.8 : 1;
      const val = Math.min(14, (amt * RES[r].base * want) / 14);
      addMemory(g, t, `You gifted them ${amt} ${RES[r].name.toLowerCase()}${want > 1 ? ', which they badly needed' : ''}.`, val, 3);
      g.prestige += 0.3;
      res = { ok: true, msg: `${t.name} accept your gift gratefully.` };
      break;
    }
    case 'trade':
      if (A.trade) return { ok: false, msg: 'A trade agreement already exists.' };
      if (t.opinion < DIP_REQ.trade) return deny(topNegative(t));
      A.trade = true; res = { ok: true, msg: 'Trade agreement signed: no tolls, better exchange rates.' }; break;
    case 'borders':
      if (!A.trade) return { ok: false, msg: 'Sign a trade agreement first.' };
      if (t.opinion < DIP_REQ.borders) return deny(`They do not trust you enough to open borders (${Math.floor(t.opinion)}/${DIP_REQ.borders}). ${topNegative(t)}`);
      A.borders = true; res = { ok: true, msg: 'Borders opened. Caravans travel safely and hunting-ground friction eases.' }; break;
    case 'resource': {
      if (t.opinion < DIP_REQ.resource) return deny(`Opinion ${Math.floor(t.opinion)}/${DIP_REQ.resource}. ${topNegative(t)}`);
      if (!p || p.give === p.get) return { ok: false, msg: 'Choose two different goods.' };
      if (!t.exports.includes(p.get) && t.res[p.get as Res] < 40) return deny(`They have little ${RES[p.get as Res].name.toLowerCase()} to spare.`);
      A.resource = { give: p.give, get: p.get, qty: p.qty || 10 };
      res = { ok: true, msg: `Agreement: you send ${A.resource.qty} ${RES[p.give as Res].name.toLowerCase()} and receive ${A.resource.qty} ${RES[p.get as Res].name.toLowerCase()} every season.` };
      break;
    }
    case 'defensive':
      if (t.opinion < DIP_REQ.defensive) return deny(`Opinion ${Math.floor(t.opinion)}/${DIP_REQ.defensive}. ${topNegative(t)}`);
      A.defensive = true; res = { ok: true, msg: 'Defensive pact sworn. Their warriors will help repel raiders.' }; break;
    case 'alliance':
      if (!A.borders) return { ok: false, msg: 'Open borders are required before an alliance.' };
      if (t.opinion < DIP_REQ.alliance || g.prestige < 5) return deny(`They want an ally of proven worth: opinion ${Math.floor(t.opinion)}/${DIP_REQ.alliance}, your prestige ${g.prestige.toFixed(0)}/5.`);
      A.alliance = true; A.defensive = true; A.rivalry = false; res = { ok: true, msg: 'An alliance is sealed with feast and oath.' }; break;
    case 'tribute_pay': {
      const r = (p?.res || 'meat') as Res;
      const amt = p?.amt || 20;
      if (A.war) return { ok: false, msg: 'Make peace first.' };
      A.tribute = { dir: 'to', res: r, amt };
      A.dispute = false;
      res = { ok: true, msg: `You will pay ${amt} ${RES[r].name.toLowerCase()} each year. They will not raid you while it is paid.` }; break;
    }
    case 'tribute_demand': {
      if (g.info.defense > t.strength * 1.3 && t.opinion > -40 && !A.tribute) {
        const r = t.exports[0];
        A.tribute = { dir: 'from', res: r, amt: 15 };
        res = { ok: true, msg: `${t.name} bow to your strength and will pay 15 ${RES[r].name.toLowerCase()} each year.` };
        addMemory(g, t, 'You forced them to pay tribute.', -10, 4);
      } else { addMemory(g, t, 'You demanded tribute they could refuse.', -8, 2); return deny(`They scorn the demand. Your defense (${g.info.defense.toFixed(0)}) must exceed ${(t.strength * 1.3).toFixed(0)}.`); }
      break;
    }
    case 'rival':
      A.rivalry = !A.rivalry; res = { ok: true, msg: A.rivalry ? 'You declared a rivalry. Relations will sour.' : 'You withdrew the rivalry.' }; break;
    case 'war':
      if (A.alliance) return { ok: false, msg: 'Break the alliance first.' };
      A.war = true; A.trade = false; A.borders = false; A.tribute = null; A.resource = null;
      g.routes.forEach((r) => { if (r.tribe === tid) r.active = false; });
      t.raidTimer = 30;
      res = { ok: true, msg: 'War declared! Raids will follow; prepare your defenses.' }; break;
    case 'peace': {
      if (!A.war) return { ok: false, msg: 'You are not at war.' };
      if (g.info.defense > t.strength * 0.6 || t.opinion > -55) { A.war = false; addMemory(g, t, 'Peace was agreed after a costly war.', 6, 3); res = { ok: true, msg: 'Peace is agreed.' }; }
      else return deny('They smell blood and want more war.');
      break;
    }
    case 'cancel': {
      const k = p as string;
      if (k === 'alliance') { A.alliance = false; addMemory(g, t, 'You broke your alliance.', -12, 4); }
      else if (k === 'defensive') A.defensive = false;
      else if (k === 'borders') A.borders = false;
      else if (k === 'trade') { A.trade = false; A.borders = false; }
      else if (k === 'resource') A.resource = null;
      else if (k === 'tribute') A.tribute = null;
      res = { ok: true, msg: 'Agreement cancelled.' }; break;
    }
    case 'settle_dispute': {
      A.dispute = false; addMemory(g, t, 'You settled the territorial dispute honorably.', 6, 3);
      res = { ok: true, msg: 'The dispute is resolved.' }; break;
    }
  }
  computeOpinion(g, t);
  g.version++;
  return res;
}
