// ============================================
// GAME STATE & ECONOMY
// ============================================
import type { HexCoord } from './hex';
import { hexKey, hexDistance, parseHexKey } from './hex';
import type { GameMap } from './terrain';
import { TerrainType, TERRAIN_DATA } from './terrain';
import type { ResearchState } from './techTree';
import { createResearchState, getSpeedBonus, getCapacityBonus, getMaintenanceReduction, getRevenueBonus, getUnlockedTrainTypes } from './techTree';

export interface TrackSegment {
    from: HexCoord;
    to: HexCoord;
    built: boolean;
    type: 'narrow' | 'standard' | 'double' | 'electrified' | 'highspeed';
}

export interface Station {
    hex: HexCoord;
    name: string;
    type: 'halt' | 'station' | 'junction' | 'terminal';
    platforms: number;
    cityIndex: number;
}

export interface Train {
    id: number;
    name: string;
    type: 'freight' | 'passenger' | 'mixed' | 'luxury' | 'mail' | 'express' | 'commuter' | 'bullet' | 'hyperloop';
    route: HexCoord[];
    currentSegment: number;
    progress: number;
    speed: number;
    capacity: number;
    cargo: Record<string, number>;
    revenue: number;
    maintenanceCost: number;
    color: number;
}

export type GameSpeed = 0 | 1 | 2 | 3;
export type Tool = 'select' | 'track' | 'station' | 'train' | 'demolish' | 'research' | 'diplomacy' | 'economy';

export interface GameState {
    map: GameMap;
    tracks: Map<string, TrackSegment>;
    stations: Map<string, Station>;
    trains: Train[];
    funds: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    lastMonthIncome: number;
    lastMonthExpenses: number;
    totalRevenue: number;
    month: number;
    year: number;
    era: 'steam' | 'diesel' | 'electric' | 'maglev';
    speed: GameSpeed;
    selectedTool: Tool;
    selectedHex: HexCoord | null;
    trackBuildStart: HexCoord | null;
    nextTrainId: number;
    research: ResearchState;
    notifications: GameNotification[];
}

export interface GameNotification {
    id: number;
    icon: string;
    title: string;
    text: string;
    type: 'success' | 'warning' | 'danger' | 'info';
    time: number;
}

export const COSTS = {
    trackPerHex: 500,
    stationHalt: 1000,
    stationBasic: 3000,
    stationJunction: 5000,
    stationTerminal: 15000,
    trainFreight: 5000,
    trainPassenger: 8000,
    trainMixed: 6000,
    trainLuxury: 12000,
    trainMail: 4000,
    trainExpress: 15000,
    trainCommuter: 10000,
    trainBullet: 25000,
    trainHyperloop: 50000,
    demolishTrack: 100,
    demolishStation: 500,
};

export const TRAIN_CONFIGS: Record<Train['type'], { speed: number; capacity: number; maintenance: number; color: number }> = {
    // Steam Era
    freight: { speed: 0.15, capacity: 100, maintenance: 50, color: 0x8B6914 },
    passenger: { speed: 0.25, capacity: 60, maintenance: 80, color: 0x4A6FA5 },
    mail: { speed: 0.30, capacity: 40, maintenance: 40, color: 0xB44A3E },
    // Diesel Era
    mixed: { speed: 0.20, capacity: 70, maintenance: 65, color: 0x7A7D85 },
    luxury: { speed: 0.20, capacity: 30, maintenance: 120, color: 0xD4A843 },
    // Electric Era
    express: { speed: 0.40, capacity: 80, maintenance: 150, color: 0x2E86C1 },
    commuter: { speed: 0.35, capacity: 120, maintenance: 100, color: 0x27AE60 },
    // Maglev Era
    bullet: { speed: 0.55, capacity: 90, maintenance: 200, color: 0xE74C3C },
    hyperloop: { speed: 0.80, capacity: 50, maintenance: 350, color: 0x9B59B6 },
};

let notifId = 0;

// Era-based train maintenance costs ($/month)
export const TRAIN_MAINTENANCE_BY_ERA: Record<Train['type'], Record<GameState['era'], number>> = {
    freight: { steam: 50, diesel: 75, electric: 110, maglev: 165 },
    passenger: { steam: 80, diesel: 120, electric: 180, maglev: 270 },
    mail: { steam: 40, diesel: 60, electric: 90, maglev: 135 },
    mixed: { steam: 65, diesel: 90, electric: 130, maglev: 195 },
    luxury: { steam: 120, diesel: 180, electric: 270, maglev: 405 },
    express: { steam: 150, diesel: 220, electric: 330, maglev: 495 },
    commuter: { steam: 100, diesel: 150, electric: 220, maglev: 330 },
    bullet: { steam: 200, diesel: 300, electric: 450, maglev: 675 },
    hyperloop: { steam: 350, diesel: 520, electric: 780, maglev: 1170 },
};

