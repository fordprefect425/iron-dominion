// ============================================
// TERRAIN & MAP GENERATION
// ============================================
import type { HexCoord } from './hex';
import { hexKey, hexNeighbors, hexDistance } from './hex';

// Use const objects instead of enums (erasableSyntaxOnly)
export const TerrainType = {
    Plains: 'plains',
    Forest: 'forest',
    Hills: 'hills',
    Mountains: 'mountains',
    River: 'river',
    Desert: 'desert',
    Swamp: 'swamp',
    Coast: 'coast',
    Water: 'water',
} as const;

export type TerrainType = typeof TerrainType[keyof typeof TerrainType];

export interface TerrainInfo {
    type: TerrainType;
    trackCostMultiplier: number;
    speedModifier: number;
    color: number;
    label: string;
}

export const TERRAIN_DATA: Record<TerrainType, TerrainInfo> = {
    [TerrainType.Plains]: { type: TerrainType.Plains, trackCostMultiplier: 1.0, speedModifier: 1.0, color: 0xC5B358, label: 'Plains' },
    [TerrainType.Forest]: { type: TerrainType.Forest, trackCostMultiplier: 1.5, speedModifier: 0.8, color: 0x2D5F3A, label: 'Forest' },
    [TerrainType.Hills]: { type: TerrainType.Hills, trackCostMultiplier: 2.0, speedModifier: 0.6, color: 0x8B7D4A, label: 'Hills' },
    [TerrainType.Mountains]: { type: TerrainType.Mountains, trackCostMultiplier: 4.0, speedModifier: 0.4, color: 0x7A7D85, label: 'Mountains' },
    [TerrainType.River]: { type: TerrainType.River, trackCostMultiplier: 3.0, speedModifier: 1.0, color: 0x4A6FA5, label: 'River' },
    [TerrainType.Desert]: { type: TerrainType.Desert, trackCostMultiplier: 1.2, speedModifier: 0.9, color: 0xD4A843, label: 'Desert' },
    [TerrainType.Swamp]: { type: TerrainType.Swamp, trackCostMultiplier: 2.5, speedModifier: 0.5, color: 0x4A6B4A, label: 'Swamp' },
    [TerrainType.Coast]: { type: TerrainType.Coast, trackCostMultiplier: 1.0, speedModifier: 1.0, color: 0x7EC8E3, label: 'Coast' },
    [TerrainType.Water]: { type: TerrainType.Water, trackCostMultiplier: Infinity, speedModifier: 0, color: 0x2A5298, label: 'Water' },
};

// City data
export interface CityData {
    hex: HexCoord;
    name: string;
    population: number;
    demand: Record<string, number>;
    supply: Record<string, number>;
    hasStation: boolean;
    growth: number;
}

// Simplex-like noise for terrain generation
class SimpleNoise {
    private perm: number[] = [];

    constructor(seed: number) {
        const p: number[] = [];
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = (s * 16807 + 0) % 2147483647;
            const j = s % (i + 1);
            [p[i], p[j]] = [p[j], p[i]];
        }
        this.perm = [...p, ...p];
    }

    private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
    private lerp(a: number, b: number, t: number): number { return a + t * (b - a); }
    private grad(hash: number, x: number, y: number): number {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise2D(x: number, y: number): number {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const u = this.fade(xf);
        const v = this.fade(yf);
        const aa = this.perm[this.perm[X] + Y];
        const ab = this.perm[this.perm[X] + Y + 1];
        const ba = this.perm[this.perm[X + 1] + Y];
        const bb = this.perm[this.perm[X + 1] + Y + 1];
        return this.lerp(
            this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
            this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
            v
        );
    }

    fbm(x: number, y: number, octaves: number = 4): number {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            value += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        return value / maxValue;
    }
}

const CITY_NAMES = [
    'Ironhaven', 'Coalridge', 'Steamford', 'Brasswick', 'Copperdale',
    'Ashton', 'Millbrook', 'Gearston', 'Piston End', 'Foundryville',
    'Riverton', 'Timberfall', 'Goldgate', 'Silvermine', 'Duskburgh',
    'Northgate', 'Southport', 'Eastfield', 'Westmoor', 'Highbridge',
    'Lowvale', 'Ironclad', 'Steelhurst', 'Copperton', 'Brassfield',
    'Crossroads', 'Deepwell', 'Firepeak', 'Graniteton', 'Hammerstead',
    'Junctionburg', 'Kingsrail', 'Lakeside', 'Mountainview', 'Newmarket',
    'Oldport', 'Quarrytown', 'Railsend', 'Stonegate', 'Tradevale',
];

export interface GameMap {
    width: number;
    height: number;
    terrain: Map<string, TerrainType>;
    cities: CityData[];
    explored: Set<string>;
    resources: Map<string, string>;
}

