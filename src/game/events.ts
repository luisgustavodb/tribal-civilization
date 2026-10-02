import { N, DAY_SEC, DAYS_PER_YEAR, BMAP, BIO, DEP, RES, FOOD_RES, TRIBE_TEMPLATES, type Res } from './data';
import type { Game } from './sim';
import type { GameEvent } from './types';
import { rnd, clamp } from './rng';
import { addMemory, computeOpinion } from './tribes';

const NON_FLAMMABLE = ['stone_house', 'stone_tower', 'stone_wall', 'temple', 'monument', 'great_hall', 'foundry', 'ironworks', 'well', 'quarry'];

function cool(g: Game): Record<string, number> { const a = g as any; if (!a.evCool) a.evCool = {}; return a.evCool; }
function ready(g: Game, kind: string, cd: number) { const c = cool(g); if ((c[kind] || -999) + cd > g.day) return false; return true; }
function mark(g: Game, kind: string) { cool(g)[kind] = g.day; }
function has(g: Game, kind: string) { return g.events.some((e) => e.kind === kind); }

export function addEvent(g: Game, e: Omit<GameEvent, 'id' | 'started'> & { alertToo?: boolean }) {
  const ev: GameEvent = { ...e, id: g.id(), started: g.time } as GameEvent;
  g.events.push(ev);
  g.alert(e.sev, e.title, e.text, e.x, e.z);
  g.version++;
  return ev;
}

function playerCenter(g: Game) { return g.basePoint(); }

export function applyMods(g: Game) {
  const m = g.mod;
  m.farm = 1; m.gather = 1; m.hunt = 1; m.water = 1; m.cold = 0; m.drought = false; m.rain = false; m.eclipse = 0; m.aurora = 0; m.plague = 0; m.flood = 0;
  for (const e of g.events) {
    switch (e.kind) {
      case 'drought': m.drought = true; m.water = 0.6; m.gather *= 0.7; break;
      case 'rain': m.rain = true; m.farm *= 1.2; break;
      case 'flood': m.flood = 1; m.rain = true; break;
      case 'winter': m.cold = 1; m.hunt *= 0.6; m.gather *= 0.4; break;
      case 'disease': m.plague = 1; break;
      case 'eclipse': m.eclipse = 1; break;
      case 'aurora': m.aurora = 1; break;
    }
  }
}

function riverNear(g: Game, cx: number, cz: number, r: number) {
  let f = false;
  g.scan(cx, cz, r, (t) => { if (g.world.biome[t] === BIO.RIVER) f = true; });
  return f;
}

