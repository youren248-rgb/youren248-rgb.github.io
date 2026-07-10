const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)').matches;
const saveData = navigator.connection?.saveData === true;
const root = document.documentElement;
const rootStyle = root.style;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const previewVersion = new URLSearchParams(location.search).has('v');

function resetInitialScroll() {
  const previousBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  scrollTo(0, 0);
  root.style.scrollBehavior = previousBehavior;
}

if (previewVersion) history.replaceState(null, '', location.pathname);
if (previewVersion || !location.hash) {
  requestAnimationFrame(resetInitialScroll);
  addEventListener('pageshow', resetInitialScroll, { once: true });
}

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
  { r: 255, g: 174, b: 92 },
  { r: 137, g: 154, b: 255 },
  { r: 239, g: 226, b: 204 },
  { r: 255, g: 190, b: 116 },
  { r: 255, g: 161, b: 72 },
  { r: 121, g: 143, b: 255 },
  { r: 255, g: 207, b: 143 },
  { r: 245, g: 241, b: 232 },
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

const carousel = $('[data-carousel]');

if (carousel) {
  const slides = $$('.work-slide', carousel);
  const slideTabs = $$('[data-carousel-go]', carousel);
  const counter = $('.work-counter b', carousel);
  const previous = $('[data-carousel-prev]', carousel);
  const next = $('[data-carousel-next]', carousel);
  let currentSlide = 0;
  let carouselTimer = 0;
  let carouselVisible = false;
  let carouselPaused = false;
  let touchStartX = null;

  function stopCarousel() {
    clearTimeout(carouselTimer);
    carouselTimer = 0;
    carousel.classList.remove('cycling');
  }

  function startCarousel() {
    stopCarousel();
    if (reduceMotion.matches || carouselPaused || !carouselVisible) return;

    requestAnimationFrame(() => {
      carousel.classList.add('cycling');
      carouselTimer = setTimeout(() => showSlide(currentSlide + 1), 7000);
    });
  }

  function showSlide(index) {
    currentSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === currentSlide;
      slide.classList.toggle('active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });

    slideTabs.forEach((tab, tabIndex) => {
      const active = tabIndex === currentSlide;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });

    counter.textContent = String(currentSlide + 1).padStart(2, '0');
    startCarousel();
  }

  previous.addEventListener('click', () => showSlide(currentSlide - 1));
  next.addEventListener('click', () => showSlide(currentSlide + 1));
  slideTabs.forEach((tab) => tab.addEventListener('click', () => {
    showSlide(Number(tab.dataset.carouselGo));
  }));

  carousel.addEventListener('mouseenter', () => {
    carouselPaused = true;
    stopCarousel();
  });
  carousel.addEventListener('mouseleave', () => {
    carouselPaused = false;
    startCarousel();
  });
  carousel.addEventListener('focusin', () => {
    carouselPaused = true;
    stopCarousel();
  });
  carousel.addEventListener('focusout', () => {
    carouselPaused = false;
    startCarousel();
  });
  carousel.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') touchStartX = event.clientX;
  }, { passive: true });
  carousel.addEventListener('pointerup', (event) => {
    if (touchStartX === null) return;
    const distance = event.clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(distance) > 42) showSlide(currentSlide + (distance < 0 ? 1 : -1));
  }, { passive: true });

  const carouselObserver = new IntersectionObserver(([entry]) => {
    carouselVisible = entry.isIntersecting;
    if (carouselVisible) startCarousel();
    else stopCarousel();
  }, { threshold: 0.3 });

  carouselObserver.observe(carousel);
  reduceMotion.addEventListener?.('change', startCarousel);
  showSlide(0);
}

const canvas = $('#field');
const context = canvas.getContext('2d', { alpha: true });
let cosmicWidth = 0;
let cosmicHeight = 0;
let cosmicRatio = 1;
let cosmicMobile = false;
let cosmicStars = [];
let cosmicFrame = 0;
let cosmicLastFrame = 0;
let cosmicStatic = reduceMotion.matches || saveData;
const cosmicPointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

