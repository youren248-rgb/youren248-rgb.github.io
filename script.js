'use strict';

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (value) => value * value * (3 - 2 * value);

const root = document.documentElement;
const rootStyle = root.style;
const body = document.body;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)').matches;
const saveData = navigator.connection?.saveData === true;

/* Keep previews and fresh visits at the origin while respecting deliberate hashes. */
const initialUrl = new URL(location.href);
const isVersionPreview = initialUrl.searchParams.has('v');
const initialHash = isVersionPreview ? '' : initialUrl.hash.slice(1);
const forceCanvas2D = initialUrl.searchParams.get('renderer') === '2d';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (isVersionPreview) history.replaceState(null, '', initialUrl.pathname);

function alignInitialPosition() {
  const behavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';

  if (initialHash) {
    document.getElementById(initialHash)?.scrollIntoView({ block: 'start' });
  } else {
    scrollTo(0, 0);
  }

  root.style.scrollBehavior = behavior;
}

requestAnimationFrame(() => requestAnimationFrame(alignInitialPosition));
addEventListener('pageshow', alignInitialPosition, { once: true });
addEventListener('load', () => requestAnimationFrame(alignInitialPosition), { once: true });
setTimeout(alignInitialPosition, 120);

/* Navigation */
const menu = $('.menu-toggle');
const navigation = $('nav');

function closeMenu() {
  if (!menu || !navigation) return;
  navigation.classList.remove('open');
  menu.classList.remove('active');
  menu.setAttribute('aria-expanded', 'false');
}

menu?.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menu.classList.toggle('active', open);
  menu.setAttribute('aria-expanded', String(open));
});

$$('nav a').forEach((link) => link.addEventListener('click', closeMenu));
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const year = $('#year');
if (year) year.textContent = String(new Date().getFullYear());

/* Reveal choreography */
const revealTargets = $$('.reveal');
let revealObserver;

function setupRevealObserver() {
  revealObserver?.disconnect();

  if (motionQuery.matches || !('IntersectionObserver' in window)) {
    revealTargets.forEach((target) => target.classList.add('visible'));
    return;
  }

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -7% 0px' });

  revealTargets.forEach((target, index) => {
    target.style.setProperty('--reveal-order', String(index % 5));
    if (!target.classList.contains('visible')) revealObserver.observe(target);
  });
}

setupRevealObserver();

/* Cosmos scene controller */
const canvas = $('[data-cosmos]');
let cosmos = null;
const cosmosState = {
  pointerX: 0,
  pointerY: 0,
  pointerActive: 0,
  pointerShock: 0,
  scrollProgress: 0,
  scrollVelocity: 0,
  scene: 0,
  nextScene: 0,
  sceneMix: 0,
};

function createCosmos() {
  cosmos?.destroy?.();
  cosmos = null;

  if (!canvas || !globalThis.GoodMoodCosmos?.create) return;

  cosmos = globalThis.GoodMoodCosmos.create(canvas, {
    reducedMotion: motionQuery.matches,
    static: motionQuery.matches || saveData,
    quality: 'auto',
    autoInput: false,
    autoResize: false,
    autoPause: false,
    forceCanvas2D,
    onReady: ({ mode }) => { body.dataset.cosmosRenderer = mode; },
    onQualityChange: ({ quality }) => { body.dataset.cosmosQuality = String(quality); },
    onContextLost: () => { body.dataset.cosmosState = 'lost'; },
    onContextRestored: () => { body.dataset.cosmosState = 'ready'; },
    onError: ({ phase, error }) => console.error(`[GOODMOOD COSMOS / ${phase}]`, error),
  });
  body.dataset.cosmosRenderer = cosmos?.mode || 'unavailable';
  body.dataset.cosmosState = 'ready';
  cosmos?.setInput?.(cosmosState);
}

createCosmos();

const sceneSections = $$('[data-cosmos-scene]');
const navLinks = $$('nav a');
const progressBar = $('#progressBar');
let activeSection = -1;
let lastScrollY = scrollY;
let lastScrollTime = performance.now();
let scrollFrame = 0;
let inputFrame = 0;

function sceneLabel(section) {
  return section?.id || 'home';
}

function feedCosmos() {
  cosmos?.setInput?.(cosmosState);
  rootStyle.setProperty('--pointer-x', cosmosState.pointerX.toFixed(4));
  rootStyle.setProperty('--pointer-y', cosmosState.pointerY.toFixed(4));
  rootStyle.setProperty('--scroll-velocity', cosmosState.scrollVelocity.toFixed(4));
}

function decayInput() {
  inputFrame = 0;
  cosmosState.scrollVelocity *= 0.86;
  cosmosState.pointerShock *= 0.9;
  feedCosmos();

  if (Math.abs(cosmosState.scrollVelocity) > 0.006 || cosmosState.pointerShock > 0.01) {
    inputFrame = requestAnimationFrame(decayInput);
  }
}

function scheduleInputDecay() {
  if (!inputFrame) inputFrame = requestAnimationFrame(decayInput);
}

