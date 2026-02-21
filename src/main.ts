// ============================================
// IRON DOMINION — Main Entry Point
// ============================================
import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

// Animate loading bar while initializing
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
let loadProgress = 0;

function animateLoading() {
  loadProgress = Math.min(loadProgress + Math.random() * 15, 85);
  if (loadingBar) loadingBar.style.width = `${loadProgress}%`;
  if (loadProgress < 85) {
    const messages = [
      'Laying down tracks...', 'Surveying terrain...', 'Building stations...',
      'Stoking the engines...', 'Charting routes...', 'Loading resources...',
    ];
    if (loadingStatus) loadingStatus.textContent = messages[Math.floor(Math.random() * messages.length)];
    setTimeout(animateLoading, 200 + Math.random() * 300);
  }
}
animateLoading();

// Phaser config
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a22',
  antialias: true,
  scene: [GameScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    mouse: {
      preventDefaultWheel: true,
    }
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
};

// Create game
const game = new Phaser.Game(config);

// Handle window resize
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

export { game };
