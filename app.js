/* Einfaches top-down Auto mit WASD-Steuerung und Space zum Driften */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

let keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); if (e.code === 'KeyX') registerBoostTap(); });
window.addEventListener('keyup', e => { keys[e.code] = false; });

const hudScore = document.getElementById('score');
const hudSpeed = document.getElementById('speed');
const hudDrift = document.getElementById('drift');
const hudBoost = document.getElementById('boost');

// Car
const car = {
  x: W/2, y: H/2,
  angle: 0,
  vx: 0, vy: 0,
  width: 44, height: 22, radius: 18,
  maxSpeed: 9
};

let score = 0;

// Hütchen (cones)
const cones = [];
const coneRadius = 12;
for (let i=0;i<7;i++){
  // zufällige Positionen, nicht zu nahe am Start
  let cx, cy, ok;
  do{
    cx = 60 + Math.random()*(W-120);
    cy = 60 + Math.random()*(H-120);
    ok = Math.hypot(cx - car.x, cy - car.y) > 120;
  } while(!ok);
  cones.push({x:cx, y:cy, r:coneRadius, lastHit:0});
}

// Partikel & Reifenspuren für bessere Grafik
const particles = [];
const skids = [];
const MAX_PARTICLES = 300;
const skidThreshold = 1.6; // seitliche Geschwindigkeit ab der Spuren entstehen

// Boost (KeyX) Multi-Tap System
let tapCount = 0;
let lastTapTime = 0;
const TAP_WINDOW = 650; // ms allowed between taps to chain
const MAX_TAPS = 5;
let boostActiveUntil = 0;
const BOOST_BASE_IMPULSE = 1.6;
const BOOST_DURATION = 700; // ms of visible boost
const BOOST_MAX_MULT = 3;

function spawnParticle(x,y,dx,dy,color,life){
  if (particles.length > MAX_PARTICLES) return;
  particles.push({x:x,y:y,vx:dx,vy:dy,alpha:1,color:color,life:life,age:0});
}

function updateParticles(dt){
  for (let i = particles.length-1; i >= 0; i--){
    const p = particles[i];
    p.age += dt;
    p.x += p.vx * dt * 0.06;
    p.y += p.vy * dt * 0.06;
    p.alpha = 1 - p.age / p.life;
    if (p.age > p.life) particles.splice(i,1);
  }
}

function addSkid(x,y,intensity){
  skids.push({x:x,y:y,alpha:Math.min(1,intensity),life:1500,age:0});
}

function updateSkids(dt){
  for (let i = skids.length-1; i >= 0; i--){
    const s = skids[i];
    s.age += dt;
    s.alpha = Math.max(0, 1 - s.age / s.life);
    if (s.age > s.life) skids.splice(i,1);
  }
}

// Multi-tap boost registration (KeyX)
function registerBoostTap(){
  const now = Date.now();
  if (now - lastTapTime < TAP_WINDOW) {
    tapCount = Math.min(MAX_TAPS, tapCount + 1);
  } else {
    tapCount = 1;
  }
  lastTapTime = now;
  // immediate impulse forward scaled by tapCount
  const mult = Math.min(BOOST_MAX_MULT, 1 + 0.35 * tapCount);
  car.vx += Math.cos(car.angle) * BOOST_BASE_IMPULSE * mult;
  car.vy += Math.sin(car.angle) * BOOST_BASE_IMPULSE * mult;
  boostActiveUntil = now + BOOST_DURATION;
  // visual feedback particles
  for (let i=0;i<6;i++){
    spawnParticle(car.x - Math.cos(car.angle)*10 + (Math.random()-0.5)*6,
                  car.y - Math.sin(car.angle)*10 + (Math.random()-0.5)*6,
                  -Math.cos(car.angle)*(0.8+Math.random()), -Math.sin(car.angle)*(0.8+Math.random()),
                  'rgba(255,220,90,0.95)', 400 + Math.random()*300);
  }
} 

