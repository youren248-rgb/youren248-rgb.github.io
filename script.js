const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)').matches;
const saveData = navigator.connection?.saveData === true;
const root = document.documentElement;
const rootStyle = root.style;

root.classList.toggle('motion-ready', !reduceMotion.matches);

const menu = $('.menu-toggle');
const nav = $('nav');

menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.classList.toggle('active', open);
  menu.setAttribute('aria-expanded', String(open));
});

$$('nav a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menu.classList.remove('active');
  menu.setAttribute('aria-expanded', 'false');
}));

$('#year').textContent = new Date().getFullYear();

const scenePalettes = [
  { r: 97, g: 255, b: 173 },
  { r: 110, g: 225, b: 255 },
  { r: 116, g: 255, b: 205 },
  { r: 211, g: 255, b: 92 },
  { r: 92, g: 139, b: 255 },
  { r: 128, g: 255, b: 189 },
  { r: 215, g: 255, b: 92 },
  { r: 239, g: 255, b: 247 },
];

const pageSections = $$('main > section');
const navLinks = $$('nav a');
const progressBar = $('#progressBar');
let pageProgress = 0;
let scrollEnergy = 0;
let activeSectionIndex = 0;
let lastScrollY = scrollY;
let scrollFrame = 0;
let motionEnabled = !reduceMotion.matches;

pageSections.forEach((section, index) => {
  section.dataset.chapter = String(index).padStart(2, '0');
});

const telemetry = document.createElement('aside');
telemetry.className = 'scroll-telemetry';
telemetry.setAttribute('aria-hidden', 'true');

const telemetryIndex = document.createElement('b');
const telemetryTrack = document.createElement('i');
const telemetryMarker = document.createElement('span');
const telemetryLabel = document.createElement('small');

telemetryTrack.append(telemetryMarker);
telemetry.append(telemetryIndex, telemetryTrack, telemetryLabel);
document.body.append(telemetry);

const parallaxConfig = [
  ['.field-stage', 24],
  ['.exp-visual', 16],
  ['.tutorial-panel', 12],
  ['.qr-card', 14],
];

parallaxConfig.forEach(([selector, amount]) => {
  $$(selector).forEach((item) => {
    item.dataset.parallax = String(amount);
  });
});

const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
  : null;

function splitTitle(title) {
  const label = title.innerText.replace(/\s+/g, ' ').trim();
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  const nodes = [];

  while (walker.nextNode()) nodes.push(walker.currentNode);

  let index = 0;

  nodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    const parts = segmenter
      ? [...segmenter.segment(node.nodeValue)].map((item) => item.segment)
      : [...node.nodeValue];

    parts.forEach((part) => {
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        return;
      }

      const mask = document.createElement('span');
      const character = document.createElement('span');
      mask.className = 'char-mask';
      mask.setAttribute('aria-hidden', 'true');
      character.className = 'char';
      character.style.setProperty('--char-index', String(Math.min(index++, 30)));
      character.textContent = part;
      mask.append(character);
      fragment.append(mask);
    });

    node.replaceWith(fragment);
  });

  title.classList.add('split-title');
  title.setAttribute('aria-label', label);
}

const splitTitles = $$('.section h2, .contact h2');
splitTitles.forEach(splitTitle);

$$('.practice-grid, .focus-cards, .experiment-grid, .tutorial-map').forEach((group) => {
  [...group.children].forEach((item, index) => {
    item.classList.add('reveal');
    item.style.setProperty('--reveal-delay', `${Math.min(index * 75, 225)}ms`);
  });
});

const revealTargets = [...new Set([...$$('.reveal'), ...splitTitles])];
let revealObserver;

function setupRevealObserver() {
  revealObserver?.disconnect();

  if (!motionEnabled || !('IntersectionObserver' in window)) {
    revealTargets.forEach((target) => target.classList.add('visible'));
    return;
  }

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  revealTargets.forEach((target) => {
    if (!target.classList.contains('visible')) revealObserver.observe(target);
  });
}

function sectionLabel(section) {
  return section.querySelector('.section-label span, .overline')?.textContent.trim()
    || section.id.replaceAll('-', ' ').toUpperCase();
}

