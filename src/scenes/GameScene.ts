// ============================================
// MAIN PHASER GAME SCENE
// ============================================
import Phaser from 'phaser';
import type { HexCoord } from '../hex';
import { hexToPixel, pixelToHex, hexKey, hexCorners, hexLineDraw, HEX_SIZE } from '../hex';
import { generateMap, TERRAIN_DATA } from '../terrain';
import type { Train } from '../gameState';
import {
    createGameState, buildTrack, buildStation,
    canBuildTrack, canBuildStation, updateTrains, advanceTime,
    getMonthName, getEraLabel, formatMoney, addNotification,
    buyTrain, removeTrain, TRAIN_CONFIGS, COSTS,
} from '../gameState';
import type { Tool, GameState } from '../gameState';
import { TECH_TREE, canResearch, unlockTech, getUnlockedTrainTypes, getEraForTech } from '../techTree';
import type { Technology } from '../techTree';

const MAP_WIDTH = 40;
const MAP_HEIGHT = 30;

export class GameScene extends Phaser.Scene {
    private gameState!: GameState;
    private mapGraphics!: Phaser.GameObjects.Graphics;
    private trackGraphics!: Phaser.GameObjects.Graphics;
    private trainGraphics!: Phaser.GameObjects.Graphics;
    private overlayGraphics!: Phaser.GameObjects.Graphics;
    private cityTexts: Phaser.GameObjects.Text[] = [];
    private resourceIcons: Phaser.GameObjects.Text[] = [];
    private isDragging = false;
    private dragDidMove = false;
    private dragStart = { x: 0, y: 0 };
    private camStart = { x: 0, y: 0 };
    private readonly DRAG_THRESHOLD = 5;
    private keysDown = new Set<string>();
    private hoverHex: HexCoord | null = null;
    private economyTimer = 0;
    private readonly ECONOMY_INTERVAL = 5000;
    private trainRouteStations: HexCoord[] = [];

    constructor() {
        super({ key: 'GameScene' });
    }

    create(): void {
        const map = generateMap(MAP_WIDTH, MAP_HEIGHT, Math.floor(Math.random() * 999999));
        this.gameState = createGameState(map);

        this.mapGraphics = this.add.graphics();
        this.trackGraphics = this.add.graphics();
        this.trainGraphics = this.add.graphics();
        this.overlayGraphics = this.add.graphics();

        this.drawMap();
        this.drawCities();
        this.drawResources();

        if (map.cities.length > 0) {
            const startPx = hexToPixel(map.cities[0].hex);
            this.cameras.main.centerOn(startPx.x, startPx.y);
        }

        const worldW = MAP_WIDTH * HEX_SIZE * 2;
        const worldH = MAP_HEIGHT * HEX_SIZE * 2;
        this.cameras.main.setBounds(-100, -100, worldW + 200, worldH + 200);
        this.cameras.main.setZoom(1.5);

        this.setupInput();
        this.setupUI();

        setTimeout(() => {
            this.hideLoading();
        }, 800);

        addNotification(this.gameState, '🎉', 'Welcome, Tycoon!', 'Build your railway empire. Start by placing a station near a city.', 'info');
        this.renderNotifications();
    }

    update(_time: number, delta: number): void {
        this.updateKeyboardPan(delta);
        this.drawOverlay();
        this.updateUI();

        if (this.gameState.speed === 0) return;

        updateTrains(this.gameState, delta / 1000);
        this.drawTrains();

        const speedMultipliers = [0, 1, 0.33, 0.125];
        this.economyTimer += delta;
        const interval = this.ECONOMY_INTERVAL * speedMultipliers[this.gameState.speed];
        if (this.economyTimer >= interval && interval > 0) {
            this.economyTimer = 0;
            advanceTime(this.gameState);
            this.renderNotifications();
        }
    }

    // ============ MAP RENDERING ============

