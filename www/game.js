/*
 * Firefly Run — game logic
 * ========================
 *
 * HOW THE GAME WORKS (big picture)
 * --------------------------------
 * Everything is drawn on one <canvas>. The browser calls `frame()` about
 * 60 times a second (via requestAnimationFrame). Each frame does two things:
 *
 *   1. update(dt) — move everything forward in time by `dt` seconds
 *                   (rain falls, player moves, check collisions, add score)
 *   2. draw()     — wipe the canvas and paint the current scene from scratch
 *
 * This "update then draw, forever" pattern is called a GAME LOOP.
 *
 * The game has three states, stored in the `state` variable:
 *   'menu'    — start card is showing, nothing to play yet
 *   'playing' — the run is live
 *   'over'    — you got hit; the game-over card appears after a short delay
 *
 * The HTML overlays (#startScreen, #overScreen, #hud) are plain DOM elements
 * on top of the canvas. We show/hide them by toggling their `hidden` property.
 *
 * WHY THE WHOLE FILE IS WRAPPED IN (() => { ... })();
 * ----------------------------------------------------
 * That's an IIFE ("Immediately Invoked Function Expression"). It runs right
 * away and keeps all our variables private, so names like `score` or `state`
 * don't leak onto the global `window` object and clash with anything else.
 */
