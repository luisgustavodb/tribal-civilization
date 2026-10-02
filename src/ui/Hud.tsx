import { useEffect, useRef, useState } from 'react';
import { BDEFS, BMAP, BUILD_CATS, BIOME_INFO, DEP_INFO, JOBS, OVERLAYS, RES, SKILL_NAMES, TECH_MAP, FOOD_RES, type Res, type BDef } from '../game/data';
import type { Game } from '../game/sim';
import type { Renderer } from '../game/render';
import { choose } from '../game/events';
import { LEGENDS } from '../game/overlays';
import { N } from '../game/data';
import { Bar, CostChips, fmt, useTick } from './common';

type P = { g: Game; r: Renderer; panel: string | null; setPanel: (p: string | null) => void };

// ------------------------------------------------ Top bar
function Chip({ icon, value, sub, tip, warn }: { icon: string; value: string; sub?: string; tip: string; warn?: boolean }) {
  return (
    <div className={`res-chip ${warn ? 'warn' : ''}`} title={tip}>
      <span className="text-base leading-none">{icon}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-[10px] opacity-80 tabular-nums">{sub}</span>}
    </div>
  );
}

export function TopBar({ g, setPanel }: P) {
  useTick(250);
  const I = g.info;
  const net = (r: Res) => g.flowLast.prod[r] - g.flowLast.cons[r];
  const rc = (r: Res, show = true) => {
    if (!show) return null;
    const n = net(r);
    return <Chip key={r} icon={RES[r].icon} value={fmt(g.res[r])} sub={Math.abs(n) >= 0.5 ? `${n > 0 ? '+' : ''}${n.toFixed(0)}` : undefined} tip={`${RES[r].name}: ${Math.floor(g.res[r])} / ${g.capGen}\nLast day: +${g.flowLast.prod[r].toFixed(1)} produced, −${g.flowLast.cons[r].toFixed(1)} used`} warn={g.res[r] < 5 && ['wood', 'water'].includes(r)} />;
  };
  const f = g.dayFrac;
  const phase = f < 0.05 ? '🌅' : f < 0.7 ? '☀️' : f < 0.8 ? '🌇' : '🌙';
  const season = ['🌸', '☀️', '🍂', '❄️'][g.season];
  const happyIcon = I.happy > 75 ? '😄' : I.happy > 55 ? '🙂' : I.happy > 35 ? '😐' : I.happy > 20 ? '😟' : '😡';
  const t = g.research ? TECH_MAP[g.research.id] : null;
  return (
    <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
      <div className="panel-stone pointer-events-auto mx-2 mt-2 px-3 py-1.5 flex items-center gap-3 flex-wrap">
        <div className="flex flex-col leading-tight pr-3 border-r border-[#6a4a26]">
          <div className="title-rune text-[15px]">⚑ {g.playerName}</div>
          <div className="text-[11px] opacity-80">{g.era()} · {g.stage()}</div>
        </div>
        <Chip icon="👥" value={String(I.pop)} sub={`${I.children}👶`} tip={`Population ${I.pop}\nAdults ${I.adults}, children ${I.children}\nHousing: ${I.housing} beds (${I.homeless} homeless)\nUnemployed: ${I.unemployed}`} warn={I.homeless > 3} />
        <Chip icon="🍖" value={fmt(g.foodTotal())} sub={`${I.foodDays >= 50 ? '∞' : I.foodDays.toFixed(1)}d`} tip={`Food stores ${Math.floor(g.foodTotal())}/${g.capFood}\n${FOOD_RES.map((r) => `${RES[r].icon} ${RES[r].name}: ${Math.floor(g.res[r])}`).join('\n')}\nEnough for ${I.foodDays.toFixed(1)} days at current rations`} warn={I.foodDays < 3} />
        {rc('water')}
        {rc('wood')}
        {rc('stone')}
        {rc('fiber')}
        {rc('clay', g.res.clay > 0 || g.hasTech('pottery'))}
        {rc('tools', g.res.tools > 0)}
        {rc('pottery', g.res.pottery > 0)}
        {rc('copper', g.res.copper > 0 || g.hasTech('metalworking'))}
        {rc('tin', g.res.tin > 0 || g.hasTech('metalworking'))}
        {rc('bronze', g.res.bronze > 0 || g.hasTech('bronze'))}
        {rc('iron', g.res.iron > 0 || g.hasTech('iron'))}
        {rc('salt', g.res.salt > 0)}
        {rc('gems', g.res.gems > 0)}
        {rc('rare', g.res.rare > 0)}
        <Chip icon={happyIcon} value={Math.round(I.happy) + '%'} tip={`Average happiness ${I.happy.toFixed(0)}%\nHealth ${I.avgHealth.toFixed(0)}% · sick ${I.sick}`} warn={I.happy < 35} />
        <button className="res-chip hover:brightness-125" onClick={() => setPanel('tech')} title="Open the technology tree">
          <span>📖</span>
          {t ? <span className="text-xs">{t.name} <b>{Math.floor((g.research!.progress / t.cost) * 100)}%</b></span> : <span className="text-xs text-amber-300">Choose research!</span>}
          <span className="text-[10px] opacity-80">+{I.kRate.toFixed(1)}/d</span>
        </button>
        <Chip icon="🏛️" value={g.prestige.toFixed(0)} tip="Prestige: earned through temples, monuments, gifts, tribute and discoveries. Needed for alliances." />
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="title-rune text-[15px]">{season} Year {g.year + 1} {phase}</div>
            <div className="text-[11px] opacity-80">{g.seasonName} · day {(g.day % 8) + 1}/8</div>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((s) => (
              <button key={s} className={`btn speed ${g.speed === s ? 'btn-on' : ''}`} onClick={() => g.setSpeed(s)} title={s === 0 ? 'Pause (Space)' : `Speed ${s}× (${s})`}>
                {s === 0 ? '⏸' : s + '×'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------ Side bar
export function SideBar({ g, r, panel, setPanel, unread }: P & { unread: number }) {
  const items = [
    { id: 'tech', icon: '🔥', label: 'Technology' },
    { id: 'tribes', icon: '🤝', label: 'Tribes & Diplomacy' },
    { id: 'trade', icon: '⚖️', label: 'Trade' },
    { id: 'tribe', icon: '🏕️', label: 'Settlement & Policies' },
    { id: 'stats', icon: '📊', label: 'Statistics' },
    { id: 'alerts', icon: '📜', label: 'Alerts & Chronicle' },
  ];
  void g; void r;
  return (
    <div className="absolute left-2 top-[100px] z-20 flex flex-col gap-1.5 pointer-events-auto">
      {items.map((it) => (
        <button key={it.id} onClick={() => setPanel(panel === it.id ? null : it.id)} className={`side-btn ${panel === it.id ? 'btn-on' : ''}`} title={it.label}>
          <span className="text-xl">{it.icon}</span>
          {it.id === 'alerts' && unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
      ))}
      <OverlayMenu g={g} />
    </div>
  );
}

function OverlayMenu({ g }: { g: Game }) {
  const [open, setOpen] = useState(false);
  useTick(500);
  const cur = OVERLAYS.find((o) => o.id === g.overlay)!;
  const leg = LEGENDS[g.overlay];
  return (
    <div className="relative">
      <button className={`side-btn ${g.overlay !== 'none' ? 'btn-on' : ''}`} onClick={() => setOpen(!open)} title="Map overlays">
        <span className="text-xl">{cur.icon}</span>
      </button>
      {open && (
        <div className="absolute left-14 top-0 panel-stone p-2 w-44 flex flex-col gap-1">
          <div className="title-rune text-xs mb-1">Map Overlays</div>
          {OVERLAYS.map((o) => (
            <button key={o.id} className={`btn text-left text-xs px-2 py-1 ${g.overlay === o.id ? 'btn-on' : ''}`} onClick={() => { g.overlay = o.id; g.version++; setOpen(false); }}>
              {o.icon} {o.name}
            </button>
          ))}
        </div>
      )}
      {leg && !open && (
        <div className="absolute left-14 top-0 panel-stone p-2 w-48 text-[11px]">
          <div className="title-rune text-xs mb-1">{cur.icon} {cur.name}</div>
          {leg.map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span style={{ background: l.color, width: 10, height: 10, display: 'inline-block', borderRadius: 2, border: '1px solid #0006' }} />
              {l.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------ Build menu
const REQ_TEXT = (def: BDef) => {
  const r = def.req;
  if (!r) return '';
  if (r === 'water') return def.id === 'fishing' ? 'Must be near water' : 'Must be near a river or lake';
  if (r === 'forest') return 'Must be near forest';
  if (r === 'fertile') return 'Needs fertile soil';
  if (r.startsWith('dep')) return `Needs ${DEP_INFO[parseInt(r.slice(3))].name} nearby`;
  return '';
};

export function BuildMenu({ g, r }: P) {
  const [cat, setCat] = useState('Housing');
  const [tip, setTip] = useState<BDef | null>(null);
  useTick(400);
  const tool = g.tool;
  const cats = [...BUILD_CATS, 'Roads'];
  const list = BDEFS.filter((d) => d.cat === cat && !d.noPlace);
  const pick = (d: BDef) => {
    if (!g.hasTech(d.tech)) { g.toast(`Requires ${TECH_MAP[d.tech].name} technology`); return; }
    g.tool = { mode: d.wall ? 'wall' : 'build', type: d.id, rot: 0 };
    g.selected = null; g.version++;
  };
  const setTool = (mode: string, type = '') => { g.tool = { mode, type, rot: 0 }; g.selected = null; g.version++; };
  void r;
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center pointer-events-none">
      <div className="pointer-events-auto panel-stone m-2 mb-2 w-[min(1100px,calc(100%-250px))] mr-[226px] relative">
        {tip && (
          <div className="absolute bottom-full mb-2 left-0 panel-parch p-3 w-[340px] text-sm z-40">
            <div className="font-bold text-base">{tip.icon} {tip.name}</div>
            <div className="text-xs italic mb-1">{tip.desc}</div>
            <div className="text-xs flex flex-col gap-0.5">
              <div>Cost: <CostChips cost={tip.cost} g={g} /></div>
              <div>Footprint {tip.w}×{tip.d} · build effort {tip.time}s</div>
              {tip.housing ? <div>🏠 Houses {tip.housing}</div> : null}
              {tip.workers ? <div>👷 {tip.workers} workers ({JOBS[tip.job!]?.name})</div> : null}
              {tip.terr ? <div>🚩 Claims {tip.terr} tiles of land</div> : null}
              {tip.happy ? <div>😊 Happiness +{tip.happy} nearby</div> : null}
              {tip.capGen || tip.capFood ? <div>📦 +{tip.capGen || 0} goods / +{tip.capFood || 0} food storage</div> : null}
              {tip.work?.k === 'craft' ? <div>⚙️ {Object.entries(tip.work.inp).map(([k, v]) => `${v} ${RES[k as Res].name}`).join(' + ')} → {Object.entries(tip.work.out).map(([k, v]) => `${v} ${RES[k as Res].name}`).join(' + ')}</div> : null}
              {REQ_TEXT(tip) && <div className="text-red-900">⚠ {REQ_TEXT(tip)}</div>}
              {tip.upgrade && <div>⬆ Upgrades to {BMAP[tip.upgrade].name}</div>}
              {!g.hasTech(tip.tech) && <div className="text-red-900 font-bold">🔒 Requires {TECH_MAP[tip.tech].name}</div>}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 px-2 pt-1.5 flex-wrap">
          {cats.map((c) => (
            <button key={c} className={`tab ${cat === c ? 'tab-on' : ''}`} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
          <div className="ml-auto flex gap-1">
            <button className={`btn text-xs px-2 ${tool.mode === 'demolish' ? 'btn-on' : ''}`} onClick={() => setTool(tool.mode === 'demolish' ? 'none' : 'demolish')} title="Demolish a building">🔨 Demolish</button>
            <button className="btn text-xs px-2" onClick={() => { if (tool.mode === 'build') { g.tool.rot = 1 - g.tool.rot; } }} title="Rotate (R)">↻ Rotate (R)</button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto p-2 pt-1.5">
          {cat === 'Roads' ? (
            <>
              <button className={`card ${tool.mode === 'road' && tool.type === 'path' ? 'card-on' : ''}`} onClick={() => setTool('road', 'path')}>
                <div className="text-xl">🥾</div><div className="text-[11px] font-semibold">Dirt Path</div><div className="text-[10px]">Free · drag</div>
              </button>
              <button className={`card ${tool.mode === 'road' && tool.type === 'stone' ? 'card-on' : ''} ${g.hasTech('bronze') ? '' : 'locked'}`} onClick={() => (g.hasTech('bronze') ? setTool('road', 'stone') : g.toast('Requires Bronze technology'))}>
                <div className="text-xl">🛤️</div><div className="text-[11px] font-semibold">Stone Road</div><div className="text-[10px]">1🪨 / tile · faster</div>
              </button>
              <button className={`card ${tool.mode === 'erase' ? 'card-on' : ''}`} onClick={() => setTool('erase')}>
                <div className="text-xl">🧹</div><div className="text-[11px] font-semibold">Remove Road</div><div className="text-[10px]">drag</div>
              </button>
              <div className="text-xs opacity-80 self-center px-3 max-w-[360px]">Roads speed up citizens and caravans (+35% / +70%) and boost the output of nearby workplaces. Paths can ford rivers.</div>
            </>
          ) : (
            list.map((d) => {
              const locked = !g.hasTech(d.tech);
              return (
                <button key={d.id} className={`card ${tool.type === d.id && (tool.mode === 'build' || tool.mode === 'wall') ? 'card-on' : ''} ${locked ? 'locked' : ''}`} onClick={() => pick(d)} onMouseEnter={() => setTip(d)} onMouseLeave={() => setTip(null)}>
                  <div className="text-2xl leading-none">{locked ? '🔒' : d.icon}</div>
                  <div className="text-[11px] font-semibold leading-tight">{d.name}</div>
                  <div className="text-[10px]"><CostChips cost={d.cost} g={g} small /></div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function PlacementHint({ g, r }: P) {
  useTick(120);
  const t = g.tool;
  if (t.mode === 'none' || t.mode === 'settle') return null;
  const h = r.hover;
  let text = '';
  if (t.mode === 'build') { const d = BMAP[t.type]; text = `Placing ${d.name} — click to build · R to rotate · right-click to cancel`; }
  else if (t.mode === 'wall') text = `Drag to build ${BMAP[t.type].name} lines — right-click to cancel`;
  else if (t.mode === 'road') text = `Drag to lay ${t.type === 'stone' ? 'stone road' : 'dirt path'} — right-click to cancel`;
  else if (t.mode === 'erase') text = 'Drag over roads to remove them';
  else if (t.mode === 'demolish') text = 'Click a building to demolish it (partial refund)';
  return (
    <div className="absolute bottom-[190px] left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-1">
      <div className="panel-stone px-3 py-1 text-sm">{text}</div>
      {t.mode === 'build' && h && !h.valid && <div className="px-3 py-0.5 rounded bg-red-900/90 text-red-100 text-xs border border-red-400">✖ {h.msg}</div>}
      {t.mode === 'build' && h && h.valid && <div className="px-3 py-0.5 rounded bg-emerald-900/90 text-emerald-100 text-xs border border-emerald-400">✔ Can build here · Cost: <CostChips cost={BMAP[t.type].cost} g={g} small /></div>}
    </div>
  );
}

// ------------------------------------------------ Selection
export function SelectionPanel({ g, r, setPanel }: P) {
  useTick(300);
  const s = g.selected;
  if (!s) return <TileInfo g={g} r={r} />;
  if (s.kind === 'building') return <BuildingInfo g={g} id={s.id} />;
  if (s.kind === 'citizen') return <CitizenInfo g={g} r={r} id={s.id} />;
  if (s.kind === 'tribe') {
    const t = g.tribes[s.id - 1];
    if (!t) return null;
    return (
      <div className="panel-stone p-3 w-[300px] pointer-events-auto">
        <div className="title-rune">⚑ {t.met ? t.name : 'Unknown tribe'}</div>
        <div className="text-xs opacity-80">{t.met ? t.culture : 'Not yet met — send an envoy via the Tribes panel.'}</div>
        <button className="btn mt-2 px-3 py-1 text-sm" onClick={() => setPanel('tribes')}>Open diplomacy</button>
      </div>
    );
  }
  return null;
}

function TileInfo({ g, r }: { g: Game; r: Renderer }) {
  const h = r.hover;
  if (!h || h.tile < 0 || g.tool.mode !== 'none') return null;
  const ti = g.tileInfo(h.x, h.z);
  if (!ti) return null;
  const own = ti.owner === 255 ? 'Unclaimed' : ti.owner === 0 ? 'Your territory' : g.tribes[ti.owner - 1]?.met ? g.tribes[ti.owner - 1].name + ' territory' : 'Foreign territory';
  return (
    <div className="panel-stone px-3 py-2 text-xs w-[220px] pointer-events-none">
      <div className="font-semibold">{BIOME_INFO[ti.biome].name} · {own}</div>
      <div>Fertility {(ti.fert * 100).toFixed(0)}% {ti.trees ? `· 🌲×${ti.trees}` : ''}</div>
      {ti.dep ? <div>{DEP_INFO[ti.dep].name} ({Math.floor(ti.depAmt)} left)</div> : null}
    </div>
  );
}

function BuildingInfo({ g, id }: { g: Game; id: number }) {
  const b = g.bById.get(id);
  if (!b) return null;
  const def = BMAP[b.type];
  const residents = g.citizens.filter((c) => c.homeId === b.id);
  const workers = b.workers.map((i) => g.cById.get(i)).filter(Boolean);
  const up = def.upgrade ? BMAP[def.upgrade] : null;
  return (
    <div className="panel-stone p-3 w-[300px] pointer-events-auto text-sm">
      <div className="flex justify-between items-start">
        <div className="title-rune">{def.icon} {b.name || def.name}</div>
        <button className="btn px-1.5 text-xs" onClick={() => { g.selected = null; g.version++; }}>✕</button>
      </div>
      <div className="text-xs italic opacity-80 mb-1">{def.desc}</div>
      {b.state !== 'ready' && (
        <div className="mb-1">
          <div className="text-xs">{b.state === 'upgrading' ? `Upgrading to ${BMAP[b.upTo!].name}` : 'Under construction'} — {Math.floor(b.progress * 100)}%</div>
          <Bar v={b.progress} max={1} color="#e0a840" />
          <div className="text-[11px] opacity-80">Builders on site walk here to work. {g.citizens.filter((c) => c.job === 'builder').length} builders in the tribe.</div>
        </div>
      )}
      {b.state === 'ready' && b.downUntil > g.time && <div className="text-xs text-red-300">⚠ Out of use ({b.flooded ? 'flooded' : 'raided'}) for {Math.ceil((b.downUntil - g.time) / 20)} more days</div>}
      {b.state === 'ready' && b.status && <div className="text-xs">Status: <b>{b.status}</b></div>}
      {def.housing ? <div className="text-xs">🏠 Residents {residents.length}/{def.housing}{residents.length ? ': ' + residents.slice(0, 5).map((c) => c.name).join(', ') + (residents.length > 5 ? '…' : '') : ''}</div> : null}
      {def.workers ? (
        <div className="text-xs mt-1">
          👷 Workers {workers.length}/{b.maxW} <span className="opacity-70">(max {def.workers})</span>
          <span className="ml-2 inline-flex gap-1">
            <button className="btn px-1.5" onClick={() => g.setMaxWorkers(b.id, b.maxW - 1)}>−</button>
            <button className="btn px-1.5" onClick={() => g.setMaxWorkers(b.id, b.maxW + 1)}>+</button>
          </span>
          <div className="opacity-80">{workers.slice(0, 6).map((c) => `${c!.name} (${Math.floor(c!.skills[(['hunter', 'fisher'].includes(c!.job) ? 'hunting' : 'gathering') as 'hunting'])})`).length ? workers.slice(0, 6).map((c) => c!.name).join(', ') : 'No workers assigned yet'}</div>
        </div>
      ) : null}
      {def.work?.k === 'craft' ? <div className="text-xs mt-1">⚙️ {Object.entries(def.work.inp).map(([k, v]) => `${v}${RES[k as Res].icon}`).join(' + ')} → {Object.entries(def.work.out).map(([k, v]) => `${v}${RES[k as Res].icon}`).join(' + ')} {b.craftProg > 0 ? `(${Math.floor((b.craftProg / def.work.time) * 100)}%)` : ''}</div> : null}
      {def.work?.k === 'field' ? <div className="text-xs mt-1">🌱 Soil fertility {(b.fert * 100).toFixed(0)}% · water access {(b.wf * 100).toFixed(0)}%</div> : null}
      <div className="flex gap-1 mt-2 flex-wrap">
        {b.state === 'ready' && up && <button className="btn px-2 py-1 text-xs" onClick={() => g.upgrade(b.id)} title={g.hasTech(up.tech) ? '' : 'Requires ' + TECH_MAP[up.tech].name}>⬆ {up.name} <CostChips cost={up.cost} g={g} small /></button>}
        {def.workers ? <button className="btn px-2 py-1 text-xs" onClick={() => { b.enabled = !b.enabled; g.version++; }}>{b.enabled ? '⏸ Disable' : '▶ Enable'}</button> : null}
        <button className="btn px-2 py-1 text-xs" onClick={() => g.demolish(b.id)}>🔨 Demolish</button>
      </div>
    </div>
  );
}

function CitizenInfo({ g, r, id }: { g: Game; r: Renderer; id: number }) {
  const c = g.cById.get(id);
  if (!c || !c.alive) return null;
  const home = g.bById.get(c.homeId), work = g.bById.get(c.workId);
  const partner = g.cById.get(c.partner);
  const kids = c.children.map((k) => g.cById.get(k)).filter(Boolean);
  const top = g.specialization(c);
  return (
    <div className="panel-stone p-3 w-[300px] pointer-events-auto text-sm">
      <div className="flex justify-between items-start">
        <div className="title-rune">{c.female ? '👩' : '👨'} {c.name}</div>
        <button className="btn px-1.5 text-xs" onClick={() => { g.selected = null; g.version++; }}>✕</button>
      </div>
      <div className="text-xs opacity-90">Age {Math.floor(c.age)} · {c.age < 12 ? 'Child' : c.age > 55 ? 'Elder' : JOBS[c.job]?.name} · {SKILL_NAMES[top]} ({Math.round(c.skills[top] * 100)})</div>
      <div className="text-xs">Doing: {c.act === 'sleep' ? '😴 sleeping' : c.act === 'eat' ? '🍲 eating' : c.act === 'social' ? '🪘 socialising' : c.working ? '⚒ working' : c.carry ? `carrying ${RES[c.carry].name.toLowerCase()}` : 'walking / idle'}</div>
      <div className="text-xs">🏠 {home ? BMAP[home.type].name : 'Homeless'} · 🔨 {work ? BMAP[work.type].name : c.job === 'builder' ? 'Construction crew' : 'No workplace'}</div>
      <div className="text-xs">👪 {partner ? `Partner ${partner.name}` : 'Single'}{kids.length ? ` · children: ${kids.map((k) => k!.name).join(', ')}` : ''}{c.sick ? ' · 🤒 sick' : ''}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px]">
        {[['Health', c.health, '#d05050'], ['Happy', c.happy, '#e0c040'], ['Food', c.needs.food, '#c08040'], ['Water', c.needs.water, '#4aa0d8'], ['Rest', c.needs.rest, '#8a7ad0'], ['Social', c.needs.social, '#d070b0']].map(([l, v, col]) => (
          <div key={l as string}>{l as string}<Bar v={v as number} color={col as string} h={5} /></div>
        ))}
      </div>
      <button className="btn px-2 py-1 text-xs mt-2" onClick={() => r.focus(c.x, c.z, 9)}>🎯 Follow closely</button>
    </div>
  );
}

// ------------------------------------------------ Events, alerts
export function EventStack({ g, r }: P) {
  useTick(400);
  const evs = g.events.slice(-5);
  const toasts = g.toasts.filter((t) => g.time - t.t < 7 + 3);
  return (
    <>
      <div className="fixed top-[78px] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1 pointer-events-none">
        {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
      <div className="flex flex-col gap-2 w-[300px] pointer-events-auto">
        {evs.map((e) => (
          <div key={e.id} className={`event-card sev-${e.sev}`}>
            <div className="flex items-start gap-2">
              <div className="text-2xl">{e.icon}</div>
              <div className="flex-1">
                <div className="font-bold text-sm leading-tight">{e.title}</div>
                <div className="text-[11px] leading-snug">{e.text}</div>
                {e.advice && <div className="text-[11px] italic mt-0.5">💡 {e.advice}</div>}
              </div>
              {e.x !== undefined && <button className="btn px-1 text-xs" onClick={() => r.focus(e.x!, e.z!, 40)} title="Show on map">🎯</button>}
            </div>
            {e.choices && (
              <div className="flex flex-col gap-1 mt-1.5">
                {e.choices.map((c) => (
                  <button key={c.id} className="btn text-xs px-2 py-1 text-left" onClick={() => { choose(g, e.id, c.id); g.version++; }}>
                    {c.label} {c.hint && <span className="opacity-70">· {c.hint}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------ Minimap
const mmCache = new Map<number, HTMLCanvasElement>();
function baseMap(g: Game) {
  let c = mmCache.get(g.seed);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  const img = x.createImageData(N, N);
  const W = g.world;
  for (let t = 0; t < N * N; t++) {
    const col = BIOME_INFO[W.biome[t]].color;
    const v = parseInt(col.slice(1), 16);
    let r = (v >> 16) & 255, gg = (v >> 8) & 255, b = v & 255;
    const h = W.h[Math.floor(t / N) * (N + 1) + (t % N)];
    const sh = W.biome[t] <= 2 ? 1 : 0.8 + Math.min(0.35, h * 0.03);
    if (W.biome[t] === 0) { const d = Math.min(1, Math.abs(h) / 5); r *= 1 - d * 0.5; gg *= 1 - d * 0.4; b *= 1 - d * 0.1; }
    img.data[t * 4] = r * sh; img.data[t * 4 + 1] = gg * sh; img.data[t * 4 + 2] = b * sh; img.data[t * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  mmCache.set(g.seed, c);
  return c;
}

export function Minimap({ g, r }: P) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const cv = ref.current;
      if (!cv) return;
      const x = cv.getContext('2d')!;
      x.imageSmoothingEnabled = false;
      x.drawImage(baseMap(g), 0, 0);
      for (let t = 0; t < N * N; t++) {
        const o = g.owner[t];
        if (o === 255) continue;
        const known = o === 0 || g.tribes[o - 1]?.met;
        x.fillStyle = o === 0 ? 'rgba(255,220,100,0.38)' : known ? `#${g.tribes[o - 1].color.toString(16).padStart(6, '0')}55` : 'rgba(200,200,200,0.2)';
        x.fillRect(t % N, Math.floor(t / N), 1, 1);
      }
      for (const b of g.buildings) { x.fillStyle = b.owner === 0 ? '#fff' : '#' + g.tribes[b.owner - 1].color.toString(16).padStart(6, '0'); x.fillRect(Math.floor(b.cx) - 1, Math.floor(b.cz) - 1, b.owner === 0 ? 2 : 2, 2); }
      for (const t of g.tribes) { x.strokeStyle = t.met ? '#fff' : '#aaa'; x.fillStyle = '#' + t.color.toString(16).padStart(6, '0'); x.beginPath(); x.arc(t.x, t.z, 3, 0, 7); x.fill(); x.stroke(); }
      for (const rd of g.raids) { x.fillStyle = '#f00'; x.fillRect(rd.x - 2, rd.z - 2, 4, 4); }
      for (const s of g.world.sites) if (s.found) { x.fillStyle = '#f0e'; x.fillRect(s.x - 1, s.z - 1, 2, 2); }
      const view = Math.max(8, r.dist * 0.75);
      x.strokeStyle = '#fff'; x.lineWidth = 1.2;
      x.save(); x.translate(r.tgt.x, r.tgt.z); x.rotate(-r.yaw);
      x.strokeRect(-view / 2, -view * 0.35, view, view * 0.7);
      x.restore();
    };
    draw();
    const id = setInterval(draw, 400);
    return () => clearInterval(id);
  }, [g, r]);
  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rc = e.currentTarget.getBoundingClientRect();
    r.focus(((e.clientX - rc.left) / rc.width) * N, ((e.clientY - rc.top) / rc.height) * N, Math.min(r.distGoal, 70));
  };
  return <canvas ref={ref} width={N} height={N} onClick={click} className="block cursor-pointer" style={{ width: 200, height: 200, imageRendering: 'pixelated' }} />;
}

export function ZoomBox({ g, r }: P) {
  useTick(300);
  const lv = r.zoomLevel();
  void g;
  return (
    <div className="panel-stone p-1.5 w-[212px] pointer-events-auto">
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="title-rune text-[11px]">{lv}</div>
        <div className="flex gap-1">
          <button className="btn px-1.5 text-xs" onClick={() => r.rotateBy(-0.4)} title="Rotate left (Q)">⟲</button>
          <button className="btn px-1.5 text-xs" onClick={() => r.rotateBy(0.4)} title="Rotate right (E)">⟳</button>
          <button className="btn px-1.5 text-xs" onClick={() => r.zoomBy(1.4)} title="Zoom out">−</button>
          <button className="btn px-1.5 text-xs" onClick={() => r.zoomBy(0.7)} title="Zoom in">＋</button>
        </div>
      </div>
      <div className="border border-[#6a4a26]"><Minimap g={g} r={r} panel={null} setPanel={() => {}} /></div>
      <div className="grid grid-cols-4 gap-1 mt-1">
        {[['🌍', 250], ['🗺️', 110], ['🏘️', 45], ['👣', 10]].map(([ic, d]) => (
          <button key={d as number} className="btn text-xs py-0.5" onClick={() => { r.distGoal = d as number; }} title="Zoom level">{ic}</button>
        ))}
      </div>
    </div>
  );
}
