export const N = 160; // tiles per side
export const V = N + 1; // vertices per side
export const DAY_SEC = 20;
export const DAYS_PER_YEAR = 8;
export const YEAR_SEC = DAY_SEC * DAYS_PER_YEAR;

export type Res =
  | 'wood' | 'stone' | 'water' | 'clay' | 'fiber' | 'meat' | 'fish' | 'berries' | 'grain'
  | 'copper' | 'tin' | 'bronze' | 'iron' | 'salt' | 'gems' | 'rare' | 'tools' | 'pottery';
export type ResMap = Record<Res, number>;
export type Cost = Partial<Record<Res, number>>;

export const RES_LIST: Res[] = ['wood', 'stone', 'water', 'clay', 'fiber', 'meat', 'fish', 'berries', 'grain', 'copper', 'tin', 'bronze', 'iron', 'salt', 'gems', 'rare', 'tools', 'pottery'];
export const FOOD_RES: Res[] = ['berries', 'grain', 'meat', 'fish'];

export const RES: Record<Res, { name: string; icon: string; base: number; color: string }> = {
  wood: { name: 'Wood', icon: '🪵', base: 2, color: '#9a6a3a' },
  stone: { name: 'Stone', icon: '🪨', base: 3, color: '#9a9a96' },
  water: { name: 'Water', icon: '💧', base: 1, color: '#4aa3d8' },
  clay: { name: 'Clay', icon: '🏺', base: 3, color: '#c0703c' },
  fiber: { name: 'Fiber', icon: '🌿', base: 2, color: '#a8c060' },
  meat: { name: 'Meat', icon: '🍖', base: 3, color: '#c0504a' },
  fish: { name: 'Fish', icon: '🐟', base: 2.5, color: '#5fa8c8' },
  berries: { name: 'Berries', icon: '🫐', base: 2, color: '#7a4aa0' },
  grain: { name: 'Grain', icon: '🌾', base: 2.5, color: '#e0c050' },
  copper: { name: 'Copper', icon: '🟠', base: 7, color: '#d0743a' },
  tin: { name: 'Tin', icon: '⚪', base: 8, color: '#c8d0d8' },
  bronze: { name: 'Bronze', icon: '🔶', base: 14, color: '#c89030' },
  iron: { name: 'Iron', icon: '⚙️', base: 12, color: '#7a6a68' },
  salt: { name: 'Salt', icon: '🧂', base: 5, color: '#f0f0f0' },
  gems: { name: 'Gems', icon: '💎', base: 25, color: '#60d0e0' },
  rare: { name: 'Rare Materials', icon: '🔮', base: 40, color: '#e0a0f0' },
  tools: { name: 'Tools', icon: '🔨', base: 9, color: '#b0a090' },
  pottery: { name: 'Pottery', icon: '⚱️', base: 6, color: '#d08a50' },
};

export const emptyRes = (): ResMap => {
  const r: any = {};
  for (const k of RES_LIST) r[k] = 0;
  return r as ResMap;
};

// biomes
export const BIO = { OCEAN: 0, LAKE: 1, RIVER: 2, BEACH: 3, PLAINS: 4, FOREST: 5, DESERT: 6, SWAMP: 7, MOUNTAIN: 8, VALLEY: 9 };
export const BIOME_INFO = [
  { name: 'Ocean', color: '#2a6fa8' },
  { name: 'Lake', color: '#3a86b8' },
  { name: 'River', color: '#4a9ac8' },
  { name: 'Beach', color: '#e6d7a1' },
  { name: 'Plains', color: '#86b050' },
  { name: 'Forest', color: '#3f7a3a' },
  { name: 'Desert', color: '#dcc27a' },
  { name: 'Swamp', color: '#5b6b3a' },
  { name: 'Mountain', color: '#8a8378' },
  { name: 'Fertile Valley', color: '#62a43f' },
];

// deposits
export const DEP = { NONE: 0, STONE: 1, COPPER: 2, TIN: 3, IRON: 4, SALT: 5, GEMS: 6, CLAY: 7, RARE: 8, BERRIES: 9, FIBER: 10 };
export const DEP_INFO: { name: string; res: Res | null; color: string }[] = [
  { name: 'None', res: null, color: '#000000' },
  { name: 'Stone', res: 'stone', color: '#a0a09a' },
  { name: 'Copper Ore', res: 'copper', color: '#d0743a' },
  { name: 'Tin Ore', res: 'tin', color: '#c8d0e0' },
  { name: 'Iron Ore', res: 'iron', color: '#8a4a38' },
  { name: 'Salt', res: 'salt', color: '#ffffff' },
  { name: 'Gems', res: 'gems', color: '#40e0e0' },
  { name: 'Clay', res: 'clay', color: '#c0703c' },
  { name: 'Rare Crystal', res: 'rare', color: '#e070ff' },
  { name: 'Berry Bushes', res: 'berries', color: '#a040c0' },
  { name: 'Fiber Plants', res: 'fiber', color: '#b8d060' },
];