function updateScrollState() {
  scrollFrame = 0;
  const viewportHeight = innerHeight;
  const maxScroll = Math.max(1, root.scrollHeight - viewportHeight);
  const currentY = scrollY;
  const currentTime = performance.now();
  const elapsed = Math.max(16, currentTime - lastScrollTime);
  const delta = currentY - lastScrollY;
  const normalizedVelocity = clamp((delta / elapsed) * 0.22, -1.4, 1.4);

  cosmosState.scrollProgress = clamp(currentY / maxScroll);
  cosmosState.scrollVelocity += (normalizedVelocity - cosmosState.scrollVelocity) * 0.5;
  lastScrollY = currentY;
  lastScrollTime = currentTime;

  rootStyle.setProperty('--page-progress', cosmosState.scrollProgress.toFixed(4));
  progressBar?.style.setProperty('transform', `scaleX(${cosmosState.scrollProgress})`);

  const reads = sceneSections.map((section) => {
    const rect = section.getBoundingClientRect();
    const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height));
    section.style.setProperty('--section-progress', progress.toFixed(4));
    section.classList.toggle(
      'is-near',
      rect.bottom > -viewportHeight * 0.3 && rect.top < viewportHeight * 1.3,
    );
    return { section, rect, progress };
  });

  if (reads.length) {
    let nextActive = 0;
    reads.forEach(({ rect }, index) => {
      if (rect.top <= viewportHeight * 0.52) nextActive = index;
    });

    const current = reads[nextActive];
    const following = reads[Math.min(nextActive + 1, reads.length - 1)];
    const currentScene = Number(current?.section.dataset.cosmosScene || 0);
    const followingScene = Number(following?.section.dataset.cosmosScene || currentScene);
    const transition = current
      ? smoothstep(clamp((current.progress - 0.56) / 0.36))
      : 0;

    cosmosState.scene = currentScene;
    cosmosState.nextScene = followingScene;
    cosmosState.sceneMix = followingScene === currentScene ? 0 : transition;

    if (nextActive !== activeSection) {
      activeSection = nextActive;
      sceneSections.forEach(({ classList }, index) => classList.toggle('is-current', index === nextActive));
      const activeId = sceneLabel(sceneSections[nextActive]);
      navLinks.forEach((link) => {
        if (link.getAttribute('href') === `#${activeId}`) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
  }

  feedCosmos();
  scheduleInputDecay();
}

function scheduleScrollState() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollState);
}

addEventListener('scroll', scheduleScrollState, { passive: true });
addEventListener('resize', () => {
  cosmos?.resize?.();
  scheduleScrollState();
}, { passive: true });

/* Pointer gravity, touch shockwave, and cursor orbit */
const cursorAura = $('.cursor-aura');
const cursorCore = $('.cursor-core');
const cursor = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
let cursorFrame = 0;

function renderCursor() {
  cursorFrame = 0;
  cursor.x += (cursor.tx - cursor.x) * 0.16;
  cursor.y += (cursor.ty - cursor.y) * 0.16;
  cursorAura?.style.setProperty('transform', `translate3d(${cursor.x}px, ${cursor.y}px, 0) translate(-50%, -50%)`);
  cursorCore?.style.setProperty('transform', `translate3d(${cursor.tx}px, ${cursor.ty}px, 0) translate(-50%, -50%)`);

  if (Math.abs(cursor.tx - cursor.x) > 0.25 || Math.abs(cursor.ty - cursor.y) > 0.25) {
    cursorFrame = requestAnimationFrame(renderCursor);
  }
}

function updatePointer(event) {
  cursor.tx = event.clientX;
  cursor.ty = event.clientY;
  cosmosState.pointerX = clamp(event.clientX / Math.max(innerWidth, 1) - 0.5, -0.5, 0.5) * 2;
  cosmosState.pointerY = clamp(0.5 - event.clientY / Math.max(innerHeight, 1), -0.5, 0.5) * 2;
  cosmosState.pointerActive = 1;
  feedCosmos();

  if (finePointer && !cursorFrame) cursorFrame = requestAnimationFrame(renderCursor);
}

addEventListener('pointermove', updatePointer, { passive: true });
addEventListener('pointerdown', (event) => {
  updatePointer(event);
  cosmosState.pointerShock = 1;
  body.classList.remove('is-shocked');
  void body.offsetWidth;
  body.classList.add('is-shocked');
  feedCosmos();
  scheduleInputDecay();
}, { passive: true });

root.addEventListener('pointerleave', () => {
  cosmosState.pointerX = 0;
  cosmosState.pointerY = 0;
  cosmosState.pointerActive = 0;
  feedCosmos();
});

/* Method tabs */
const methodTabs = $$('.protocol-tab');
const methodPanels = $$('.protocol-panel');

function activateMethod(index, focus = false) {
  const safeIndex = (index + methodTabs.length) % methodTabs.length;
  methodTabs.forEach((tab, tabIndex) => {
    const active = tabIndex === safeIndex;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
  });
  methodPanels.forEach((panel, panelIndex) => {
    const active = panelIndex === safeIndex;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

methodTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateMethod(index));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') activateMethod(0, true);
    else if (event.key === 'End') activateMethod(methodTabs.length - 1, true);
    else activateMethod(index + (event.key === 'ArrowRight' ? 1 : -1), true);
  });
});