export function generateMap(width: number, height: number, seed: number = Date.now()): GameMap {
    const noise = new SimpleNoise(seed);
    const moisture = new SimpleNoise(seed + 1000);
    const terrain = new Map<string, TerrainType>();
    const resources = new Map<string, string>();
    const explored = new Set<string>();

    const centerQ = Math.floor(width / 2);
    const centerR = Math.floor(height / 2);

    for (let r = 0; r < height; r++) {
        for (let q = 0; q < width; q++) {
            const key = hexKey({ q, r });
            const elevation = noise.fbm(q * 0.08, r * 0.08, 5);
            const moist = moisture.fbm(q * 0.06 + 50, r * 0.06 + 50, 4);

            const dx = (q - centerQ) / (width * 0.45);
            const dy = (r - centerR) / (height * 0.45);
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);
            const islandMask = 1 - distFromCenter * distFromCenter;
            const finalElevation = elevation * 0.6 + islandMask * 0.4;

            let type: TerrainType;
            if (finalElevation < -0.15) {
                type = TerrainType.Water;
            } else if (finalElevation < -0.05) {
                type = TerrainType.Coast;
            } else if (finalElevation > 0.45) {
                type = TerrainType.Mountains;
            } else if (finalElevation > 0.3) {
                type = TerrainType.Hills;
            } else if (moist > 0.25) {
                type = TerrainType.Forest;
            } else if (moist < -0.2) {
                type = TerrainType.Desert;
            } else if (moist > 0.1 && finalElevation < 0.05) {
                type = TerrainType.Swamp;
            } else {
                type = TerrainType.Plains;
            }

            terrain.set(key, type);
        }
    }

    // Add rivers
    const riverStarts = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < riverStarts; i++) {
        let q = Math.floor(Math.random() * width);
        let r = Math.floor(Math.random() * height);
        const key = hexKey({ q, r });
        const t = terrain.get(key);
        if (t === TerrainType.Mountains || t === TerrainType.Hills) {
            for (let step = 0; step < 20; step++) {
                const rKey = hexKey({ q, r });
                if (terrain.get(rKey) === TerrainType.Water) break;
                terrain.set(rKey, TerrainType.River);
                const neighbors = hexNeighbors({ q, r }).filter(n =>
                    n.q >= 0 && n.q < width && n.r >= 0 && n.r < height
                );
                if (neighbors.length === 0) break;
                const next = neighbors[Math.floor(Math.random() * neighbors.length)];
                q = next.q;
                r = next.r;
            }
        }
    }

    // Place cities
    const cities: CityData[] = [];
    const namePool = [...CITY_NAMES].sort(() => Math.random() - 0.5);
    const MIN_CITY_DISTANCE = 5;
    const TARGET_CITIES = Math.min(15, Math.floor((width * height) / 60));

    const suitableHexes: HexCoord[] = [];
    terrain.forEach((type, key) => {
        if (type === TerrainType.Plains || type === TerrainType.Coast || type === TerrainType.Forest) {
            const [q, r] = key.split(',').map(Number);
            suitableHexes.push({ q, r });
        }
    });

    suitableHexes.sort(() => Math.random() - 0.5);

    for (const hex of suitableHexes) {
        if (cities.length >= TARGET_CITIES) break;
        const tooClose = cities.some(c => hexDistance(c.hex, hex) < MIN_CITY_DISTANCE);
        if (tooClose) continue;

        const pop = 500 + Math.floor(Math.random() * 4500);
        const name = namePool.pop() || `City ${cities.length + 1}`;

        cities.push({
            hex,
            name,
            population: pop,
            demand: generateDemand(pop),
            supply: generateSupply(terrain.get(hexKey(hex))!),
            hasStation: false,
            growth: 0.01 + Math.random() * 0.02,
        });
    }

    // Place resources
    terrain.forEach((type, key) => {
        const roll = Math.random();
        if (type === TerrainType.Mountains && roll < 0.15) {
            resources.set(key, 'iron');
        } else if (type === TerrainType.Hills && roll < 0.2) {
            resources.set(key, 'coal');
        } else if (type === TerrainType.Forest && roll < 0.15) {
            resources.set(key, 'timber');
        } else if (type === TerrainType.Plains && roll < 0.1) {
            resources.set(key, 'grain');
        }
    });

    // Explore around first city
    if (cities.length > 0) {
        const startCity = cities[0];
        for (let dr = -4; dr <= 4; dr++) {
            for (let dq = -4; dq <= 4; dq++) {
                const h: HexCoord = { q: startCity.hex.q + dq, r: startCity.hex.r + dr };
                if (hexDistance(startCity.hex, h) <= 4) {
                    explored.add(hexKey(h));
                }
            }
        }
    }

    return { width, height, terrain, cities, explored, resources };
}

function generateDemand(population: number): Record<string, number> {
    const scale = population / 1000;
    return {
        grain: Math.floor(scale * 10 + Math.random() * 5),
        goods: Math.floor(scale * 8 + Math.random() * 4),
        passengers: Math.floor(scale * 15 + Math.random() * 10),
    };
}

function generateSupply(terrain: TerrainType): Record<string, number> {
    switch (terrain) {
        case TerrainType.Plains: return { grain: 10 + Math.floor(Math.random() * 10) };
        case TerrainType.Coast: return { passengers: 5 + Math.floor(Math.random() * 5) };
        case TerrainType.Forest: return { timber: 8 + Math.floor(Math.random() * 5) };
        default: return {};
    }
}