export function dailyEvents(g: Game) {
  const doy = g.day % DAYS_PER_YEAR;
  const early = g.day < 12;
  const pc = playerCenter(g);
  const info = g.info;
  const roll = (p: number) => Math.random() < p;
  // seasonal weather
  if (!early && g.season === 1 && !has(g, 'drought') && ready(g, 'drought', 14) && roll(0.1)) {
    mark(g, 'drought');
    addEvent(g, { kind: 'drought', title: 'Drought', icon: '☀️', sev: 'warn', until: g.time + DAY_SEC * 3, text: 'The rains have failed. Streams run low: farms yield far less unless irrigated, water collection drops, and wildfire risk rises.', advice: 'Dig wells, build irrigation works, and stockpile grain.', x: pc.x, z: pc.z });
  }
  if (!early && (g.season === 0 || g.season === 2) && !has(g, 'rain') && ready(g, 'rain', 8) && roll(0.12)) {
    mark(g, 'rain');
    addEvent(g, { kind: 'rain', title: 'Heavy Rain', icon: '🌧️', sev: 'info', until: g.time + DAY_SEC * 2, text: 'Storm clouds gather. Crops drink deeply (+20% farming) but swollen rivers may flood low ground.', advice: 'Avoid building next to rivers.' });
  }
  if (!early && g.season === 3 && doy === 6 && !has(g, 'winter') && roll(0.35)) {
    mark(g, 'winter');
    addEvent(g, { kind: 'winter', title: 'Harsh Winter', icon: '❄️', sev: 'danger', until: g.time + DAY_SEC * 2.2, text: 'A bitter cold grips the land. Firewood use triples, people eat more, and hunting and foraging drop sharply.', advice: 'Keep wood and food stockpiled and house everyone.' });
    g.happyMod -= 3;
  }
  // wildfire
  if (!early && (g.season === 1 || g.season === 2) && !has(g, 'wildfire') && ready(g, 'wildfire', 12) && roll(g.mod.drought ? 0.2 : 0.04)) startFire(g);
  // migration of herds
  if (!has(g, 'herd') && ready(g, 'herd', 8) && roll(0.1)) {
    mark(g, 'herd');
    const a = Math.random() * 6.28, d = 40;
    const sx = clamp(pc.x + Math.cos(a) * d, 4, N - 4), sz = clamp(pc.z + Math.sin(a) * d, 4, N - 4);
    const ex = clamp(pc.x - Math.cos(a) * 20, 4, N - 4), ez = clamp(pc.z - Math.sin(a) * 20, 4, N - 4);
    let n = 0;
    for (let i = 0; i < 12; i++) {
      const x = sx + rnd.range(-3, 3), z = sz + rnd.range(-3, 3);
      if (g.world.tileWater[Math.floor(z) * N + Math.floor(x)]) continue;
      g.addAnimal(i % 4 === 0 ? 2 : 0, x, z);
      const an = g.animals[g.animals.length - 1]; an.migrate = true; an.tx = ex + rnd.range(-3, 3); an.tz = ez + rnd.range(-3, 3); an.hx = an.tx; an.hz = an.tz;
      n++;
    }
    if (n > 3) addEvent(g, { kind: 'herd', title: 'Animal Migration', icon: '🦌', sev: 'good', until: g.time + DAY_SEC * 3, text: 'A great herd of deer and mammoth is crossing the land near your territory. Hunters will find rich pickings while it lasts.', advice: 'Hunting camps with free hunters will bring in lots of meat.', x: sx, z: sz });
  }
  // discovery
  if (!early && ready(g, 'discovery', 7) && roll(0.1)) {
    mark(g, 'discovery');
    const types = [DEP.COPPER, DEP.TIN, DEP.IRON, DEP.GEMS, DEP.SALT, DEP.CLAY, DEP.STONE];
    const ty = rnd.pick(types);
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(pc.x + rnd.range(-22, 22)), z = Math.floor(pc.z + rnd.range(-22, 22));
      if (x < 4 || z < 4 || x >= N - 4 || z >= N - 4) continue;
      const t = z * N + x;
      if (g.world.tileWater[t] || g.world.dep[t] || g.occ[t] || g.owner[t] === 255 && Math.random() < 0.3) continue;
      if (g.owner[t] !== 0 && g.owner[t] !== 255) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const tt = (z + dz) * N + x + dx;
        if (tt < 0 || tt >= N * N || g.world.tileWater[tt] || g.world.dep[tt] || g.occ[tt] || Math.random() < 0.35) continue;
        g.world.dep[tt] = ty; g.world.depAmt[tt] = g.world.depMax[tt] = ty === DEP.GEMS ? 40 : 200; g.depDirty.push(tt);
      }
      addEvent(g, { kind: 'discovery', title: 'New Resource Discovered', icon: '✨', sev: 'good', until: g.time + DAY_SEC, text: `Hunters report a new deposit of ${['', 'stone', 'copper ore', 'tin ore', 'iron ore', 'salt', 'gems', 'clay'][ty]} nearby. Build the right extraction camp close to it.`, x: x + 0.5, z: z + 0.5, advice: 'Check the Resources overlay.' });
      break;
    }
  }
  // wandering trader
  if (info.pop >= 8 && !has(g, 'trader') && ready(g, 'trader', 10) && roll(0.12)) {
    mark(g, 'trader');
    const t = rnd.pick(g.tribes);
    const sell = rnd.pick(t.exports.filter((r) => !FOOD_RES.includes(r)).concat(['copper', 'salt', 'tools'] as Res[]).slice(0, 5));
    const payR = rnd.pick(['wood', 'meat', 'grain', 'fiber', 'stone'] as Res[]);
    const qty = rnd.int(15, 30);
    const payQty = Math.max(5, Math.round((qty * RES[sell].base * 0.85) / RES[payR].base));
    const cf = g.campfire();
    addEvent(g, {
      kind: 'trader', title: 'Wandering Trader', icon: '🧳', sev: 'good', until: g.time + DAY_SEC * 2, decision: true, x: cf?.cx, z: cf?.cz,
      text: `A trader of the ${t.title} arrives at your fire. She offers ${qty} ${RES[sell].name.toLowerCase()} for ${payQty} ${RES[payR].name.toLowerCase()}.`,
      data: { sell, qty, payR, payQty, tribe: t.id },
      choices: [{ id: 'accept', label: `Trade ${payQty} ${RES[payR].name} for ${qty} ${RES[sell].name}` }, { id: 'decline', label: 'Send her on her way' }],
    });
    if (cf) g.caravans.push({ id: g.id(), route: -1, tribe: 0, x: cf.cx + 30 * Math.cos(1), z: cf.cz + 30 * Math.sin(1), tx: cf.cx + 2, tz: cf.cz + 2, state: 'out', give: 'wood', get: 'wood', qty: 0, got: 0, wait: 40, ox: cf.cx + 30, oz: cf.cz + 30, amb: true, fromTribe: t.id, hid: false });
  }
  // migrants
  if (info.pop >= 10 && !has(g, 'migrants') && ready(g, 'migrants', 12) && roll(0.1)) {
    mark(g, 'migrants');
    const n = rnd.int(4, 7);
    const cf = g.campfire();
    addEvent(g, {
      kind: 'migrants', title: 'Migrants at the Border', icon: '👣', sev: 'info', until: g.time + DAY_SEC * 2.5, decision: true, x: cf?.cx, z: cf?.cz,
      text: `A band of ${n} wanderers, driven from their lands, asks to join ${g.playerName}. They need ${Math.ceil(n * 0.8)} food a day and housing.`,
      data: { n }, choices: [{ id: 'accept', label: `Welcome them (+${n} people)`, hint: `Housing free: ${Math.max(0, info.housing - info.pop)}` }, { id: 'refuse', label: 'Turn them away' }],
    });
  }
  // territorial dispute
  if (!early) {
    for (const t of g.tribes) {
      if (!t.met || t.agreements.dispute || t.agreements.war || t.agreements.alliance || !ready(g, 'dispute' + t.id, 16)) continue;
      const enc = g.buildings.filter((b) => b.owner === 0 && Math.hypot(b.cx - t.x, b.cz - t.z) < t.huntR && b.state !== 'building').length;
      if (enc >= 2 && t.opinion < 10 && roll(0.25)) {
        mark(g, 'dispute' + t.id);
        t.agreements.dispute = true;
        addEvent(g, {
          kind: 'dispute', title: `Territorial Dispute: ${t.name}`, icon: '⚔️', sev: 'warn', until: g.time + DAY_SEC * 4, decision: true, x: t.x, z: t.z,
          text: `The ${t.title} say your ${enc} structures stand on their hunting grounds and demand redress. If ignored, they may raid.`,
          data: { tribe: t.id }, choices: [
            { id: 'tribute', label: 'Pay 25 food as compensation' },
            { id: 'negotiate', label: 'Negotiate a border treaty', hint: g.hasTech('writing') || g.prestige > 6 ? 'Likely to succeed' : 'Risky without writing or prestige' },
            { id: 'withdraw', label: 'Dismantle the disputed structures' },
            { id: 'refuse', label: 'Refuse and stand firm' },
          ],
        });
        computeOpinion(g, t);
        break;
      }
    }
  }
  // boom
  if (info.pop >= 14 && info.happy > 68 && info.foodDays > 8 && !has(g, 'boom') && ready(g, 'boom', 16) && roll(0.12)) {
    mark(g, 'boom');
    addEvent(g, { kind: 'boom', title: 'Population Boom', icon: '👶', sev: 'good', until: g.time + DAY_SEC * 4, text: 'Plentiful food and good spirits mean many babies are being born. Your tribe is growing fast!', advice: 'Build housing and food sources before the new mouths strain your stores.' });
  }
  // disease
  const pollSum = g.poll.reduce((a, b) => a + b, 0);
  const diseaseP = 0.02 + (info.homeless > 3 ? 0.03 : 0) + (g.res.water < 10 ? 0.04 : 0) + Math.min(0.05, pollSum / 8000);
  if (!early && info.pop >= 16 && !has(g, 'disease') && ready(g, 'disease', 12) && roll(diseaseP)) {
    mark(g, 'disease');
    const cs = g.citizens.filter((c) => c.alive);
    const n = Math.min(cs.length, rnd.int(3, 5));
    for (let i = 0; i < n; i++) rnd.pick(cs).sick = true;
    const cause = info.homeless > 3 ? 'crowded, unsheltered living' : g.res.water < 10 ? 'foul water' : pollSum > 200 ? 'smoke and filth in the air' : 'a sickness carried by travellers';
    addEvent(g, { kind: 'disease', title: 'Disease Outbreak', icon: '🤒', sev: 'danger', until: g.time + DAY_SEC * 3, text: `Sickness spreads through the camp, likely from ${cause}. The sick lose health daily and spread illness to their households.`, advice: "Build an Herbalist's Hut; keep water supplies and housing healthy." });
  }
  // phenomenon
  if (info.pop >= 12 && !has(g, 'aurora') && !has(g, 'eclipse') && ready(g, 'phen', 24) && roll(0.05)) {
    mark(g, 'phen');
    const eclipse = Math.random() < 0.5;
    const cf = g.campfire();
    addEvent(g, {
      kind: eclipse ? 'eclipse' : 'aurora', title: eclipse ? 'The Sun Is Eaten' : 'Lights in the Sky', icon: eclipse ? '🌑' : '🌌', sev: 'warn', until: g.time + DAY_SEC * 1.5, decision: true, x: cf?.cx, z: cf?.cz,
      text: eclipse ? 'Day turns to dusk as a dark disc covers the sun. Terror spreads — the elders say a rite is needed.' : 'Green and violet fire dances across the night sky. Some see a blessing, others an omen.',
      choices: [{ id: 'ritual', label: 'Hold a ritual (costs 15 food)', hint: 'Happiness, prestige and knowledge' }, { id: 'ignore', label: 'Let people believe what they will' }],
    });
    if (!eclipse) { g.knowledgeAcc += 10; }
  }
}