// ---------------- Technology ----------------
export interface Tech { id: string; name: string; icon: string; cost: number; req: string[]; desc: string; res?: Cost; bonus: string }
export const TECHS: Tech[] = [
  { id: 'survival', name: 'Survival', icon: '🌱', cost: 0, req: [], desc: 'Gathering, shelter and water. The knowledge every tribe is born with.', bonus: 'Huts, gathering, storage, water' },
  { id: 'fire', name: 'Fire', icon: '🔥', cost: 10, req: ['survival'], desc: 'Tamed flame cooks food, drives off beasts and brings elders together to share lore.', bonus: 'Cooking hearth, Storyteller circle' },
  { id: 'tools', name: 'Basic Tools', icon: '🪓', cost: 25, req: ['fire'], desc: 'Hafted axes and flint blades. Wood and stone can now be worked in earnest.', bonus: 'Woodcutters, quarry, workshop, outposts · +15% gathering' },
  { id: 'hunting', name: 'Hunting', icon: '🏹', cost: 45, req: ['tools'], desc: 'Spears, snares and organised hunts; fishing and the first watchers on the hills.', bonus: 'Hunting camp, fishing, palisades, lookouts, warriors, trading post' },
  { id: 'agriculture', name: 'Agriculture', icon: '🌾', cost: 80, req: ['tools'], desc: 'Sowing seed and penning beasts. Permanent villages become possible.', bonus: 'Farms, pens, granary, timber house, village totem, herbalist' },
  { id: 'pottery', name: 'Pottery', icon: '🏺', cost: 110, req: ['agriculture'], desc: 'Fired clay vessels keep grain dry and water fresh. Markets are born.', res: { clay: 10 }, bonus: 'Clay pit, potter, marketplace, well, salt works · less spoilage' },
  { id: 'metalworking', name: 'Metalworking', icon: '⛏️', cost: 160, req: ['pottery'], desc: 'Native copper and the first kilns. Mountains become precious.', res: { copper: 6 }, bonus: 'Copper, tin and gem mines' },
  { id: 'bronze', name: 'Bronze', icon: '🔶', cost: 230, req: ['metalworking'], desc: 'Alloying copper and tin creates a hard, lasting metal.', res: { copper: 15, tin: 8 }, bonus: 'Foundry, stone houses · +20% tools' },
  { id: 'iron', name: 'Iron', icon: '⚔️', cost: 340, req: ['bronze'], desc: 'Hotter furnaces smelt black iron; stronger tools and stronger warriors.', res: { iron: 10 }, bonus: 'Iron mine, ironworks, stone towers · +30% tools' },
  { id: 'advagri', name: 'Advanced Agriculture', icon: '🚜', cost: 450, req: ['iron', 'agriculture'], desc: 'Iron ploughs and irrigation ditches multiply the harvest.', bonus: 'Irrigation works · +35% farm yield' },
  { id: 'writing', name: 'Writing', icon: '📜', cost: 560, req: ['bronze'], desc: 'Marks on clay record debts, treaties and star-lore.', res: { clay: 20 }, bonus: 'Scribe house, temple · stronger diplomacy' },
  { id: 'engineering', name: 'Engineering', icon: '📐', cost: 720, req: ['writing', 'iron'], desc: 'Levers, ramps and surveying. Stone walls and great stores.', res: { stone: 80 }, bonus: 'Stone walls, warehouse, aqueduct' },
  { id: 'construction', name: 'Large-Scale Construction', icon: '🏛️', cost: 900, req: ['engineering', 'advagri'], desc: 'Organised labour raises halls and monuments that outlast their makers.', res: { stone: 150, wood: 100 }, bonus: 'Great hall, monument, longhouse' },
];
export const TECH_MAP: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