function update(dt){
  // Steuerung
  const forward = Math.cos(car.angle);
  const forwardY = Math.sin(car.angle);
  const forwardVec = {x: forward, y: forwardY};
  const leftVec = {x: -forwardY, y: forward};

  let thrust = 0;
  if (keys['KeyW']) thrust = 0.36;
  if (keys['KeyS']) thrust = -0.22;

  const isDrifting = !!keys['Space'];
  if (Date.now() - lastTapTime > TAP_WINDOW) tapCount = 0;

  // Wenden: stärkeres Lenken beim Driften, abhängig von Tempo
  let turn = 0;
  if (keys['KeyA']) turn = -1;
  if (keys['KeyD']) turn = 1;
  const speed = Math.hypot(car.vx, car.vy);
  const turnBase = 0.045;
  const driftMultiplier = isDrifting ? 1.9 : 1;
  const turnSpeed = turnBase * driftMultiplier * (0.4 + Math.min(speed / car.maxSpeed, 1));
  car.angle += turn * turnSpeed;
  car.wheelAngle = turn * 0.6; // für Zeichnen

  // Kräfte
  car.vx += forwardVec.x * thrust;
  car.vy += forwardVec.y * thrust;

  // Zerlegen der Geschwindigkeit
  const vF = car.vx * forwardVec.x + car.vy * forwardVec.y;
  const vL = car.vx * leftVec.x + car.vy * leftVec.y;

  // Grip / Traktion: beim Driften mehr seitliches Gleiten, aber mit kontrolliertem 'slide'
  const lateralRetention = isDrifting ? 0.98 : 0.12;
  const forwardDamping = isDrifting ? 0.995 : 0.95;

  const newVx = forwardVec.x * vF + leftVec.x * (vL * lateralRetention);
  const newVy = forwardVec.y * vF + leftVec.y * (vL * lateralRetention);

  car.vx = newVx * forwardDamping;
  car.vy = newVy * forwardDamping;

  // Geschwindigkeit begrenzen + Boost-Multiplikator
  const sp = Math.hypot(car.vx, car.vy);
  const boostActive = Date.now() < boostActiveUntil;
  const mult = boostActive ? Math.min(BOOST_MAX_MULT, 1 + 0.25 * tapCount) : 1;
  const maxSpeedNow = car.maxSpeed * mult;
  if (sp > maxSpeedNow) {
    car.vx = car.vx / sp * maxSpeedNow;
    car.vy = car.vy / sp * maxSpeedNow;
  }

  // Position
  car.x += car.vx;
  car.y += car.vy;

  // Begrenzungen
  if (car.x < 20) { car.x = 20; car.vx *= -0.2; }
  if (car.x > W-20) { car.x = W-20; car.vx *= -0.2; }
  if (car.y < 20) { car.y = 20; car.vy *= -0.2; }
  if (car.y > H-20) { car.y = H-20; car.vy *= -0.2; }

  // Hütchen - Kollision und Drift-Punkte, plus Partikel bei Kontakt
  const now = Date.now();
  for (let c of cones){
    const dx = car.x - c.x, dy = car.y - c.y;
    const d = Math.hypot(dx, dy);
    const minD = car.radius + c.r;
    if (d < minD){
      const overlap = minD - d + 0.5;
      if (d !== 0){
        car.x += (dx / d) * overlap;
        car.y += (dy / d) * overlap;
      }
      car.vx *= 0.5; car.vy *= 0.5;
      // Partikel
      for (let i=0;i<12;i++) spawnParticle(car.x, car.y, (Math.random()-0.5)*4, (Math.random()-0.5)*4, '#e04', 700 + Math.random()*400);
    }
    // Punkte
    if (isDrifting && d < minD + 28 && now - c.lastHit > 650){
      c.lastHit = now;
      score += 1;
      // kleiner Boost für gutes Driften
      car.vx += (Math.cos(car.angle) * 0.6);
      car.vy += (Math.sin(car.angle) * 0.6);
    }
  }

  // Skid & Partikel erzeugen wenn lateral speed groß
  if (Math.abs(vL) > skidThreshold){
    addSkid(car.x - Math.cos(car.angle)*car.height/2, car.y - Math.sin(car.angle)*car.height/2, Math.min(2, Math.abs(vL)));
    // Partikel: Rauch
    for (let i=0;i<2;i++) spawnParticle(car.x - Math.cos(car.angle)*car.height/2 + (Math.random()-0.5)*8,
      car.y - Math.sin(car.angle)*car.height/2 + (Math.random()-0.5)*8,
      (Math.random()-0.5)*1.6, (Math.random()-0.5)*1.6, 'rgba(40,40,40,0.9)', 700 + Math.random()*600);
  }

  // Update kleine Systeme
  updateParticles(dt);
  updateSkids(dt);

  // HUD
  hudScore.textContent = 'Punkte: ' + score;
  hudSpeed.textContent = 'Speed: ' + Math.round(sp*12);
  hudDrift.textContent = 'Drift: ' + (isDrifting ? '✅' : '❌') + ' (' + Math.abs(Math.round(vL*10)) + ')';
  const boostActiveNow = Date.now() < boostActiveUntil;
  if (hudBoost) hudBoost.textContent = 'Boost: x' + (boostActiveNow ? ((1 + 0.25 * Math.min(tapCount, MAX_TAPS)).toFixed(2)) : '1') + ((Date.now() - lastTapTime) < TAP_WINDOW ? ' ('+tapCount+')' : '');
}