// Era-based track segment maintenance ($/month per segment)
export const TRACK_MAINTENANCE_BY_ERA: Record<GameState['era'], number> = {
    steam: 5,
    diesel: 10,
    electric: 50,
    maglev: 250,
};

export function createGameState(map: GameMap): GameState {
    return {
        map,
        tracks: new Map(),
        stations: new Map(),
        trains: [],
        funds: 50000,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        lastMonthIncome: 0,
        lastMonthExpenses: 0,
        totalRevenue: 0,
        month: 0,
        year: 1840,
        era: 'steam',
        speed: 1,
        selectedTool: 'select',
        selectedHex: null,
        trackBuildStart: null,
        nextTrainId: 1,
        research: createResearchState(),
        notifications: [],
    };
}

export function trackKey(from: HexCoord, to: HexCoord): string {
    const fk = hexKey(from);
    const tk = hexKey(to);
    return fk < tk ? `${fk}->${tk}` : `${tk}->${fk}`;
}

export function canBuildTrack(state: GameState, from: HexCoord, to: HexCoord): { ok: boolean; cost: number; reason?: string } {
    const dist = hexDistance(from, to);
    if (dist !== 1) return { ok: false, cost: 0, reason: 'Must be adjacent hexes' };

    const toTerrain = state.map.terrain.get(hexKey(to));
    if (!toTerrain) return { ok: false, cost: 0, reason: 'Out of bounds' };
    if (toTerrain === TerrainType.Water) return { ok: false, cost: 0, reason: 'Cannot build on water' };

    const key = trackKey(from, to);
    if (state.tracks.has(key)) return { ok: false, cost: 0, reason: 'Track already exists' };

    const terrainInfo = TERRAIN_DATA[toTerrain];
    const cost = Math.floor(COSTS.trackPerHex * terrainInfo.trackCostMultiplier);

    if (state.funds < cost) return { ok: false, cost, reason: 'Insufficient funds' };

    return { ok: true, cost };
}

export function buildTrack(state: GameState, from: HexCoord, to: HexCoord): boolean {
    const check = canBuildTrack(state, from, to);
    if (!check.ok) return false;

    const key = trackKey(from, to);
    state.tracks.set(key, {
        from, to, built: true, type: 'standard',
    });
    state.funds -= check.cost;
    revealAround(state, to, 2);
    return true;
}

export function canBuildStation(state: GameState, hex: HexCoord): { ok: boolean; cost: number; reason?: string } {
    const key = hexKey(hex);
    if (state.stations.has(key)) return { ok: false, cost: 0, reason: 'Station already here' };

    const terrain = state.map.terrain.get(key);
    if (!terrain || terrain === TerrainType.Water || terrain === TerrainType.Mountains) {
        return { ok: false, cost: 0, reason: 'Cannot build station here' };
    }

    const hasTrack = Array.from(state.tracks.values()).some(
        (t: TrackSegment) => hexKey(t.from) === key || hexKey(t.to) === key
    );

    const cityIndex = state.map.cities.findIndex(c => hexKey(c.hex) === key);
    const cost = cityIndex >= 0 ? COSTS.stationBasic : COSTS.stationHalt;

    if (state.funds < cost) return { ok: false, cost, reason: 'Insufficient funds' };

    if (state.stations.size > 0 && !hasTrack) {
        return { ok: false, cost, reason: 'Must connect to track network' };
    }

    return { ok: true, cost };
}

export function buildStation(state: GameState, hex: HexCoord): boolean {
    const check = canBuildStation(state, hex);
    if (!check.ok) return false;

    const key = hexKey(hex);
    const cityIndex = state.map.cities.findIndex(c => hexKey(c.hex) === key);

    const station: Station = {
        hex,
        name: cityIndex >= 0 ? state.map.cities[cityIndex].name : `Halt ${state.stations.size + 1}`,
        type: cityIndex >= 0 ? 'station' : 'halt',
        platforms: cityIndex >= 0 ? 2 : 1,
        cityIndex,
    };

    state.stations.set(key, station);
    state.funds -= check.cost;

    if (cityIndex >= 0) {
        state.map.cities[cityIndex].hasStation = true;
        addNotification(state, '🏛️', 'Station Built', `${station.name} station is now operational!`, 'success');
    }

    revealAround(state, hex, 3);
    return true;
}

/**
 * BFS pathfinding along the track network from one hex to another.
 * Returns the full path of hex coordinates, or null if no track connection exists.
 */
