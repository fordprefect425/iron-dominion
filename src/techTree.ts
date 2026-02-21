// ============================================
// TECH TREE & RESEARCH SYSTEM
// ============================================

export interface Technology {
    id: string;
    name: string;
    icon: string;
    era: 'steam' | 'diesel' | 'electric' | 'maglev';
    cost: number; // research points to unlock
    prerequisites: string[];
    description: string;
    effects: TechEffect[];
}

export interface TechEffect {
    type: 'unlock_train' | 'speed_bonus' | 'capacity_bonus' | 'maintenance_reduction' | 'revenue_bonus' | 'unlock_track';
    value: string | number; // train type name or percentage
}

export interface ResearchState {
    points: number;
    pointsPerMonth: number;
    unlocked: Set<string>;
    currentResearch: string | null;
    progress: number; // 0-1 for current research
}

export function createResearchState(): ResearchState {
    return {
        points: 0,
        pointsPerMonth: 0,
        unlocked: new Set(['basic_locomotive']), // start with basic tech
        currentResearch: null,
        progress: 0,
    };
}

// ============ TECH DEFINITIONS ============

export const TECH_TREE: Technology[] = [
    // === STEAM ERA (1840) ===
    {
        id: 'basic_locomotive',
        name: 'Basic Locomotive',
        icon: '🚂',
        era: 'steam',
        cost: 0,
        prerequisites: [],
        description: 'The foundation of rail travel. Enables basic freight trains.',
        effects: [{ type: 'unlock_train', value: 'freight' }],
    },
    {
        id: 'passenger_carriages',
        name: 'Passenger Carriages',
        icon: '🧳',
        era: 'steam',
        cost: 500,
        prerequisites: ['basic_locomotive'],
        description: 'Comfortable carriages for passenger transport.',
        effects: [{ type: 'unlock_train', value: 'passenger' }],
    },
    {
        id: 'mail_coach',
        name: 'Mail Coach',
        icon: '📮',
        era: 'steam',
        cost: 400,
        prerequisites: ['basic_locomotive'],
        description: 'Fast postal delivery service by rail.',
        effects: [{ type: 'unlock_train', value: 'mail' }],
    },
    {
        id: 'improved_boiler',
        name: 'Improved Boiler',
        icon: '🔥',
        era: 'steam',
        cost: 800,
        prerequisites: ['basic_locomotive'],
        description: 'Higher pressure boilers increase all train speeds.',
        effects: [{ type: 'speed_bonus', value: 15 }],
    },

    // === DIESEL ERA (1900) ===
    {
        id: 'diesel_engine',
        name: 'Diesel Engine',
        icon: '⛽',
        era: 'diesel',
        cost: 1500,
        prerequisites: ['improved_boiler'],
        description: 'Internal combustion engines bring a new age of rail.',
        effects: [{ type: 'unlock_train', value: 'mixed' }],
    },
    {
        id: 'luxury_carriages',
        name: 'Luxury Carriages',
        icon: '👑',
        era: 'diesel',
        cost: 2000,
        prerequisites: ['diesel_engine', 'passenger_carriages'],
        description: 'First-class travel with premium dining cars.',
        effects: [{ type: 'unlock_train', value: 'luxury' }],
    },
    {
        id: 'reinforced_chassis',
        name: 'Reinforced Chassis',
        icon: '🔩',
        era: 'diesel',
        cost: 1200,
        prerequisites: ['diesel_engine'],
        description: 'Stronger frames allow larger cargo capacity.',
        effects: [{ type: 'capacity_bonus', value: 25 }],
    },
    {
        id: 'efficient_logistics',
        name: 'Efficient Logistics',
        icon: '📊',
        era: 'diesel',
        cost: 1800,
        prerequisites: ['diesel_engine'],
        description: 'Optimized operations reduce maintenance costs.',
        effects: [{ type: 'maintenance_reduction', value: 20 }],
    },

    // === ELECTRIC ERA (1950) ===
    {
        id: 'electric_motors',
        name: 'Electric Motors',
        icon: '⚡',
        era: 'electric',
        cost: 3000,
        prerequisites: ['diesel_engine'],
        description: 'Clean electric power transforms rail travel.',
        effects: [
            { type: 'unlock_train', value: 'express' },
            { type: 'unlock_track', value: 'electrified' },
        ],
    },
    {
        id: 'signal_systems',
        name: 'Signal Systems',
        icon: '🚦',
        era: 'electric',
        cost: 2500,
        prerequisites: ['electric_motors'],
        description: 'Automated signaling increases route efficiency.',
        effects: [{ type: 'revenue_bonus', value: 20 }],
    },
    {
        id: 'commuter_networks',
        name: 'Commuter Networks',
        icon: '🏙️',
        era: 'electric',
        cost: 2800,
        prerequisites: ['electric_motors', 'passenger_carriages'],
        description: 'Dense urban rail networks for daily commuters.',
        effects: [{ type: 'unlock_train', value: 'commuter' }],
    },
    {
        id: 'high_speed_rails',
        name: 'High-Speed Rails',
        icon: '🛤️',
        era: 'electric',
        cost: 4000,
        prerequisites: ['electric_motors', 'reinforced_chassis'],
        description: 'Dedicated high-speed track for express services.',
        effects: [
            { type: 'speed_bonus', value: 30 },
            { type: 'unlock_track', value: 'highspeed' },
        ],
    },

    // === MAGLEV ERA (2000) ===
    {
        id: 'maglev_technology',
        name: 'Maglev Technology',
        icon: '🧲',
        era: 'maglev',
        cost: 6000,
        prerequisites: ['electric_motors', 'high_speed_rails'],
        description: 'Magnetic levitation eliminates friction entirely.',
        effects: [{ type: 'unlock_train', value: 'bullet' }],
    },
    {
        id: 'hyperloop_prototype',
        name: 'Hyperloop Prototype',
        icon: '🚀',
        era: 'maglev',
        cost: 10000,
        prerequisites: ['maglev_technology'],
        description: 'Vacuum tube transport at near-supersonic speeds.',
        effects: [{ type: 'unlock_train', value: 'hyperloop' }],
    },
    {
        id: 'quantum_logistics',
        name: 'Quantum Logistics',
        icon: '🔮',
        era: 'maglev',
        cost: 8000,
        prerequisites: ['maglev_technology', 'signal_systems'],
        description: 'AI-optimized logistics reduce all costs dramatically.',
        effects: [
            { type: 'maintenance_reduction', value: 30 },
            { type: 'revenue_bonus', value: 25 },
        ],
    },
    {
        id: 'neural_networks',
        name: 'Neural Networks',
        icon: '🧠',
        era: 'maglev',
        cost: 7000,
        prerequisites: ['maglev_technology'],
        description: 'Self-driving trains maximize capacity and efficiency.',
        effects: [
            { type: 'capacity_bonus', value: 40 },
            { type: 'speed_bonus', value: 20 },
        ],
    },
];