// ---------------- Jobs ----------------
export const JOBS: Record<string, { name: string; color: number; icon: string }> = {
  none: { name: 'Unemployed', color: 0xb8a98a, icon: '💤' },
  builder: { name: 'Builder', color: 0xd9a441, icon: '🔨' },
  gatherer: { name: 'Gatherer', color: 0x8fbf5a, icon: '🧺' },
  woodcutter: { name: 'Woodcutter', color: 0x8a5a2a, icon: '🪓' },
  hunter: { name: 'Hunter', color: 0xb04a3a, icon: '🏹' },
  fisher: { name: 'Fisher', color: 0x4a9ac8, icon: '🎣' },
  farmer: { name: 'Farmer', color: 0xe0c050, icon: '🌾' },
  herder: { name: 'Herder', color: 0xd8b890, icon: '🐗' },
  water: { name: 'Water Bearer', color: 0x6ac0e8, icon: '💧' },
  quarry: { name: 'Quarryman', color: 0x9a9a9a, icon: '⛏️' },
  miner: { name: 'Miner', color: 0x6a5a58, icon: '⛏️' },
  crafter: { name: 'Craftsman', color: 0xc0783a, icon: '🔨' },
  smith: { name: 'Smith', color: 0x484850, icon: '⚒️' },
  trader: { name: 'Trader', color: 0xd04aa0, icon: '⚖️' },
  shaman: { name: 'Elder / Shaman', color: 0xe8e8f0, icon: '🔮' },
  scribe: { name: 'Scribe', color: 0xf0e0b0, icon: '📜' },
  warrior: { name: 'Warrior', color: 0xc02828, icon: '🗡️' },
  guard: { name: 'Lookout', color: 0x6a3a8a, icon: '👁️' },
  healer: { name: 'Healer', color: 0x40b890, icon: '🌿' },
};

export type PrioCat = 'food' | 'materials' | 'craft' | 'build' | 'knowledge' | 'defense' | 'trade' | 'water';
export const PRIO_CATS: { id: PrioCat; name: string; icon: string }[] = [
  { id: 'food', name: 'Food', icon: '🍖' },
  { id: 'water', name: 'Water', icon: '💧' },
  { id: 'materials', name: 'Materials', icon: '🪵' },
  { id: 'build', name: 'Construction', icon: '🔨' },
  { id: 'craft', name: 'Crafts & Metal', icon: '🏺' },
  { id: 'knowledge', name: 'Lore & Healing', icon: '🔮' },
  { id: 'trade', name: 'Trade', icon: '⚖️' },
  { id: 'defense', name: 'Defense', icon: '🛡️' },
];

// ---------------- Buildings ----------------
export type Work =
  | { k: 'node'; deps: number[]; r: number; per: number }
  | { k: 'tree'; r: number }
  | { k: 'hunt'; r: number }
  | { k: 'fish'; r: number }
  | { k: 'water'; r: number }
  | { k: 'field' }
  | { k: 'pen' }
  | { k: 'craft'; inp: Cost; out: Cost; time: number }
  | { k: 'well' }
  | { k: 'lore'; rate: number }
  | { k: 'trade' }
  | { k: 'guard' }
  | { k: 'warrior' }
  | { k: 'heal' };

export interface BDef {
  id: string; name: string; icon: string; cat: string; w: number; d: number;
  cost: Cost; tech: string; desc: string; time: number;
  workers?: number; job?: string; prio?: PrioCat; work?: Work;
  housing?: number; capGen?: number; capFood?: number; terr?: number; poll?: number;
  req?: string; upgrade?: string; happy?: number; watch?: number; wall?: boolean;
  slots?: number; foodSave?: number; heal?: number; prestige?: number; settle?: string; noPlace?: boolean;
}

const defs: BDef[] = [];
function B(d: BDef) { defs.push(d); }

// housing
B({ id: 'sleep', name: 'Sleeping Hides', icon: '🛏️', cat: 'Housing', w: 1, d: 1, cost: { fiber: 3, wood: 1 }, tech: 'survival', desc: 'A windbreak of hides and branches. Shelters three people badly.', time: 8, housing: 3 });
B({ id: 'hut', name: 'Primitive Hut', icon: '🛖', cat: 'Housing', w: 2, d: 2, cost: { wood: 10, fiber: 6 }, tech: 'survival', desc: 'A domed hut of branches and thatch. Houses a family.', time: 20, housing: 6, upgrade: 'timber' });
B({ id: 'timber', name: 'Timber House', icon: '🏠', cat: 'Housing', w: 2, d: 2, cost: { wood: 25, fiber: 8, stone: 4 }, tech: 'agriculture', desc: 'Sturdy plank walls and a gabled roof.', time: 40, housing: 10, upgrade: 'stone_house' });
B({ id: 'stone_house', name: 'Stone House', icon: '🏘️', cat: 'Housing', w: 2, d: 2, cost: { stone: 24, wood: 12, clay: 8 }, tech: 'bronze', desc: 'Stone-and-clay walls that last for generations.', time: 70, housing: 14 });
B({ id: 'longhouse', name: 'Clan Longhouse', icon: '🏛️', cat: 'Housing', w: 3, d: 2, cost: { stone: 40, wood: 40, pottery: 6 }, tech: 'construction', desc: 'A great hall where an entire clan lives under one roof.', time: 110, housing: 28 });