(() => {
  // ---------------------------------------------------------------------------
  // SETUP
  // ---------------------------------------------------------------------------

  // The canvas element and its 2D drawing context (the "pen" we draw with).
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');

  // Tiny helper so we can write $('score') instead of document.getElementById('score').
  const $ = id => document.getElementById(id);

  // Respect the user's OS setting "reduce motion": if on, we use fewer
  // particles and skip screen shake.
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // CANVAS SIZING
  // ---------------------------------------------------------------------------
  // W, H  = canvas size in CSS pixels (what we use for all game math)
  // DPR   = device pixel ratio (2 on most phones / Retina screens)
  //
  // On a Retina screen, a 400px-wide canvas is really 800 physical pixels.
  // If we only gave the canvas 400 pixels of storage it would look blurry.
  // So we make the canvas's internal buffer W*DPR by H*DPR pixels, then
  // `setTransform(DPR, ...)` scales all drawing by DPR. Result: we keep
  // thinking in CSS pixels, but the output is sharp. DPR is capped at 2 to
  // avoid wasting performance on 3x screens.
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Keep the firefly near the bottom (80% down) if the window changes size.
    if (player) player.y = H * 0.8;
  }

  // ---------------------------------------------------------------------------
  // BEST SCORE (saved in the browser)
  // ---------------------------------------------------------------------------
  // localStorage keeps data between visits. It's wrapped in try/catch because
  // some browsers (private mode, blocked storage) throw an error when you touch
  // it — in that case the game still works, it just won't remember your best.
  // The `+` in front of getItem converts the stored string to a number;
  // `|| 0` falls back to 0 if nothing was saved yet (null -> 0).
  let best = 0;
  try { best = +localStorage.getItem('firefly-best') || 0; } catch (e) { }
  function saveBest() { try { localStorage.setItem('firefly-best', best); } catch (e) { } }

  // ---------------------------------------------------------------------------
  // GAME STATE
  // ---------------------------------------------------------------------------
  // state   — 'menu' | 'playing' | 'over'
  // score   — current score (a float; we show Math.floor of it)
  // t       — seconds survived in this run (drives difficulty)
  // last    — timestamp of the previous frame, used to compute dt
  let state = 'menu', score = 0, t = 0, last = 0;

  // player  — the firefly: { x, y, r (radius), vx (horizontal speed) }
  // drops   — dangerous raindrops you must dodge
  // pollen  — glowing pickups worth +25
  // sparks  — little particles for explosions / pickup effects
  // bgDrops — faint decorative rain streaks in the background (harmless)
  let player, drops = [], pollen = [], sparks = [], bgDrops = [];

  // targetX — where the firefly is trying to move to (set by pointer/keys).
  //           The firefly eases toward it instead of teleporting.
  // keys    — which arrow keys are currently held down
  let targetX = 0, keys = { left: false, right: false };

  // spawnTimer  — countdown (seconds) until the next raindrop appears
  // pollenTimer — countdown until the next pollen appears
  // shake       — current screen-shake strength in pixels (fades to 0)
  let spawnTimer = 0, pollenTimer = 0, shake = 0;

  // Put everything back to the starting values for a fresh run.
  function reset() {
    player = { x: W / 2, y: H * 0.8, r: 11, vx: 0 };
    targetX = W / 2;
    drops = []; pollen = []; sparks = [];
    // First drop after 0.6s, first pollen after 2s — a short grace period.
    score = 0; t = 0; spawnTimer = 0.6; pollenTimer = 2;
  }

  // Create the decorative background rain. Each streak has:
  //   x, y — position, l — length, s — falling speed (px/sec)
  function makeBg() {
    bgDrops = [];
    const n = reduce ? 25 : 70;
    for (let i = 0; i < n; i++) bgDrops.push({ x: Math.random() * W, y: Math.random() * H, l: 6 + Math.random() * 10, s: 120 + Math.random() * 160 });
  }

  // ---------------------------------------------------------------------------
  // DIFFICULTY
  // ---------------------------------------------------------------------------
  // Both depend on `t` (seconds survived), so the game gets harder over time.
  //   speed()    — raindrop fall speed: starts at 230 px/s, +9 px/s every second
  //   interval() — seconds between drops: starts at 0.7s, shrinks by 0.012s
  //                every second, but never goes below 0.16s
  const speed = () => 230 + t * 9;
  const interval = () => Math.max(0.16, 0.7 - t * 0.012);

  // ---------------------------------------------------------------------------
  // SPAWNING THINGS
  // ---------------------------------------------------------------------------

  // Add a raindrop just above the top of the screen (y = -30) at a random x.
  // r = size; v = its fall speed (base speed with ±random variation so drops
  // don't all fall in lockstep).
  function spawnDrop() {
    const r = 6 + Math.random() * 5;
    drops.push({ x: r + Math.random() * (W - 2 * r), y: -30, r, v: speed() * (0.85 + Math.random() * 0.35) });
  }

  // Add a pollen pickup. It falls slower than rain (55% speed).
  // `ph` = phase, a random starting angle used to make it sway side to side
  // and pulse; 6.28 ≈ 2π (one full circle).
  function spawnPollen() {
    pollen.push({ x: 20 + Math.random() * (W - 40), y: -20, v: speed() * 0.55, ph: Math.random() * 6.28 });
  }

  // Particle explosion: spawn `n` sparks at (x, y) flying in random directions.
  // For each spark we pick a random angle `a` and speed `s`, then split it into
  // horizontal (cos) and vertical (sin) velocity. `life` counts down to 0.
  function burst(x, y, color, n) {
    if (reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color });
    }
  }

  // ---------------------------------------------------------------------------
  // INPUT
  // ---------------------------------------------------------------------------
  // "Pointer" events cover mouse, touch, and pen with a single API.
  // We only care about the horizontal position: the firefly follows your
  // finger/mouse left and right.
  function pointer(e) {
    if (state !== 'playing') return;
    targetX = e.clientX;
  }
  cv.addEventListener('pointerdown', e => { pointer(e); });
  // Follow movement if: a button/finger is pressed, OR it's touch/pen,
  // OR we're playing (so a mouse can steer just by hovering).
  window.addEventListener('pointermove', e => { if (e.buttons || e.pointerType !== 'mouse' || state === 'playing') pointer(e); });

  // Keyboard: remember which keys are held. The actual movement happens in
  // update(), so holding a key moves smoothly every frame.
  // Space / Enter starts the game from the menu or game-over screen.
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if ((e.key === ' ' || e.key === 'Enter') && state !== 'playing') { e.preventDefault(); start(); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  // ---------------------------------------------------------------------------
  // STARTING AND ENDING A RUN
  // ---------------------------------------------------------------------------

  function start() {
    reset();
    state = 'playing';
    // Hide the cards, show the score bar.
    $('startScreen').hidden = true; $('overScreen').hidden = true; $('hud').hidden = false;
    $('bestHud').textContent = best;
    // Ask the phone not to dim/lock the screen while playing (if supported).
    // Wrapped in try/catch and .catch() because it can fail silently.
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => { }); } catch (e) { }
  }

  function gameOver() {
    state = 'over';
    shake = reduce ? 0 : 12;               // kick off screen shake
    burst(player.x, player.y, '#7fb4ff', 30); // blue "splash" where the firefly was
    const s = Math.floor(score);
    const isNew = s > best;
    if (isNew) { best = s; saveBest(); }
    // Fill in the game-over card.
    $('finalScore').textContent = s;
    $('finalBest').textContent = best;
    $('finalBest').classList.toggle('new', isNew); // highlight best in yellow if new
    $('overTitle').textContent = isNew ? 'New best!' : 'Doused!';
    $('overNote').textContent = isNew ? 'Brightest firefly in the meadow.' : 'The rain gets heavier the longer you last.';
    // Wait ~0.5s so the player sees the splash before the card covers it,
    // then focus the button so Enter/Space works right away.
    setTimeout(() => { $('overScreen').hidden = false; $('againBtn').focus({ preventScroll: true }); }, 550);
  }
  $('playBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);

  // ---------------------------------------------------------------------------
  // UPDATE — advance the world by dt seconds
  // ---------------------------------------------------------------------------
  // Key idea: every movement is "speed * dt". If speed is 200 px/s and dt is
  // 0.016s (one frame at 60fps), the object moves 3.2px this frame. This makes
  // the game run at the same real-world speed on 60Hz and 120Hz screens.
  function update(dt) {
    // Background rain always falls (even on menus). When a streak goes off the
    // bottom, recycle it back to the top at a new random x.
    for (const b of bgDrops) { b.y += b.s * dt; if (b.y > H + 20) { b.y = -20; b.x = Math.random() * W; } }

    // Move sparks, apply gravity (vy grows by 260 px/s every second), age them,
    // and drop the dead ones.
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt; s.life -= dt; }
    sparks = sparks.filter(s => s.life > 0);

    // Screen shake fades out at 40 px per second.
    if (shake > 0) shake = Math.max(0, shake - 40 * dt);

    // Everything below only happens during an active run.
    if (state !== 'playing') return;
    t += dt;
    score += dt * 10; // 10 points per second survived

    // --- Player movement ---
    // Keys nudge the target left/right at 520 px/s.
    if (keys.left) targetX -= 520 * dt;
    if (keys.right) targetX += 520 * dt;
    // Clamp the target so the firefly can't leave the screen.
    targetX = Math.max(player.r, Math.min(W - player.r, targetX));
    // Ease toward the target: each frame, close a fraction of the remaining gap.
    // This gives a smooth, slightly floaty feel instead of instant snapping.
    const prev = player.x;
    player.x += (targetX - player.x) * Math.min(1, dt * 14);
    // Horizontal velocity — only used for tilting the firefly when drawing.
    // (1e-4 guards against dividing by zero.)
    player.vx = (player.x - prev) / Math.max(dt, 1e-4);

    // --- Spawning ---
    // Count timers down; when they hit 0, spawn and reset the timer.
    spawnTimer -= dt;
    // After 20 seconds there's a 30% chance of a bonus second drop.
    if (spawnTimer <= 0) { spawnDrop(); if (t > 20 && Math.random() < 0.3) spawnDrop(); spawnTimer = interval(); }
    pollenTimer -= dt;
    if (pollenTimer <= 0) { spawnPollen(); pollenTimer = 2.5 + Math.random() * 2.5; }

    // --- Raindrops: move + collide ---
    for (const d of drops) {
      d.y += d.v * dt;
      // Circle-vs-circle collision: two circles overlap when the distance
      // between centers is less than the sum of their radii. We compare the
      // SQUARED distance to avoid a slow Math.sqrt. The 0.85 / 0.8 factors
      // shrink the hitboxes a bit so near-misses feel fair.
      const dx = d.x - player.x, dy = d.y - player.y, rr = d.r * 0.85 + player.r * 0.8;
      if (dx * dx + dy * dy < rr * rr) { gameOver(); return; }
    }
    // Remove drops that have fallen off the bottom.
    drops = drops.filter(d => d.y < H + 40);

    // --- Pollen: move (with a sideways sine-wave sway) + collect ---
    for (const p of pollen) {
      p.y += p.v * dt; p.ph += dt * 3; p.x += Math.sin(p.ph) * 30 * dt;
      const dx = p.x - player.x, dy = p.y - player.y;
      // Within 26px = collected. Mark it, add points, yellow sparkle.
      if (dx * dx + dy * dy < 26 * 26) { p.got = true; score += 25; burst(p.x, p.y, '#ffd45c', 14); }
    }
    // Remove collected pollen and pollen that fell off screen.
    pollen = pollen.filter(p => !p.got && p.y < H + 30);

    // Update the score shown in the HUD.
    $('score').textContent = Math.floor(score);
  }

  // ---------------------------------------------------------------------------
  // DRAWING
  // ---------------------------------------------------------------------------

  // Draws one teardrop shape: a pointed top made from two curves, and a round
  // bottom made from a half circle. (x, y) is the center of the round part.
  //   moveTo            — start at the tip (above the center)
  //   quadraticCurveTo  — curve down the right side to the circle's edge
  //   arc(0 → π)        — half circle around the bottom, right to left
  //   quadraticCurveTo  — curve back up the left side to the tip
  function drawDrop(x, y, r, alpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.6);
    ctx.quadraticCurveTo(x + r * 1.05, y - r * 0.4, x + r, y);
    ctx.arc(x, y, r, 0, Math.PI);
    ctx.quadraticCurveTo(x - r * 1.05, y - r * 0.4, x, y - r * 2.6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Paints the whole scene. Order matters: things drawn later appear on top.
  // (Note: `arc(..., 0, 7)` is used as shorthand for a full circle, since
  // 7 > 2π ≈ 6.28.)
  function draw() {
    // save()/restore() snapshot the canvas settings so the shake offset below
    // doesn't permanently move everything.
    ctx.save();
    // Screen shake: offset the whole drawing by a small random amount.
    if (shake) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

    // 1. Sky — a vertical gradient. Drawn slightly larger than the screen
    //    (-20 / +40) so screen shake never reveals the edges.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1220'); g.addColorStop(1, '#16243f');
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);

    // 2. Distant rain streaks — all added to ONE path and stroked once,
    //    which is much faster than stroking 70 separate lines.
    ctx.strokeStyle = 'rgba(127,180,255,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const b of bgDrops) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 1, b.y + b.l); }
    ctx.stroke();

    // 3. Grass silhouette along the bottom — a zigzag of blades.
    //    `(x * 7) % 17` gives a fixed pseudo-random height per blade, so the
    //    grass looks irregular but doesn't flicker between frames.
    ctx.fillStyle = '#081019';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 14) { ctx.lineTo(x, H - 26 - ((x * 7) % 17)); ctx.lineTo(x + 7, H - 14); }
    ctx.lineTo(W, H); ctx.fill();

    // 4. Pollen — a soft pulsing glow (radial gradient fading to transparent)
    //    with a small bright core on top.
    for (const p of pollen) {
      const pulse = 1 + Math.sin(p.ph * 2) * 0.15;
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18 * pulse);
      rg.addColorStop(0, 'rgba(255,212,92,0.9)'); rg.addColorStop(1, 'rgba(255,212,92,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, 18 * pulse, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill();
    }

    // 5. Raindrops — blue teardrops, then a tiny white highlight on each
    //    to make them look glossy.
    ctx.fillStyle = '#7fb4ff';
    for (const d of drops) drawDrop(d.x, d.y, d.r, 0.92);
    ctx.fillStyle = 'rgba(232,238,252,0.7)';
    for (const d of drops) { ctx.beginPath(); ctx.arc(d.x - d.r * 0.35, d.y - d.r * 0.3, d.r * 0.22, 0, 7); ctx.fill(); }

    // 6. The firefly (hidden once you've been hit).
    if (player && state !== 'over') {
      const now = performance.now() / 1000; // current time in seconds, for animation

      // Glow halo that gently breathes (radius oscillates ±6px).
      const glowR = 46 + Math.sin(now * 4) * 6;
      const rg = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, glowR);
      rg.addColorStop(0, 'rgba(255,212,92,0.55)'); rg.addColorStop(1, 'rgba(255,212,92,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(player.x, player.y, glowR, 0, 7); ctx.fill();

      // Tilt the body in the direction of movement (max ±0.5 radians ≈ 29°).
      // translate + rotate means we can now draw the firefly as if it's at
      // (0, 0) and upright; the canvas handles positioning and rotation.
      const tilt = Math.max(-0.5, Math.min(0.5, player.vx / 1400));
      ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(tilt);

      // Wings — two translucent ellipses that flap quickly (sin of time * 40).
      const flap = Math.sin(now * 40) * 0.35;
      ctx.fillStyle = 'rgba(232,238,252,0.55)';
      ctx.beginPath(); ctx.ellipse(-8, -9, 9, 5, -0.6 + flap, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, -9, 9, 5, 0.6 - flap, 0, 7); ctx.fill();

      // Body (dark), glowing lantern abdomen (yellow), and a little shine dot.
      ctx.fillStyle = '#2a2f45'; ctx.beginPath(); ctx.ellipse(0, -4, 5, 7, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd45c'; ctx.beginPath(); ctx.ellipse(0, 6, 7, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(-2, 4, 2.5, 0, 7); ctx.fill();
      ctx.restore(); // undo the translate/rotate
    }

    // 7. Sparks — fade out as their life runs down (alpha = life / max).
    for (const s of sparks) {
      ctx.globalAlpha = Math.max(0, s.life / s.max);
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(s.x, s.y, 2.4, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore(); // undo the screen-shake translate
  }

  // ---------------------------------------------------------------------------
  // THE GAME LOOP
  // ---------------------------------------------------------------------------
  // requestAnimationFrame calls `frame` right before the browser repaints,
  // passing a high-precision timestamp in milliseconds.
  function frame(now) {
    // dt = seconds since last frame. Capped at 0.033 (~30fps) so that if the
    // browser stutters, things don't jump huge distances in one step (which
    // could let a raindrop skip straight through the player).
    // `|| 0` handles the NaN case on the very first call.
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    update(dt); draw();
    requestAnimationFrame(frame); // schedule the next frame -> infinite loop
  }

  // ---------------------------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------------------------
  resize(); reset(); makeBg();
  $('bestStart').textContent = best;
  // Re-fit the canvas (and regenerate background rain) when the window resizes.
  window.addEventListener('resize', () => { resize(); makeBg(); });
  // When you switch tabs, rAF pauses. On return, reset `last` so the first dt
  // isn't a huge gap (it would be capped anyway, but this keeps it clean).
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  // Kick off the loop. The first callback just records the start time.
  requestAnimationFrame(t0 => { last = t0; frame(t0); });
})();