function createCosmicStars() {
  const count = cosmicMobile ? 90 : Math.min(260, Math.floor(cosmicWidth / 5));
  const maximumRadius = Math.hypot(cosmicWidth, cosmicHeight) * 0.72;

  cosmicStars = Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: (0.08 + Math.pow(Math.random(), 0.66) * 0.92) * maximumRadius,
    depth: 0.18 + Math.random() * 0.82,
    size: 0.35 + Math.random() * 1.25,
    speed: (Math.random() - 0.5) * 0.000025,
    phase: Math.random() * Math.PI * 2,
    color: Math.random(),
  }));
}

function resizeCosmos() {
  cosmicWidth = innerWidth;
  cosmicHeight = innerHeight;
  cosmicMobile = cosmicWidth <= 760;
  cosmicRatio = cosmicMobile ? 1 : Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(cosmicWidth * cosmicRatio);
  canvas.height = Math.round(cosmicHeight * cosmicRatio);
  canvas.style.width = `${cosmicWidth}px`;
  canvas.style.height = `${cosmicHeight}px`;
  context.setTransform(cosmicRatio, 0, 0, cosmicRatio, 0, 0);
  createCosmicStars();

  if (cosmicStatic) drawCosmos(0);
}

function cosmicColor(star, alpha) {
  if (star.color < 0.14) return `rgba(118,140,255,${alpha})`;
  if (star.color < 0.38) return `rgba(255,174,92,${alpha})`;
  return `rgba(245,241,232,${alpha})`;
}

function drawCosmos(time) {
  if (!cosmicWidth || !cosmicHeight) return;

  const base = Math.min(cosmicWidth, cosmicHeight);
  const palette = scenePalettes[activeSectionIndex % scenePalettes.length];
  const lensX = cosmicWidth * (cosmicMobile ? 0.64 : 0.72)
    + cosmicPointer.x * cosmicWidth * 0.035;
  const lensY = cosmicHeight * 0.42
    + cosmicPointer.y * cosmicHeight * 0.028
    + Math.sin(time * 0.00008) * base * 0.015;
  const rotation = -0.18 + pageProgress * 0.7;

  context.clearRect(0, 0, cosmicWidth, cosmicHeight);
  context.save();
  context.globalCompositeOperation = 'screen';

  cosmicStars.forEach((star) => {
    const angle = star.angle + time * star.speed + pageProgress * (0.24 + star.depth * 0.58);
    const radius = star.radius * (0.96 + Math.sin(time * 0.00017 + star.phase) * 0.035);
    const x = lensX + Math.cos(angle) * radius;
    const y = lensY + Math.sin(angle) * radius * 0.58;
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle) * 0.58;
    const trail = 0.6 + scrollEnergy * 24 * star.depth;
    const alpha = (0.16 + star.depth * 0.48) * (0.82 + Math.sin(time * 0.001 + star.phase) * 0.18);

    context.beginPath();
    context.moveTo(x - tangentX * trail, y - tangentY * trail);
    context.lineTo(x + tangentX * star.size, y + tangentY * star.size);
    context.strokeStyle = cosmicColor(star, alpha);
    context.lineWidth = star.size * (0.55 + star.depth * 0.55);
    context.stroke();
  });

  context.translate(lensX, lensY);
  context.rotate(rotation);
  context.scale(1, 0.58);

  for (let index = 0; index < 7; index += 1) {
    const radius = base * (0.23 + index * 0.115);
    const start = -1.35 + index * 0.37 + Math.sin(time * 0.00008 + index) * 0.12;
    const end = start + 1.45 + index * 0.08;

    context.beginPath();
    context.arc(0, 0, radius, start, end);
    context.setLineDash([radius * 0.34, radius * 0.11]);
    context.lineDashOffset = -time * 0.003 * (index % 2 ? 1 : -1);
    context.strokeStyle = index % 3 === 0
      ? `rgba(${palette.r},${palette.g},${palette.b},.18)`
      : index % 3 === 1
        ? 'rgba(255,174,92,.15)'
        : 'rgba(118,140,255,.13)';
    context.lineWidth = index === 1 ? 1.3 : 0.75;
    context.stroke();
  }

  context.setLineDash([]);
  const beam = context.createLinearGradient(-base * 1.1, 0, base * 1.1, 0);
  beam.addColorStop(0, 'rgba(255,174,92,0)');
  beam.addColorStop(0.42, 'rgba(255,174,92,.04)');
  beam.addColorStop(0.5, 'rgba(245,241,232,.34)');
  beam.addColorStop(0.58, 'rgba(118,140,255,.05)');
  beam.addColorStop(1, 'rgba(118,140,255,0)');
  context.fillStyle = beam;
  context.fillRect(-base * 1.15, -0.8, base * 2.3, 1.6);
  context.restore();

  const horizon = context.createRadialGradient(
    lensX,
    lensY,
    base * 0.075,
    lensX,
    lensY,
    base * 0.34,
  );
  horizon.addColorStop(0, 'rgba(0,0,0,.94)');
  horizon.addColorStop(0.24, 'rgba(0,0,0,.9)');
  horizon.addColorStop(0.29, 'rgba(255,174,92,.1)');
  horizon.addColorStop(0.42, 'rgba(118,140,255,.025)');
  horizon.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = horizon;
  context.fillRect(
    lensX - base * 0.36,
    lensY - base * 0.36,
    base * 0.72,
    base * 0.72,
  );
}