function startFire(g: Game) {
  const pc = playerCenter(g);
  let best = -1, bd = 1e9;
  for (let k = 0; k < 120; k++) {
    const x = Math.floor(pc.x + rnd.range(-26, 26)), z = Math.floor(pc.z + rnd.range(-26, 26));
    if (x < 3 || z < 3 || x >= N - 3 || z >= N - 3) continue;
    const t = z * N + x;
    if (g.world.treeCount[t] < 2) continue;
    const d = Math.hypot(x - pc.x, z - pc.z);
    if (d > 9 && d < bd) { bd = d; best = t; }
  }
  if (best < 0) return;
  mark(g, 'wildfire');
  g.fires.set(best, 12);
  const x = best % N + 0.5, z = Math.floor(best / N) + 0.5;
  addEvent(g, { kind: 'wildfire', title: 'Wildfire!', icon: '🔥', sev: 'danger', until: g.time + DAY_SEC * 6, x, z, text: 'Lightning (or a stray ember) has set the forest ablaze near your lands. Fire spreads through trees and wooden buildings.', advice: 'Send water bearers to fight the flames, or fell trees to make a firebreak.', choices: [{ id: 'fight', label: 'Send water bearers (30 water)' }] });
}

export function updateEvents(g: Game, dt: number) {
  // fires
  if (g.fires.size) {
    const next: [number, number][] = [];
    for (const [t, rem] of g.fires) {
      const r = rem - dt;
      const x = t % N, z = Math.floor(t / N);
      if (Math.random() < dt * 2) g.fx('fire', x + 0.5, z + 0.5, 2);
      // spread
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nt = nz * N + nx;
        if (g.fires.has(nt) || g.world.tileWater[nt]) continue;
        const b = g.bById.get(g.occ[nt]);
        const flam = g.world.treeCount[nt] > 0 || (b && !NON_FLAMMABLE.includes(b.type));
        if (flam && Math.random() < dt * 0.1 * (g.mod.drought ? 2 : 1) * (g.mod.rain ? 0 : 1)) next.push([nt, 10 + Math.random() * 6]);
      }
      if (r <= 0) {
        g.fires.delete(t);
        g.clearTile(t);
        const b = g.bById.get(g.occ[t]);
        if (b && !NON_FLAMMABLE.includes(b.type) && b.owner === 0) { g.alert('danger', 'Building burned', `A ${BMAP[b.type].name} was destroyed by wildfire.`, b.cx, b.cz); g.removeBuilding(b); }
      } else g.fires.set(t, r);
    }
    for (const [t, r] of next) if (!g.fires.has(t)) g.fires.set(t, r);
  }
  // expire events
  for (const e of g.events) {
    if (e.kind === 'wildfire') { if (g.fires.size === 0) e.until = 0; else e.until = g.time + 5; }
    if (e.kind === 'flood' || e.kind === 'rain') continue;
  }
  const keep: GameEvent[] = [];
  let changed = false;
  for (const e of g.events) {
    if (e.until > g.time) keep.push(e);
    else {
      changed = true;
      if (e.kind === 'rain' && g.season !== 3 && Math.random() < 0.45 && !has(g, 'flood')) floodStart(g, keep);
      if (e.kind === 'drought') g.alert('info', 'Drought ends', 'Rain returns to the land.');
      if (e.kind === 'winter') g.alert('info', 'Winter loosens its grip', 'The thaw begins.');
      if (e.kind === 'wildfire') g.alert('info', 'Fire is out', 'The wildfire has burned itself out. Scorched land will regrow slowly.');
      if (e.kind === 'eclipse') g.alert('info', 'Sun returns', 'The sun shines again.');
      if (e.decision) { g.alert('info', `${e.title}: no decision`, 'The moment passed without a decision.'); if (e.kind === 'dispute') { const t = g.tribes[e.data.tribe - 1]; addMemory(g, t, 'You ignored their grievance over the hunting grounds.', -8, 2); } }
    }
  }
  if (changed) { g.events = keep; g.version++; }
}

