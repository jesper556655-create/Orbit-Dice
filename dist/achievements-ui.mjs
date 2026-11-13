import {
  ACHIEVEMENTS, createAchievementState, restoreAchievementState,
  recordAchievementRoll, recordMenuOpen, getAchievementProgress
} from './achievements-state.mjs';

const STORAGE_KEY = 'orbit-dice-achievements-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  orbit: '<circle cx="12" cy="12" r="4.5"/><ellipse cx="12" cy="12" rx="10" ry="3.8" transform="rotate(-30 12 12)"/><path d="m18 2 .6 1.8L20.5 4l-1.9.7L18 6.5l-.6-1.8L15.5 4l1.9-.2Z"/>',
  galaxy: '<path d="M12 12c-4-5 4-10 8-5 5 6-5 15-12 11C1 14 4 5 10 4M12 12c4 5-4 10-8 5-5-6 5-15 12-11"/><circle cx="12" cy="12" r="1.2"/>',
  spark: '<path d="m9 3 1.8 5.2L16 10l-5.2 1.8L9 17l-1.8-5.2L2 10l5.2-1.8Zm9 10 1.1 3.9L23 18l-3.9 1.1L18 23l-1.1-3.9L13 18l3.9-1.1Z"/>',
  planet: '<circle cx="12" cy="12" r="5.3"/><path d="M3 9c-4 4 1 9 9 9s13-5 9-9M5 5l1 1M19 5l-1 1M3 15l2-1M21 15l-2-1"/>',
  comet: '<circle cx="16.5" cy="16.5" r="4.5"/><path d="m3 3 10 10M3 9l8 5M9 3l5 8M5 16l4 1M16 5l1 4"/>',
  rocket: '<path d="M9 15c-1-5 2-10 10-12 0 8-3 13-8 14l-2-2Zm0-4-4 1-2 5 6-2M14 17l-1 4 5-2 1-6M6 18l-3 3M8 20l-1 2"/><circle cx="15" cy="8" r="2"/>',
  moon: '<path d="M19.5 15.8A8.5 8.5 0 0 1 8.2 4.5 8.6 8.6 0 1 0 19.5 15.8Z"/><path d="M14 3v3M12.5 4.5h3M20 8v2M19 9h2"/>',
  satellite: '<path d="m9 9 6 6M8 7l3-3 9 9-3 3ZM4 11l3-3 9 9-3 3ZM10 16l-2 3M5 22l3-3M17 7l2-2M20 2l2 2M2 3h3M3.5 1.5v3"/>',
  constellation: '<path d="m5 6 7 13 7-14M5 6l14-1"/><circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="12" cy="19" r="2.5"/>',
  station: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7Z"/><path d="M8 9h8v7H8ZM8 12H3.3M16 12h4.7M12 9V5M12 16v6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>'
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // These paths are fixed project artwork, never saved or user-supplied content.
  svg.innerHTML = ICONS[name] ?? ICONS.orbit;
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function progressLabel(id, current, target) {
  if (id === 'space-cadet' || id === 'galactic-gambler') return `${current} / ${target} rolls`;
  if (id === 'perfect-balance') return `${current} / ${target} numbers found`;
  return `Best streak: ${current} / ${target}`;
}