function setActiveSection(index) {
  activeSectionIndex = index;
  const section = pageSections[index];
  const palette = scenePalettes[index % scenePalettes.length];

  rootStyle.setProperty('--scene-rgb', `${palette.r} ${palette.g} ${palette.b}`);
  telemetryIndex.textContent = String(index).padStart(2, '0');
  telemetryLabel.textContent = sectionLabel(section);

  navLinks.forEach((link) => {
    if (link.getAttribute('href') === `#${section.id}`) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function updateScrollMotion() {
  scrollFrame = 0;

  const viewportHeight = innerHeight;
  const maxScroll = root.scrollHeight - viewportHeight;
  const currentY = scrollY;
  const delta = currentY - lastScrollY;
  const mobileScale = innerWidth <= 760 ? 0.5 : 1;

  pageProgress = maxScroll ? currentY / maxScroll : 0;
  scrollEnergy = Math.min(1, scrollEnergy + Math.abs(delta) / 180);
  lastScrollY = currentY;

  rootStyle.setProperty('--page-progress', pageProgress.toFixed(4));
  rootStyle.setProperty('--bg-y', `${Math.round((pageProgress - 0.5) * -64)}px`);
  progressBar.style.transform = `scaleX(${pageProgress})`;

  const sectionReads = pageSections.map((section) => {
    const rect = section.getBoundingClientRect();
    const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height));
    return { section, rect, progress };
  });

  const parallaxReads = $$('[data-parallax]')
    .map((item) => ({ item, rect: item.getBoundingClientRect() }))
    .filter(({ rect }) => rect.bottom > -viewportHeight * 0.25 && rect.top < viewportHeight * 1.25);

  let nextActive = 0;

  sectionReads.forEach(({ section, rect, progress }, index) => {
    const shift = (0.5 - progress) * 44;
    section.style.setProperty('--chapter-progress', progress.toFixed(4));
    section.style.setProperty('--view-shift', `${shift.toFixed(1)}px`);
    section.style.setProperty('--view-shift-opposite', `${(-shift).toFixed(1)}px`);
    section.style.setProperty('--view-lift', `${(shift * 0.42).toFixed(1)}px`);

    if (rect.top <= viewportHeight * 0.48 && rect.bottom > viewportHeight * 0.28) {
      nextActive = index;
    }
  });

  parallaxReads.forEach(({ item, rect }) => {
    const center = rect.top + rect.height / 2;
    const normalized = clamp(
      (viewportHeight / 2 - center) / (viewportHeight + rect.height),
      -0.5,
      0.5,
    ) * 2;
    const amount = Number(item.dataset.parallax) * mobileScale;
    item.style.setProperty('--parallax-y', `${(normalized * amount).toFixed(1)}px`);
  });

  telemetry.style.setProperty('--telemetry-progress', pageProgress.toFixed(4));

  if (nextActive !== activeSectionIndex || !telemetryLabel.textContent) {
    setActiveSection(nextActive);
  }
}

function scheduleScrollMotion() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollMotion);
}

addEventListener('scroll', scheduleScrollMotion, { passive: true });
addEventListener('resize', scheduleScrollMotion);

const tabs = $$('.protocol-tab');
const panels = $$('.protocol-panel');

tabs.forEach((tab) => tab.addEventListener('click', () => {
  const step = tab.dataset.step;

  tabs.forEach((item) => {
    const active = item === tab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });

  panels.forEach((panel) => {
    const active = panel.dataset.panel === step;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}));

const toast = $('.toast');
const copyTrigger = $('.copy-trigger');

if (copyTrigger) copyTrigger.addEventListener('click', async (event) => {
  const text = event.currentTarget.dataset.copy;

  try {
    await navigator.clipboard.writeText(text);
    toast.textContent = 'PROMPT COPIED';
  } catch {
    toast.textContent = 'SELECT & COPY THE PROMPT';
  }

  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1700);
});

if (finePointer && motionEnabled) {
  const aura = $('.cursor-aura');
  const core = $('.cursor-core');

  addEventListener('pointermove', (event) => {
    aura.style.left = core.style.left = `${event.clientX}px`;
    aura.style.top = core.style.top = `${event.clientY}px`;
  }, { passive: true });

  const stage = $('.field-stage');

  if (stage) {
    stage.addEventListener('pointermove', (event) => {
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      stage.style.transform = `perspective(1000px) rotateX(${y * -3.5}deg) rotateY(${x * 4.5}deg)`;
    });
    stage.addEventListener('pointerleave', () => {
      stage.style.transform = '';
    });
  }
}

const canvas = $('#field');
const context = canvas.getContext('2d', { alpha: true });
const contourSegments = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 0], [1, 2]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 1], [2, 3]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[3, 0]],
  [],
];