// survival & food
B({ id: 'campfire', name: 'Campfire', icon: '🔥', cat: 'Core', w: 2, d: 2, cost: {}, tech: 'survival', desc: 'The heart of the tribe. Claims territory, stores a little food and sends out foragers.', time: 10, capGen: 60, capFood: 60, terr: 11, happy: 8, upgrade: 'hearth', noPlace: true, settle: 'camp', workers: 2, job: 'gatherer', prio: 'food', work: { k: 'node', deps: [9, 10], r: 12, per: 3 } });
B({ id: 'hearth', name: 'Council Hearth', icon: '🏕️', cat: 'Core', w: 3, d: 3, cost: { wood: 40, stone: 20, clay: 0 }, tech: 'agriculture', desc: 'A ring of stones, benches and drying racks. Larger territory, more storage and joy.', time: 50, capGen: 160, capFood: 160, terr: 15, happy: 14, upgrade: 'great_hall', noPlace: true, settle: 'camp', prestige: 1, workers: 3, job: 'gatherer', prio: 'food', work: { k: 'node', deps: [9, 10], r: 13, per: 3 } });
B({ id: 'gatherer', name: 'Gathering Area', icon: '🧺', cat: 'Food', w: 2, d: 2, cost: { wood: 5, fiber: 2 }, tech: 'survival', desc: 'Foragers collect berries and fibres from nearby plants.', time: 12, workers: 3, job: 'gatherer', prio: 'food', work: { k: 'node', deps: [9, 10], r: 11, per: 3 } });
B({ id: 'water_spot', name: 'Water Collection', icon: '🪣', cat: 'Food', w: 2, d: 2, cost: { wood: 4, fiber: 4 }, tech: 'survival', desc: 'Bearers carry water from a nearby river, lake or sea. Must be near water.', time: 12, workers: 2, job: 'water', prio: 'water', work: { k: 'water', r: 12 }, req: 'water' });
B({ id: 'storage_pile', name: 'Storage Pile', icon: '📦', cat: 'Materials', w: 2, d: 2, cost: { wood: 8 }, tech: 'survival', desc: 'A covered heap of goods. +150 general, +60 food capacity.', time: 12, capGen: 150, capFood: 60 });
B({ id: 'cooking', name: 'Cooking Hearth', icon: '🍲', cat: 'Food', w: 1, d: 1, cost: { stone: 4, wood: 3 }, tech: 'fire', desc: 'Cooked food feeds more people: reduces food consumption 4% and raises happiness.', time: 10, foodSave: 0.04, happy: 4 });
B({ id: 'elders', name: "Storyteller's Circle", icon: '🔮', cat: 'Community', w: 2, d: 2, cost: { wood: 10, stone: 4, fiber: 4 }, tech: 'fire', desc: 'Elders pass down lore around the flames. Generates knowledge and happiness.', time: 18, workers: 2, job: 'shaman', prio: 'knowledge', work: { k: 'lore', rate: 3 }, happy: 6, prestige: 0.2 });
B({ id: 'woodcutter', name: "Woodcutter's Camp", icon: '🪓', cat: 'Materials', w: 2, d: 2, cost: { wood: 8, fiber: 4 }, tech: 'tools', desc: 'Fells nearby trees. Needs a forest in reach.', time: 16, workers: 3, job: 'woodcutter', prio: 'materials', work: { k: 'tree', r: 13 }, req: 'forest' });
B({ id: 'quarry', name: 'Stone Pit', icon: '⛏️', cat: 'Materials', w: 2, d: 2, cost: { wood: 12, fiber: 3 }, tech: 'tools', desc: 'Digs stone from rocky outcrops. Needs stone deposits nearby.', time: 20, workers: 4, job: 'quarry', prio: 'materials', work: { k: 'node', deps: [1], r: 10, per: 3 }, req: 'dep1', poll: 0.4 });
B({ id: 'workshop', name: 'Basic Workshop', icon: '🔨', cat: 'Craft', w: 2, d: 2, cost: { wood: 15, stone: 6 }, tech: 'tools', desc: 'Craftsmen knap flint and bind handles: wood + stone → tools.', time: 24, workers: 2, job: 'crafter', prio: 'craft', work: { k: 'craft', inp: { wood: 1, stone: 1 }, out: { tools: 1 }, time: 9 }, poll: 0.3 });
B({ id: 'outpost', name: 'Outpost', icon: '⛺', cat: 'Expansion', w: 2, d: 2, cost: { wood: 25, stone: 8 }, tech: 'tools', desc: 'A remote camp that claims land. May be placed up to 10 tiles beyond your border.', time: 30, terr: 9, capGen: 30, settle: 'outpost' });
B({ id: 'resource_camp', name: 'Resource Camp', icon: '🏕️', cat: 'Expansion', w: 1, d: 1, cost: { wood: 12, fiber: 4 }, tech: 'tools', desc: 'A tiny claim marker near a resource site. Extends territory by 6 tiles.', time: 14, terr: 6, capGen: 20, settle: 'camp2' });