export function findTrackPath(state: GameState, from: HexCoord, to: HexCoord): HexCoord[] | null {
    const startKey = hexKey(from);
    const goalKey = hexKey(to);
    if (startKey === goalKey) return [from];

    // Build adjacency from track segments
    const adj = new Map<string, Set<string>>();
    for (const track of state.tracks.values()) {
        const fk = hexKey(track.from);
        const tk = hexKey(track.to);
        if (!adj.has(fk)) adj.set(fk, new Set());
        if (!adj.has(tk)) adj.set(tk, new Set());
        adj.get(fk)!.add(tk);
        adj.get(tk)!.add(fk);
    }

    if (!adj.has(startKey)) return null;

    // BFS
    const queue: string[] = [startKey];
    const cameFrom = new Map<string, string>();
    cameFrom.set(startKey, '');

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === goalKey) {
            // Reconstruct path
            const path: HexCoord[] = [];
            let node = goalKey;
            while (node !== '') {
                path.push(parseHexKey(node));
                node = cameFrom.get(node)!;
            }
            path.reverse();
            return path;
        }

        const neighbors = adj.get(current);
        if (!neighbors) continue;
        for (const next of neighbors) {
            if (!cameFrom.has(next)) {
                cameFrom.set(next, current);
                queue.push(next);
            }
        }
    }

    return null;
}

