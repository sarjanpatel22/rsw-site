const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function savedMode() {
  try { return localStorage.getItem('rsw-mode'); } catch { return null; }
}
function saveMode(mode) {
  try { localStorage.setItem('rsw-mode', mode); } catch { /* private mode: choice just won't persist */ }
}

// ---------- Clean / Manga mode ----------
const toggle = document.querySelector('.mode-switch');
const syncToggle = () => toggle.setAttribute('aria-pressed', root.dataset.mode === 'manga');
syncToggle();

function setMode(mode, origin) {
  saveMode(mode);
  const apply = () => {
    root.dataset.mode = mode;
    syncToggle();
    // Manga always starts at the top, with its intro
    if (mode === 'manga') {
      if (lenis) lenis.scrollTo(0, { immediate: true });
      else scrollTo({ top: 0, behavior: 'instant' });
      replay('intro');
    }
    if (!reduceMotion) onScroll(); // the other mode's hero has a different scroll track
  };
  if (reduceMotion || !document.startViewTransition || !origin) return apply();
  root.style.setProperty('--vt-x', `${origin.left + origin.width / 2}px`);
  root.style.setProperty('--vt-y', `${origin.top + origin.height / 2}px`);
  document.startViewTransition(apply);
}

toggle.addEventListener('click', () => {
  setMode(root.dataset.mode === 'manga' ? 'clean' : 'manga', toggle.getBoundingClientRect());
});

const dialog = document.querySelector('.mode-dialog');
if (!savedMode()) setTimeout(() => dialog.showModal(), 1200);
dialog.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick]');
  if (!pick) return;
  const origin = pick.getBoundingClientRect();
  dialog.close();
  setMode(pick.dataset.pick, origin);
});
// Closed with Escape: keep the current mode and don't ask again
dialog.addEventListener('close', () => { if (!savedMode()) saveMode(root.dataset.mode); });

// ---------- Phone menu: a popover; close it once a link is picked ----------
const menu = document.querySelector('#menu');
menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.hidePopover?.(); });

// ---------- Cart: counts what's added until the shop's real checkout exists ----------
const cart = document.querySelector('.cart-toggle');
const cartCount = cart.querySelector('.cart-count');
const cartNote = document.querySelector('.cart-note');
let inCart = 0;
document.querySelector('.products').addEventListener('click', (e) => {
  const add = e.target.closest('.add');
  if (!add) return;
  inCart++;
  const items = `${inCart} item${inCart > 1 ? 's' : ''}`;
  cartCount.textContent = inCart;
  cartCount.hidden = false;
  cart.setAttribute('aria-label', `Cart, ${items}`);
  cartNote.textContent = `${items} in your cart.`;
  add.textContent = 'Added ✓';
  setTimeout(() => { add.textContent = 'Add to cart'; }, 1500);
});

// ---------- Clean hero slider: the CSS timer bar drives the 5s advance ----------
const slider = document.querySelector('.slider');
const slides = [...slider.querySelectorAll('.slide')];
const dots = [...slider.querySelectorAll('.dot')];
const pause = slider.querySelector('.pause');
const bar = slider.querySelector('.timer span');
let current = 0;

function show(i) {
  current = (i + slides.length) % slides.length;
  slides.forEach((s, n) => { s.classList.toggle('is-active', n === current); s.inert = n !== current; });
  dots.forEach((d, n) => d.setAttribute('aria-current', n === current));
  bar.style.animation = 'none';
  void bar.offsetWidth; // restart the timer animation
  bar.style.animation = '';
}

show(0);
bar.addEventListener('animationend', () => show(current + 1));
dots.forEach((d, n) => d.addEventListener('click', () => show(n)));
pause.addEventListener('click', () => {
  const paused = slider.classList.toggle('is-paused');
  pause.textContent = paused ? '▶' : '❚❚';
  pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
});

// ---------- Manga power-up hero: --power climbs 0 → 1 while the pinned hero scrolls ----------
const hero = document.querySelector('.hero');
const sfx = [...hero.querySelectorAll('[data-at]')];
const powerNum = hero.querySelector('.power b');
const copyLines = [...hero.querySelectorAll('.hero-copy > *')];
const finalBits = [...hero.querySelectorAll('.final > *, .flash')];
let charged = false; // has the power-up got going since the intro last played?
let atTop = true; // the hero's two ends, where its animation comes round again
let atEnd = false;
let awaySince = -Infinity; // when the hero last scrolled up out of sight (null while on screen)
let fresh = false; // back after a long time away: the hero shows uncharged until it rewinds
let replayTimer = 0;
const replayEvery = 5000; // ms between replays while the hero sits at either end

function restart(els) {
  els.forEach((el) => {
    el.style.animation = 'none';
    void el.offsetWidth; // restart its CSS animation
    el.style.animation = '';
  });
}

// The Saiyan animation plays again. 'intro': the text slams back in and hero.js drops the tub
// with its thud. 'final': the flash, shout and title burst again and hero.js sends a shockwave.
function replay(part) {
  if (part === 'intro') charged = false;
  restart(part === 'intro' ? copyLines : finalBits);
  hero.dispatchEvent(new Event(part));
  clearTimeout(replayTimer);
  replayTimer = setTimeout(idleReplay, replayEvery);
}