// hunting
B({ id: 'hunting_camp', name: 'Hunting Camp', icon: '🏹', cat: 'Food', w: 2, d: 2, cost: { wood: 14, fiber: 6 }, tech: 'hunting', desc: 'Hunters range far to bring back meat. Beware predators.', time: 22, workers: 3, job: 'hunter', prio: 'food', work: { k: 'hunt', r: 34 } });
B({ id: 'fishing', name: 'Fishing Spot', icon: '🎣', cat: 'Food', w: 2, d: 2, cost: { wood: 10, fiber: 8 }, tech: 'hunting', desc: 'Nets and spears for the shallows. Must be on a coast, river or lake.', time: 16, workers: 3, job: 'fisher', prio: 'food', work: { k: 'fish', r: 11 }, req: 'water' });
B({ id: 'palisade', name: 'Palisade', icon: '🪵', cat: 'Defense', w: 1, d: 1, cost: { wood: 2 }, tech: 'hunting', desc: 'Sharpened logs. Drag to build a line. Adds defense.', time: 4, wall: true });
B({ id: 'lookout', name: 'Lookout Platform', icon: '👁️', cat: 'Defense', w: 1, d: 1, cost: { wood: 20, fiber: 6 }, tech: 'hunting', desc: 'A raised platform with a watcher. Claims 5 tiles and adds defense and early warning.', time: 18, workers: 1, job: 'guard', prio: 'defense', work: { k: 'guard' }, terr: 5, watch: 3, upgrade: 'stone_tower' });
B({ id: 'warrior_lodge', name: "Warriors' Lodge", icon: '🗡️', cat: 'Defense', w: 2, d: 2, cost: { wood: 25, stone: 8, fiber: 4 }, tech: 'hunting', desc: 'Trains warriors who defend the tribe and protect trade routes.', time: 30, workers: 4, job: 'warrior', prio: 'defense', work: { k: 'warrior' } });
B({ id: 'trading_post', name: 'Trading Post', icon: '🧳', cat: 'Trade', w: 2, d: 2, cost: { wood: 20, fiber: 10 }, tech: 'hunting', desc: 'Where caravans are outfitted. One caravan slot.', time: 24, workers: 1, job: 'trader', prio: 'trade', work: { k: 'trade' }, slots: 1, happy: 3 });

// agriculture
B({ id: 'farm', name: 'Farm Field', icon: '🌾', cat: 'Food', w: 3, d: 3, cost: { wood: 15, fiber: 5 }, tech: 'agriculture', desc: 'Cultivated grain. Yield depends on soil fertility, water nearby and the season.', time: 36, workers: 3, job: 'farmer', prio: 'food', work: { k: 'field' }, req: 'fertile' });
B({ id: 'pen', name: 'Animal Pen', icon: '🐗', cat: 'Food', w: 3, d: 3, cost: { wood: 20, fiber: 4, meat: 8 }, tech: 'agriculture', desc: 'Penned livestock give steady meat and fibre, regardless of season.', time: 30, workers: 2, job: 'herder', prio: 'food', work: { k: 'pen' } });
B({ id: 'granary', name: 'Granary', icon: '🏚️', cat: 'Food', w: 2, d: 2, cost: { wood: 20, fiber: 6 }, tech: 'agriculture', desc: 'Raised store that keeps vermin out. +300 food capacity, slows spoilage.', time: 28, capFood: 300, capGen: 20 });
B({ id: 'totem', name: 'Village Totem', icon: '🗿', cat: 'Expansion', w: 2, d: 2, cost: { wood: 40, stone: 15, fiber: 10 }, tech: 'agriculture', desc: 'Founds a new village with its own territory (radius 13). Place within 10 tiles of your border.', time: 45, terr: 13, capGen: 60, capFood: 60, happy: 6, settle: 'village', prestige: 0.3 });
B({ id: 'meeting', name: 'Gathering Circle', icon: '🪘', cat: 'Community', w: 3, d: 3, cost: { wood: 20, stone: 12 }, tech: 'agriculture', desc: 'A dancing ground and meeting place. Large happiness bonus nearby.', time: 36, happy: 12, prestige: 0.3 });
B({ id: 'herbalist', name: "Herbalist's Hut", icon: '🌿', cat: 'Community', w: 2, d: 2, cost: { wood: 14, fiber: 8 }, tech: 'agriculture', desc: 'Heals the sick and slows disease.', time: 22, workers: 2, job: 'healer', prio: 'knowledge', work: { k: 'heal' }, heal: 1 });

