// ==========================================
// 1. KONFIGURASI FILE ASSET (TEMA SPASIAL / LUAR ANGKASA)
// ==========================================
const ASSET_PATHS = {
  player: 'Asset Image/spaceship.png',   // Gambar Pesawat Luar Angkasa
  enemy: 'Asset Image/alien.png',         // Gambar Alien
  asteroid: 'Asset Image/asteroid.png',   // Gambar Asteroid
  bg: 'Asset Image/space_bg.png',         // Gambar Background Luar Angkasa
  bgMusic: 'Asset Audio/bgm.mp3',
  shootSFX: 'Asset Audio/shoot.mp3',
  explodeSFX: 'Asset Audio/explode.mp3',
  gameOverSFX: 'Asset Audio/gameover.mp3'
};

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');
const shootBtn = document.getElementById('shootBtn');
const deathReasonEl = document.getElementById('deathReason');
const finalScoreEl = document.getElementById('finalScore');
const highScoreTextEl = document.getElementById('highScoreText');

// Memuat Gambar dengan Fallback Rendering
const images = {};
function loadImages() {
  const keys = ['player', 'enemy', 'asteroid', 'bg'];
  keys.forEach(key => {
    const img = new Image();
    img.src = ASSET_PATHS[key];
    img.onload = () => { images[key] = img; };
    img.onerror = () => { images[key] = null; };
  });
}
loadImages();

// Memuat Audio
let isMuted = false;
const audio = {
  bgm: new Audio(ASSET_PATHS.bgMusic),
  shoot: new Audio(ASSET_PATHS.shootSFX),
  explode: new Audio(ASSET_PATHS.explodeSFX),
  gameOver: new Audio(ASSET_PATHS.gameOverSFX)
};
audio.bgm.loop = true;

function playSound(soundKey) {
  if (!isMuted && audio[soundKey]) {
    audio[soundKey].currentTime = 0;
    audio[soundKey].play().catch(() => {});
  }
}

muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? '🔇 Audio: OFF' : '🔊 Audio: ON';
  if (isMuted) {
    audio.bgm.pause();
    audio.gameOver.pause();
  } else if (gameState === 'PLAYING') {
    audio.bgm.play().catch(() => {});
  }
});

// ==========================================
// 2. STATE GAME & INPUT KONTROL (KEYBOARD & TOUCH)
// ==========================================
let gameState = 'START';
let score = 0;
let highScore = localStorage.getItem('asteroid_highscore') || 0;
let timer = 30.0;
const MAX_TIMER = 30.0;
let screenFlash = 0;

let level = 0;
let nextBossThreshold = 200;
let bossActive = false;
let boss = null;

let asteroidTimerAcc = 0;
let enemyTimerAcc = 0;
let ammoBubbleTimerAcc = 0;
let buffBubbleTimerAcc = 0;

let nextBuffBubbleInterval = 15.0 + Math.random() * 15.0;

let touchTarget = null;
let isPointerDown = false;

const keys = {
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
  w: false, a: false, s: false, d: false
};

window.addEventListener('keydown', e => {
  if (e.code in keys) keys[e.code] = true;
  if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    triggerShoot();
  }
});

window.addEventListener('keyup', e => {
  if (e.code in keys) keys[e.code] = false;
  if (e.key.toLowerCase() in keys) keys[e.key.toLowerCase()] = false;
});

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height)
  };
}

function handlePointerStart(e) {
  if (gameState !== 'PLAYING') return;
  if (e.target === shootBtn) return;
  isPointerDown = true;
  touchTarget = getCanvasCoords(e);
}

function handlePointerMove(e) {
  if (!isPointerDown || gameState !== 'PLAYING') return;
  touchTarget = getCanvasCoords(e);
}

function handlePointerEnd() {
  isPointerDown = false;
  touchTarget = null;
}

canvas.addEventListener('mousedown', handlePointerStart);
canvas.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerEnd);

canvas.addEventListener('touchstart', handlePointerStart, { passive: false });
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
window.addEventListener('touchend', handlePointerEnd);