// While the hero sits at either end it comes round every 5 seconds; mid-charge it waits
function idleReplay() {
  if (root.dataset.mode === 'manga' && (atTop || atEnd) && !document.hidden) replay(atEnd ? 'final' : 'intro');
  else replayTimer = setTimeout(idleReplay, replayEvery);
}

// ---------- Clean universe gates: tabbing to a world's link scrolls to where its gate is open ----------
const gates = document.querySelector('.gates');
const gateList = [...gates.querySelectorAll('.gate')];
const tank = document.querySelector('.tank');
gates.addEventListener('focusin', (e) => {
  if (reduceMotion) return; // the gates just stack then
  const i = gateList.indexOf(e.target.closest('.gate')) - 1; // the first is the title, not a world
  const box = gates.getBoundingClientRect();
  const y = scrollY + box.top + ((i + 0.85) / 4) * (box.height - innerHeight);
  if (lenis) lenis.scrollTo(y, { immediate: true });
  else scrollTo({ top: y, behavior: 'instant' });
});

// ---------- Scroll reveals ----------
const io = new IntersectionObserver((entries) => {
  entries.filter((e) => e.isIntersecting).forEach((e, i) => {
    e.target.style.transitionDelay = `${i * 80}ms`;
    e.target.addEventListener('transitionend', () => { e.target.style.transitionDelay = ''; }, { once: true });
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ---------- Scroll-linked effects (skipped when motion is unwelcome) ----------
// [data-scroll] elements get --p from 0 to 1 while their top travels from the bottom of
// the screen to a quarter from the top. In Clean the slider's boxes turn as the hero scrolls
// away, and the creatine tank and the universe gates play (--s) through their stages' holds; in
// Manga the hero pins and charges up as you scroll its tall track.
const scrollers = [...document.querySelectorAll('[data-scroll]')];
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function onScroll() {
  // Read every position first, then write, so the browser only lays out once
  const vh = innerHeight;
  const manga = root.dataset.mode === 'manga';
  const tops = scrollers.map((el) => el.getBoundingClientRect().top);
  const pin = hero.getBoundingClientRect();
  const out = manga ? 0 : clamp01(scrollY / slider.offsetHeight);
  const held = manga ? null : gates.getBoundingClientRect();
  const tankBox = manga ? null : tank.getBoundingClientRect();

  scrollers.forEach((el, i) => el.style.setProperty('--p', clamp01((vh - tops[i]) / (vh * 0.75)).toFixed(3)));

  if (!manga) {
    slider.style.setProperty('--out', out.toFixed(3));
    gates.style.setProperty('--s', clamp01(-held.top / (held.height - vh)).toFixed(4));
    const drained = clamp01(-tankBox.top / (tankBox.height - vh));
    tank.style.setProperty('--s', drained.toFixed(4));
    const step = String(Math.min(3, Math.floor(drained * 3) + 1));
    if (tank.dataset.step !== step) tank.dataset.step = step;
    return;
  }

  // Away below the hero for over 10 s, then back: it comes back fresh. It shows uncharged while
  // its stage slides in, and once the stage fills the screen it rewinds to the top, unseen.
  const now = performance.now();
  if (pin.bottom <= 0) awaySince ??= now;
  else if (awaySince !== null) {
    fresh = pin.top < 0 && now - awaySince > 10000;
    awaySince = null;
  }
  if (fresh && pin.bottom >= vh) {
    fresh = false;
    charged = true; // so arriving at the top plays the intro, once
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  // Full power a little before the pin lets go, so the final form gets a moment on screen
  const power = fresh ? 0 : clamp01(-pin.top / ((pin.height - vh) * 0.85));
  hero.style.setProperty('--power', power.toFixed(3));
  hero.classList.toggle('is-charging', power > 0.25);
  hero.classList.toggle('is-final', power > 0.92);
  sfx.forEach((el) => el.classList.toggle('is-on', power >= el.dataset.at));
  const pct = String(Math.round(power * 100));
  if (powerNum.textContent !== pct) powerNum.textContent = pct;

  // Back at the top after charging: the intro plays straight away
  atTop = power < 0.02 && !fresh; // a fresh hero only shows uncharged; it isn't at the top yet
  atEnd = power > 0.92 && pin.bottom > vh / 2; // the final form, still mostly on screen
  if (power > 0.25) charged = true;
  else if (charged && atTop) replay('intro');
}

let lenis = null;
if (!reduceMotion) {
  if (window.Lenis) {
    // Lenis eases wheel scrolling and anchor jumps, and reports every scroll, keys and scrollbar included
    lenis = new Lenis({ autoRaf: true, anchors: true });
    lenis.on('scroll', onScroll);
  } else {
    let queued = false;
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        onScroll();
      });
    }, { passive: true });
  }
  addEventListener('resize', onScroll);
  onScroll();
  replayTimer = setTimeout(idleReplay, replayEvery);
}