// pottery
B({ id: 'clay_pit', name: 'Clay Pit', icon: '🏺', cat: 'Materials', w: 2, d: 2, cost: { wood: 10, fiber: 2 }, tech: 'pottery', desc: 'Digs clay from river banks and swamps.', time: 18, workers: 3, job: 'quarry', prio: 'materials', work: { k: 'node', deps: [7], r: 10, per: 3 }, req: 'dep7' });
B({ id: 'potter', name: "Potter's Kiln", icon: '⚱️', cat: 'Craft', w: 2, d: 2, cost: { wood: 15, stone: 8 }, tech: 'pottery', desc: 'Clay → pottery for storage and trade. Produces smoke.', time: 28, workers: 2, job: 'crafter', prio: 'craft', work: { k: 'craft', inp: { clay: 2, wood: 1 }, out: { pottery: 2 }, time: 10 }, poll: 0.5 });
B({ id: 'market', name: 'Marketplace', icon: '🛍️', cat: 'Trade', w: 3, d: 3, cost: { wood: 35, stone: 15, pottery: 6 }, tech: 'pottery', desc: 'Stalls, scales and shouting. Two caravan slots and a happiness boost.', time: 50, workers: 3, job: 'trader', prio: 'trade', work: { k: 'trade' }, slots: 2, happy: 10, prestige: 0.3 });
B({ id: 'well', name: 'Well', icon: '⛲', cat: 'Food', w: 1, d: 1, cost: { stone: 10, wood: 6 }, tech: 'pottery', desc: 'Reliable clean water without walking to the river (+14/day per worker).', time: 16, workers: 1, job: 'water', prio: 'water', work: { k: 'well' } });
B({ id: 'salt_works', name: 'Salt Works', icon: '🧂', cat: 'Materials', w: 2, d: 2, cost: { wood: 14, clay: 4, fiber: 4 }, tech: 'pottery', desc: 'Evaporates brine and scrapes salt crusts on shores and desert pans.', time: 22, workers: 3, job: 'miner', prio: 'materials', work: { k: 'node', deps: [5], r: 10, per: 3 }, req: 'dep5' });

// metal
B({ id: 'copper_mine', name: 'Copper Mine', icon: '🟠', cat: 'Materials', w: 2, d: 2, cost: { wood: 25, stone: 10, tools: 3 }, tech: 'metalworking', desc: 'Digs green-stained copper ore. Needs a copper deposit.', time: 36, workers: 4, job: 'miner', prio: 'materials', work: { k: 'node', deps: [2], r: 10, per: 3 }, req: 'dep2', poll: 0.8 });
B({ id: 'tin_mine', name: 'Tin Mine', icon: '⚪', cat: 'Materials', w: 2, d: 2, cost: { wood: 25, stone: 10, tools: 3 }, tech: 'metalworking', desc: 'Rare tin for bronze-making. Needs a tin deposit.', time: 36, workers: 4, job: 'miner', prio: 'materials', work: { k: 'node', deps: [3], r: 10, per: 3 }, req: 'dep3', poll: 0.8 });
B({ id: 'gem_mine', name: "Gem Digger's Camp", icon: '💎', cat: 'Materials', w: 2, d: 2, cost: { wood: 20, stone: 8, tools: 2 }, tech: 'metalworking', desc: 'Recovers precious stones and rare crystals for trade and rites.', time: 30, workers: 3, job: 'miner', prio: 'materials', work: { k: 'node', deps: [6, 8], r: 12, per: 2 }, req: 'dep6' });

// bronze / iron
B({ id: 'foundry', name: 'Bronze Foundry', icon: '🔶', cat: 'Craft', w: 2, d: 2, cost: { stone: 30, wood: 20, clay: 10 }, tech: 'bronze', desc: 'Copper + tin → bronze. Heavy smoke.', time: 50, workers: 3, job: 'smith', prio: 'craft', work: { k: 'craft', inp: { copper: 2, tin: 1 }, out: { bronze: 2 }, time: 11 }, poll: 1.5 });
B({ id: 'iron_mine', name: 'Iron Mine', icon: '⚙️', cat: 'Materials', w: 2, d: 2, cost: { wood: 30, stone: 15, bronze: 4 }, tech: 'iron', desc: 'Black iron from deep seams. Needs an iron deposit.', time: 50, workers: 4, job: 'miner', prio: 'materials', work: { k: 'node', deps: [4], r: 10, per: 3 }, req: 'dep4', poll: 1 });
B({ id: 'ironworks', name: 'Ironworks', icon: '⚒️', cat: 'Craft', w: 2, d: 2, cost: { stone: 40, wood: 30, bronze: 6 }, tech: 'iron', desc: 'Iron + wood → three iron tools. Intense smoke.', time: 60, workers: 3, job: 'smith', prio: 'craft', work: { k: 'craft', inp: { iron: 2, wood: 2 }, out: { tools: 3 }, time: 12 }, poll: 2 });
B({ id: 'stone_tower', name: 'Stone Watchtower', icon: '🗼', cat: 'Defense', w: 2, d: 2, cost: { stone: 50, wood: 15, bronze: 3 }, tech: 'iron', desc: 'A tall tower: claims 7 tiles, big defense bonus and early warning.', time: 60, workers: 2, job: 'guard', prio: 'defense', work: { k: 'guard' }, terr: 7, watch: 8 });
B({ id: 'irrigation', name: 'Irrigation Works', icon: '🚰', cat: 'Food', w: 2, d: 2, cost: { stone: 30, wood: 20, tools: 4 }, tech: 'advagri', desc: 'Ditches carry water to fields: +35% yield for farms within 9 tiles, drought-proofing.', time: 45 });