export function buyTrain(state: GameState, type: Train['type'], routeStations: HexCoord[]): Train | null {
    const costMap: Record<string, number> = {
        freight: COSTS.trainFreight,
        passenger: COSTS.trainPassenger,
        mixed: COSTS.trainMixed,
        luxury: COSTS.trainLuxury,
        mail: COSTS.trainMail,
        express: COSTS.trainExpress,
        commuter: COSTS.trainCommuter,
        bullet: COSTS.trainBullet,
        hyperloop: COSTS.trainHyperloop,
    };
    const cost = costMap[type] ?? 5000;
    if (state.funds < cost) return null;
    if (routeStations.length < 2) return null;

    // Check tech unlock
    const unlocked = getUnlockedTrainTypes(state.research);
    if (!unlocked.includes(type)) {
        addNotification(state, '🔒', 'Tech Required',
            `Research the required technology to unlock ${type} trains!`, 'danger');
        return null;
    }

    // Resolve full track path between consecutive stations
    const fullRoute: HexCoord[] = [];
    for (let i = 0; i < routeStations.length - 1; i++) {
        const segment = findTrackPath(state, routeStations[i], routeStations[i + 1]);
        if (!segment) {
            addNotification(state, '⚠️', 'No Track Path',
                `No track connection between stations. Build tracks first!`, 'danger');
            return null;
        }
        if (i === 0) {
            fullRoute.push(...segment);
        } else {
            fullRoute.push(...segment.slice(1));
        }
    }

    const config = TRAIN_CONFIGS[type];
    const speedBonus = 1 + getSpeedBonus(state.research) / 100;
    const capBonus = 1 + getCapacityBonus(state.research) / 100;
    const train: Train = {
        id: state.nextTrainId++,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${state.nextTrainId - 1}`,
        type,
        route: fullRoute,
        currentSegment: 0,
        progress: 0,
        speed: config.speed * speedBonus,
        capacity: Math.floor(config.capacity * capBonus),
        cargo: {},
        revenue: 0,
        maintenanceCost: config.maintenance,
        color: config.color,
    };

    state.trains.push(train);
    state.funds -= cost;
    addNotification(state, '🚂', 'Train Purchased', `${train.name} is ready to roll!`, 'success');
    return train;
}

export function removeTrain(state: GameState, trainId: number): boolean {
    const idx = state.trains.findIndex(t => t.id === trainId);
    if (idx === -1) return false;
    const train = state.trains[idx];
    state.trains.splice(idx, 1);
    // Refund 25% of purchase cost
    const costMap: Record<string, number> = {
        freight: COSTS.trainFreight,
        passenger: COSTS.trainPassenger,
        mixed: COSTS.trainMixed,
        luxury: COSTS.trainLuxury,
        mail: COSTS.trainMail,
    };
    const refund = Math.floor((costMap[train.type] ?? 5000) * 0.25);
    state.funds += refund;
    addNotification(state, '🗑️', 'Train Retired', `${train.name} retired. Refund: ${formatMoney(refund)}`, 'warning');
    return true;
}

export function updateTrains(state: GameState, delta: number): void {
    const speedMultipliers = [0, 1, 3, 8];
    const gameSpeed = speedMultipliers[state.speed] * delta;

    for (const train of state.trains) {
        if (train.route.length < 2) continue;

        train.progress += train.speed * gameSpeed;

        if (train.progress >= 1) {
            train.progress = 0;
            train.currentSegment++;

            if (train.currentSegment >= train.route.length - 1) {
                train.route.reverse();
                train.currentSegment = 0;

                const routeLength = train.route.length;
                const revBonus = 1 + getRevenueBonus(state.research) / 100;
                const typeMultiplier = train.type === 'hyperloop' ? 5 : train.type === 'bullet' ? 4 : train.type === 'luxury' ? 3 : train.type === 'express' ? 2.5 : train.type === 'passenger' ? 2 : train.type === 'commuter' ? 1.5 : 1;
                const baseRevenue = Math.floor(routeLength * 100 * typeMultiplier * revBonus);
                train.revenue += baseRevenue;
                state.monthlyIncome += baseRevenue;
                state.totalRevenue += baseRevenue;
            }

            const currentHex = train.route[train.currentSegment];
            const station = state.stations.get(hexKey(currentHex));
            if (station && station.cityIndex >= 0) {
                const deliveryRevenue = Math.floor(Math.random() * 200) + 50;
                train.revenue += deliveryRevenue;
                state.monthlyIncome += deliveryRevenue;
                state.totalRevenue += deliveryRevenue;
            }
        }
    }
}

export function updateEconomy(state: GameState): void {
    // Apply maintenance reduction from tech
    const maintReduction = 1 - getMaintenanceReduction(state.research) / 100;

    // Calculate this month's maintenance costs
    let totalMaintenance = 0;
    totalMaintenance += state.tracks.size * TRACK_MAINTENANCE_BY_ERA[state.era];

    state.stations.forEach((s: Station) => {
        totalMaintenance += s.type === 'terminal' ? 200 : s.type === 'station' ? 100 : 30;
    });

    for (const train of state.trains) {
        totalMaintenance += TRAIN_MAINTENANCE_BY_ERA[train.type]?.[state.era] ?? train.maintenanceCost;
    }

    totalMaintenance = Math.floor(totalMaintenance * maintReduction);
    state.monthlyExpenses += totalMaintenance;

    // Generate research points: 10 per station + 2% of income
    const rpFromStations = state.stations.size * 10;
    const rpFromIncome = Math.floor(state.monthlyIncome * 0.02);
    const rpGenerated = rpFromStations + rpFromIncome;
    state.research.points += rpGenerated;
    state.research.pointsPerMonth = rpGenerated;

    // Settle: add income, subtract expenses, all at once
    const net = state.monthlyIncome - state.monthlyExpenses;
    state.funds += net;

    // Snapshot for UI display, then reset for next month
    state.lastMonthIncome = state.monthlyIncome;
    state.lastMonthExpenses = state.monthlyExpenses;
    state.monthlyIncome = 0;
    state.monthlyExpenses = 0;

    // Grow cities with stations
    for (const city of state.map.cities) {
        if (city.hasStation) {
            city.population = Math.floor(city.population * (1 + city.growth));
        }
    }
}

export function advanceTime(state: GameState): void {
    state.month++;
    if (state.month >= 12) {
        state.month = 0;
        state.year++;

        if (state.year >= 1900 && state.era === 'steam') {
            state.era = 'diesel';
            addNotification(state, '🚃', 'New Era!', 'The Diesel Era has begun!', 'warning');
        } else if (state.year >= 1950 && state.era === 'diesel') {
            state.era = 'electric';
            addNotification(state, '⚡', 'New Era!', 'The Electric Era has begun!', 'warning');
        } else if (state.year >= 2000 && state.era === 'electric') {
            state.era = 'maglev';
            addNotification(state, '🚄', 'New Era!', 'The Maglev Era has begun!', 'warning');
        }
    }

    updateEconomy(state);
}

export function addNotification(state: GameState, icon: string, title: string, text: string, type: GameNotification['type']): void {
    state.notifications.push({ id: notifId++, icon, title, text, type, time: Date.now() });
    while (state.notifications.length > 5) {
        state.notifications.shift();
    }
}

function revealAround(state: GameState, center: HexCoord, radius: number): void {
    for (let dr = -radius; dr <= radius; dr++) {
        for (let dq = -radius; dq <= radius; dq++) {
            const h: HexCoord = { q: center.q + dq, r: center.r + dr };
            if (hexDistance(center, h) <= radius) {
                state.map.explored.add(hexKey(h));
            }
        }
    }
}

export function getMonthName(month: number): string {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month];
}

export function getEraLabel(era: GameState['era']): string {
    return { steam: 'Steam Era', diesel: 'Diesel Era', electric: 'Electric Era', maglev: 'Maglev Era' }[era];
}

export function formatMoney(amount: number): string {
    if (Math.abs(amount) >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toLocaleString()}`;
}
