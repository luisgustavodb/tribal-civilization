import type { Res, ResMap, Skill, Cost } from './data';

export interface Citizen {
  id: number; name: string; female: boolean; age: number; job: string; workId: number; homeId: number; settlement: number;
  partner: number; parents: number[]; children: number[];
  health: number; happy: number; needs: { food: number; water: number; rest: number; social: number };
  skills: Record<Skill, number>;
  x: number; z: number; tx: number; tz: number; act: string; phase: number; timer: number; walkT: number;
  carry: Res | null; carryAmt: number; tgt: number; alive: boolean; hidden: boolean; stuck: number; sick: boolean;
  ang: number; lastMeal: number; working: boolean; fed: boolean; born: number; lastAct: string; speedMul: number;
  dOff: number; dT: number;
}

export interface Building {
  id: number; type: string; x: number; z: number; w: number; d: number; rot: number; cx: number; cz: number; y: number;
  progress: number; state: 'building' | 'ready' | 'upgrading'; owner: number; workers: number[]; maxW: number; enabled: boolean;
  craftProg: number; upTo: string | null; downUntil: number; burning: number; flooded: number; mask: number; style: number;
  ver: number; auto: boolean; status: string; settle: number; builtYear: number; out: number; fert: number; wf: number; name: string;
}

export interface Animal {
  id: number; type: number; x: number; z: number; tx: number; tz: number; timer: number; alive: boolean; respawn: number;
  hx: number; hz: number; ang: number; flee: number; migrate: boolean; atk: number;
}

export interface Opinion { label: string; value: number }
export interface Agreements {
  trade: boolean; borders: boolean; alliance: boolean; defensive: boolean;
  resource: { give: Res; get: Res; qty: number } | null;
  tribute: { dir: 'to' | 'from'; res: Res; amt: number } | null;
  rivalry: boolean; dispute: boolean; war: boolean;
}

export interface Tribe {
  id: number; key: string; name: string; title: string; color: number; accent: number; culture: string; desc: string; biome: number;
  x: number; z: number; pop: number; tech: number; res: ResMap; target: ResMap; exports: Res[]; wants: Res[];
  aggression: number; trade: number; nomad: boolean; strength: number; met: boolean; metYear: number;
  status: 'unmet' | 'neutral' | 'friendly' | 'allied' | 'hostile' | 'war';
  opinion: number; factors: Opinion[]; memories: { label: string; value: number; until: number }[];
  agreements: Agreements; tradeVol: number; tradeRes: Partial<Record<Res, number>>; firstTrade: number; huntR: number;
  style: number; sacred: string; nomadTimer: number; raidTimer: number; buildCount: number; maxBuild: number; lastAction: string;
  claims: { x: number; z: number; r: number; until: number }[]; lastTribute: number; asked: number;
}

export interface TradeRoute { id: number; tribe: number; give: Res; get: Res; qty: number; active: boolean; trips: number; timer: number; gained: number; spent: number }
export interface Caravan {
  id: number; route: number; tribe: number; x: number; z: number; tx: number; tz: number; state: 'out' | 'wait' | 'back';
  give: Res; get: Res; qty: number; got: number; wait: number; ox: number; oz: number; amb: boolean; fromTribe: number; hid: boolean;
}
export interface Raid { id: number; tribe: number; x: number; z: number; tx: number; tz: number; n: number; state: 'march' | 'fight' | 'flee'; timer: number; target: number; str: number; members: { dx: number; dz: number }[] }
export interface Ambient { id: number; tribe: number; x: number; z: number; tx: number; tz: number; timer: number; hx: number; hz: number; hide: boolean }

export interface Alert { id: number; kind: 'info' | 'good' | 'warn' | 'danger'; title: string; text: string; year: number; day: number; x?: number; z?: number }
export interface GameEvent {
  id: number; kind: string; title: string; text: string; icon: string; until: number; x?: number; z?: number;
  choices?: { id: string; label: string; hint?: string }[]; data?: any; sev: 'info' | 'good' | 'warn' | 'danger'; decision?: boolean; started: number; advice?: string;
}
export interface Settlement { id: number; name: string; x: number; z: number; kind: string; bid: number; pop: number }

export type { Res, ResMap, Cost };