export function createAchievementsController({ trigger, scene, priorCounts, onOpen }) {
  const dialog = document.querySelector('#achievementsDialog');
  const closeButton = document.querySelector('#achievementsClose');
  const list = document.querySelector('#achievementsList');
  const persistenceNote = document.querySelector('#achievementsPersistence');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let state;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    state = saved === null ? createAchievementState(priorCounts) : restoreAchievementState(saved);
  } catch (_) {
    state = createAchievementState(priorCounts);
  }
  let closing = false;
  let closeTimer = 0;
  let pointerStartedOutside = false;
  const cards = new Map();

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistenceNote.textContent = 'Progress lasts for this tab.';
    } catch (_) {
      persistenceNote.textContent = 'Progress is available for this session.';
    }
  }

  for (const definition of ACHIEVEMENTS) {
    const card = element('li', 'achievement-card');
    card.dataset.achievementId = definition.id;
    const artwork = element('div', 'achievement-icon');
    artwork.append(icon(definition.icon));
    const content = element('div', 'achievement-content');
    const titleRow = element('div', 'achievement-title-row');
    const title = element('h3', '', definition.title);
    const status = element('span', 'achievement-state');
    const description = element('p', 'achievement-description', definition.description);
    const progress = element('div', 'achievement-progress');
    const track = element('div', 'achievement-track');
    const fill = element('i');
    const label = element('span', 'achievement-progress-label');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `${definition.title} progress`);
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(definition.target));
    track.append(fill);
    progress.append(track, label);
    progress.hidden = definition.id === 'rocket-scientist';
    titleRow.append(title, status);
    content.append(titleRow, description, progress);
    card.append(artwork, content);
    list.append(card);
    cards.set(definition.id, { card, status, track, fill, label });
  }

  function render() {
    let completed = 0;
    for (const definition of ACHIEVEMENTS) {
      const { card, status, track, fill, label } = cards.get(definition.id);
      const unlocked = Boolean(state.unlocked[definition.id]);
      const { current, target } = getAchievementProgress(state, definition.id);
      completed += Number(unlocked);
      if (unlocked) list.append(card);
      card.dataset.unlocked = String(unlocked);
      status.replaceChildren(icon(unlocked ? 'check' : 'lock'), element('span', '', unlocked ? 'Unlocked' : 'Locked'));
      fill.style.width = `${current / target * 100}%`;
      label.textContent = progressLabel(definition.id, current, target);
      track.setAttribute('aria-valuenow', String(current));
      track.setAttribute('aria-valuetext', label.textContent);
    }
    document.querySelector('#achievementsSummary').textContent = `${completed} / ${ACHIEVEMENTS.length} unlocked`;
    document.querySelector('#achievementsOverallProgress').style.width = `${completed / ACHIEVEMENTS.length * 100}%`;
  }

  function open() {
    if (dialog.open || closing) return;
    onOpen?.();
    delete dialog.dataset.closing;
    dialog.showModal();
    dialog.scrollTop = 0;
    trigger.setAttribute('aria-expanded', 'true');
    closeButton.focus({ preventScroll: true });
    recordMenuOpen(state);
    persist();
    render();
  }

  function close() {
    if (!dialog.open || closing) return;
    closing = true;
    dialog.dataset.closing = 'true';
    const finish = () => dialog.close();
    if (reducedMotion.matches) finish();
    else closeTimer = setTimeout(finish, 200);
  }

  function outside(event) {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  }
  trigger.addEventListener('click', event => { event.stopPropagation(); open(); });
  closeButton.addEventListener('click', event => { event.stopPropagation(); close(); });
  dialog.addEventListener('pointerdown', event => {
    pointerStartedOutside = event.target === dialog && outside(event);
  });
  dialog.addEventListener('click', event => {
    event.stopPropagation();
    if (pointerStartedOutside && event.target === dialog && outside(event)) close();
    pointerStartedOutside = false;
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    clearTimeout(closeTimer);
    closing = false;
    delete dialog.dataset.closing;
    trigger.setAttribute('aria-expanded', 'false');
    const rect = trigger.getBoundingClientRect();
    const visible = rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
    (visible ? trigger : scene).focus({ preventScroll: true });
  });
  new IntersectionObserver(([entry]) => {
    trigger.tabIndex = entry.isIntersecting ? 0 : -1;
    if (!entry.isIntersecting && document.activeElement === trigger) scene.focus({ preventScroll: true });
  }).observe(trigger);

  persist();
  return {
    isOpen: () => dialog.open,
    recordRoll(value) {
      recordAchievementRoll(state, value);
      persist();
      if (dialog.open) render();
    }
  };
}