function renderCosmos(time) {
  cosmicFrame = 0;
  if (document.hidden || cosmicStatic) return;

  const frameInterval = 1000 / (cosmicMobile ? 24 : 40);

  if (time - cosmicLastFrame < frameInterval) {
    cosmicFrame = requestAnimationFrame(renderCosmos);
    return;
  }

  cosmicLastFrame = time;
  cosmicPointer.x += (cosmicPointer.targetX - cosmicPointer.x) * 0.035;
  cosmicPointer.y += (cosmicPointer.targetY - cosmicPointer.y) * 0.035;
  scrollEnergy *= 0.91;
  drawCosmos(time);
  cosmicFrame = requestAnimationFrame(renderCosmos);
}

function startCosmos() {
  if (!cosmicStatic && !cosmicFrame && !document.hidden) {
    cosmicFrame = requestAnimationFrame(renderCosmos);
  }
}

function stopCosmos() {
  if (cosmicFrame) cancelAnimationFrame(cosmicFrame);
  cosmicFrame = 0;
}

if (finePointer) {
  addEventListener('pointermove', (event) => {
    cosmicPointer.targetX = clamp(event.clientX / Math.max(cosmicWidth, 1) - 0.5, -0.5, 0.5);
    cosmicPointer.targetY = clamp(event.clientY / Math.max(cosmicHeight, 1) - 0.5, -0.5, 0.5);
  }, { passive: true });

  root.addEventListener('pointerleave', () => {
    cosmicPointer.targetX = 0;
    cosmicPointer.targetY = 0;
  });
}

addEventListener('resize', resizeCosmos);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCosmos();
  else startCosmos();
});

reduceMotion.addEventListener?.('change', (event) => {
  motionEnabled = !event.matches;
  cosmicStatic = event.matches || saveData;
  root.classList.toggle('motion-ready', motionEnabled);
  setupRevealObserver();
  scheduleScrollMotion();

  if (cosmicStatic) {
    stopCosmos();
    drawCosmos(0);
  } else {
    startCosmos();
  }
});

resizeCosmos();
setupRevealObserver();
setActiveSection(0);
updateScrollMotion();

if (cosmicStatic) drawCosmos(0);
else startCosmos();