if (methodTabs.length) activateMethod(0);

/* Selected work carousel */
const carousel = $('[data-carousel]');

if (carousel) {
  const slides = $$('.work-slide', carousel);
  const slideTabs = $$('[data-carousel-go]', carousel);
  const counter = $('.work-counter b', carousel);
  const controls = $('.work-controls', carousel);
  const previous = $('[data-carousel-prev]', carousel);
  const next = $('[data-carousel-next]', carousel);
  const pauseReasons = new Set(['offscreen']);
  let currentSlide = 0;
  let carouselTimer = 0;
  let carouselFrame = 0;
  let carouselVisible = false;
  let touchStartX = null;
  let manualPauseTimer = 0;
  let scrollPauseTimer = 0;

  const playback = document.createElement('button');
  playback.type = 'button';
  playback.className = 'work-playback';
  playback.setAttribute('aria-pressed', 'false');
  controls?.append(playback);

  function syncPlaybackLabel() {
    const userPaused = pauseReasons.has('user');
    playback.textContent = userPaused ? '▶' : 'Ⅱ';
    playback.setAttribute('aria-pressed', String(userPaused));
    playback.setAttribute('aria-label', userPaused ? '继续自动播放' : '暂停自动播放');
  }

  function canAutoplay() {
    return carouselVisible
      && !document.hidden
      && !motionQuery.matches
      && pauseReasons.size === 0;
  }

  function stopCarouselClock() {
    clearTimeout(carouselTimer);
    cancelAnimationFrame(carouselFrame);
    carouselTimer = 0;
    carouselFrame = 0;
    carousel.classList.remove('cycling');
  }

  function scheduleCarousel() {
    stopCarouselClock();
    if (!canAutoplay()) return;
    carouselFrame = requestAnimationFrame(() => {
      carouselFrame = 0;
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
      tab.tabIndex = active ? 0 : -1;
    });
    if (counter) counter.textContent = String(currentSlide + 1).padStart(2, '0');
    scheduleCarousel();
  }

  function setPause(reason, paused) {
    if (paused) pauseReasons.add(reason);
    else pauseReasons.delete(reason);
    syncPlaybackLabel();
    scheduleCarousel();
  }

  function pauseForManualInput() {
    clearTimeout(manualPauseTimer);
    setPause('manual', true);
    manualPauseTimer = setTimeout(() => setPause('manual', false), 10000);
  }

  function chooseSlide(index) {
    pauseForManualInput();
    showSlide(index);
  }

  previous?.addEventListener('click', () => chooseSlide(currentSlide - 1));
  next?.addEventListener('click', () => chooseSlide(currentSlide + 1));
  slideTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => chooseSlide(index));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = slideTabs.length - 1;
      else nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + slideTabs.length) % slideTabs.length;
      chooseSlide(nextIndex);
      slideTabs[nextIndex].focus();
    });
  });

  playback.addEventListener('click', () => setPause('user', !pauseReasons.has('user')));

  carousel.addEventListener('mouseenter', () => setPause('hover', true));
  carousel.addEventListener('mouseleave', () => setPause('hover', false));
  carousel.addEventListener('focusin', () => setPause('focus', true));
  carousel.addEventListener('focusout', (event) => {
    if (!carousel.contains(event.relatedTarget)) setPause('focus', false);
  });
  carousel.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') touchStartX = event.clientX;
  });
  carousel.addEventListener('pointerup', (event) => {
    if (touchStartX === null) return;
    const distance = event.clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(distance) > 48) chooseSlide(currentSlide + (distance < 0 ? 1 : -1));
  });
  carousel.addEventListener('pointercancel', () => { touchStartX = null; });

  addEventListener('scroll', () => {
    if (!carouselVisible) return;
    clearTimeout(scrollPauseTimer);
    setPause('scroll', true);
    scrollPauseTimer = setTimeout(() => setPause('scroll', false), 900);
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    const carouselObserver = new IntersectionObserver(([entry]) => {
      carouselVisible = entry.isIntersecting;
      setPause('offscreen', !carouselVisible);
    }, { threshold: 0.28 });
    carouselObserver.observe(carousel);
  } else {
    carouselVisible = true;
    setPause('offscreen', false);
  }

  document.addEventListener('visibilitychange', () => setPause('hidden', document.hidden));
  motionQuery.addEventListener?.('change', (event) => setPause('reduced', event.matches));
  syncPlaybackLabel();
  showSlide(0);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) cosmos?.pause?.();
  else cosmos?.resume?.();
});

motionQuery.addEventListener?.('change', () => {
  root.classList.toggle('reduced-motion', motionQuery.matches);
  setupRevealObserver();
  createCosmos();
  scheduleScrollState();
});

root.classList.toggle('reduced-motion', motionQuery.matches);
updateScrollState();

requestAnimationFrame(() => {
  body.classList.add('is-ready');
});