function floodStart(g: Game, list: GameEvent[]) {
  mark(g, 'flood');
  let hit = 0;
  for (const b of g.buildings) {
    if (b.owner !== 0 || b.state === 'building') continue;
    if (riverNear(g, b.cx, b.cz, 2.5)) { b.downUntil = g.time + DAY_SEC * 2.5; b.flooded = 1; hit++; }
  }
  if (hit) for (const r of FOOD_RES) g.res[r] *= 0.85;
  const ev: GameEvent = { id: g.id(), kind: 'flood', title: 'River Flood', icon: '🌊', sev: hit ? 'danger' : 'warn', until: g.time + DAY_SEC * 2.5, started: g.time,
    text: hit ? `Swollen rivers burst their banks. ${hit} building${hit > 1 ? 's' : ''} near the water are flooded and out of use, and some food was ruined.` : 'Rivers swell and spill over their banks, but your buildings stand clear of the water.', advice: 'Keep buildings away from river banks.' };
  list.push(ev);
  g.alert(ev.sev, ev.title, ev.text);
}

export function fightFire(g: Game) {
  if (g.res.water < 30) { g.toast('Not enough water (30 needed)'); return; }
  g.take('water', 30);
  const pb = g.buildings.filter((b) => b.owner === 0);
  let n = 0;
  for (const [t] of [...g.fires]) {
    const x = t % N, z = Math.floor(t / N);
    if (pb.some((b) => Math.hypot(b.cx - x, b.cz - z) < 14)) { g.fires.delete(t); n++; g.fx('smoke', x + 0.5, z + 0.5, 3); }
  }
  g.toast(n ? `Water bearers put out ${n} burning tiles.` : 'No fires near your settlement.');
}