function draw(){
  ctx.clearRect(0,0,W,H);

  // Boden - leichter Verlauf
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#30323a'); g.addColorStop(1,'#1f2126');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  // Raster
  ctx.strokeStyle = 'rgba(255,255,255,0.02)';
  ctx.lineWidth = 1;
  const grid = 60;
  for (let x=0;x<W;x+=grid){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y=0;y<H;y+=grid){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Reifenspuren
  for (let s of skids){
    ctx.globalAlpha = s.alpha * 0.9;
    ctx.fillStyle = '#0b0b0b';
    ctx.beginPath(); ctx.arc(s.x, s.y, 3 + s.alpha*3, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Hütchen - schöner
  for (let c of cones){
    ctx.save(); ctx.translate(c.x, c.y);
    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, c.r+6, c.r*0.9, c.r*0.35, 0, 0, Math.PI*2); ctx.fill();
    // Cone
    ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(0, -c.r); ctx.lineTo(c.r, c.r); ctx.lineTo(-c.r, c.r); ctx.closePath(); ctx.fill();
    // weiße Streifen
    ctx.fillStyle = '#fff'; ctx.fillRect(-c.r*0.4, -6, c.r*0.8, 6);
    ctx.restore();
  }

  // Partikel (Rauch, Kollision)
  for (let p of particles){
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (1-p.alpha)*3, 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Boost-Glow
  if (Date.now() < boostActiveUntil){
    ctx.save();
    ctx.globalAlpha = 0.08 + 0.03 * Math.min(tapCount, MAX_TAPS);
    ctx.fillStyle = '#ffd674';
    ctx.beginPath();
    ctx.ellipse(car.x - Math.cos(car.angle)*8, car.y - Math.sin(car.angle)*8, car.width*0.9*(1+tapCount*0.14), car.height*0.9*(1+tapCount*0.12), car.angle, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // Auto mit besserer Grafik
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // weicher Schatten
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(4, 8, car.width*0.6, car.height*0.6, 0,0,Math.PI*2); ctx.fill();

  // Karosserie (Gradient)
  const cg = ctx.createLinearGradient(-car.width/2, -car.height/2, car.width/2, car.height/2);
  cg.addColorStop(0, '#1fb3c0'); cg.addColorStop(1, '#0b7f88');
  ctx.fillStyle = cg; roundRect(ctx, -car.width/2, -car.height/2, car.width, car.height, 6); ctx.fill();

  // Fenster
  ctx.fillStyle = 'rgba(7,24,36,0.9)'; roundRect(ctx, -10, -car.height/2 + 3, 20, car.height/2 - 4, 3); ctx.fill();

  // Räder (vorn leicht eingelenkt)
  const wheelW = 8, wheelH = 4;
  // vorne rechts
  ctx.save(); ctx.translate(car.width/4, -car.height/2 + 6); ctx.rotate(car.wheelAngle); ctx.fillStyle = '#111'; roundRect(ctx, -wheelW/2, -wheelH/2, wheelW, wheelH, 1); ctx.fill(); ctx.restore();
  // vorne links
  ctx.save(); ctx.translate(car.width/4, car.height/2 - 6); ctx.rotate(car.wheelAngle); ctx.fillStyle = '#111'; roundRect(ctx, -wheelW/2, -wheelH/2, wheelW, wheelH, 1); ctx.fill(); ctx.restore();
  // hinten
  ctx.fillStyle = '#111'; roundRect(ctx, -car.width/4, -car.height/2 + 6, wheelW, wheelH, 1); ctx.fill();
  roundRect(ctx, -car.width/4, car.height/2 - 6, wheelW, wheelH, 1); ctx.fill();

  // Highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; roundRect(ctx, -car.width/2+2, -car.height/2+2, car.width-4, car.height-4, 5); ctx.stroke();

  ctx.restore();

  // Anleitung / HUD Box
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(W-260, H-140, 240, 120);
  ctx.fillStyle = '#eee'; ctx.font = '13px Segoe UI';
  ctx.fillText('Controls: W/A/S/D - Fahrt | Space - Drift', W-250, H-116);
  ctx.fillText('Drifte um Punkte an Hütchen zu sammeln', W-250, H-96);
}

// kleine Hilfsfunktion: gerundetes Rechteck
function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath();
}


let last = 0;
function loop(ts){
  if (!last) last = ts;
  const dt = ts - last;
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