function triggerShoot() {
  if (gameState === 'PLAYING') {
    player.manualShoot();
  }
}

shootBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  triggerShoot();
});

// ==========================================
// 3. EFEK FLOATING TEXT
// ==========================================
let floatingTexts = [];

function addFloatingText(x, y, text, color = '#facc15') {
  floatingTexts.push({
    x: x,
    y: y,
    text: text,
    color: color,
    life: 50,
    maxLife: 50
  });
}

function updateAndDrawFloatingTexts() {
  floatingTexts.forEach((ft, i) => {
    ft.y -= 0.6;
    ft.life--;
    let alpha = ft.life / ft.maxLife;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();

    if (ft.life <= 0) floatingTexts.splice(i, 1);
  });
}

// ==========================================
// 4. PLAYER & ENTITI GAME
// ==========================================
const player = {
  x: 100,
  y: 300,
  width: 75,
  height: 50,
  speed: 360,
  hp: 3,
  ammo: 30,
  invincibleTimer: 0,
  shieldTimer: 0,
  shotDirections: 1,
  reset() {
    this.x = 100;
    this.y = 300;
    this.hp = 3;
    this.ammo = 30;
    this.invincibleTimer = 0;
    this.shieldTimer = 0;
    this.shotDirections = 1;
    touchTarget = null;
  },
  takeDamage(amount, reason) {
    if (this.shieldTimer > 0) return;
    if (this.invincibleTimer > 0) return;
    
    this.hp -= amount;
    screenFlash = 12;
    this.invincibleTimer = 60;

    if (this.hp <= 0) {
      this.hp = 0;
      triggerGameOver(reason);
    }
  },
  update(dt) {
    if (keys.ArrowUp || keys.w) this.y -= this.speed * dt;
    if (keys.ArrowDown || keys.s) this.y += this.speed * dt;
    if (keys.ArrowLeft || keys.a) this.x -= this.speed * dt;
    if (keys.ArrowRight || keys.d) this.x += this.speed * dt;

    if (touchTarget) {
      let destX = touchTarget.x - this.width / 2;
      let destY = touchTarget.y - this.height / 2;
      let dx = destX - this.x;
      let dy = destY - this.y;
      let dist = Math.hypot(dx, dy);

      if (dist > 5) {
        let step = this.speed * dt;
        if (step > dist) step = dist;
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    }

    if (this.x < 0) this.x = 0;
    if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
    if (this.y < 50) this.y = 50;
    if (this.y + this.height > canvas.height) this.y = canvas.height - this.height;

    if (this.invincibleTimer > 0) this.invincibleTimer--;
    if (this.shieldTimer > 0) this.shieldTimer -= dt;
  },
  manualShoot() {
    if (this.ammo <= 0) {
      addFloatingText(this.x, this.y - 10, 'AMMO HABIS!', '#ef4444');
      return;
    }

    this.ammo--;
    let count = this.shotDirections;
    let bulletSpeed = 10;

    for (let i = 0; i < count; i++) {
      let angle = 0;
      if (count > 1) {
        let step = (Math.PI / 6);
        angle = (i - (count - 1) / 2) * (step / ((count - 1) / 2));
      }

      playerBullets.push({
        x: this.x + this.width,
        y: this.y + this.height / 2 - 3,
        width: 12,
        height: 5,
        vx: Math.cos(angle) * bulletSpeed,
        vy: Math.sin(angle) * bulletSpeed
      });
    }
    playSound('shoot');
  },
  applyRandomBuff() {
    let buffType = Math.floor(Math.random() * 3);
    if (buffType === 0) {
      if (this.shotDirections < 7) this.shotDirections += 2;
      addFloatingText(this.x, this.y - 10, `BUFF: ${this.shotDirections} SPREAD LASER!`, '#facc15');
    } else if (buffType === 1) {
      this.shieldTimer = 45.0;
      addFloatingText(this.x, this.y - 10, 'BUFF: FORCE SHIELD 45s!', '#a855f7');
    } else {
      this.hp = 3;
      addFloatingText(this.x, this.y - 10, 'BUFF: HULL REPAIRED!', '#22c55e');
    }
  },
  draw() {
    ctx.save();
    if (this.shieldTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x + this.width/2, this.y + this.height/2, 42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (this.invincibleTimer % 10 < 5) {
      if (images.player) {
        ctx.drawImage(images.player, this.x, this.y, this.width, this.height);
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width, this.y + this.height / 2);
        ctx.lineTo(this.x, this.y);
        ctx.lineTo(this.x + 15, this.y + this.height / 2);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 15);
        ctx.lineTo(this.x - 12, this.y + this.height / 2);
        ctx.lineTo(this.x, this.y + this.height - 15);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
};

let playerBullets = [];
let enemyBullets = []; // Peluru khusus dari Bos
let enemies = [];
let asteroids = [];
let ammoBubbles = [];
let buffBubbles = [];
let particles = [];

// Gelembung Amunisi
class AmmoBubble {
  constructor() {
    this.x = canvas.width + 40;
    this.y = Math.random() * (canvas.height - 120) + 60;
    this.radius = 16;
    this.speed = 1.5;
  }
  update() {
    this.x -= this.speed;
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.fill();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AMMO', this.x, this.y);
    ctx.restore();
  }
}

// Gelembung Buff
class BuffBubble {
  constructor() {
    this.x = canvas.width + 40;
    this.y = Math.random() * (canvas.height - 120) + 60;
    this.radius = 18;
    this.speed = 1.2;
  }
  update() {
    this.x -= this.speed;
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.5)';
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', this.x, this.y);
    ctx.restore();
  }
}

// Asteroid
class Asteroid {
  constructor() {
    this.x = canvas.width + 50;
    this.width = 65;
    this.height = 65;
    this.y = Math.random() * (canvas.height - 120) + 50;
    this.speed = 1.2 + (level * 0.05);
    this.hp = 2 + level;
  }
  update() {
    this.x -= this.speed;
  }
  draw() {
    if (images.asteroid) {
      ctx.drawImage(images.asteroid, this.x, this.y, this.width, this.height);
    } else {
      ctx.save();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(this.x + this.width/3, this.y + this.height/3, 8, 0, Math.PI * 2);
      ctx.arc(this.x + 40, this.y + 35, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// Musuh Alien (Bervariasi Ukuran & HP - Tidak Menembak)
class Enemy {
  constructor() {
    this.x = canvas.width + 60;
    let type = Math.floor(Math.random() * 3);
    if (type === 0) {
      this.width = 55;
      this.height = 40;
      this.hp = 1 + level;
      this.speed = 1.3;
    } else if (type === 1) {
      this.width = 80;
      this.height = 60;
      this.hp = 3 + level;
      this.speed = 0.9;
    } else {
      this.width = 110;
      this.height = 80;
      this.hp = 6 + (level * 2);
      this.speed = 0.6;
    }

    this.y = Math.random() * (canvas.height - 120) + 50;
  }
  update(dt) {
    this.x -= this.speed;
  }
  draw() {
    if (images.enemy) {
      ctx.drawImage(images.enemy, this.x, this.y, this.width, this.height);
    } else {
      ctx.save();
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.ellipse(this.x + this.width/2, this.y + this.height/2, this.width/2, this.height/4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(this.x + this.width/2, this.y + this.height/3, this.width/5, 0, Math.PI, true);
      ctx.fill();
      ctx.restore();
    }
  }
}

// BOS INDUK ALIEN (BISA MENEMBAK TIAP 5 DETIK)
class Boss {
  constructor() {
    this.x = canvas.width + 120;
    this.targetX = canvas.width * 0.65;
    this.width = 150;
    this.height = 110;
    this.y = canvas.height / 2 - 55;
    this.speed = 1.0;
    this.vy = 0.6;
    this.hp = 15 + (level * 8);
    this.maxHp = this.hp;
    this.shootTimer = 5.0; // Timer menembak Bos
  }
  update(dt) {
    if (this.x > this.targetX) {
      this.x -= this.speed;
    } else {
      this.x = this.targetX;
      this.y += this.vy;
      if (this.y <= 60) {
        this.y = 60;
        this.vy = Math.abs(this.vy);
      }
      if (this.y + this.height >= canvas.height - 10) {
        this.y = canvas.height - 10 - this.height;
        this.vy = -Math.abs(this.vy);
      }
    }

    // Tembakan Bos Tiap 5 Detik (3 Arah Peluru Plasma)
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      let bSpeed = 2.2 + (level * 0.05);
      let centerY = this.y + this.height / 2;

      enemyBullets.push({ x: this.x, y: centerY, radius: 7, vx: -bSpeed, vy: 0 });
      enemyBullets.push({ x: this.x, y: centerY, radius: 7, vx: -bSpeed, vy: -0.6 });
      enemyBullets.push({ x: this.x, y: centerY, radius: 7, vx: -bSpeed, vy: 0.6 });

      this.shootTimer = 5.0;
    }
  }
  draw() {
    if (images.enemy) {
      ctx.drawImage(images.enemy, this.x, this.y, this.width, this.height);
    } else {
      ctx.save();
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(this.x + 10, this.y + 10, this.width - 20, this.height - 20);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.fillRect(this.x, this.y - 15, this.width, 8);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(this.x, this.y - 15, this.width * (this.hp / this.maxHp), 8);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y - 15, this.width, 8);
  }
}

// Partikel Ledakan
function createExplosion(x, y, color = '#f97316', count = 25) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      size: Math.random() * 5 + 2,
      life: 25,
      color: color
    });
  }
  playSound('explode');
}

// ==========================================
// 5. DETEKSI TABRAKAN & BONUS WAKTU (+2.5s)
// ==========================================
function addBonusTime(x, y) {
  timer = Math.min(MAX_TIMER, timer + 2.5);
  addFloatingText(x, y, '+2.5s TIME', '#22c55e');
}

function checkCollisions() {
  playerBullets.forEach((b, bIndex) => {

    if (bossActive && boss) {
      if (b.x < boss.x + boss.width && b.x + b.width > boss.x &&
          b.y < boss.y + boss.height && b.y + b.height > boss.y) {
        createExplosion(b.x, b.y, '#f97316', 10);
        playerBullets.splice(bIndex, 1);
        boss.hp--;

        if (boss.hp <= 0) {
          createExplosion(boss.x + boss.width/2, boss.y + boss.height/2, '#ef4444', 60);
          level++;
          score += 100;
          addBonusTime(boss.x + boss.width/2, boss.y);
          bossActive = false;
          boss = null;
        }
        return;
      }
    }

    enemies.forEach((e, eIndex) => {
      if (b.x < e.x + e.width && b.x + b.width > e.x &&
          b.y < e.y + e.height && b.y + b.height > e.y) {
        playerBullets.splice(bIndex, 1);
        e.hp--;
        createExplosion(e.x + e.width/2, e.y + e.height/2, '#f97316', 10);

        if (e.hp <= 0) {
          createExplosion(e.x + e.width/2, e.y + e.height/2, '#a855f7', 25);
          enemies.splice(eIndex, 1);
          score += 15;
          addBonusTime(e.x + e.width/2, e.y);
        }
      }
    });

    asteroids.forEach((a, aIndex) => {
      if (b.x < a.x + a.width && b.x + b.width > a.x &&
          b.y < a.y + a.height && b.y + b.height > a.y) {
        playerBullets.splice(bIndex, 1);
        a.hp--;
        createExplosion(a.x + a.width/2, a.y + a.height/2, '#64748b', 10);

        if (a.hp <= 0) {
          createExplosion(a.x + a.width/2, a.y + a.height/2, '#cbd5e1', 35);
          asteroids.splice(aIndex, 1);
          score += 5;
          addBonusTime(a.x + a.width/2, a.y);
        }
      }
    });
  });

  // Peluru Bos Kena Player
  enemyBullets.forEach((eb, ebIndex) => {
    if (eb.x > player.x && eb.x < player.x + player.width &&
        eb.y > player.y && eb.y < player.y + player.height) {
      enemyBullets.splice(ebIndex, 1);
      createExplosion(player.x + player.width/2, player.y + player.height/2, '#f43f5e');
      player.takeDamage(1, 'Kamu tertembak oleh Induk Alien!');
    }
  });

  ammoBubbles.forEach((ab, abIndex) => {
    let dist = Math.hypot((player.x + player.width/2) - ab.x, (player.y + player.height/2) - ab.y);
    if (dist < player.width/2 + ab.radius) {
      ammoBubbles.splice(abIndex, 1);
      player.ammo += 15;
      addFloatingText(player.x, player.y - 10, '+15 AMMO', '#38bdf8');
    }
  });

  buffBubbles.forEach((bb, bbIndex) => {
    let dist = Math.hypot((player.x + player.width/2) - bb.x, (player.y + player.height/2) - bb.y);
    if (dist < player.width/2 + bb.radius) {
      buffBubbles.splice(bbIndex, 1);
      player.applyRandomBuff();
    }
  });

  if (bossActive && boss) {
    if (player.x < boss.x + boss.width && player.x + player.width > boss.x &&
        player.y < boss.y + boss.height && player.y + player.height > boss.y) {
      player.takeDamage(1, 'Kamu menabrak Induk Alien!');
    }
  }

  enemies.forEach((e, eIndex) => {
    if (player.x < e.x + e.width && player.x + player.width > e.x &&
        player.y < e.y + e.height && player.y + player.height > e.y) {
      createExplosion(e.x + e.width/2, e.y + e.height/2, '#a855f7', 35);
      enemies.splice(eIndex, 1);
      player.takeDamage(1, 'Kamu menabrak Alien!');
    }
  });

  asteroids.forEach((a, aIndex) => {
    if (player.x < a.x + a.width && player.x + player.width > a.x &&
        player.y < a.y + a.height && player.y + player.height > a.y) {
      createExplosion(a.x + a.width/2, a.y + a.height/2, '#64748b', 40);
      asteroids.splice(aIndex, 1);
      player.takeDamage(1, 'Kamu menabrak Asteroid!');
    }
  });
}

// ==========================================
// 6. GAME LOOP & HUD
// ==========================================
let lastTime = performance.now();

function resetGame() {
  score = 0;
  level = 0;
  nextBossThreshold = 200;
  bossActive = false;
  boss = null;
  timer = MAX_TIMER;
  
  asteroidTimerAcc = 0;
  enemyTimerAcc = 0;
  ammoBubbleTimerAcc = 0;
  buffBubbleTimerAcc = 0;

  playerBullets = [];
  enemyBullets = [];
  enemies = [];
  asteroids = [];
  ammoBubbles = [];
  buffBubbles = [];
  particles = [];
  floatingTexts = [];
  player.reset();
  
  gameState = 'PLAYING';
  gameOverScreen.classList.add('hidden');
  startScreen.classList.add('hidden');
  
  audio.gameOver.pause();
  audio.gameOver.currentTime = 0;
  if (!isMuted) audio.bgm.play().catch(() => {});
}

function triggerGameOver(reason) {
  gameState = 'GAMEOVER';
  screenFlash = 12;
  deathReasonEl.textContent = reason;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('asteroid_highscore', highScore);
  }
  finalScoreEl.textContent = score;
  highScoreTextEl.textContent = highScore;
  gameOverScreen.classList.remove('hidden');

  audio.bgm.pause();
  playSound('gameOver');
}

function gameLoop(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (images.bg) {
    ctx.drawImage(images.bg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(100, 80, 2, 2);
    ctx.fillRect(300, 250, 2, 2);
    ctx.fillRect(600, 120, 3, 3);
    ctx.fillRect(450, 480, 2, 2);
    ctx.fillRect(720, 380, 2, 2);
  }

  if (gameState === 'PLAYING') {
    timer -= dt;
    if (timer <= 0) {
      timer = 0;
      triggerGameOver('Kehabisan Waktu!');
    }

    ammoBubbleTimerAcc += dt;
    if (ammoBubbleTimerAcc >= 4.0) {
      ammoBubbles.push(new AmmoBubble());
      ammoBubbleTimerAcc = 0;
    }

    buffBubbleTimerAcc += dt;
    if (buffBubbleTimerAcc >= nextBuffBubbleInterval) {
      buffBubbles.push(new BuffBubble());
      buffBubbleTimerAcc = 0;
      nextBuffBubbleInterval = 15.0 + Math.random() * 15.0;
    }

    asteroidTimerAcc += dt;
    if (asteroidTimerAcc >= 3.0) {
      asteroids.push(new Asteroid());
      asteroidTimerAcc = 0;
    }

    enemyTimerAcc += dt;
    if (enemyTimerAcc >= 5.0) {
      enemies.push(new Enemy());
      enemyTimerAcc = 0;
    }

    if (score >= nextBossThreshold && !bossActive) {
      bossActive = true;
      boss = new Boss();
    }

    player.update(dt);
    if (bossActive && boss) boss.update(dt);
    checkCollisions();

    // Update Peluru Player
    playerBullets.forEach((b, i) => {
      b.x += b.vx;
      b.y += (b.vy || 0);
      if (b.x > canvas.width || b.y < 0 || b.y > canvas.height) playerBullets.splice(i, 1);
    });

    // Update Peluru Bos
    enemyBullets.forEach((eb, i) => {
      eb.x += eb.vx;
      eb.y += (eb.vy || 0);
      if (eb.x < 0 || eb.y < 0 || eb.y > canvas.height) enemyBullets.splice(i, 1);
    });

    ammoBubbles.forEach((ab, i) => {
      ab.update();
      if (ab.x < -30) ammoBubbles.splice(i, 1);
    });
    buffBubbles.forEach((bb, i) => {
      bb.update();
      if (bb.x < -30) buffBubbles.splice(i, 1);
    });
    asteroids.forEach((a, i) => {
      a.update();
      if (a.x < -60) asteroids.splice(i, 1);
    });
    enemies.forEach((e, i) => {
      e.update(dt);
      if (e.x < -120) enemies.splice(i, 1);
    });
  }

  // Draw Entities
  ammoBubbles.forEach(ab => ab.draw());
  buffBubbles.forEach(bb => bb.draw());
  asteroids.forEach(a => a.draw());
  enemies.forEach(e => e.draw());
  if (bossActive && boss) boss.draw();
  player.draw();

  // Draw Peluru Player Laser (Biru)
  ctx.fillStyle = '#38bdf8';
  playerBullets.forEach(b => {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw Peluru Bos Plasma (Merah)
  ctx.fillStyle = '#f43f5e';
  enemyBullets.forEach(eb => {
    ctx.beginPath();
    ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  particles.forEach((p, i) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    if (p.life <= 0) particles.splice(i, 1);
  });

  updateAndDrawFloatingTexts();

  // HUD Spasial
  if (gameState === 'PLAYING' || gameState === 'GAMEOVER') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(10, 10, 620, 50);

    let timeRatio = Math.max(0, timer / MAX_TIMER);
    let barColor = timeRatio > 0.5 ? '#38bdf8' : (timeRatio > 0.25 ? '#facc15' : '#ef4444');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 35, 160, 14);
    ctx.fillStyle = barColor;
    ctx.fillRect(20, 35, 160 * timeRatio, 14);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`WAKTU: ${timer.toFixed(1)}s`, 20, 26);
    ctx.fillText(`AMMO: 🚀 ${player.ammo}`, 190, 26);
    ctx.fillText(`SKOR: ${score}`, 300, 26);
    ctx.fillText(`LVL: ${level + 1}`, 390, 26);

    let hpHearts = '❤️ '.repeat(player.hp).trim() || '💀';
    ctx.fillText(`HP: ${hpHearts}`, 450, 26);

    if (player.shieldTimer > 0) {
      ctx.fillStyle = '#c084fc';
      ctx.fillText(`🛡️ ${Math.ceil(player.shieldTimer)}s`, 540, 26);
    }
  }

  if (screenFlash > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${screenFlash / 20})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    screenFlash--;
  }

  requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', resetGame);
restartBtn.addEventListener('click', resetGame);
requestAnimationFrame(gameLoop);