// writing, engineering, construction
B({ id: 'scribe', name: 'Scribe House', icon: '📜', cat: 'Community', w: 2, d: 2, cost: { wood: 25, clay: 12, pottery: 4 }, tech: 'writing', desc: 'Scribes keep tallies and star-charts. Strong knowledge output.', time: 45, workers: 3, job: 'scribe', prio: 'knowledge', work: { k: 'lore', rate: 7 }, prestige: 0.3 });
B({ id: 'temple', name: 'Temple', icon: '⛩️', cat: 'Community', w: 3, d: 3, cost: { stone: 60, wood: 30, pottery: 8, gems: 2 }, tech: 'writing', desc: 'A house of the spirits. Happiness, knowledge and prestige.', time: 90, workers: 2, job: 'shaman', prio: 'knowledge', work: { k: 'lore', rate: 4 }, happy: 18, prestige: 1 });
B({ id: 'stone_wall', name: 'Stone Wall', icon: '🧱', cat: 'Defense', w: 1, d: 1, cost: { stone: 3 }, tech: 'engineering', desc: 'Thick masonry. Drag to build. Strong defense.', time: 7, wall: true });
B({ id: 'warehouse', name: 'Warehouse', icon: '🏬', cat: 'Materials', w: 3, d: 2, cost: { wood: 40, stone: 30 }, tech: 'engineering', desc: 'Huge communal store. +500 general, +150 food capacity.', time: 55, capGen: 500, capFood: 150 });
B({ id: 'aqueduct', name: 'Aqueduct', icon: '🌉', cat: 'Food', w: 2, d: 2, cost: { stone: 80, tools: 4 }, tech: 'engineering', desc: 'Brings fresh water to the settlement: +60 water per day.', time: 70, req: 'water' });
B({ id: 'great_hall', name: 'Great Hall', icon: '🏰', cat: 'Core', w: 4, d: 4, cost: { wood: 150, stone: 250, bronze: 20, pottery: 20 }, tech: 'construction', desc: 'Seat of the tribal council. Massive storage, territory and pride.', time: 160, capGen: 500, capFood: 300, terr: 20, happy: 22, prestige: 3, settle: 'camp', noPlace: true });
B({ id: 'monument', name: 'Great Monument', icon: '🗽', cat: 'Community', w: 3, d: 3, cost: { stone: 400, gems: 10, bronze: 30 }, tech: 'construction', desc: 'A towering monument to the tribe. Huge prestige and happiness.', time: 220, happy: 20, prestige: 5 });

export const BDEFS: BDef[] = defs;
export const BMAP: Record<string, BDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const BUILD_CATS = ['Housing', 'Food', 'Materials', 'Craft', 'Community', 'Trade', 'Defense', 'Expansion'];