// ============ HELPER FUNCTIONS ============

export function getTech(id: string): Technology | undefined {
    return TECH_TREE.find(t => t.id === id);
}

export function canResearch(state: ResearchState, techId: string): { ok: boolean; reason?: string } {
    if (state.unlocked.has(techId)) return { ok: false, reason: 'Already researched' };

    const tech = getTech(techId);
    if (!tech) return { ok: false, reason: 'Unknown technology' };

    for (const prereq of tech.prerequisites) {
        if (!state.unlocked.has(prereq)) {
            const prereqTech = getTech(prereq);
            return { ok: false, reason: `Requires: ${prereqTech?.name ?? prereq}` };
        }
    }

    if (state.points < tech.cost) {
        return { ok: false, reason: `Need ${tech.cost} RP (have ${Math.floor(state.points)})` };
    }

    return { ok: true };
}

export function unlockTech(state: ResearchState, techId: string): boolean {
    const check = canResearch(state, techId);
    if (!check.ok) return false;

    const tech = getTech(techId)!;
    state.points -= tech.cost;
    state.unlocked.add(techId);
    return true;
}

export function getUnlockedTrainTypes(state: ResearchState): string[] {
    const types: string[] = [];
    for (const techId of state.unlocked) {
        const tech = getTech(techId);
        if (!tech) continue;
        for (const effect of tech.effects) {
            if (effect.type === 'unlock_train') {
                types.push(effect.value as string);
            }
        }
    }
    return types;
}

export function getSpeedBonus(state: ResearchState): number {
    let bonus = 0;
    for (const techId of state.unlocked) {
        const tech = getTech(techId);
        if (!tech) continue;
        for (const effect of tech.effects) {
            if (effect.type === 'speed_bonus') bonus += effect.value as number;
        }
    }
    return bonus;
}

export function getCapacityBonus(state: ResearchState): number {
    let bonus = 0;
    for (const techId of state.unlocked) {
        const tech = getTech(techId);
        if (!tech) continue;
        for (const effect of tech.effects) {
            if (effect.type === 'capacity_bonus') bonus += effect.value as number;
        }
    }
    return bonus;
}

export function getMaintenanceReduction(state: ResearchState): number {
    let reduction = 0;
    for (const techId of state.unlocked) {
        const tech = getTech(techId);
        if (!tech) continue;
        for (const effect of tech.effects) {
            if (effect.type === 'maintenance_reduction') reduction += effect.value as number;
        }
    }
    return Math.min(reduction, 75); // cap at 75%
}

export function getRevenueBonus(state: ResearchState): number {
    let bonus = 0;
    for (const techId of state.unlocked) {
        const tech = getTech(techId);
        if (!tech) continue;
        for (const effect of tech.effects) {
            if (effect.type === 'revenue_bonus') bonus += effect.value as number;
        }
    }
    return bonus;
}

export function getEraForTech(era: string): Technology[] {
    return TECH_TREE.filter(t => t.era === era);
}
