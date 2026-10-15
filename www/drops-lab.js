/*
 * DROPS LAB — a playground for learning how the falling drops work.
 * =================================================================
 * This is a stripped-down copy of the drop logic from game.js:
 * no firefly, no score — just drops. Open drops-lab.html in your browser.
 *
 *   - Drops spawn on a timer at the top.
 *   - CLICK anywhere to spawn a drop exactly where you clicked.
 *   - Each drop shows its own y and v numbers so you can watch the data change.
 *   - The top-left shows how many drops are in the `drops` array right now.
 *
 * HOW TO EXPERIMENT: change ONE setting below, save, refresh the browser.
 *
 * Try these, one at a time (put the value back after each):
 *
 *   1. FALL_SPEED = 30          -> drops crawl; watch y grow a little each frame
 *   2. SPAWN_EVERY = 0.1        -> heavy rain; watch the "drops in array" count
 *   3. SPAWN_EVERY = 999        -> no automatic drops; only your clicks make drops
 *   4. GRAVITY = 400            -> drops start slow and speed up (watch v grow)
 *   5. WIND = 80                -> drops drift sideways (x changes too now)
 *   6. REMOVE_OFFSCREEN = false -> drops are never deleted; the count only grows
 *   7. CLEAR_EACH_FRAME = false -> no erasing; every frame smears on top of the
 *                                  last one. This shows why draw() repaints the sky.
 *   8. RANDOM_SPEED = false     -> every drop falls at exactly the same speed
 */

// ---------------------------------------------------------------------------
// SETTINGS — change these and refresh
// ---------------------------------------------------------------------------
const FALL_SPEED = 150;         // pixels per second a new drop starts with
const RANDOM_SPEED = true;      // give each drop a slightly different speed?
const SPAWN_EVERY = 0.8;        // seconds between automatic drops
const DROP_SIZE = 10;           // radius in pixels
const GRAVITY = 0;              // speed added every second (0 = constant speed)
const WIND = 0;                 // sideways pixels per second (+ right, - left)
const REMOVE_OFFSCREEN = true;  // delete drops after they leave the bottom?
const CLEAR_EACH_FRAME = true;  // repaint the background every frame?
const SHOW_NUMBERS = true;      // draw y / v next to each drop?

// ---------------------------------------------------------------------------
// CANVAS SETUP (same idea as resize() in game.js, simplified)
// ---------------------------------------------------------------------------
const cv = document.getElementById('lab');
const ctx = cv.getContext('2d');
let W = 0, H = 0;
function resize() {
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
resize();
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// THE DATA: every drop is just an object in this array
// ---------------------------------------------------------------------------
let drops = [];
let spawnTimer = 0;   // counts down to the next automatic drop
let last = 0;         // time of the previous frame

// Create one drop. If x / y aren't given, use a random x at the top.
function spawnDrop(x, y) {
  const v = RANDOM_SPEED ? FALL_SPEED * (0.85 + Math.random() * 0.35) : FALL_SPEED;
  drops.push({
    x: x ?? DROP_SIZE + Math.random() * (W - 2 * DROP_SIZE),
    y: y ?? -30,        // -30 = just above the screen, so it slides in
    r: DROP_SIZE,
    v                   // fall speed (pixels per second)
  });
}

// Click to place a drop by hand.
cv.addEventListener('pointerdown', e => spawnDrop(e.clientX, e.clientY));

// ---------------------------------------------------------------------------
// UPDATE: change the numbers (no drawing here)
// ---------------------------------------------------------------------------
function update(dt) {
  // 1. Timer: count down, spawn when it hits zero, start counting again.
  spawnTimer -= dt;
  if (spawnTimer <= 0) { spawnDrop(); spawnTimer = SPAWN_EVERY; }

  // 2. Move every drop.
  for (const d of drops) {
    d.v += GRAVITY * dt;   // gravity changes the SPEED...
    d.y += d.v * dt;       // ...speed changes the POSITION (this is the falling)
    d.x += WIND * dt;      // wind pushes sideways
  }

  // 3. Throw away drops that are below the screen.
  if (REMOVE_OFFSCREEN) drops = drops.filter(d => d.y < H + 40);
}

// ---------------------------------------------------------------------------
// DRAW: paint a picture of the current numbers
// ---------------------------------------------------------------------------
// Same teardrop shape as game.js.
function drawDrop(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2.6);                                     // tip
  ctx.quadraticCurveTo(x + r * 1.05, y - r * 0.4, x + r, y);      // right side
  ctx.arc(x, y, r, 0, Math.PI);                                   // round bottom
  ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.4, x, y - r * 2.6); // left side
  ctx.fill();
}

function draw() {
  // Erase the previous frame by painting the background over everything.
  if (CLEAR_EACH_FRAME) { ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, W, H); }

  ctx.fillStyle = '#7fb4ff';
  for (const d of drops) drawDrop(d.x, d.y, d.r);

  // Label each drop with its data.
  if (SHOW_NUMBERS) {
    ctx.fillStyle = '#8a9bc4'; ctx.font = '11px ui-monospace, Menlo, monospace';
    for (const d of drops) ctx.fillText(`y ${d.y.toFixed(0)}  v ${d.v.toFixed(0)}`, d.x + d.r + 6, d.y + 4);
  }

  // Info panel.
  ctx.fillStyle = '#0b1220'; ctx.fillRect(8, 8, 270, 46);
  ctx.fillStyle = '#ffd45c'; ctx.font = '14px ui-monospace, Menlo, monospace';
  ctx.fillText(`drops in array: ${drops.length}`, 16, 28);
  ctx.fillStyle = '#8a9bc4'; ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText('click anywhere to add a drop', 16, 46);
}

// ---------------------------------------------------------------------------
// THE LOOP: update numbers, draw them, ask for the next frame. Forever.
// ---------------------------------------------------------------------------
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000 || 0);  // seconds since last frame
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(t0 => { last = t0; frame(t0); });
