import { useEffect, useState } from 'react';
import { BIO, BIOME_INFO, N } from '../game/data';
import type { Game } from '../game/sim';
import type { Renderer } from '../game/render';
import { slopeAt, tileIdx } from '../game/world';
import { Bar } from './common';

const COLORS = [0xe8c060, 0xe06a4a, 0x5ab0e0, 0x7ad070, 0xc080e0, 0xf0f0e0];

export function analyzeSite(g: Game, x: number, z: number) {
  const W = g.world;
  const t = tileIdx(x, z);
  let n = 0, fert = 0, fresh = 0, sea = 0, trees = 0, stone = 0, ore = 0, berries = 0, mount = 0, clay = 0;
  g.scan(x, z, 12, (i) => {
    n++; fert += W.fert[i]; trees += W.treeCount[i];
    const b = W.biome[i];
    if (b === BIO.LAKE || b === BIO.RIVER) fresh++;
    if (b === BIO.OCEAN) sea++;
    if (b === BIO.MOUNTAIN) mount++;
    const d = W.dep[i];
    if (d === 1) stone++; else if (d >= 2 && d <= 4) ore++; else if (d === 9) berries++; else if (d === 7) clay++;
  });
  let nearest = 1e9, nn = '';
  for (const tr of g.tribes) { const d = Math.hypot(tr.x - x, tr.z - z); if (d < nearest) { nearest = d; nn = tr.title; } }
  let problem = '';
  if (t < 0 || W.tileWater[t]) problem = 'You cannot settle on water.';
  else if (W.biome[t] === BIO.MOUNTAIN) problem = 'Too rugged — settle in the foothills.';
  else if (slopeAt(W, t) > 1.0) problem = 'Ground is too steep here.';
  else if (nearest < 26) problem = `Too close to the ${nn} (${nearest.toFixed(0)} tiles). Keep at least 26.`;
  const biome = t >= 0 ? BIOME_INFO[W.biome[t]].name : '—';
  const r = {
    farming: Math.min(1, (fert / n) * 1.3 + (fresh > 3 ? 0.2 : 0)),
    water: Math.min(1, fresh / 14),
    wood: Math.min(1, trees / 160),
    stone: Math.min(1, (stone + ore * 1.5 + mount * 0.2) / 16),
    food: Math.min(1, berries / 8 + (sea + fresh) / 60 + (fert / n) * 0.5),
    clay: Math.min(1, clay / 6),
  };
  return { problem, biome, nearest, nn, r, ok: !problem };
}

export function StartScreen({ g, r, seed, setSeed, busy, onFound }: { g: Game; r: Renderer; seed: number; setSeed: (s: number) => void; busy: boolean; onFound: (x: number, z: number, name: string, color: number) => void }) {
  const [site, setSite] = useState<{ x: number; z: number } | null>(null);
  const [name, setName] = useState('Oak Clan');
  const [color, setColor] = useState(COLORS[0]);
  const [seedText, setSeedText] = useState(String(seed));
  useEffect(() => { setSeedText(String(seed)); setSite(null); }, [seed]);
  useEffect(() => {
    r.onClickGround = (x, z) => { setSite({ x, z }); const a = analyzeSite(g, x, z); r.setMarker(x, z, 3, a.ok ? 0x80ff90 : 0xff6040); };
    return () => { r.onClickGround = null; r.setMarker(null); };
  }, [g, r]);
  const a = site ? analyzeSite(g, site.x, site.z) : null;
  const rows: [string, string, number][] = a ? [['Farmland', '🌾', a.r.farming], ['Fresh water', '💧', a.r.water], ['Timber', '🪵', a.r.wood], ['Stone & ore', '⛏️', a.r.stone], ['Wild food', '🫐', a.r.food], ['Clay', '🏺', a.r.clay]] : [];
  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex">
      <div className="pointer-events-auto panel-stone m-6 w-[400px] p-5 flex flex-col gap-3 self-start max-h-[calc(100%-48px)] overflow-auto">
        <div>
          <div className="title-rune text-2xl leading-tight">Tribes of the<br />Ancient Land</div>
          <div className="text-xs opacity-80 mt-1">A sandbox of campfires, harvests, caravans and rival peoples. No story — only the civilization you build.</div>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1 text-xs">World seed
            <input className="inp w-full" value={seedText} onChange={(e) => setSeedText(e.target.value)} onBlur={() => { const v = parseInt(seedText) || 1; if (v !== seed) setSeed(v); }} onKeyDown={(e) => { if (e.key === 'Enter') { const v = parseInt(seedText) || 1; if (v !== seed) setSeed(v); } }} />
          </label>
          <button className="btn px-3 py-1.5" disabled={busy} onClick={() => setSeed(Math.floor(Math.random() * 99999) + 1)}>🎲 New world</button>
        </div>
        <label className="text-xs">Tribe name
          <input className="inp w-full" value={name} maxLength={22} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="text-xs">Banner colour
          <div className="flex gap-2 mt-1">
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ background: '#' + c.toString(16).padStart(6, '0'), width: 26, height: 26, borderRadius: 5, border: color === c ? '3px solid #fff' : '2px solid #000a' }} />)}
          </div>
        </div>
        <div className="panel-parch p-3 text-sm min-h-[150px]">
          {busy ? <div>Shaping the land…</div> : !a ? (
            <div>
              <b>Choose where to settle.</b> Rotate the map with right-mouse drag, zoom with the wheel, then click the ground. Look for rivers (water & fertile valleys), forests (wood), hills (stone & ore) and coasts (fish & salt). Other tribes' banners show who your neighbours will be.
            </div>
          ) : (
            <>
              <div className="font-bold">Site report — {a.biome}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 my-1.5 text-xs">
                {rows.map(([l, ic, v]) => <div key={l}>{ic} {l}<Bar v={v} max={1} color={v > 0.6 ? '#5a9a2a' : v > 0.3 ? '#c0a030' : '#a05030'} h={5} /></div>)}
              </div>
              <div className="text-xs">Nearest tribe: {a.nn} ({a.nearest.toFixed(0)} tiles away)</div>
              {a.problem && <div className="text-red-800 font-bold text-xs mt-1">✖ {a.problem}</div>}
            </>
          )}
        </div>
        <button className="btn-gold px-4 py-2 text-base" disabled={busy || !a || !a.ok || !name.trim()} onClick={() => site && onFound(site.x, site.z, name.trim(), color)}>
          🔥 Light the first campfire
        </button>
        <div className="text-[11px] opacity-70 leading-relaxed">
          <b>Controls:</b> WASD/arrows pan · Q/E or right-drag rotate · wheel zoom (world map → street level) · R rotate building · Space pause · 1/2/3 speed · Esc cancel tool
        </div>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-none self-end m-6 text-right text-xs opacity-70">Map {N}×{N} tiles · {g.tribes.length} tribes · {g.world.sites.length} ancient sites</div>
    </div>
  );
}
