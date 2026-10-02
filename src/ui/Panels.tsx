import { useState } from 'react';
import { BDEFS, JOBS, PRIO_CATS, RES, RES_LIST, TECHS, TECH_MAP, BIOME_INFO, FOOD_RES, type Res } from '../game/data';
import type { Game } from '../game/sim';
import type { Renderer } from '../game/render';
import { DIP_REQ, addRoute, diplomacy, myPrice, removeRoute, routeQuote, tribePrice, nearestMarket } from '../game/tribes';
import { Bar, CostChips, Modal, Seg, fmt, useTick } from './common';

type P = { g: Game; r: Renderer; onClose: () => void };

// ------------------------------------------------ Technology
export function TechPanel({ g, onClose }: P) {
  useTick(400);
  const depth: Record<string, number> = {};
  const dep = (id: string): number => (depth[id] !== undefined ? depth[id] : (depth[id] = TECH_MAP[id].req.length ? 1 + Math.max(...TECH_MAP[id].req.map(dep)) : 0));
  TECHS.forEach((t) => dep(t.id));
  const cols: string[][] = [];
  TECHS.forEach((t) => { (cols[depth[t.id]] = cols[depth[t.id]] || []).push(t.id); });
  const cur = g.research ? TECH_MAP[g.research.id] : null;
  return (
    <Modal title="Technology — Growth of Knowledge" icon="📖" onClose={onClose} wide>
      <div className="panel-parch p-3 mb-3 text-sm flex items-center gap-4">
        <div className="flex-1">
          {cur ? (
            <>
              <div className="font-bold">Researching: {cur.icon} {cur.name} <span className="font-normal">— {Math.floor(g.research!.progress)} / {cur.cost}</span></div>
              <Bar v={g.research!.progress} max={cur.cost} color="#c08a30" h={10} />
            </>
          ) : (
            <div className="font-bold text-amber-900">No research chosen — your elders' wisdom is being stored. Pick a discovery below.</div>
          )}
        </div>
        <div className="text-xs w-64">Knowledge grows by <b>{g.info.kRate.toFixed(1)}</b> per day: every person contributes a little, Storyteller circles, scribes and temples contribute much more. Caves, ruins and monoliths grant bursts of insight.</div>
      </div>
      <div className="flex gap-3 items-start overflow-x-auto pb-2">
        {cols.map((col, i) => (
          <div key={i} className="flex flex-col gap-2 min-w-[190px] flex-1">
            <div className="text-[11px] uppercase tracking-widest opacity-60 text-center">Tier {i}</div>
            {col.map((id) => {
              const t = TECH_MAP[id];
              const done = g.techs.has(id);
              const avail = !done && t.req.every((r) => g.techs.has(r));
              const going = g.research?.id === id;
              const unlocks = BDEFS.filter((d) => d.tech === id && d.id !== 'campfire').map((d) => d.icon + ' ' + d.name);
              return (
                <div key={id} className={`tech-card ${done ? 'done' : avail ? 'avail' : 'locked'} ${going ? 'going' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xl">{t.icon}</span>
                    <b className="text-sm leading-tight">{t.name}</b>
                    {done && <span className="ml-auto text-green-300">✔</span>}
                  </div>
                  <div className="text-[11px] opacity-90 leading-snug my-1">{t.desc}</div>
                  <div className="text-[11px] text-amber-200">Unlocks: {t.bonus}</div>
                  {unlocks.length > 0 && <div className="text-[10px] opacity-70 mt-0.5">{unlocks.join(' · ')}</div>}
                  {!done && (
                    <div className="mt-1.5 flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-[11px]">📖 {t.cost}{t.res ? <> + <CostChips cost={t.res} g={g} small /></> : null}</span>
                      {avail && !going && <button className="btn px-2 py-0.5 text-xs" onClick={() => g.startResearch(id)}>Research</button>}
                      {going && <span className="text-xs text-amber-300">In progress…</span>}
                      {!avail && <span className="text-[10px] opacity-70">Needs {t.req.filter((r) => !g.techs.has(r)).map((r) => TECH_MAP[r].name).join(', ')}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------ Diplomacy
const STATUS_COL: Record<string, string> = { unmet: '#999', neutral: '#d8c890', friendly: '#7ad070', allied: '#4ac8e8', hostile: '#e08040', war: '#e04040' };

export function TribesPanel({ g, r, onClose }: P) {
  useTick(500);
  const first = g.selected?.kind === 'tribe' ? g.selected.id : (g.tribes.find((t) => t.met) || g.tribes[0]).id;
  const [sel, setSel] = useState(first);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [gift, setGift] = useState<Res>('meat');
  const [rg, setRg] = useState<Res>('wood');
  const [rt, setRt] = useState<Res>('copper');
  const t = g.tribes[sel - 1];
  const A = t.agreements;
  const act = (a: string, p?: any) => setMsg(diplomacy(g, t.id, a, p));
  const sorted = [...t.factors].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const A_btn = (id: string, label: string, on: boolean, req?: number, p?: any, cancelKey?: string) => (
    <div className="flex items-center justify-between gap-2 text-sm py-1 border-b border-[#ffffff14]">
      <div>
        {label}
        {req !== undefined && <span className="text-[10px] opacity-70"> · needs opinion ≥ {req}</span>}
      </div>
      {on ? <button className="btn px-2 py-0.5 text-xs" onClick={() => act('cancel', cancelKey || id)}>✔ Active · cancel</button> : <button className="btn px-2 py-0.5 text-xs" onClick={() => act(id, p)}>Propose</button>}
    </div>
  );
  const goodsOpts = RES_LIST.filter((x) => x !== 'water');
  return (
    <Modal title="Tribes & Diplomacy" icon="🤝" onClose={onClose} wide>
      <div className="flex gap-4 min-h-[420px]">
        <div className="w-60 flex flex-col gap-1.5">
          {g.tribes.map((x) => (
            <button key={x.id} className={`flex items-center gap-2 p-2 rounded text-left border ${sel === x.id ? 'bg-[#5a3d1f] border-amber-400' : 'bg-[#3a2814] border-[#6a4a26] hover:bg-[#4a331a]'}`} onClick={() => { setSel(x.id); setMsg(null); }}>
              <span style={{ background: '#' + x.color.toString(16).padStart(6, '0'), width: 14, height: 30, borderRadius: 3, border: '1px solid #000a' }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{x.met ? x.name : 'Unknown tribe'}</div>
                <div className="text-[10px] opacity-80 truncate">{x.met ? x.culture : 'not yet met'}</div>
              </div>
              <span className="text-[10px] px-1 rounded" style={{ color: STATUS_COL[x.status], border: `1px solid ${STATUS_COL[x.status]}` }}>{x.status}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          {!t.met ? (
            <div className="panel-parch p-4">
              <div className="font-bold text-lg">An unknown people</div>
              <p className="text-sm my-2">Smoke from distant fires hints at another tribe. Send an envoy (costs 10 food) to learn who they are, or expand toward them.</p>
              <button className="btn px-3 py-1" onClick={() => act('envoy')}>Send envoy 🕊️</button>
              <button className="btn px-3 py-1 ml-2" onClick={() => { r.focus(t.x, t.z, 90); onClose(); }}>Look on map 🎯</button>
              {msg && <div className="mt-2 text-sm text-red-900">{msg.msg}</div>}
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1">
                  <div className="title-rune text-xl">{t.name} <span className="text-sm opacity-80">— {t.title}</span></div>
                  <div className="text-xs opacity-90 italic">{t.desc}</div>
                  <div className="text-[11px] mt-1">Culture: <b>{t.culture}</b> · prefers {BIOME_INFO[t.biome].name.toLowerCase()} · pop {t.pop} · tech level {t.tech} · strength {t.strength.toFixed(0)} · aggression {(t.aggression * 100).toFixed(0)}%{t.nomad ? ' · nomadic' : ''}</div>
                  <div className="text-[11px]">Exports: {t.exports.map((e) => RES[e].icon + RES[e].name).join(', ')} · Wants: {t.wants.map((e) => RES[e].icon + RES[e].name).join(', ')}</div>
                </div>
                <button className="btn px-2 py-1 text-xs" onClick={() => { r.focus(t.x, t.z, 60); onClose(); }}>🎯 Map</button>
              </div>
              <div className="mb-2">
                <div className="flex justify-between text-xs"><span>Opinion of you: <b style={{ color: STATUS_COL[t.status] }}>{t.status.toUpperCase()}</b></span><span>{t.opinion > 0 ? '+' : ''}{Math.round(t.opinion)}</span></div>
                <div className="relative h-3 bg-black/50 rounded border border-black/50">
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/50 left-1/2" />
                  <div className="absolute top-0 bottom-0" style={{ left: t.opinion >= 0 ? '50%' : `${50 + t.opinion / 2}%`, width: `${Math.abs(t.opinion) / 2}%`, background: t.opinion >= 0 ? '#6ac060' : '#d05040' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="panel-parch p-2 text-[13px]">
                  <div className="font-bold mb-1">Why they feel this way</div>
                  <div className="flex flex-col gap-1 max-h-[250px] overflow-auto">
                    {sorted.map((f, i) => (
                      <div key={i} className="flex gap-2 items-start leading-snug">
                        <b className="w-9 text-right shrink-0" style={{ color: f.value >= 0 ? '#2a6a1a' : '#a02a1a' }}>{f.value > 0 ? '+' : ''}{f.value.toFixed(0)}</b>
                        <span>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="panel-stone p-2 text-sm">
                  <div className="font-bold mb-1">Agreements</div>
                  {A_btn('trade', '📜 Trade agreement (no tolls, better rates)', A.trade, DIP_REQ.trade)}
                  {A_btn('borders', '🚪 Open borders (safe caravans)', A.borders, DIP_REQ.borders)}
                  {A_btn('defensive', '🛡️ Defensive pact', A.defensive, DIP_REQ.defensive)}
                  {A_btn('alliance', '🤝 Alliance', A.alliance, DIP_REQ.alliance)}
                  <div className="flex items-center justify-between gap-1 text-sm py-1 border-b border-[#ffffff14] flex-wrap">
                    <div>📦 Resource agreement <span className="text-[10px] opacity-70">· opinion ≥ {DIP_REQ.resource}</span></div>
                    {A.resource ? (
                      <button className="btn px-2 py-0.5 text-xs" onClick={() => act('cancel', 'resource')}>{A.resource.qty}{RES[A.resource.give].icon}→{A.resource.qty}{RES[A.resource.get].icon}/season ✖</button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs">
                        <select className="sel" value={rg} onChange={(e) => setRg(e.target.value as Res)}>{goodsOpts.map((x) => <option key={x} value={x}>{RES[x].name}</option>)}</select>→
                        <select className="sel" value={rt} onChange={(e) => setRt(e.target.value as Res)}>{goodsOpts.map((x) => <option key={x} value={x}>{RES[x].name}</option>)}</select>
                        <button className="btn px-2 py-0.5" onClick={() => act('resource', { give: rg, get: rt, qty: 10 })}>10/season</button>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm py-1 border-b border-[#ffffff14]">
                    <div>💰 Tribute {A.tribute ? <span className="text-xs opacity-80">({A.tribute.dir === 'to' ? 'you pay' : 'they pay'} {A.tribute.amt} {RES[A.tribute.res].name}/yr)</span> : ''}</div>
                    {A.tribute ? <button className="btn px-2 py-0.5 text-xs" onClick={() => act('cancel', 'tribute')}>End</button> : (
                      <span className="flex gap-1"><button className="btn px-2 py-0.5 text-xs" onClick={() => act('tribute_pay', { res: 'meat', amt: 20 })}>Pay 20🍖/yr</button><button className="btn px-2 py-0.5 text-xs" onClick={() => act('tribute_demand')}>Demand</button></span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm py-1 border-b border-[#ffffff14]">
                    <div>🎁 Gift <select className="sel" value={gift} onChange={(e) => setGift(e.target.value as Res)}>{goodsOpts.map((x) => <option key={x} value={x}>{RES[x].icon} {RES[x].name}</option>)}</select></div>
                    <button className="btn px-2 py-0.5 text-xs" onClick={() => act('gift', gift)}>Send</button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {A.dispute && <button className="btn px-2 py-0.5 text-xs" onClick={() => act('settle_dispute')}>🕊️ Settle dispute</button>}
                    <button className="btn px-2 py-0.5 text-xs" onClick={() => act('rival')}>{A.rivalry ? 'Withdraw rivalry' : '😠 Declare rivalry'}</button>
                    {A.war ? <button className="btn px-2 py-0.5 text-xs" onClick={() => act('peace')}>🏳️ Sue for peace</button> : <button className="btn px-2 py-0.5 text-xs" onClick={() => act('war')}>⚔️ Declare war</button>}
                  </div>
                </div>
              </div>
              {msg && <div className={`mt-2 p-2 rounded text-sm ${msg.ok ? 'bg-emerald-900/70 border border-emerald-500' : 'bg-red-900/70 border border-red-500'}`}>{msg.msg}</div>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------ Trade
export function TradePanel({ g, onClose }: P) {
  useTick(500);
  const met = g.tribes.filter((t) => t.met);
  const [tid, setTid] = useState(met[0]?.id || 0);
  const [give, setGive] = useState<Res>('meat');
  const [get, setGet] = useState<Res>('copper');
  const [qty, setQty] = useState(20);
  const [msg, setMsg] = useState('');
  const t = g.tribes[tid - 1];
  const q = t ? routeQuote(g, t, give, get, qty) : null;
  const slots = g.buildings.filter((b) => b.owner === 0 && b.state === 'ready' && (b.type === 'market' || b.type === 'trading_post')).reduce((s, b) => s + (b.type === 'market' ? 2 : 1), 0);
  const used = g.caravans.filter((c) => !c.amb).length;
  const goods = RES_LIST.filter((x) => x !== 'water');
  return (
    <Modal title="Trade & Caravans" icon="⚖️" onClose={onClose} wide>
      {met.length === 0 ? (
        <div className="panel-parch p-4 text-sm">You have not met any tribes yet. Expand your territory toward the banners on the map, or send an envoy from the Tribes panel.</div>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2 flex flex-col gap-2">
            <div className="panel-stone p-3">
              <div className="title-rune text-sm mb-2">Create a trade route</div>
              <div className="text-xs mb-2 opacity-80">Caravans physically walk from your Trading Post / Market to the other tribe and back. Distance eats into the profit, and unsafe roads risk ambush.</div>
              <div className="flex flex-col gap-1.5 text-sm">
                <label className="flex justify-between items-center">Partner <select className="sel" value={tid} onChange={(e) => setTid(+e.target.value)}>{met.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                <label className="flex justify-between items-center">You send <select className="sel" value={give} onChange={(e) => setGive(e.target.value as Res)}>{goods.map((x) => <option key={x} value={x}>{RES[x].icon} {RES[x].name} ({fmt(g.res[x])})</option>)}</select></label>
                <label className="flex justify-between items-center">You receive <select className="sel" value={get} onChange={(e) => setGet(e.target.value as Res)}>{goods.map((x) => <option key={x} value={x}>{RES[x].icon} {RES[x].name}</option>)}</select></label>
                <label className="flex justify-between items-center">Per trip <input type="range" min={5} max={80} step={5} value={qty} onChange={(e) => setQty(+e.target.value)} /> <b>{qty}</b></label>
              </div>
              {q && t && (
                <div className="mt-2 p-2 rounded bg-black/30 text-xs leading-relaxed">
                  Send <b>{qty} {RES[give].name}</b> → receive about <b>{Math.floor(q.got * (1 - q.toll))} {RES[get].name}</b><br />
                  Distance loss {(q.loss * 100).toFixed(0)}% · toll {t.agreements.trade ? 'none (agreement)' : '10%'}{q.limited ? ' · they lack stock!' : ''}
                  <br />Their price: {RES[give].icon}{tribePrice(t, give).toFixed(1)} · {RES[get].icon}{tribePrice(t, get).toFixed(1)}
                </div>
              )}
              <button className="btn px-3 py-1 mt-2 w-full" onClick={() => setMsg(addRoute(g, tid, give, get, qty) || 'Route established — caravans will depart shortly.')}>Establish route</button>
              {msg && <div className="text-xs mt-1 text-amber-200">{msg}</div>}
            </div>
            <div className="panel-stone p-3 text-sm">
              <div className="title-rune text-sm mb-1">Caravan capacity</div>
              <div>🧳 {used} on the road · {slots} slots ({g.buildings.filter((b) => b.owner === 0 && BDEFSlots(b.type)).length} markets / posts)</div>
              <div className="text-xs opacity-80">Each Trading Post gives 1 slot, each Marketplace 2 — traders must be employed there.{!nearestMarket(g, 0, 0) && <b className="text-red-300"> You have no trading building yet!</b>}</div>
            </div>
          </div>
          <div className="col-span-3 flex flex-col gap-3">
            <div className="panel-stone p-3">
              <div className="title-rune text-sm mb-1">Active routes</div>
              {g.routes.length === 0 && <div className="text-xs opacity-70">No routes yet.</div>}
              {g.routes.map((r) => {
                const tt = g.tribes[r.tribe - 1];
                return (
                  <div key={r.id} className="flex items-center gap-2 text-sm py-1 border-b border-[#ffffff14]">
                    <span className="flex-1">{r.qty}{RES[r.give].icon} → {tt.name} → {RES[r.get].icon}<span className="text-xs opacity-70"> · {r.trips} trips · +{Math.floor(r.gained)} {RES[r.get].name}, −{Math.floor(r.spent)} {RES[r.give].name}</span></span>
                    <button className="btn px-2 text-xs" onClick={() => { r.active = !r.active; g.version++; g.routeDirty = true; }}>{r.active ? 'Pause' : 'Resume'}</button>
                    <button className="btn px-2 text-xs" onClick={() => removeRoute(g, r.id)}>✖</button>
                  </div>
                );
              })}
            </div>
            <div className="panel-parch p-2 text-[12px] overflow-auto max-h-[300px]">
              <div className="font-bold mb-1">Market prices — supply & demand</div>
              <table className="w-full text-center">
                <thead>
                  <tr className="border-b border-black/30"><th className="text-left">Good</th><th>You</th>{met.map((x) => <th key={x.id} style={{ color: '#' + x.color.toString(16).padStart(6, '0') }}>{x.name.split(' ')[0]}</th>)}</tr>
                </thead>
                <tbody>
                  {goods.map((rr) => (
                    <tr key={rr} className="border-b border-black/10">
                      <td className="text-left">{RES[rr].icon} {RES[rr].name}</td>
                      <td>{myPrice(g, rr).toFixed(1)}</td>
                      {met.map((x) => {
                        const p = tribePrice(x, rr), b = RES[rr].base;
                        return <td key={x.id} style={{ color: p < b * 0.8 ? '#1a7a2a' : p > b * 1.4 ? '#a02a1a' : '#3a2814', fontWeight: x.exports.includes(rr) || x.wants.includes(rr) ? 700 : 400 }} title={`Stock ${Math.floor(x.res[rr])} · ${x.exports.includes(rr) ? 'exports' : x.wants.includes(rr) ? 'wants' : ''}`}>{p.toFixed(1)}{x.exports.includes(rr) ? '▼' : x.wants.includes(rr) ? '▲' : ''}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[10px] opacity-70 mt-1">▼ abundant (cheap to buy there) · ▲ in demand (they pay well). Bold = specialisation. Green = cheap, red = dear.</div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
function BDEFSlots(type: string) { return BDEFS.find((d) => d.id === type)?.slots; }

// ------------------------------------------------ Stats
function Spark({ data, color, label, fmtv }: { data: number[]; color: string; label: string; fmtv?: (n: number) => string }) {
  const w = 240, h = 60;
  const mx = Math.max(1, ...data), mn = Math.min(0, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`).join(' ');
  return (
    <div className="panel-stone p-2">
      <div className="flex justify-between text-xs"><span>{label}</span><b>{(fmtv || fmt)(data[data.length - 1] || 0)}</b></div>
      <svg width={w} height={h} className="block"><polyline points={pts} fill="none" stroke={color} strokeWidth="2" /></svg>
    </div>
  );
}

export function StatsPanel({ g, onClose }: P) {
  useTick(800);
  const H = g.hist;
  const jobs = Object.entries(g.info.jobs).sort((a, b) => b[1] - a[1]);
  return (
    <Modal title="Chronicle & Statistics" icon="📊" onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Spark data={H.map((h) => h.pop)} color="#e8c060" label="Population" />
        <Spark data={H.map((h) => h.food)} color="#d07040" label="Food stored" />
        <Spark data={H.map((h) => h.happy)} color="#80d060" label="Happiness %" fmtv={(n) => n.toFixed(0)} />
        <Spark data={H.map((h) => h.wood)} color="#9a6a3a" label="Wood" />
        <Spark data={H.map((h) => h.stone)} color="#aaaaaa" label="Stone" />
        <Spark data={H.map((h) => h.bronze)} color="#d8a030" label="Bronze" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="panel-parch p-2 text-xs">
          <div className="font-bold text-sm mb-1">Daily production / use</div>
          <table className="w-full"><tbody>
            {RES_LIST.filter((r) => g.flowLast.prod[r] > 0.05 || g.flowLast.cons[r] > 0.05).map((r) => (
              <tr key={r}><td>{RES[r].icon} {RES[r].name}</td><td className="text-green-800">+{g.flowLast.prod[r].toFixed(1)}</td><td className="text-red-800">−{g.flowLast.cons[r].toFixed(1)}</td><td className="text-right">{fmt(g.res[r])}</td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="panel-parch p-2 text-xs">
          <div className="font-bold text-sm mb-1">Workforce</div>
          {jobs.map(([j, n]) => <div key={j} className="flex justify-between"><span>{JOBS[j]?.icon} {JOBS[j]?.name || j}</span><b>{n}</b></div>)}
          <div className="mt-2 font-bold text-sm">Farm yield today: {g.info.farmY.toFixed(1)}</div>
        </div>
        <div className="panel-parch p-2 text-xs">
          <div className="font-bold text-sm mb-1">Tribe record</div>
          <div>Births: {g.stats.births} · Deaths: {g.stats.deaths} (starved {g.stats.starved})</div>
          <div>Buildings raised: {g.stats.built}</div>
          <div>Caravans returned: {g.stats.trades}</div>
          <div>Raids repelled: {g.stats.raidsRepelled} · lost: {g.stats.raidsLost}</div>
          <div>Defense rating: {g.info.defense.toFixed(1)} · warriors {g.info.warriors}</div>
          <div>Trees felled: {g.cutTrees}</div>
          <div className="mt-2 font-bold text-sm">Known tribes</div>
          {g.tribes.filter((t) => t.met).map((t) => <div key={t.id}>⚑ {t.name}: pop {t.pop}, {t.status}, opinion {Math.round(t.opinion)}</div>)}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------ Settlement & policies
export function TribePanel({ g, r, onClose }: P) {
  useTick(500);
  const I = g.info;
  const nextStage = I.pop < 20 ? 20 : I.pop < 60 ? 60 : I.pop < 150 ? 150 : 400;
  return (
    <Modal title="Settlement & Policies" icon="🏕️" onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <div className="panel-parch p-3 text-sm">
            <div className="font-bold">{g.stage()} — {g.era()}</div>
            <div className="text-xs">Population {I.pop} / next stage at {nextStage}</div>
            <Bar v={I.pop} max={nextStage} color="#c08a30" h={8} />
            <div className="text-xs mt-1">Housing {I.housing} beds · homeless {I.homeless} · unemployed {I.unemployed} · sick {I.sick}</div>
            <div className="text-xs">Food for {I.foodDays >= 50 ? '∞' : I.foodDays.toFixed(1)} days · defense rating {I.defense.toFixed(0)}</div>
          </div>
          <div className="panel-stone p-3">
            <div className="title-rune text-sm mb-1">Settlements & outposts</div>
            {g.settlements.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm py-0.5">
                <span>{s.kind === 'camp' ? '🔥' : s.kind === 'village' ? '🏘️' : '⛺'} {s.name} <span className="text-xs opacity-70">pop {s.pop}</span></span>
                <button className="btn px-2 text-xs" onClick={() => { r.focus(s.x, s.z, 40); onClose(); }}>🎯</button>
              </div>
            ))}
            <div className="text-[11px] opacity-70 mt-1">Found villages (Village Totem) and outposts to extend your territory toward resources, rivers and strategic ground.</div>
          </div>
          <div className="panel-stone p-3 text-sm">
            <div className="title-rune text-sm mb-1">Food rations</div>
            <Seg value={g.rations} onChange={(v) => { g.rations = v; g.version++; }} options={[{ v: 0.75, label: 'Meager ×0.75' }, { v: 1, label: 'Fair ×1' }, { v: 1.25, label: 'Generous ×1.25' }]} />
            <div className="text-[11px] opacity-80 mt-1">Generous rations raise happiness and growth but drain stores; meager rations stretch a shortage at a cost to morale.</div>
            <div className="title-rune text-sm mt-3 mb-1">Tribute to the elders: {g.tribute}%</div>
            <input type="range" min={0} max={30} value={g.tribute} onChange={(e) => { g.tribute = +e.target.value; g.version++; }} className="w-full" />
            <div className="text-[11px] opacity-80">A share of every harvest is set aside for the elders. It builds prestige (needed for alliances) but lowers happiness.</div>
          </div>
        </div>
        <div className="panel-stone p-3">
          <div className="title-rune text-sm mb-1">Work priorities</div>
          <div className="text-[11px] opacity-80 mb-2">Idle people choose jobs where priority and need are highest. “Off” releases workers from that category. Emergencies (famine, thirst) automatically pull hands toward food and water.</div>
          {PRIO_CATS.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1 text-sm">
              <span>{c.icon} {c.name}</span>
              <Seg value={g.prio[c.id]} onChange={(v) => { g.prio[c.id] = v; g.version++; }} options={[{ v: 0, label: 'Off' }, { v: 1, label: 'Low' }, { v: 2, label: 'Normal' }, { v: 3, label: 'High' }]} />
            </div>
          ))}
          <div className="title-rune text-sm mt-3 mb-1">Food sources</div>
          <div className="text-xs">
            {FOOD_RES.map((f) => <div key={f}>{RES[f].icon} {RES[f].name}: {Math.floor(g.res[f])} <span className="opacity-70">({g.flowLast.prod[f] >= 0 ? '+' : ''}{g.flowLast.prod[f].toFixed(1)}/day)</span></div>)}
            <div className="opacity-70 mt-1">Gathering is quick but limited · hunting is rich yet seasonal · fishing is steady · farming scales with fertility · livestock is reliable.</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------ Alerts
export function AlertsPanel({ g, r, onClose }: P) {
  useTick(600);
  return (
    <Modal title="Alerts & Chronicle" icon="📜" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        {g.alerts.length === 0 && <div className="text-sm opacity-70">Nothing has happened yet.</div>}
        {g.alerts.map((a) => (
          <div key={a.id} className={`event-card sev-${a.kind} flex items-start gap-2`}>
            <div className="text-[10px] w-14 shrink-0 opacity-80">Yr {a.year + 1}<br />day {(a.day % 8) + 1}</div>
            <div className="flex-1">
              <div className="font-bold text-sm">{a.title}</div>
              <div className="text-xs leading-snug">{a.text}</div>
            </div>
            {a.x !== undefined && <button className="btn px-1.5 text-xs" onClick={() => { r.focus(a.x!, a.z!, 40); onClose(); }}>🎯</button>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