export function choose(g: Game, id: number, choice: string) {
  const e = g.events.find((q) => q.id === id);
  if (!e) return;
  let done = true;
  if (e.kind === 'wildfire') { fightFire(g); return; }
  switch (e.kind) {
    case 'trader': {
      const d = e.data;
      if (choice === 'accept') {
        if (g.res[d.payR as Res] >= d.payQty) { g.take(d.payR, d.payQty); g.add(d.sell, d.qty); g.toast(`Traded for ${d.qty} ${RES[d.sell as Res].name.toLowerCase()}.`); const t = g.tribes[d.tribe - 1]; if (t) { t.tradeVol += d.qty; t.tradeRes[d.payR as Res] = (t.tradeRes[d.payR as Res] || 0) + d.payQty; if (!t.firstTrade) t.firstTrade = g.year; addMemory(g, t, 'Their trader was treated fairly at your fire.', 4, 3); } }
        else { g.toast('You cannot afford that trade.'); done = false; }
      }
      break;
    }
    case 'migrants': {
      if (choice === 'accept') {
        const cf = g.campfire();
        if (cf) {
          const n = e.data.n;
          for (let i = 0; i < n; i++) { const c = g.makeCitizen(cf.cx + rnd.range(-12, 12), cf.cz + rnd.range(-12, 12), i % 2 === 0, i < n - 2 ? 18 + Math.random() * 14 : 2 + Math.random() * 6); g.goTo(c, cf.cx, cf.cz); }
          g.alert('good', 'Migrants welcomed', `${n} newcomers have joined ${g.playerName}.`, cf.cx, cf.cz);
        }
      } else g.alert('info', 'Migrants turned away', 'The wanderers move on toward other tribes.');
      break;
    }
    case 'dispute': {
      const t = g.tribes[e.data.tribe - 1];
      if (choice === 'tribute') {
        if (g.foodTotal() >= 25) { let need = 25; for (const r of FOOD_RES) { const x = Math.min(g.res[r], need); g.take(r, x); need -= x; } t.agreements.dispute = false; addMemory(g, t, 'You compensated them for using their hunting grounds.', 12, 4); g.alert('good', 'Dispute settled', `${t.name} accept your compensation.`); }
        else { g.toast('You need 25 food.'); done = false; }
      } else if (choice === 'negotiate') {
        const p = g.hasTech('writing') ? 0.85 : g.prestige > 6 ? 0.65 : 0.35;
        if (Math.random() < p) { t.agreements.dispute = false; addMemory(g, t, 'A fair border treaty was negotiated.', 10, 4); g.alert('good', 'Treaty signed', `${t.name} agree to honor a boundary.`); }
        else { addMemory(g, t, 'Border talks collapsed in insults.', -6, 2); g.alert('warn', 'Talks failed', `${t.name} walked out of negotiations.`); }
      } else if (choice === 'withdraw') {
        const bs = g.buildings.filter((b) => b.owner === 0 && Math.hypot(b.cx - t.x, b.cz - t.z) < t.huntR && !BMAP[b.type].settle);
        for (const b of bs) g.demolish(b.id);
        t.agreements.dispute = false;
        addMemory(g, t, 'You withdrew from their hunting grounds.', 10, 4);
        g.alert('info', 'Structures dismantled', `${bs.length} structures removed from disputed land.`);
      } else { addMemory(g, t, 'You refused to address their grievance.', -10, 3); g.alert('warn', 'Dispute escalates', `${t.name} are furious. Expect trouble.`); }
      break;
    }
    case 'eclipse':
    case 'aurora': {
      if (choice === 'ritual') {
        if (g.foodTotal() >= 15) { let need = 15; for (const r of FOOD_RES) { const x = Math.min(g.res[r], need); g.take(r, x); need -= x; } g.happyMod += 12; g.prestige += 1; g.knowledgeAcc += 20; g.alert('good', 'Ritual held', 'The tribe feasts and sings. Spirits are eased; elders gain new insight.'); }
        else { g.toast('You need 15 food.'); done = false; }
      } else if (e.kind === 'eclipse') g.happyMod -= 5;
      break;
    }
  }
  if (done) { g.events = g.events.filter((q) => q.id !== id); g.version++; }
}
