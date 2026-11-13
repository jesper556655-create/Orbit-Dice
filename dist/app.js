import { createAchievementsController } from './achievements-ui.mjs?v=4';

(() => {
  'use strict';
  const die = document.querySelector('#diceModel');
  const announcement = document.querySelector('#rollAnnouncement');
  const planet = document.querySelector('#planetSecret');
  const panel = document.querySelector('#rollStats');
  const closeStats = document.querySelector('#statsClose');
  const modelError = document.querySelector('#modelError');
  const scene = document.querySelector('.scene');
  const rocket = document.querySelector('.rocket-flight');
  const orbitPlanets = Array.from(document.querySelectorAll('.orbit-planet'));
  const starShoots = Array.from(document.querySelectorAll('.shooting-star'));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'orbit-dice-visit-v1';

  // The mesh has a baked 22° yaw. model-viewer parses these as Z, X, Y
  // rotations in YXZ order. Each pose makes its numbered face point exactly up.
  const landingAngles = {
    1: [-90, -22, 0],
    2: [180, 0, 0],
    3: [90, -68, 0],
    4: [-90, 68, 0],
    5: [0, 0, 0],
    6: [90, 22, 0]
  };
  let ready = false;
  let pendingRoll = false;
  let spinning = false;
  let planetOrbitFrame = 0;
  let starOrder = [];
  // A restored or duplicated tab can inherit sessionStorage. Resume only a reload
  // or a background tab that the browser discarded to free memory.
  const resume = performance.getEntriesByType('navigation')[0]?.type === 'reload' || document.wasDiscarded;
  if (!resume) {
    try {
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem('orbit-dice-achievements-v1');
    } catch (_) {}
  }
  let stats = readStats();
  let orientation = stats.last ? landingAngles[stats.last].slice() : [0, 0, 0];
  const bins = Array.from({ length: 6 }, (_, index) => {
    const row = document.createElement('li');
    const label = document.createElement('span');
    const track = document.createElement('span');
    const bar = document.createElement('i');
    const count = document.createElement('strong');
    label.textContent = String(index + 1);
    track.className = 'stats-bar';
    track.append(bar);
    row.append(label, track, count);
    document.querySelector('#statCounts').append(row);
    return { row, bar, count };
  });
  const achievements = createAchievementsController({
    trigger: document.querySelector('#rocketAchievements'),
    scene: document.querySelector('.scene'),
    priorCounts: stats.counts,
    onOpen: () => setStatsOpen(false, { restoreFocus: false })
  });

  function readStats() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved && Array.isArray(saved.counts) && saved.counts.length === 6 &&
          saved.counts.every(n => Number.isSafeInteger(n) && n >= 0) &&
          Number.isSafeInteger(saved.last) && saved.last >= 1 && saved.last <= 6) {
        return { counts: saved.counts, last: saved.last };
      }
    } catch (_) { /* A blocked or cleared store should not prevent rolling. */ }
    return { counts: [0, 0, 0, 0, 0, 0], last: null };
  }

  function renderStats() {
    const total = stats.counts.reduce((sum, n) => sum + n, 0);
    const highest = Math.max(...stats.counts);
    document.querySelector('#statTotal').textContent = String(total);
    bins.forEach(({ row, bar, count }, index) => {
      count.textContent = String(stats.counts[index]);
      bar.style.width = highest ? `${stats.counts[index] / highest * 100}%` : '0%';
      row.setAttribute('aria-label', `${index + 1}: ${stats.counts[index]} rolls`);
    });
  }

  function setStatsOpen(open, { restoreFocus = true } = {}) {
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    planet.setAttribute('aria-expanded', String(open));
    if (open) closeStats.focus({ preventScroll: true });
    else if (restoreFocus) planet.focus({ preventScroll: true });
  }

  function setOrientation(value) {
    die.setAttribute('orientation', value.map(angle => `${angle.toFixed(3)}deg`).join(' '));
  }

  function describeResult(value) {
    die.setAttribute('alt', `Red die showing ${value} on its upward face`);
  }

  function randomInt(limit) {
    const sample = new Uint32Array(1);
    const ceiling = Math.floor(0x100000000 / limit) * limit;
    do { crypto.getRandomValues(sample); } while (sample[0] >= ceiling);
    return sample[0] % limit;
  }

  function roll() {
    if (spinning || achievements.isOpen() || !panel.hidden || !modelError.hidden) return;
    if (!ready) { pendingRoll = true; return; }
    spinning = true;
    const result = randomInt(6) + 1;
    const target = landingAngles[result].slice();
    // Yaw is applied last, so it changes the view without changing the upward face.
    target[2] = randomInt(4) * 90;
    const start = orientation.slice();
    const end = target.map(angle => angle + (1 + randomInt(2)) * 360);
    const duration = reducedMotion.matches ? 160 : 1650 + randomInt(250);
    const startTime = performance.now();

    function finish() {
      const previousResult = stats.last;
      orientation = target;
      setOrientation(orientation);
      stats.counts[result - 1] += 1;
      stats.last = result;
      try { sessionStorage.setItem(storageKey, JSON.stringify(stats)); } catch (_) {}
      renderStats();
      describeResult(result);
      const total = stats.counts.reduce((sum, n) => sum + n, 0);
      announcement.textContent = `Roll ${total}: ${result}.`;
      spinning = false;
      achievements.recordRoll(result);
      if (result === 6 && previousResult === 6) startPlanetOrbit();
    }
    function animate(now) {
      const progress = Math.min(1, (now - startTime) / duration);
      if (progress === 1) { finish(); return; }
      if (!reducedMotion.matches) {
        // Quintic easing starts and ends at rest, with no abrupt snap into the landing.
        const eased = progress ** 3 * (progress * (progress * 6 - 15) + 10);
        setOrientation(start.map((angle, axis) => angle + (end[axis] - angle) * eased));
      }
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  function onModelLoad() {
    ready = true;
    modelError.hidden = true;
    setOrientation(orientation);
    if (stats.last) describeResult(stats.last);
    if (pendingRoll) { pendingRoll = false; roll(); }
  }
  die.addEventListener('load', onModelLoad);
  die.addEventListener('error', () => {
    ready = false;
    pendingRoll = false;
    modelError.hidden = false;
  });
  document.querySelector('#retryModel').addEventListener('click', () => {
    modelError.hidden = true;
    die.src = `./dice.glb?retry=${Date.now()}`;
  });
  customElements.whenDefined('model-viewer').then(() => { if (die.loaded) onModelLoad(); });

  function layoutScene() {
    const { width, height } = scene.getBoundingClientRect();
    const anchorX = width < height ? .93 : .5;
    const anchorY = width / height > 2 ? 0 : .5;
    document.documentElement.style.setProperty('--bg-x', `${anchorX * 100}%`);
    document.documentElement.style.setProperty('--bg-y', `${anchorY * 100}%`);
    const scale = Math.max(width / 1710, height / 920);
    const planetX = (width - 1710 * scale) * anchorX + 1408 * scale;
    const planetY = (height - 920 * scale) * anchorY + 89 * scale;
    const diameter = Math.max(44, 145 * scale);
    Object.assign(planet.style, { left: `${planetX}px`, top: `${planetY}px`, width: `${diameter}px`, height: `${diameter}px` });
    orbitPlanets.forEach(item => {
      const sourceX = Number(item.dataset.sourceX);
      const sourceY = Number(item.dataset.sourceY);
      const size = Number(item.dataset.sourceSize);
      const x = (width - 1710 * scale) * anchorX + (sourceX + size / 2) * scale;
      const y = (height - 920 * scale) * anchorY + (sourceY + size / 2) * scale;
      Object.assign(item.style, { left: `${x}px`, top: `${y}px`, width: `${size * scale}px`, height: `${size * scale}px` });
    });
    const rocketWidth = rocket.offsetWidth;
    const x0 = -rocketWidth * 1.8;
    const x1 = width + rocketWidth * 1.8;
    const y0 = height * .78;
    const y1 = height * .12;
    const angle = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    const duration = Math.max(60, Math.min(130, Math.hypot(x1 - x0, y1 - y0) / 22));
    const values = { '--rocket-start-x': `${x0}px`, '--rocket-end-x': `${x1}px`, '--rocket-start-y': `${y0}px`, '--rocket-end-y': `${y1}px`, '--rocket-angle': `${angle + 38.3}deg`, '--rocket-duration': `${duration}s`, '--rocket-delay': `${-duration * .25}s` };
    Object.entries(values).forEach(([key, value]) => rocket.style.setProperty(key, value));
  }

  function startPlanetOrbit() {
    if (reducedMotion.matches || planetOrbitFrame || orbitPlanets.length !== 2) return;
    const scene = document.querySelector('.scene');
    const { width, height } = scene.getBoundingClientRect();
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = Math.min(width * .39, 590);
    const radiusY = Math.min(height * .36, 285);
    const planets = orbitPlanets.map(element => {
      const x = parseFloat(element.style.left) || centerX;
      const y = parseFloat(element.style.top) || centerY;
      element.classList.add('is-spinning');
      return { element, angle: Math.atan2((y - centerY) / radiusY, (x - centerX) / radiusX) };
    });
    const startTime = performance.now();

    function animatePlanets(now) {
      const progress = Math.min(1, (now - startTime) / 7000);
      planets.forEach(({ element, angle }) => {
        const currentAngle = angle + progress * Math.PI * 14;
        const depth = Math.sin(currentAngle);
        element.style.left = `${centerX + Math.cos(currentAngle) * radiusX}px`;
        element.style.top = `${centerY + Math.sin(currentAngle) * radiusY}px`;
        element.style.setProperty('--orbit-scale', String(.82 + (depth + 1) * .11));
        element.style.setProperty('--orbit-shadow', String(.58 + (depth + 1) * .16));
        element.style.zIndex = depth > 0 ? '4' : '2';
      });
      if (progress < 1) {
        planetOrbitFrame = requestAnimationFrame(animatePlanets);
        return;
      }
      planetOrbitFrame = 0;
      planets.forEach(({ element }) => {
        element.classList.remove('is-spinning');
        element.style.removeProperty('--orbit-scale');
        element.style.removeProperty('--orbit-shadow');
        element.style.removeProperty('z-index');
      });
      layoutScene();
    }
    planetOrbitFrame = requestAnimationFrame(animatePlanets);
  }

  function scheduleStarShoot() {
    if (reducedMotion.matches) return;
    window.setTimeout(launchStarShoot, 10000 + randomInt(20001));
  }

  function launchStarShoot() {
    if (reducedMotion.matches || document.hidden || starShoots.length !== 10) {
      scheduleStarShoot();
      return;
    }
    if (!starOrder.length) {
      starOrder = starShoots.slice();
      for (let i = starOrder.length - 1; i > 0; i -= 1) {
        const j = randomInt(i + 1);
        [starOrder[i], starOrder[j]] = [starOrder[j], starOrder[i]];
      }
    }
    const star = starOrder.pop();
    const { width, height } = scene.getBoundingClientRect();
    const fromLeft = randomInt(2) === 0;
    const starWidth = star.getBoundingClientRect().width;
    const startX = fromLeft ? -starWidth - 30 : width + 30;
    const endX = fromLeft ? width + 30 : -starWidth - 30;
    const duration = 2 + randomInt(1801) / 1000;
    star.style.left = `${startX}px`;
    star.style.top = `${40 + randomInt(Math.max(1, Math.floor(height - 80)))}px`;
    star.style.setProperty('--shoot-distance', `${endX - startX}px`);
    star.style.setProperty('--shoot-distance-early', `${(endX - startX) * .12}px`);
    star.style.setProperty('--shoot-duration', `${duration}s`);
    star.style.setProperty('--shoot-angle', `${randomInt(57) - 28}deg`);
    star.classList.toggle('to-left', !fromLeft);
    star.classList.remove('is-active');
    void star.offsetWidth;
    star.classList.add('is-active');
    scheduleStarShoot();
  }

  new ResizeObserver(layoutScene).observe(scene);
  document.addEventListener('visibilitychange', () => document.documentElement.toggleAttribute('data-paused', document.hidden));
  planet.addEventListener('click', () => setStatsOpen(panel.hidden));
  closeStats.addEventListener('click', () => setStatsOpen(false));
  document.addEventListener('click', event => {
    if (achievements.isOpen()) return;
    if (event.target.closest('button, a, #rollStats, input, textarea, select, [contenteditable="true"]')) return;
    if (!panel.hidden) { setStatsOpen(false); return; }
    roll();
  });
  document.addEventListener('keydown', event => {
    if (achievements.isOpen()) return;
    if (event.code === 'Escape' && !panel.hidden) { setStatsOpen(false); return; }
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.composedPath().some(node => node instanceof Element && node.matches('button, a, input, textarea, select, [contenteditable="true"]'))) return;
    event.preventDefault();
    roll();
  });
  setOrientation(orientation);
  renderStats();
  layoutScene();
  scheduleStarShoot();
})();