    private drawMap(): void {
        this.mapGraphics.clear();

        for (let r = 0; r < MAP_HEIGHT; r++) {
            for (let q = 0; q < MAP_WIDTH; q++) {
                const hex: HexCoord = { q, r };
                const key = hexKey(hex);
                const terrain = this.gameState.map.terrain.get(key);
                if (!terrain) continue;

                const center = hexToPixel(hex);
                const corners = hexCorners(center);
                const isExplored = this.gameState.map.explored.has(key);
                const terrainInfo = TERRAIN_DATA[terrain];
                let color = terrainInfo.color;

                if (!isExplored) {
                    color = 0x1a1a22;
                }

                this.mapGraphics.fillStyle(color, isExplored ? 1 : 0.7);
                this.mapGraphics.beginPath();
                this.mapGraphics.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < 6; i++) {
                    this.mapGraphics.lineTo(corners[i].x, corners[i].y);
                }
                this.mapGraphics.closePath();
                this.mapGraphics.fillPath();

                this.mapGraphics.lineStyle(1, isExplored ? 0x3D3D48 : 0x111118, 0.4);
                this.mapGraphics.beginPath();
                this.mapGraphics.moveTo(corners[0].x, corners[0].y);
                for (let i = 1; i < 6; i++) {
                    this.mapGraphics.lineTo(corners[i].x, corners[i].y);
                }
                this.mapGraphics.closePath();
                this.mapGraphics.strokePath();
            }
        }
    }

    private drawCities(): void {
        this.cityTexts.forEach(t => t.destroy());
        this.cityTexts = [];

        for (const city of this.gameState.map.cities) {
            const key = hexKey(city.hex);
            if (!this.gameState.map.explored.has(key)) continue;

            const center = hexToPixel(city.hex);

            this.mapGraphics.fillStyle(0xF5E6C8, 1);
            this.mapGraphics.fillCircle(center.x, center.y, 6);
            this.mapGraphics.lineStyle(2, 0xD4A843, 1);
            this.mapGraphics.strokeCircle(center.x, center.y, 6);

            if (city.hasStation) {
                this.mapGraphics.lineStyle(2, 0x4A8F5C, 0.8);
                this.mapGraphics.strokeCircle(center.x, center.y, 10);
            }

            const nameText = this.add.text(center.x, center.y + 14, city.name, {
                fontFamily: 'Playfair Display, serif',
                fontSize: '10px',
                color: '#F5E6C8',
                stroke: '#1a1a22',
                strokeThickness: 3,
                align: 'center',
            }).setOrigin(0.5, 0);
            this.cityTexts.push(nameText);

            const popText = this.add.text(center.x, center.y + 24, `pop: ${city.population}`, {
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '7px',
                color: '#9A9DA5',
                stroke: '#1a1a22',
                strokeThickness: 2,
                align: 'center',
            }).setOrigin(0.5, 0);
            this.cityTexts.push(popText);
        }
    }

    private drawResources(): void {
        this.resourceIcons.forEach(t => t.destroy());
        this.resourceIcons = [];

        const icons: Record<string, string> = {
            coal: '⛏️', iron: '🔩', timber: '🪵', grain: '🌾'
        };

        this.gameState.map.resources.forEach((resource: string, key: string) => {
            if (!this.gameState.map.explored.has(key)) return;
            const [q, r] = key.split(',').map(Number);
            const center = hexToPixel({ q, r });
            const icon = this.add.text(center.x, center.y - 8, icons[resource] || '?', {
                fontSize: '12px',
            }).setOrigin(0.5, 0.5);
            this.resourceIcons.push(icon);
        });
    }

    private drawTracks(): void {
        this.trackGraphics.clear();

        this.gameState.tracks.forEach((segment: { from: HexCoord; to: HexCoord }) => {
            const fromPx = hexToPixel(segment.from);
            const toPx = hexToPixel(segment.to);

            const dx = toPx.x - fromPx.x;
            const dy = toPx.y - fromPx.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;
            const tieLen = 4;
            const tieCount = 5;

            this.trackGraphics.lineStyle(1, 0x5C4A2A, 0.6);
            for (let i = 1; i <= tieCount; i++) {
                const t = i / (tieCount + 1);
                const mx = fromPx.x + dx * t;
                const my = fromPx.y + dy * t;
                this.trackGraphics.beginPath();
                this.trackGraphics.moveTo(mx + nx * tieLen, my + ny * tieLen);
                this.trackGraphics.lineTo(mx - nx * tieLen, my - ny * tieLen);
                this.trackGraphics.strokePath();
            }

            const railOffset = 2;
            this.trackGraphics.lineStyle(2, 0x8B8B8B, 0.9);

            this.trackGraphics.beginPath();
            this.trackGraphics.moveTo(fromPx.x + nx * railOffset, fromPx.y + ny * railOffset);
            this.trackGraphics.lineTo(toPx.x + nx * railOffset, toPx.y + ny * railOffset);
            this.trackGraphics.strokePath();

            this.trackGraphics.beginPath();
            this.trackGraphics.moveTo(fromPx.x - nx * railOffset, fromPx.y - ny * railOffset);
            this.trackGraphics.lineTo(toPx.x - nx * railOffset, toPx.y - ny * railOffset);
            this.trackGraphics.strokePath();
        });

        // Station markers
        this.gameState.stations.forEach((station: { hex: HexCoord; type: string }) => {
            const center = hexToPixel(station.hex);
            const size = station.type === 'terminal' ? 10 : station.type === 'station' ? 8 : 5;

            this.trackGraphics.fillStyle(0xF5E6C8, 1);
            this.trackGraphics.fillRect(center.x - size, center.y - size, size * 2, size * 2);
            this.trackGraphics.lineStyle(2, 0xD4A843, 1);
            this.trackGraphics.strokeRect(center.x - size, center.y - size, size * 2, size * 2);
        });
    }

    private drawTrains(): void {
        this.trainGraphics.clear();

        for (const train of this.gameState.trains) {
            if (train.route.length < 2) continue;

            const segIdx = Math.min(train.currentSegment, train.route.length - 2);
            const fromPx = hexToPixel(train.route[segIdx]);
            const toPx = hexToPixel(train.route[segIdx + 1]);

            const x = fromPx.x + (toPx.x - fromPx.x) * train.progress;
            const y = fromPx.y + (toPx.y - fromPx.y) * train.progress;

            this.trainGraphics.fillStyle(train.color, 1);
            this.trainGraphics.fillCircle(x, y, 5);
            this.trainGraphics.lineStyle(1.5, 0xF5E6C8, 0.8);
            this.trainGraphics.strokeCircle(x, y, 5);

            if (this.gameState.era === 'steam') {
                const smokeAlpha = 0.3 + Math.sin(Date.now() / 200 + train.id) * 0.15;
                this.trainGraphics.fillStyle(0xCCCCCC, smokeAlpha);
                this.trainGraphics.fillCircle(x - 3, y - 8, 3);
                this.trainGraphics.fillCircle(x + 1, y - 11, 2);
            }
        }
    }

    private drawOverlay(): void {
        this.overlayGraphics.clear();

        if (!this.hoverHex) return;

        const center = hexToPixel(this.hoverHex);
        const corners = hexCorners(center);

        this.overlayGraphics.lineStyle(2, 0xD4A843, 0.8);
        this.overlayGraphics.beginPath();
        this.overlayGraphics.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 6; i++) {
            this.overlayGraphics.lineTo(corners[i].x, corners[i].y);
        }
        this.overlayGraphics.closePath();
        this.overlayGraphics.strokePath();

        if (this.gameState.selectedTool === 'track' && this.gameState.trackBuildStart) {
            const startPx = hexToPixel(this.gameState.trackBuildStart);
            const path = hexLineDraw(this.gameState.trackBuildStart, this.hoverHex);

            for (let i = 0; i < path.length - 1; i++) {
                const fromPx = hexToPixel(path[i]);
                const toPx = hexToPixel(path[i + 1]);
                const check = canBuildTrack(this.gameState, path[i], path[i + 1]);

                this.overlayGraphics.lineStyle(3, check.ok ? 0x4A8F5C : 0xB44A3E, 0.6);
                this.overlayGraphics.beginPath();
                this.overlayGraphics.moveTo(fromPx.x, fromPx.y);
                this.overlayGraphics.lineTo(toPx.x, toPx.y);
                this.overlayGraphics.strokePath();
            }

            this.overlayGraphics.lineStyle(2, 0xD4A843, 1);
            this.overlayGraphics.strokeCircle(startPx.x, startPx.y, 8);
        }

        if (this.gameState.selectedTool === 'station') {
            const check = canBuildStation(this.gameState, this.hoverHex);
            const color = check.ok ? 0x4A8F5C : 0xB44A3E;
            this.overlayGraphics.fillStyle(color, 0.3);
            this.overlayGraphics.fillCircle(center.x, center.y, 10);
            this.overlayGraphics.lineStyle(2, color, 0.8);
            this.overlayGraphics.strokeCircle(center.x, center.y, 10);
        }

        if (this.gameState.selectedTool === 'train' && this.trainRouteStations.length > 0) {
            for (let i = 0; i < this.trainRouteStations.length; i++) {
                const px = hexToPixel(this.trainRouteStations[i]);
                this.overlayGraphics.fillStyle(0xD4A843, 0.8);
                this.overlayGraphics.fillCircle(px.x, px.y, 6);
                if (i > 0) {
                    const prevPx = hexToPixel(this.trainRouteStations[i - 1]);
                    this.overlayGraphics.lineStyle(2, 0xD4A843, 0.5);
                    this.overlayGraphics.beginPath();
                    this.overlayGraphics.moveTo(prevPx.x, prevPx.y);
                    this.overlayGraphics.lineTo(px.x, px.y);
                    this.overlayGraphics.strokePath();
                }
            }
        }
    }

    // ============ INPUT ============

    private setupInput(): void {
        // Left-click: start potential drag or click
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.isDragging = true;
            this.dragDidMove = false;
            this.dragStart = { x: pointer.x, y: pointer.y };
            this.camStart = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            // Update hover hex
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            this.hoverHex = pixelToHex({ x: worldPoint.x, y: worldPoint.y });
            if (this.hoverHex.q < 0 || this.hoverHex.q >= MAP_WIDTH ||
                this.hoverHex.r < 0 || this.hoverHex.r >= MAP_HEIGHT) {
                this.hoverHex = null;
            }

            // Drag to pan (only after exceeding threshold)
            if (this.isDragging && pointer.isDown) {
                const dx = pointer.x - this.dragStart.x;
                const dy = pointer.y - this.dragStart.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > this.DRAG_THRESHOLD) {
                    this.dragDidMove = true;
                    this.cameras.main.scrollX = this.camStart.x - dx / this.cameras.main.zoom;
                    this.cameras.main.scrollY = this.camStart.y - dy / this.cameras.main.zoom;
                }
            }
        });

        this.input.on('pointerup', () => {
            // Only fire click if we didn't drag
            if (this.isDragging && !this.dragDidMove) {
                this.handleClick();
            }
            this.isDragging = false;
            this.dragDidMove = false;
        });

        this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
            const newZoom = Phaser.Math.Clamp(
                this.cameras.main.zoom + (deltaY > 0 ? -0.1 : 0.1),
                0.5, 3
            );
            this.cameras.main.setZoom(newZoom);
        });

        // Keyboard: track held keys for smooth panning
        this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            this.keysDown.add(key);

            switch (key) {
                case 'q': this.setTool('select'); break;
                case 't': this.setTool('track'); break;
                case 'escape':
                    this.gameState.trackBuildStart = null;
                    this.trainRouteStations = [];
                    this.setTool('select');
                    break;
                case ' ':
                    event.preventDefault();
                    this.gameState.speed = this.gameState.speed === 0 ? 1 : 0;
                    this.updateSpeedButtons();
                    break;
            }
        });

        this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
            this.keysDown.delete(event.key.toLowerCase());
        });
    }

    private updateKeyboardPan(delta: number): void {
        const panSpeed = 400 / this.cameras.main.zoom;
        const dt = delta / 1000;
        let dx = 0;
        let dy = 0;

        if (this.keysDown.has('w') || this.keysDown.has('arrowup')) dy -= 1;
        if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) dy += 1;
        if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) dx -= 1;
        if (this.keysDown.has('d') || this.keysDown.has('arrowright')) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            this.cameras.main.scrollX += (dx / len) * panSpeed * dt;
            this.cameras.main.scrollY += (dy / len) * panSpeed * dt;
        }
    }

    private handleClick(): void {
        if (!this.hoverHex) return;

        const hex = this.hoverHex;
        const key = hexKey(hex);
        const tool = this.gameState.selectedTool;

        switch (tool) {
            case 'select':
                this.gameState.selectedHex = hex;
                this.showHexInfo(hex);
                break;

            case 'track':
                if (!this.gameState.trackBuildStart) {
                    this.gameState.trackBuildStart = hex;
                } else {
                    const path = hexLineDraw(this.gameState.trackBuildStart, hex);
                    let builtAny = false;
                    for (let i = 0; i < path.length - 1; i++) {
                        if (buildTrack(this.gameState, path[i], path[i + 1])) {
                            builtAny = true;
                        }
                    }
                    if (builtAny) {
                        this.drawTracks();
                        this.drawMap();
                        this.drawCities();
                        this.drawResources();
                        this.updateUI();
                    }
                    this.gameState.trackBuildStart = hex;
                }
                break;

            case 'station':
                if (buildStation(this.gameState, hex)) {
                    this.drawTracks();
                    this.drawMap();
                    this.drawCities();
                    this.drawResources();
                    this.updateUI();
                    this.renderNotifications();
                }
                break;

            case 'train':
                if (this.gameState.stations.has(key)) {
                    this.trainRouteStations.push(hex);
                    if (this.trainRouteStations.length >= 2) {
                        this.showTrainPurchaseUI();
                    }
                } else {
                    addNotification(this.gameState, '⚠️', 'No Station', 'Click on stations to define a train route.', 'warning');
                    this.renderNotifications();
                }
                break;

            case 'demolish':
                if (this.gameState.stations.has(key)) {
                    this.gameState.stations.delete(key);
                    this.gameState.funds -= 500;
                    this.drawTracks();
                    this.updateUI();
                }
                break;
        }
    }

    private showHexInfo(hex: HexCoord): void {
        const key = hexKey(hex);
        const panel = document.getElementById('info-panel')!;
        const title = document.getElementById('panel-title')!;
        const body = document.getElementById('panel-body')!;

        panel.classList.remove('collapsed');

        const terrain = this.gameState.map.terrain.get(key);
        const station = this.gameState.stations.get(key);
        const city = this.gameState.map.cities.find(c => hexKey(c.hex) === key);
        const resource = this.gameState.map.resources.get(key);

        if (!this.gameState.map.explored.has(key)) {
            title.textContent = 'Unexplored';
            body.innerHTML = '<p style="color: var(--text-secondary);">This area has not been explored yet.</p>';
            return;
        }

        if (city && terrain) {
            title.textContent = city.name;
            body.innerHTML = `
                <div class="info-section">
                    <div class="info-row"><span class="info-label">Population</span><span class="info-value">${city.population.toLocaleString()}</span></div>
                    <div class="info-row"><span class="info-label">Terrain</span><span class="info-value">${TERRAIN_DATA[terrain].label}</span></div>
                    <div class="info-row"><span class="info-label">Station</span><span class="info-value">${station ? station.type : 'None'}</span></div>
                    ${resource ? `<div class="info-row"><span class="info-label">Resource</span><span class="info-value">${resource}</span></div>` : ''}
                </div>
                <div class="info-section">
                    <h3 style="color: var(--gold); font-family: var(--font-display); margin-bottom: 8px;">Demand</h3>
                    ${Object.entries(city.demand).map(([k, v]) => `<div class="info-row"><span class="info-label">${k}</span><span class="info-value">${v}</span></div>`).join('')}
                </div>
                <div class="info-section">
                    <h3 style="color: var(--gold); font-family: var(--font-display); margin-bottom: 8px;">Supply</h3>
                    ${Object.entries(city.supply).map(([k, v]) => `<div class="info-row"><span class="info-label">${k}</span><span class="info-value">${v}</span></div>`).join('')}
                </div>
            `;
        } else if (station && terrain) {
            title.textContent = station.name;
            body.innerHTML = `
                <div class="info-section">
                    <div class="info-row"><span class="info-label">Type</span><span class="info-value">${station.type}</span></div>
                    <div class="info-row"><span class="info-label">Platforms</span><span class="info-value">${station.platforms}</span></div>
                    <div class="info-row"><span class="info-label">Terrain</span><span class="info-value">${TERRAIN_DATA[terrain].label}</span></div>
                </div>
            `;
        } else if (terrain) {
            title.textContent = TERRAIN_DATA[terrain].label;
            body.innerHTML = `
                <div class="info-section">
                    <div class="info-row"><span class="info-label">Track Cost</span><span class="info-value">${TERRAIN_DATA[terrain].trackCostMultiplier}x</span></div>
                    <div class="info-row"><span class="info-label">Speed</span><span class="info-value">${Math.round(TERRAIN_DATA[terrain].speedModifier * 100)}%</span></div>
                    ${resource ? `<div class="info-row"><span class="info-label">Resource</span><span class="info-value">${resource}</span></div>` : ''}
                </div>
            `;
        }

        this.ensureInfoStyles();
    }

    private showTrainPurchaseUI(): void {
        const panel = document.getElementById('info-panel')!;
        const title = document.getElementById('panel-title')!;
        const body = document.getElementById('panel-body')!;

        panel.classList.remove('collapsed');
        title.textContent = 'Purchase Train';

        const stationsText = this.trainRouteStations.map(h => {
            const station = this.gameState.stations.get(hexKey(h));
            return station ? station.name : 'Unknown';
        }).join(' → ');

        const costMap: Record<string, number> = {
            freight: COSTS.trainFreight, passenger: COSTS.trainPassenger, mixed: COSTS.trainMixed,
            luxury: COSTS.trainLuxury, mail: COSTS.trainMail, express: COSTS.trainExpress,
            commuter: COSTS.trainCommuter, bullet: COSTS.trainBullet, hyperloop: COSTS.trainHyperloop,
        };

        const unlockedTypes = getUnlockedTrainTypes(this.gameState.research);

        body.innerHTML = `
            <div class="info-section">
                <p style="color: var(--text-secondary); margin-bottom: 12px;">Route: ${stationsText}</p>
                <div class="train-options">
                    ${(Object.keys(TRAIN_CONFIGS) as Array<Train['type']>)
                .filter(type => unlockedTypes.includes(type))
                .map((type) => `
                        <button class="train-buy-btn" data-type="${type}" style="
                            display: flex; justify-content: space-between; align-items: center;
                            width: 100%; padding: 8px 12px; margin-bottom: 6px;
                            background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
                            border-radius: 6px; color: var(--text-primary); cursor: pointer;
                            font-family: var(--font-body); font-size: 13px;
                            transition: all 0.2s ease;
                        ">
                            <span>${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            <span style="font-family: var(--font-mono); color: var(--gold);">$${(costMap[type] || 0).toLocaleString()}</span>
                        </button>
                    `).join('')}
                </div>
                <button id="cancel-train" style="
                    width: 100%; padding: 8px; margin-top: 8px;
                    background: rgba(180,74,62,0.15); border: 1px solid rgba(180,74,62,0.3);
                    border-radius: 6px; color: var(--text-danger); cursor: pointer;
                    font-family: var(--font-body); font-size: 13px;
                ">Cancel</button>
            </div>
        `;

        body.querySelectorAll('.train-buy-btn').forEach(btn => {
            btn.addEventListener('mouseenter', (e) => {
                (e.target as HTMLElement).style.borderColor = 'var(--gold-dark)';
                (e.target as HTMLElement).style.background = 'rgba(212,168,67,0.1)';
            });
            btn.addEventListener('mouseleave', (e) => {
                (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
            });
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type') as Train['type'];
                const train = buyTrain(this.gameState, type, [...this.trainRouteStations]);
                if (train) {
                    this.trainRouteStations = [];
                    this.updateUI();
                    this.renderNotifications();
                    this.drawTrains();
                    this.showHexInfo(train.route[0]);
                } else {
                    addNotification(this.gameState, '❌', 'Cannot Purchase', 'Insufficient funds.', 'danger');
                    this.renderNotifications();
                }
            });
        });

        document.getElementById('cancel-train')?.addEventListener('click', () => {
            this.trainRouteStations = [];
        });
    }

    // ============ UI ============

    private setupUI(): void {
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.getAttribute('data-tool') as Tool;
                if (tool) this.setTool(tool);
            });
        });

        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = parseInt(btn.getAttribute('data-speed') || '1');
                this.gameState.speed = speed as GameState['speed'];
                this.updateSpeedButtons();
            });
        });

        document.getElementById('info-panel-toggle')?.addEventListener('click', () => {
            document.getElementById('info-panel')?.classList.toggle('collapsed');
        });

        // Train panel: click train count to open
        document.getElementById('trains-display')?.addEventListener('click', () => {
            this.toggleTrainPanel(true);
        });

        // Train panel: close button
        document.getElementById('train-panel-close')?.addEventListener('click', () => {
            this.toggleTrainPanel(false);
        });

        // Train panel: backdrop close
        document.querySelector('#train-panel .modal-panel-backdrop')?.addEventListener('click', () => {
            this.toggleTrainPanel(false);
        });

        // Research panel: click RP display or Research button to open
        document.getElementById('rp-display')?.addEventListener('click', () => {
            this.toggleResearchPanel(true);
        });
        document.getElementById('btn-research')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleResearchPanel(true);
        });

        // Research panel: close button
        document.getElementById('research-panel-close')?.addEventListener('click', () => {
            this.toggleResearchPanel(false);
        });

        // Research panel: backdrop close
        document.querySelector('#research-panel .research-backdrop')?.addEventListener('click', () => {
            this.toggleResearchPanel(false);
        });

        this.renderMinimap();
        this.updateUI();
    }

    private setTool(tool: Tool): void {
        this.gameState.selectedTool = tool;
        this.gameState.trackBuildStart = null;
        if (tool !== 'train') {
            this.trainRouteStations = [];
        }

        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
        });
    }

    private updateSpeedButtons(): void {
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.getAttribute('data-speed') || '1') === this.gameState.speed);
        });
    }

    private toggleTrainPanel(open: boolean): void {
        const panel = document.getElementById('train-panel');
        if (!panel) return;
        if (open) {
            panel.classList.remove('hidden');
            this.renderTrainPanel();
        } else {
            panel.classList.add('hidden');
        }
    }

    private toggleResearchPanel(open: boolean): void {
        const panel = document.getElementById('research-panel');
        if (!panel) return;
        if (open) {
            panel.classList.remove('hidden');
            this.renderResearchPanel();
        } else {
            panel.classList.add('hidden');
        }
    }

    private renderResearchPanel(): void {
        const body = document.getElementById('research-panel-body');
        const rpCounter = document.getElementById('research-rp-counter');
        if (!body) return;

        const research = this.gameState.research;
        if (rpCounter) rpCounter.textContent = `${Math.floor(research.points)} RP`;

        const eras: Array<{ id: string; name: string; period: string }> = [
            { id: 'steam', name: 'Steam Age', period: '1840+' },
            { id: 'diesel', name: 'Diesel Era', period: '1900+' },
            { id: 'electric', name: 'Electric Age', period: '1950+' },
            { id: 'maglev', name: 'Maglev Future', period: '2000+' },
        ];

        const getEffectTag = (effect: { type: string; value: string | number }) => {
            switch (effect.type) {
                case 'unlock_train': return `<span class="tech-effect-tag train">🚂 ${effect.value}</span>`;
                case 'speed_bonus': return `<span class="tech-effect-tag speed">⚡ +${effect.value}% speed</span>`;
                case 'capacity_bonus': return `<span class="tech-effect-tag capacity">📦 +${effect.value}% capacity</span>`;
                case 'maintenance_reduction': return `<span class="tech-effect-tag maintenance">🔧 -${effect.value}% maint</span>`;
                case 'revenue_bonus': return `<span class="tech-effect-tag revenue">💰 +${effect.value}% revenue</span>`;
                case 'unlock_track': return `<span class="tech-effect-tag speed">🛤️ ${effect.value} track</span>`;
                default: return '';
            }
        };

        body.innerHTML = eras.map(era => {
            const techs = getEraForTech(era.id);
            return `
                <div class="tech-era-section">
                    <div class="tech-era-header">
                        <span class="tech-era-name ${era.id}">${era.name}</span>
                        <span class="tech-era-badge ${era.id}">${era.period}</span>
                    </div>
                    <div class="tech-grid">
                        ${techs.map((tech: Technology) => {
                const isUnlocked = research.unlocked.has(tech.id);
                const check = canResearch(research, tech.id);
                const isAvailable = check.ok;
                const stateClass = isUnlocked ? 'unlocked' : isAvailable ? 'available' : 'locked';

                return `
                                <div class="tech-card ${stateClass}" data-tech-id="${tech.id}">
                                    <div class="tech-card-icon">${tech.icon}</div>
                                    <div class="tech-card-name">${tech.name}</div>
                                    <div class="tech-card-desc">${tech.description}</div>
                                    <div class="tech-card-effects">
                                        ${tech.effects.map(e => getEffectTag(e)).join('')}
                                    </div>
                                    <div class="tech-card-footer">
                                        ${isUnlocked
                        ? '<span class="tech-status unlocked">✓ Researched</span>'
                        : isAvailable
                            ? `<span class="tech-cost">${tech.cost} RP</span>
                                                   <button class="tech-unlock-btn" data-unlock-tech="${tech.id}">Research</button>`
                            : `<span class="tech-cost">${tech.cost} RP</span>
                                                   <span class="tech-prereq-label">${check.reason || 'Locked'}</span>`
                    }
                                    </div>
                                </div>`;
            }).join('')}
                    </div>
                </div>`;
        }).join('');

        // Wire up unlock buttons
        body.querySelectorAll('[data-unlock-tech]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const techId = btn.getAttribute('data-unlock-tech');
                if (!techId) return;
                if (unlockTech(research, techId)) {
                    const tech = TECH_TREE.find(t => t.id === techId);
                    if (tech) {
                        addNotification(this.gameState, tech.icon, 'Tech Unlocked!',
                            `${tech.name} has been researched!`, 'success');
                    }
                    this.renderResearchPanel();
                    this.updateUI();
                    this.renderNotifications();
                }
            });
        });
    }

    private renderTrainPanel(): void {
        const body = document.getElementById('train-panel-body');
        const summary = document.getElementById('fleet-summary');
        if (!body || !summary) return;

        const trains = this.gameState.trains;

        if (trains.length === 0) {
            body.innerHTML = '<p class="empty-state">No trains yet. Buy trains by selecting stations with the Train tool (R).</p>';
            summary.innerHTML = '';
            return;
        }

        let totalRevenue = 0;
        let totalMaintenance = 0;

        body.innerHTML = trains.map((train: Train) => {
            const net = train.revenue - train.maintenanceCost;
            totalRevenue += train.revenue;
            totalMaintenance += train.maintenanceCost;
            const colorHex = `#${train.color.toString(16).padStart(6, '0')}`;

            return `
                <div class="train-card" style="border-left-color: ${colorHex}">
                    <div class="train-card-header">
                        <span class="train-card-name">${train.name}</span>
                        <span class="train-card-type">${train.type}</span>
                    </div>
                    <div class="train-card-stats">
                        <div class="train-stat">
                            <span class="train-stat-label">Revenue</span>
                            <span class="train-stat-value positive">${formatMoney(train.revenue)}</span>
                        </div>
                        <div class="train-stat">
                            <span class="train-stat-label">Maint/mo</span>
                            <span class="train-stat-value negative">${formatMoney(train.maintenanceCost)}</span>
                        </div>
                        <div class="train-stat">
                            <span class="train-stat-label">Net Profit</span>
                            <span class="train-stat-value ${net >= 0 ? 'positive' : 'negative'}">${formatMoney(net)}</span>
                        </div>
                        <div class="train-stat">
                            <span class="train-stat-label">Route</span>
                            <span class="train-stat-value">${train.route.length} tiles</span>
                        </div>
                        <div class="train-stat">
                            <span class="train-stat-label">Speed</span>
                            <span class="train-stat-value">${(train.speed * 100).toFixed(0)}%</span>
                        </div>
                        <div class="train-stat">
                            <span class="train-stat-label">Capacity</span>
                            <span class="train-stat-value">${train.capacity}</span>
                        </div>
                    </div>
                    <div class="train-card-actions">
                        <button class="train-action-btn danger" data-retire-train="${train.id}">🗑️ Retire</button>
                    </div>
                </div>`;
        }).join('');

        // Wire up retire buttons
        body.querySelectorAll('[data-retire-train]').forEach(btn => {
            btn.addEventListener('click', () => {
                const trainId = parseInt(btn.getAttribute('data-retire-train') || '0');
                removeTrain(this.gameState, trainId);
                this.renderTrainPanel();
                this.renderNotifications();
            });
        });

        const fleetNet = totalRevenue - totalMaintenance;
        summary.innerHTML = `
            <div class="fleet-summary-item">
                <span class="fleet-summary-label">Fleet:</span>
                <span class="fleet-summary-value">${trains.length} trains</span>
            </div>
            <div class="fleet-summary-item">
                <span class="fleet-summary-label">Revenue:</span>
                <span class="fleet-summary-value" style="color: var(--forest-green-light)">${formatMoney(totalRevenue)}</span>
            </div>
            <div class="fleet-summary-item">
                <span class="fleet-summary-label">Net:</span>
                <span class="fleet-summary-value" style="color: ${fleetNet >= 0 ? 'var(--forest-green-light)' : 'var(--rust-red-light)'}">${formatMoney(fleetNet)}</span>
            </div>`;
    }

    private updateUI(): void {
        const s = this.gameState;

        const fundsEl = document.getElementById('funds-value');
        if (fundsEl) {
            fundsEl.textContent = formatMoney(s.funds);
            fundsEl.style.color = s.funds >= 0 ? 'var(--text-primary)' : 'var(--rust-red-light)';
        }

        // Show live current-month income (falls back to last month if current is still 0)
        const liveIncome = s.monthlyIncome > 0 ? s.monthlyIncome : s.lastMonthIncome;
        const incomeEl = document.getElementById('income-value');
        if (incomeEl) {
            incomeEl.textContent = liveIncome > 0 ? `+${formatMoney(liveIncome)}` : '$0';
            incomeEl.className = `resource-value ${liveIncome > 0 ? 'income-positive' : ''}`;
        }

        // Show live current-month expenses (falls back to last month)
        const liveExpenses = s.monthlyExpenses > 0 ? s.monthlyExpenses : s.lastMonthExpenses;
        const expensesEl = document.getElementById('expenses-value');
        if (expensesEl) {
            expensesEl.textContent = liveExpenses > 0 ? `-${formatMoney(liveExpenses)}` : '$0';
            expensesEl.className = `resource-value ${liveExpenses > 0 ? 'income-negative' : ''}`;
        }

        const netEl = document.getElementById('net-value');
        if (netEl) {
            const net = liveIncome - liveExpenses;
            netEl.textContent = net === 0 ? '$0' : `${net >= 0 ? '+' : ''}${formatMoney(net)}`;
            netEl.style.color = net > 0 ? 'var(--forest-green-light)' : net < 0 ? 'var(--rust-red-light)' : 'var(--text-secondary)';
        }

        const trainsEl = document.getElementById('trains-value');
        if (trainsEl) trainsEl.textContent = `${s.trains.length}`;

        const rpEl = document.getElementById('rp-value');
        if (rpEl) rpEl.textContent = `${Math.floor(s.research.points)} RP`;

        const eraEl = document.querySelector('.era-label');
        if (eraEl) eraEl.textContent = getEraLabel(s.era);

        const dateEl = document.querySelector('.date-text');
        if (dateEl) dateEl.textContent = `${getMonthName(s.month)} ${s.year}`;
    }

    private renderNotifications(): void {
        const container = document.getElementById('notifications-container');
        if (!container) return;

        container.innerHTML = '';
        const now = Date.now();

        for (const notif of this.gameState.notifications) {
            const age = now - notif.time;
            if (age > 8000) continue;

            const el = document.createElement('div');
            el.className = `notification ${notif.type}`;
            el.innerHTML = `
                <span class="notification-icon">${notif.icon}</span>
                <div class="notification-content">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-text">${notif.text}</div>
                </div>
            `;
            container.appendChild(el);

            if (age > 6000) {
                el.classList.add('leaving');
            }
        }
    }

    private renderMinimap(): void {
        const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#1a1a22';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const scaleX = canvas.width / MAP_WIDTH;
        const scaleY = canvas.height / MAP_HEIGHT;

        this.gameState.map.terrain.forEach((terrain: string, key: string) => {
            const [q, r] = key.split(',').map(Number);
            const info = TERRAIN_DATA[terrain as keyof typeof TERRAIN_DATA];
            const explored = this.gameState.map.explored.has(key);

            if (explored) {
                const hex = info.color;
                ctx.fillStyle = `rgb(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255})`;
            } else {
                ctx.fillStyle = '#22222a';
            }
            ctx.fillRect(q * scaleX, r * scaleY, scaleX + 0.5, scaleY + 0.5);
        });

        ctx.fillStyle = '#F5E6C8';
        for (const city of this.gameState.map.cities) {
            if (!this.gameState.map.explored.has(hexKey(city.hex))) continue;
            ctx.fillRect(city.hex.q * scaleX - 1, city.hex.r * scaleY - 1, 3, 3);
        }

        ctx.strokeStyle = '#8B8B8B';
        ctx.lineWidth = 1;
        this.gameState.tracks.forEach((seg: { from: HexCoord; to: HexCoord }) => {
            ctx.beginPath();
            ctx.moveTo(seg.from.q * scaleX, seg.from.r * scaleY);
            ctx.lineTo(seg.to.q * scaleX, seg.to.r * scaleY);
            ctx.stroke();
        });
    }

    private hideLoading(): void {
        const loading = document.getElementById('loading-screen');
        if (loading) {
            const bar = document.getElementById('loading-bar');
            const status = document.getElementById('loading-status');
            if (bar) bar.style.width = '100%';
            if (status) status.textContent = 'Ready!';
            setTimeout(() => {
                loading.classList.add('hidden');
                setTimeout(() => loading.remove(), 800);
            }, 400);
        }
    }

    private ensureInfoStyles(): void {
        if (document.getElementById('info-dynamic-styles')) return;
        const style = document.createElement('style');
        style.id = 'info-dynamic-styles';
        style.textContent = `
            .info-section { margin-bottom: 16px; }
            .info-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
            }
            .info-label { color: var(--text-secondary); font-size: 13px; }
            .info-value { font-family: var(--font-mono); font-size: 13px; font-weight: 500; color: var(--text-primary); }
        `;
        document.head.appendChild(style);
    }
}