let fieldWidth = 0;
let fieldHeight = 0;
let fieldRatio = 1;
let fieldCell = 30;
let fieldColumns = 0;
let fieldRows = 0;
let fieldValues = new Float32Array(0);
let fieldLevels = [-0.62, -0.24, 0.18, 0.58];
let fieldProgress = 0;
let fieldLastFrame = 0;
let fieldFrame = 0;
let fieldStatic = reduceMotion.matches || saveData;
let mobileField = false;
const fieldPalette = { ...scenePalettes[0] };
const fieldPointer = { x: 0, y: 0, influence: 0, target: 0 };

function resizeField() {
  fieldWidth = innerWidth;
  fieldHeight = innerHeight;
  mobileField = fieldWidth <= 760;
  fieldRatio = mobileField ? 1 : Math.min(devicePixelRatio || 1, 1.5);
  fieldCell = mobileField ? 44 : clamp(Math.round(fieldWidth / 58), 26, 36);
  fieldLevels = mobileField ? [-0.42, 0.08, 0.54] : [-0.62, -0.24, 0.18, 0.58];
  fieldColumns = Math.ceil(fieldWidth / fieldCell) + 1;
  fieldRows = Math.ceil(fieldHeight / fieldCell) + 1;
  fieldValues = new Float32Array(fieldColumns * fieldRows);

  canvas.width = Math.round(fieldWidth * fieldRatio);
  canvas.height = Math.round(fieldHeight * fieldRatio);
  canvas.style.width = `${fieldWidth}px`;
  canvas.style.height = `${fieldHeight}px`;
  context.setTransform(fieldRatio, 0, 0, fieldRatio, 0, 0);

  if (fieldStatic) drawContours(0);
}

function sampleField(x, y, time) {
  const scale = Math.min(fieldWidth, fieldHeight);
  const u = (x - fieldWidth * 0.5) / scale;
  const v = (y - fieldHeight * 0.5) / scale;
  const angle = fieldProgress * 1.1 + Math.sin(time * 0.00008) * 0.08;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rx = u * cosine - v * sine;
  const ry = u * sine + v * cosine;

  let value = 0.55 * Math.sin(rx * 7.2 + Math.sin(ry * 3.5 + time * 0.00022) * 1.6)
    + 0.36 * Math.cos(ry * 8.6 - time * 0.00016)
    + 0.23 * Math.sin((rx + ry) * 11.4 + fieldProgress * 14);

  value += scrollEnergy * 0.22 * Math.sin(ry * 24 + time * 0.0008);

  if (fieldPointer.influence > 0.01) {
    const dx = u - fieldPointer.x;
    const dy = v - fieldPointer.y;
    const distance = dx * dx + dy * dy;
    const pull = Math.exp(-distance * 22) * fieldPointer.influence;
    value -= pull * 0.62;
    value += pull * Math.sin(Math.atan2(dy, dx) * 3 + time * 0.0004) * 0.48;
  }

  return value;
}

function interpolate(level, start, end) {
  const difference = end - start;
  return clamp(difference ? (level - start) / difference : 0.5);
}

function edgePoint(edge, x, y, level, values) {
  const [topLeft, topRight, bottomRight, bottomLeft] = values;

  if (edge === 0) {
    return [x + fieldCell * interpolate(level, topLeft, topRight), y];
  }

  if (edge === 1) {
    return [x + fieldCell, y + fieldCell * interpolate(level, topRight, bottomRight)];
  }

  if (edge === 2) {
    return [x + fieldCell * interpolate(level, bottomLeft, bottomRight), y + fieldCell];
  }

  return [x, y + fieldCell * interpolate(level, topLeft, bottomLeft)];
}

function lineColor(levelIndex) {
  if (levelIndex === 0) return `rgba(${fieldPalette.r},${fieldPalette.g},${fieldPalette.b},.16)`;
  if (levelIndex === 1) return 'rgba(71,108,255,.14)';
  if (levelIndex === 2) return 'rgba(215,255,92,.12)';
  return 'rgba(238,255,247,.08)';
}