// ---------------- Tribes ----------------
export interface TribeTemplate {
  key: string; title: string; names: string[]; color: number; accent: number;
  culture: string; desc: string; biome: number; exports: Res[]; wants: Res[];
  aggression: number; trade: number; nomad: boolean; tech: number; style: number; sacred: string;
}
export const TRIBE_TEMPLATES: TribeTemplate[] = [
  { key: 'riverfolk', title: 'Riverfolk', names: ['Silver Reed', 'Heron Water', 'Mudbank', 'Long River'], color: 0x2aa6a0, accent: 0xf4e7a8, culture: 'Peaceful farmers', desc: 'Gentle growers of grain who live where rivers spread silt across the valleys.', biome: BIO.VALLEY, exports: ['grain', 'fish', 'fiber'], wants: ['copper', 'stone', 'salt'], aggression: 0.1, trade: 0.55, nomad: false, tech: 3, style: 0, sacred: 'river' },
  { key: 'stonehammer', title: 'Stonehammer Clan', names: ['Stonehammer', 'Black Anvil', 'Greypeak', 'Ironbrow'], color: 0xb85a3a, accent: 0xd9d4c8, culture: 'Mountain miners', desc: 'Stern mountain people who delve for ore and trade metal for food.', biome: BIO.MOUNTAIN, exports: ['stone', 'copper', 'tin', 'iron'], wants: ['grain', 'meat', 'wood'], aggression: 0.35, trade: 0.5, nomad: false, tech: 4, style: 1, sacred: 'mountain' },
  { key: 'mariners', title: 'Salt Coast Mariners', names: ['Salt Gull', 'Tidewalkers', 'Coral Hand', 'Wavebreak'], color: 0x3a6ad8, accent: 0xf2f2f2, culture: 'Coastal traders', desc: 'Sea-faring traders who deal in fish, salt and pottery for wood and metal.', biome: BIO.BEACH, exports: ['fish', 'salt', 'pottery'], wants: ['wood', 'iron', 'copper'], aggression: 0.15, trade: 0.95, nomad: false, tech: 3, style: 2, sacred: 'coast' },
  { key: 'wanderers', title: 'Ashen Wanderers', names: ['Ashen Wind', 'Dust Walkers', 'Red Sand', 'Ember Herd'], color: 0xe08a2a, accent: 0x5a2a1a, culture: 'Nomadic herders', desc: 'Nomads who follow the herds and move their tents with the seasons.', biome: BIO.DESERT, exports: ['meat', 'gems', 'salt'], wants: ['grain', 'pottery', 'tools'], aggression: 0.3, trade: 0.6, nomad: true, tech: 2, style: 3, sacred: 'herds' },
  { key: 'raiders', title: 'Redfang Raiders', names: ['Redfang', 'Bloodroot', 'Wolfbane', 'Skullcrest'], color: 0xc02030, accent: 0x20201a, culture: 'Aggressive warband', desc: 'A hard, hungry people who take what they need from weaker neighbours.', biome: BIO.FOREST, exports: ['meat', 'wood', 'iron'], wants: ['grain', 'bronze', 'tools'], aggression: 0.9, trade: 0.2, nomad: false, tech: 4, style: 4, sacred: 'strength' },
  { key: 'mossbound', title: 'Mossbound Circle', names: ['Mossbound', 'Fen Lantern', 'Mist Sisters', 'Old Bog'], color: 0x8a5ac8, accent: 0xa8e0a0, culture: 'Swamp mystics', desc: 'Mystics of the fen who guard the deep forests and trade rare crystals and clay.', biome: BIO.SWAMP, exports: ['clay', 'rare', 'fiber', 'berries'], wants: ['salt', 'tools', 'pottery'], aggression: 0.12, trade: 0.45, nomad: false, tech: 3, style: 5, sacred: 'forest' },
];

export const NAMES_F = ['Aya', 'Mira', 'Tala', 'Nessa', 'Ila', 'Sora', 'Kefa', 'Bryn', 'Orla', 'Yara', 'Lena', 'Dara', 'Zuri', 'Hana', 'Emi', 'Runa', 'Isa', 'Neri', 'Vesa', 'Oma', 'Pela', 'Suri', 'Teya', 'Ulla'];
export const NAMES_M = ['Korr', 'Bram', 'Tor', 'Gund', 'Ake', 'Dov', 'Ruk', 'Hale', 'Orin', 'Jax', 'Mako', 'Eron', 'Fenn', 'Kai', 'Lor', 'Naro', 'Pike', 'Rolf', 'Sev', 'Tam', 'Ugo', 'Vark', 'Wen', 'Zed'];

export const SKILLS = ['hunting', 'farming', 'crafting', 'building', 'lore', 'combat', 'gathering'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_NAMES: Record<Skill, string> = { hunting: 'Hunter', farming: 'Farmer', crafting: 'Artisan', building: 'Builder', lore: 'Lorekeeper', combat: 'Warrior', gathering: 'Forager' };
export const JOB_SKILL: Record<string, Skill> = {
  gatherer: 'gathering', woodcutter: 'building', hunter: 'hunting', fisher: 'hunting', farmer: 'farming', herder: 'farming', water: 'gathering',
  quarry: 'building', miner: 'crafting', crafter: 'crafting', smith: 'crafting', trader: 'lore', shaman: 'lore', scribe: 'lore', warrior: 'combat',
  guard: 'combat', healer: 'lore', builder: 'building',
};

export const OVERLAYS = [
  { id: 'none', name: 'Normal', icon: '🌍' },
  { id: 'territory', name: 'Territory', icon: '🚩' },
  { id: 'fertility', name: 'Fertility', icon: '🌱' },
  { id: 'water', name: 'Water', icon: '💧' },
  { id: 'resources', name: 'Resources', icon: '⛏️' },
  { id: 'food', name: 'Food Production', icon: '🍖' },
  { id: 'density', name: 'Population', icon: '👥' },
  { id: 'housing', name: 'Housing', icon: '🏠' },
  { id: 'happiness', name: 'Happiness', icon: '😊' },
  { id: 'trade', name: 'Trade', icon: '⚖️' },
  { id: 'danger', name: 'Danger', icon: '⚠️' },
  { id: 'pollution', name: 'Pollution', icon: '🌫️' },
];
