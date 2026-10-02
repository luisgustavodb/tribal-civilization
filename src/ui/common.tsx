import { useEffect, useState, type ReactNode } from 'react';
import { RES, type Cost, type Res } from '../game/data';
import type { Game } from '../game/sim';

export function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export const fmt = (n: number) => (Math.abs(n) >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString());

export function Bar({ v, max = 100, color = '#8ab04a', h = 6, back = '#00000066' }: { v: number; max?: number; color?: string; h?: number; back?: string }) {
  const p = Math.max(0, Math.min(1, v / max));
  return (
    <div style={{ height: h, background: back, borderRadius: 3, overflow: 'hidden', border: '1px solid #00000055' }}>
      <div style={{ width: `${p * 100}%`, height: '100%', background: color, transition: 'width .3s' }} />
    </div>
  );
}

export function CostChips({ cost, g, small }: { cost: Cost; g: Game; small?: boolean }) {
  const keys = Object.keys(cost) as Res[];
  if (!keys.length) return <span className="text-[11px] opacity-70">Free</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {keys.map((k) => {
        const ok = g.res[k] >= (cost[k] || 0);
        return (
          <span key={k} className={`cost-chip ${ok ? '' : 'lack'} ${small ? 'sm' : ''}`} title={`${RES[k].name}: have ${Math.floor(g.res[k])}`}>
            {RES[k].icon}
            {cost[k]}
          </span>
        );
      })}
    </span>
  );
}

export function Modal({ title, icon, onClose, children, wide }: { title: string; icon?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none" style={{ padding: '70px 70px 130px 70px' }}>
      <div className={`panel-stone pointer-events-auto flex flex-col ${wide ? 'w-[1100px]' : 'w-[820px]'} max-w-full max-h-full`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#6a4a26]">
          <div className="title-rune text-lg">
            {icon} {title}
          </div>
          <button className="btn px-2 py-0.5" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="overflow-auto p-4 flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

export function Seg({ value, options, onChange }: { value: number; options: { v: number; label: string }[]; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex rounded overflow-hidden border border-[#6a4a26]">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`px-2 py-0.5 text-xs ${value === o.v ? 'seg-on' : 'seg-off'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