function drawContours(time) {
  if (!fieldColumns || !fieldRows) return;

  const targetPalette = scenePalettes[activeSectionIndex % scenePalettes.length];
  fieldPalette.r += (targetPalette.r - fieldPalette.r) * 0.035;
  fieldPalette.g += (targetPalette.g - fieldPalette.g) * 0.035;
  fieldPalette.b += (targetPalette.b - fieldPalette.b) * 0.035;

  for (let row = 0; row < fieldRows; row += 1) {
    for (let column = 0; column < fieldColumns; column += 1) {
      fieldValues[row * fieldColumns + column] = sampleField(
        column * fieldCell,
        row * fieldCell,
        time,
      );
    }
  }

  context.clearRect(0, 0, fieldWidth, fieldHeight);
  context.save();
  context.globalCompositeOperation = 'lighter';

  fieldLevels.forEach((level, levelIndex) => {
    context.beginPath();

    for (let row = 0; row < fieldRows - 1; row += 1) {
      for (let column = 0; column < fieldColumns - 1; column += 1) {
        const offset = row * fieldColumns + column;
        const values = [
          fieldValues[offset],
          fieldValues[offset + 1],
          fieldValues[offset + fieldColumns + 1],
          fieldValues[offset + fieldColumns],
        ];
        const state = (values[0] >= level ? 1 : 0)
          | (values[1] >= level ? 2 : 0)
          | (values[2] >= level ? 4 : 0)
          | (values[3] >= level ? 8 : 0);

        contourSegments[state].forEach(([from, to]) => {
          const start = edgePoint(from, column * fieldCell, row * fieldCell, level, values);
          const end = edgePoint(to, column * fieldCell, row * fieldCell, level, values);
          context.moveTo(start[0], start[1]);
          context.lineTo(end[0], end[1]);
        });
      }
    }

    context.strokeStyle = lineColor(levelIndex);
    context.lineWidth = [0.7, 0.9, 1.05, 0.7][levelIndex] || 0.75;
    context.stroke();
  });

  const fractureX = fieldWidth * (0.12 + fieldProgress * 0.76);
  context.beginPath();
  context.setLineDash([1, Math.max(9, 24 - scrollEnergy * 12)]);

  for (let y = -20; y <= fieldHeight + 20; y += 28) {
    const x = fractureX + Math.sin(y * 0.018 + time * 0.0003) * (8 + scrollEnergy * 18);
    if (y === -20) context.moveTo(x, y);
    else context.lineTo(x, y);
  }

  context.strokeStyle = `rgba(${fieldPalette.r},${fieldPalette.g},${fieldPalette.b},${0.1 + scrollEnergy * 0.08})`;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function renderField(time) {
  fieldFrame = 0;
  if (document.hidden || fieldStatic) return;

  const frameInterval = 1000 / (mobileField ? 24 : 40);

  if (time - fieldLastFrame < frameInterval) {
    fieldFrame = requestAnimationFrame(renderField);
    return;
  }

  fieldLastFrame = time;
  fieldProgress += (pageProgress - fieldProgress) * 0.045;
  fieldPointer.influence += (fieldPointer.target - fieldPointer.influence) * 0.08;
  scrollEnergy *= 0.91;
  drawContours(time);
  fieldFrame = requestAnimationFrame(renderField);
}

function startField() {
  if (!fieldStatic && !fieldFrame && !document.hidden) {
    fieldFrame = requestAnimationFrame(renderField);
  }
}

function stopField() {
  if (fieldFrame) cancelAnimationFrame(fieldFrame);
  fieldFrame = 0;
}

if (finePointer) {
  addEventListener('pointermove', (event) => {
    const scale = Math.min(fieldWidth, fieldHeight) || 1;
    fieldPointer.x = (event.clientX - fieldWidth * 0.5) / scale;
    fieldPointer.y = (event.clientY - fieldHeight * 0.5) / scale;
    fieldPointer.target = 1;
  }, { passive: true });

  root.addEventListener('pointerleave', () => {
    fieldPointer.target = 0;
  });
}

addEventListener('resize', resizeField);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopField();
  else startField();
});

reduceMotion.addEventListener?.('change', (event) => {
  motionEnabled = !event.matches;
  fieldStatic = event.matches || saveData;
  root.classList.toggle('motion-ready', motionEnabled);
  setupRevealObserver();
  scheduleScrollMotion();

  if (fieldStatic) {
    stopField();
    fieldProgress = pageProgress;
    drawContours(0);
  } else {
    startField();
  }
});

resizeField();
setupRevealObserver();
setActiveSection(0);
updateScrollMotion();

if (fieldStatic) drawContours(0);
else startField();
