import { useEffect, useRef, useState } from 'react';
import { Game } from './game/sim';
import { Renderer } from './game/render';
import { TopBar, SideBar, BuildMenu, SelectionPanel, EventStack, ZoomBox, PlacementHint } from './ui/Hud';
import { TechPanel, TribesPanel, TradePanel, StatsPanel, TribePanel, AlertsPanel } from './ui/Panels';
import { StartScreen } from './ui/Start';
import { useTick } from './ui/common';

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999) + 1);
  const [game, setGame] = useState<Game | null>(null);
  const [rend, setRend] = useState<Renderer | null>(null);
  const [phase, setPhase] = useState<'start' | 'play'>('start');
  const [busy, setBusy] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  const [err, setErr] = useState('');
  useTick(600);

  useEffect(() => {
    setBusy(true);
    setPhase('start');
    setPanel(null);
    let r: Renderer | null = null;
    const id = setTimeout(() => {
      try {
        setErr('');
        const g = new Game(seed);
        g.tool = { mode: 'settle', type: '', rot: 0 };
        r = new Renderer(mount.current!, g);
        (window as any).__game = g;
        setGame(g);
        setRend(r);
        setBusy(false);
      } catch (e: any) {
        console.error(e);
        setErr(String(e?.stack || e));
      }
    }, 40);
    return () => { clearTimeout(id); if (r) r.dispose(); };
  }, [seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game || phase !== 'play' || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); game.setSpeed(game.speed === 0 ? 1 : 0); }
      else if (e.key === '1') game.setSpeed(1);
      else if (e.key === '2') game.setSpeed(2);
      else if (e.key === '3') game.setSpeed(3);
      else if (e.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, phase]);

  const found = (x: number, z: number, name: string, color: number) => {
    if (!game || !rend) return;
    game.found(x, z, name, color);
    game.tool = { mode: 'none', type: '', rot: 0 };
    game.setSpeed(1);
    rend.setMarker(null);
    rend.focus(x, z, 52);
    setPhase('play');
  };

  const unread = game ? game.alerts.filter((a) => a.id > seen).length : 0;
  const open = (p: string | null) => {
    setPanel(p);
    if (p === 'alerts' && game && game.alerts.length) setSeen(game.alerts[0].id);
  };
  const close = () => { if (panel === 'alerts' && game && game.alerts.length) setSeen(game.alerts[0].id); setPanel(null); };
  const ready = game && rend;

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      <div ref={mount} className="absolute inset-0" />
      {ready && phase === 'start' && <StartScreen g={game} r={rend} seed={seed} setSeed={setSeed} busy={busy} onFound={found} />}
      {busy && <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#1a120a]"><div className="title-rune text-2xl">Shaping the ancient land…</div></div>}
      {err && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1a120a] p-8"><pre className="text-xs text-red-300 whitespace-pre-wrap max-w-3xl">The world failed to generate:{'\n'}{err}</pre></div>}
      {ready && phase === 'play' && (
        <>
          <TopBar g={game} r={rend} panel={panel} setPanel={open} />
          <SideBar g={game} r={rend} panel={panel} setPanel={open} unread={unread} />
          <div className="absolute right-2 top-[88px] bottom-[240px] z-20 flex flex-col gap-2 items-end pointer-events-none overflow-hidden">
            <SelectionPanel g={game} r={rend} panel={panel} setPanel={open} />
            <EventStack g={game} r={rend} panel={panel} setPanel={open} />
          </div>
          <div className="absolute right-2 bottom-2 z-20 pointer-events-auto"><ZoomBox g={game} r={rend} panel={panel} setPanel={open} /></div>
          <BuildMenu g={game} r={rend} panel={panel} setPanel={open} />
          <PlacementHint g={game} r={rend} panel={panel} setPanel={open} />
          {panel === 'tech' && <TechPanel g={game} r={rend} onClose={close} />}
          {panel === 'tribes' && <TribesPanel g={game} r={rend} onClose={close} />}
          {panel === 'trade' && <TradePanel g={game} r={rend} onClose={close} />}
          {panel === 'stats' && <StatsPanel g={game} r={rend} onClose={close} />}
          {panel === 'tribe' && <TribePanel g={game} r={rend} onClose={close} />}
          {panel === 'alerts' && <AlertsPanel g={game} r={rend} onClose={close} />}
        </>
      )}
    </div>
  );
}
