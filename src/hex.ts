// ============================================
// HEX MAP UTILITIES
// ============================================
// Axial coordinate hex grid system for the game map

export interface HexCoord {
    q: number; // column (axial)
    r: number; // row (axial)
}

export interface PixelCoord {
    x: number;
    y: number;
}

// Hex dimensions
export const HEX_SIZE = 32; // radius in pixels
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// Six neighbor directions in axial coords (pointy-top hex)
export const HEX_DIRECTIONS: HexCoord[] = [
    { q: 1, r: 0 },   // East
    { q: 1, r: -1 },  // Northeast
    { q: 0, r: -1 },  // Northwest
    { q: -1, r: 0 },  // West
    { q: -1, r: 1 },  // Southwest
    { q: 0, r: 1 },   // Southeast
];

export function hexToPixel(hex: HexCoord): PixelCoord {
    const x = HEX_SIZE * (Math.sqrt(3) * hex.q + Math.sqrt(3) / 2 * hex.r);
    const y = HEX_SIZE * (3 / 2 * hex.r);
    return { x, y };
}

export function pixelToHex(px: PixelCoord): HexCoord {
    const q = (Math.sqrt(3) / 3 * px.x - 1 / 3 * px.y) / HEX_SIZE;
    const r = (2 / 3 * px.y) / HEX_SIZE;
    return hexRound({ q, r });
}

export function hexRound(hex: HexCoord): HexCoord {
    const s = -hex.q - hex.r;
    let rq = Math.round(hex.q);
    let rr = Math.round(hex.r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - hex.q);
    const dr = Math.abs(rr - hex.r);
    const ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) {
        rq = -rr - rs;
    } else if (dr > ds) {
        rr = -rq - rs;
    }
    return { q: rq, r: rr };
}

export function hexKey(hex: HexCoord): string {
    return `${hex.q},${hex.r}`;
}

export function parseHexKey(key: string): HexCoord {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
}

export function hexNeighbors(hex: HexCoord): HexCoord[] {
    return HEX_DIRECTIONS.map(d => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function hexLineDraw(a: HexCoord, b: HexCoord): HexCoord[] {
    const dist = hexDistance(a, b);
    if (dist === 0) return [a];
    const results: HexCoord[] = [];
    for (let i = 0; i <= dist; i++) {
        const t = i / dist;
        const q = a.q + (b.q - a.q) * t;
        const r = a.r + (b.r - a.r) * t;
        results.push(hexRound({ q: q + 1e-6, r: r + 1e-6 }));
    }
    return results;
}

// Get hex vertices for drawing
export function hexCorners(center: PixelCoord, size: number = HEX_SIZE): PixelCoord[] {
    const corners: PixelCoord[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
        corners.push({
            x: center.x + size * Math.cos(angle),
            y: center.y + size * Math.sin(angle),
        });
    }
    return corners;
}
