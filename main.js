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
    orderSections();
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
menu.addEventListener('click', (e) => {
  if (!e.target.closest('a')) return;
  menu.hidePopover?.();
  menu.classList.remove('is-open');
});

// Browsers without popovers (Safari before 17, so older iPhones and iPads): the ☰ and cart buttons
// toggle a class instead (styled at the end of the nav section in styles.css)
if (!HTMLElement.prototype.togglePopover) {
  document.querySelectorAll('[popovertarget]').forEach((button) => {
    const box = document.getElementById(button.getAttribute('popovertarget'));
    button.addEventListener('click', () => button.setAttribute('aria-expanded', box.classList.toggle('is-open')));
  });
}

// ---------- Cart: counts what's added until the shop's real checkout exists ----------
const cart = document.querySelector('.cart-toggle');
const cartCount = cart.querySelector('.cart-count');
const cartNote = document.querySelector('.cart-note');
let inCart = 0;
// Every Add to cart: the shop's, and Sensei's pick in the chat
document.addEventListener('click', (e) => {
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

// ---------- AI Sensei: the brief's personal fitness teacher as a chat ----------
// Three questions (goal, diet, training), tapped or typed in English or Hinglish ("ghar pe", "weight kam
// karna hai"), then a plan with one RSW pick. It answers questions about the shop at any point too.
// shortcut: keyword matching, not a real AI, and no step 4 (email the plan, keep the address); both need
// a server, so add them at launch.
const chat = document.querySelector('#chat');
const chatLog = chat.querySelector('.chat-log');
const chatPicks = chat.querySelector('.chat-picks');
const chatForm = chat.querySelector('.chat-form');
const chatInput = chatForm.elements.q;

// Names and prices come from the shop's cards, so Sensei never quotes a stale one, and the plan can show a
// card's carton
const shop = [...document.querySelectorAll('.products > li:not(.future)')].map((li) => ({
  li,
  tag: li.querySelector('.tag').textContent,
  name: li.querySelector('h3').textContent,
  price: li.querySelector('.buy span').textContent,
  about: li.querySelector('.meta + p').textContent,
}));
const product = (tag) => shop.find((p) => p.tag === tag);
function describe(tag) {
  const { name, price, about } = product(tag);
  return `${name}, ${price}. ${about} <a href="#lab">See it in the shop</a>`;
}

// Each choice: its value, its label, the words that pick it when typed, and its tile's photo (food has
// none; its tiles show the veg / non-veg mark). Choices are tried in order, so "non veg" isn't read as
// veg, nor "gain weight" as losing it.
const questions = [
  ['goal', "What's your goal?", [
    ['muscle', 'Build muscle', /\b(muscle|bulk|gain|mass|strong|strength|banan)/, 'img/barbell-woman.webp'],
    ['lose', 'Lose weight', /\b(lose|losing|loss|fat|slim|cut|kam|weight|vajan|wajan|pet|belly|lean)/, 'img/sprint.webp'],
  ]],
  ['diet', 'What do you eat?', [
    ['nonveg', 'Non-vegetarian', /\b(non|egg|anda|ande|chicken|meat|fish|mutton)/],
    ['veg', 'Vegetarian', /\b(veg|shakahari|jain|paneer)/],
  ]],
  ['train', 'Where do you train?', [
    ['gym', 'Gym', /\bgym/, 'img/dark-barbell.webp'],
    ['home', 'Home', /\b(home|ghar|house|room|bodyweight|park)/, 'img/sensei.webp'],
  ]],
];
// "I don't eat meat" names the wrong choice, so with a no in it Sensei asks for a tap instead of guessing
const negation = /\b(no|not|never|without|don['’]?t|can['’]?t|cannot|nahi|nahin|nhi)\b/;

// What Sensei can answer at any point; the first match answers
const faqs = [
  [/\b(price|prices|cost|kitna|kitne|rate|mrp|rupees?|rs)\b|₹/, () => `${shop.map((p) => `${p.name} ${p.price}`).join(', ')}. <a href="#lab">See the shop</a>`],
  [/\b(protein|whey)/, () => describe('Protein')],
  [/creatine/, () => describe('Creatine')],
  [/\b(hydrat|electrolyte|sachet)/, () => describe('Hydration')],
  [/\bpre\b|pre-?workout|\benergy/, () => describe('Pre-Workout')],
  [/\b(ship|deliver|courier|cod)/, () => `${document.querySelector('.promo span').textContent}. Orders open when the shop launches.`],
  [/\b(order|buy|checkout|pay|upi|cart)/, () => 'Add to cart works now. Checkout opens when the shop launches.'],
  [/\b(lab|test|report|batch|safe|side effect|quality)/, () => "Every batch is lab-tested. Supplements don't replace a balanced diet, and if you have a medical condition, talk to a doctor first."],
  [/\b(contact|human|person|team|call|phone|whatsapp|email|instagram)\b/, () => 'Reach the team through the links at the <a href="#contact">bottom of the page</a>.'],
  [/\b(help|who are you|what can you)/, () => 'I build your diet and workout plan from three questions, and I know the shop: products, prices, shipping and lab tests.'],
  [/\b(hi+|hello|hey|namaste|namaskar|kem cho)\b/, () => "Hi! I'm Sensei."],
  [/\b(thanks|thank you|thx|shukriya|dhanyavad)/, () => 'Anytime. Train hard!'],
];

// placeholder: general advice; the brand should check it before launch
const diets = {
  muscle: 'Eat a little more than you burn: three meals and two snacks with protein in each, and rice, roti or oats around training.',
  lose: 'Eat a little less than you burn: half your plate vegetables, a quarter protein, a quarter roti or rice. Skip sugary drinks and fried snacks.',
};
const proteins = { veg: 'paneer, curd, dal, chana, rajma, soya chunks and milk', nonveg: 'eggs, chicken and fish, plus dal and curd' };
const workouts = {
  gym: {
    muscle: '4 days a week: chest and shoulders, back, legs, then full body. 3–4 sets of 6–12 reps, adding a little weight each week.',
    lose: '3 full-body weight sessions a week to keep your muscle, plus 2 brisk 30-minute cardio sessions. Walk 8,000 steps a day.',
  },
  home: {
    muscle: '4 days a week: push-ups, squats, lunges, pike push-ups and backpack rows. 3–4 slow sets close to your limit, harder each week.',
    lose: '5 days a week, 30 minutes: circuits of squats, push-ups, mountain climbers and burpees. Walk 8,000 steps a day.',
  },
};
const finished = ['Start over', 'Prices', 'Shipping'];

let step = 0;
const picked = {};
let refocus = false; // after a tapped answer, keyboard focus moves on to the next choices

// html is always Sensei's own words; the visitor's are added as plain text in hear()
function post(className, html) {
  const message = Object.assign(document.createElement('div'), { className, innerHTML: html });
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}
const say = (html) => post('from-sensei', html);

// A question's choices are big tiles; anything else to tap is a small chip
const tile = ([value, label, , photo]) =>
  `<button class="tile" type="button">${photo ? `<img src="${photo}" alt="">` : `<i class="mark ${value}"></i>`}<span>${label}</span></button>`;
const chip = (label) => `<button type="button">${label}</button>`;

function offer(buttons) {
  chatPicks.innerHTML = buttons.join('');
  if (refocus) chatPicks.firstElementChild.focus();
  refocus = false;
}

// Sensei "types" for a moment, so a reply doesn't land the instant you send
function reply(then) {
  if (reduceMotion) return then();
  const typing = post('from-sensei is-typing', '<i></i><i></i><i></i>');
  typing.setAttribute('aria-hidden', 'true');
  setTimeout(() => { typing.remove(); then(); }, 600);
}

function ask() {
  chat.dataset.step = step; // fills the header's progress bars
  if (step === questions.length) return plan();
  const [, question, choices] = questions[step];
  say(question);
  offer(choices.map(tile));
}

function plan() {
  const { goal, diet, train } = picked;
  const [tag, why] = diet === 'veg' ? ['Protein', 'Vegetarian meals often run short on protein, so a scoop of whey is an easy top-up.']
    : goal === 'muscle' ? ['Creatine', 'Your meals already bring protein, so creatine is your next step.']
    : ['Hydration', 'Fat loss means lots of cardio.'];
  const pick = product(tag);
  const ready = say('Your Sensei plan is ready.');
  const card = post('chat-plan', `<h3>Your Sensei plan</h3>
    <p class="chat-for">${questions.map(([key, , choices]) => choices.find((c) => c[0] === picked[key])[1]).join(' · ')}</p>
    <p><b>Diet.</b> ${diets[goal]} Protein: ${proteins[diet]}.</p>
    <p><b>Workout.</b> ${workouts[train][goal]}</p>
    <p><b>Nutrition.</b> About 1.6–2 g of protein per kg of body weight a day (110–140 g at 70 kg), water through the day and 7–9 hours of sleep.</p>
    <div class="chat-pick">
      <div><p class="chat-pick-name">${pick.name}</p><p>${pick.price}</p></div>
      <p>${why} ${pick.about}</p>
      <button class="btn add" type="button">Add to cart</button>
    </div>
    <p class="chat-fine">General guidance, not medical advice. Talk to a doctor if you have a medical condition.</p>`);
  // The pick shows its shop card's 3D carton; the card carries the carton's colours
  const carton = pick.li.querySelector('.stage').cloneNode(true);
  carton.style.cssText = pick.li.style.cssText;
  card.querySelector('.chat-pick').prepend(carton);
  chatLog.scrollTop = ready.offsetTop - 16; // read the plan from its top
  offer(finished.map(chip));
}

function hear(text) {
  chatLog.append(Object.assign(document.createElement('div'), { className: 'from-you', textContent: text }));
  chatPicks.replaceChildren();
  const t = text.toLowerCase();
  const [key, , choices] = questions[step] || [];
  const heard = choices?.find((c) => c[2].test(t));
  if (heard && !negation.test(t)) {
    picked[key] = heard[0];
    step++;
    return reply(ask);
  }
  if (/\b(start over|restart|new plan|reset)\b/.test(t)) {
    step = 0;
    return reply(() => { say("Let's start over."); ask(); });
  }
  const faq = faqs.find(([words]) => words.test(t));
  reply(() => {
    say(faq ? faq[1]() : heard ? 'Tap the one that fits you, so I get it right.'
      : "Sorry, I didn't get that. I can build your plan, or tell you about our products, prices, shipping and lab tests.");
    if (step < questions.length) ask();
    else offer(finished.map(chip));
  });
}

post('chat-intro', `<img src="img/sensei-plan.webp" alt="" width="1000" height="563">
  <b>Your plan in 3 questions</b>
  <span>Your goal, your food and where you train. Sensei builds your diet and workout, and picks the one RSW product that fits.</span>`);
ask();

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  chatInput.value = '';
  if (text) hear(text);
});
chatPicks.addEventListener('click', (e) => {
  const pick = e.target.closest('button');
  if (!pick) return;
  refocus = true;
  hear(pick.textContent);
});
// A link in an answer jumps to that part of the page (Lenis listens further up), so get out of its way
chatLog.addEventListener('click', (e) => {
  if (!e.target.closest('a')) return;
  chat.hidePopover?.();
  chat.classList.remove('is-open');
});
// With a mouse and keyboard you can type straight away; touch screens keep their keyboard down until asked
chat.addEventListener('toggle', (e) => {
  if (e.newState === 'open' && !matchMedia('(pointer: coarse)').matches) chatInput.focus();
});
// The launcher keeps out of the way: off the hero (the first impression), Clean's pinned gates and tank
// (their words can't scroll out from under it) and the footer (it has the contact links)
const chatToggle = document.querySelector('.chat-toggle');
const inView = new Set();
function inTheWay(entries) {
  entries.forEach((e) => {
    if (e.isIntersecting) inView.add(e.target);
    else inView.delete(e.target);
  });
  const blocked = [...inView].some((el) => !el.matches('.gates, .tank') || getComputedStyle(el.firstElementChild).position === 'sticky');
  chatToggle.classList.toggle('is-shown', !blocked);
}
// The hero and footer count until only the top 30% shows them: after the Shop link, the hero's last strip
// sits under the bar
const showing = new IntersectionObserver(inTheWay, { rootMargin: '-30% 0px 0px' });
document.querySelectorAll('.hero, .footer').forEach((el) => showing.observe(el));
// A scene counts from when it reaches the top of the screen, where its stage sticks, not while it scrolls in
const pinned = new IntersectionObserver(inTheWay, { rootMargin: '0px 0px -99%' });
document.querySelectorAll('.gates, .tank').forEach((el) => pinned.observe(el));

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

// ---------- Section order: Clean is a shop, so its products and Warriors come straight after the hero ----------
// Manga tells the story first. CSS order shows that from the first paint; moving the sections too
// keeps Tab and screen readers in the order on screen.
const shopFirst = [document.querySelector('#lab'), document.querySelector('#warriors')];
const soon = document.querySelector('.soon');
function orderSections() {
  if (root.dataset.mode === 'clean') hero.after(...shopFirst);
  else soon.before(...shopFirst);
}
orderSections();

// ---------- Clean universe gates: tabbing to a world's link scrolls to where its gate is open ----------
const gates = document.querySelector('.gates');
const gateList = [...gates.querySelectorAll('.gate')];
const tank = document.querySelector('.tank');
gates.addEventListener('focusin', (e) => {
  if (getComputedStyle(gates.firstElementChild).position !== 'sticky') return; // stacked: no motion, or too short a screen
  const i = gateList.indexOf(e.target.closest('.gate')) - 1; // the first is the hub, not a world; it shows from the start
  const box = gates.getBoundingClientRect();
  const y = scrollY + box.top + (Math.max(0, i + 0.85) / 4) * (box.height - innerHeight);
  if (lenis) lenis.scrollTo(y, { immediate: true });
  else scrollTo({ top: y, behavior: 'instant' });
});

// ---------- The orbit: the Lab, the Warriors and the Vault circle the RSW logo ----------
// Every frame places the planets on a tilted circle seen in perspective, so the nearest is the
// biggest and passes in front of the logo. They drift round, wait under the mouse, spin when dragged
// or swiped sideways, and one tabbed to comes to the front. They fly out from behind the logo as the
// orbit scrolls in (its --p, from data-scroll). In Clean, as the gates begin, the Lab comes to the
// front and its world opens out of it: styles.css draws that from the --lx, --ly and --lr set here.
const third = (Math.PI * 2) / 3;
const near = 3; // the eye is 3 orbit radii from the logo
const drift = (Math.PI * 2) / 36; // one lap in 36 s
const smooth = (t) => t * t * (3 - 2 * t);

document.querySelectorAll('.orbit').forEach((orbit) => {
  const sun = orbit.querySelector('.sun');
  const [farRing, nearRing] = orbit.querySelectorAll('.ring');
  const planets = [...orbit.querySelectorAll('.planet')];
  const stage = gates.contains(orbit) && gates.firstElementChild; // Clean's orbit sits on the gates' stage
  for (let z = 1; z <= 12; z++) { // the logo's depth: copies of its letters stacked behind it
    const layer = sun.firstElementChild.cloneNode(true);
    layer.style.setProperty('--z', z);
    sun.append(layer);
  }

  let angle = 2; // the Lab at the front left, the Warriors far left, the Vault at the right
  let speed = 0;
  let cosT, sinT, cosR, sinR, radius, pr, cx, cy, ox, oy;

  // Where a planet at angle a sits, per unit of radius, and how much bigger nearness makes it
  function project(a) {
    const scale = near / (near - Math.sin(a) * cosT);
    const x = Math.cos(a) * scale;
    const y = Math.sin(a) * sinT * scale;
    return [x * cosR - y * sinR, x * sinR + y * cosR, scale];
  }

  function fit() {
    const w = orbit.clientWidth;
    const h = orbit.clientHeight;
    if (!w) return; // hidden: the other mode's orbit
    pr = planets[0].offsetWidth / 2;
    // Taller boxes (phones) look down on the orbit more steeply; it leans a little either way
    const tilt = Math.min(0.7, Math.max(0.21, Math.atan((h / w) * 0.6)));
    [cosT, sinT, cosR, sinR] = [Math.cos(tilt), Math.sin(tilt), Math.cos(-0.6 * tilt), Math.sin(-0.6 * tilt)];

    // The biggest orbit whose planets all fit in the box, centred in it, with room to grow on hover
    const points = Array.from({ length: 72 }, (_, i) => project((i / 36) * Math.PI));
    const extent = (r) => [0, 1].map((n) => [
      Math.min(...points.map((p) => p[n] * r - pr * p[2])),
      Math.max(...points.map((p) => p[n] * r + pr * p[2])),
    ]);
    const pad = Math.max(12, pr * 0.25);
    let lo = 0;
    let hi = w;
    while (hi - lo > 0.5) {
      const r = (lo + hi) / 2;
      const [[x0, x1], [y0, y1]] = extent(r);
      if (x1 - x0 <= w - 2 * pad && y1 - y0 <= h - 2 * pad) lo = r;
      else hi = r;
    }
    radius = lo;
    const [[x0, x1], [y0, y1]] = extent(radius);
    cx = (w - x0 - x1) / 2;
    cy = (h - y0 - y1) / 2;

    // The ring's two halves, each a line through 49 points
    const half = (from) => Array.from({ length: 49 }, (_, i) => {
      const [x, y] = project(from + (i / 48) * Math.PI);
      return [x * radius, y * radius];
    });
    const [far, close] = [half(Math.PI), half(0)];
    for (const [ring, line] of [[farRing, far], [nearRing, close]]) {
      ring.firstElementChild.setAttribute('d', `M${line.map(([x, y]) => `${(cx + x).toFixed(1)} ${(cy + y).toFixed(1)}`).join(' L')}`);
      ring.style.transformOrigin = `${cx}px ${cy}px`;
    }

    // Shrink the logo until the near half of the ring passes clear of its letters, and so do the
    // planets where they swap from behind it to in front, at its sides
    const sw = sun.offsetWidth / 2;
    const sh = sun.offsetHeight / 2;
    let fits = Math.min(...close.map(([x, y]) => 0.95 * Math.max(Math.abs(x) / sw, Math.abs(y) / sh)));
    const [sideX, sideY] = close[0].map(Math.abs);
    if (sideY - pr * 1.1 < sh) fits = Math.min(fits, (sideX - pr * 1.1 - 12) / sw); // 1.1: grown on hover
    sun.style.scale = fits < 1 ? fits.toFixed(3) : '';
    sun.style.translate = `${cx - sw}px ${cy - sh}px`;
    orbit.style.perspectiveOrigin = `${cx}px ${cy}px`;

    if (stage) { // the orbit's place on the stage, for the Lab's disc
      ox = oy = 0;
      for (let el = orbit; el && el !== stage; el = el.offsetParent) {
        ox += el.offsetLeft;
        oy += el.offsetTop;
      }
    }
  }

  let hovered = false;
  let focused = -1;
  let drag = null;
  let dragged = false;
  let visible = false;
  let running = false;
  let last = 0;

  function frame(now) {
    if (!visible) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (radius === undefined) return; // not measured yet
    const s = stage ? parseFloat(gates.style.getPropertyValue('--s')) || 0 : 0;
    if (s > 0.2) return; // the Lab's world covers the hub

    const aim = s > 0 ? 0 : focused; // the Lab as its world opens, or a planet tabbed to
    if (drag?.moved) {
      // the pointer turns it
    } else if (aim >= 0) {
      const off = Math.PI / 2 - aim * third - angle; // a quarter turn round is the front
      const turn = off - Math.round(off / (Math.PI * 2)) * Math.PI * 2; // the short way round
      angle += reduceMotion ? turn : turn * (1 - Math.exp(-dt * 6));
      speed = 0;
    } else {
      speed += ((hovered || reduceMotion ? 0 : drift) - speed) * (1 - Math.exp(-dt * 1.5));
      angle += speed * dt;
    }

    // They fly out from behind the logo as the orbit scrolls in
    const p = parseFloat(orbit.style.getPropertyValue('--p'));
    const out = reduceMotion || isNaN(p) ? 1 : smooth(clamp01((p - 0.3) / 0.7));
    planets.forEach((planet, k) => {
      const a = angle + k * third;
      const [x, y, scale] = project(a);
      planet.style.translate = `${(cx + x * radius * out - pr).toFixed(1)}px ${(cy + y * radius * out - pr).toFixed(1)}px`;
      planet.style.scale = (scale * (0.3 + 0.7 * out)).toFixed(3);
      planet.style.zIndex = Math.sin(a) > 0 && out > 0.6 ? 4 : 1;
    });
    for (const ring of [farRing, nearRing]) ring.style.scale = out.toFixed(3);

    if (s > 0) {
      const [x, y, scale] = project(angle);
      stage.style.setProperty('--lx', `${(ox + cx + x * radius).toFixed(1)}px`);
      stage.style.setProperty('--ly', `${(oy + cy + y * radius).toFixed(1)}px`);
      stage.style.setProperty('--lr', `${(pr * scale).toFixed(1)}px`);
    }
  }

  // Drag or swipe sideways to spin it; let go mid-swipe and it keeps spinning, slowing to its drift
  orbit.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    drag = { id: e.pointerId, x: e.clientX, from: angle, moved: false, at: e.timeStamp, last: angle };
    focused = -1; // the pointer steers now, not the planet tabbed to
  });
  orbit.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag?.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 8) return; // still a tap
      drag.moved = true;
      orbit.setPointerCapture(e.pointerId);
      orbit.classList.add('is-dragging');
    }
    angle = drag.from - dx / radius;
    const dt = (e.timeStamp - drag.at) / 1000;
    if (dt > 0) speed += ((angle - drag.last) / dt - speed) * 0.5;
    drag.at = e.timeStamp;
    drag.last = angle;
  });
  function drop(e) {
    if (e.pointerId !== drag?.id) return;
    if (drag.moved) {
      dragged = true;
      setTimeout(() => { dragged = false; });
      // Held still before letting go, it doesn't fling
      speed = reduceMotion || e.timeStamp - drag.at > 80 ? 0 : Math.max(-6, Math.min(6, speed));
    }
    drag = null;
    orbit.classList.remove('is-dragging');
  }
  orbit.addEventListener('pointerup', drop);
  orbit.addEventListener('pointercancel', drop); // a vertical swipe: the page scrolls instead
  // A drag ends in a click on the planet it started on, which mustn't open it
  orbit.addEventListener('click', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation(); // Lenis's anchor jump listens further up
  }, true);
  orbit.addEventListener('dragstart', (e) => e.preventDefault()); // a planet would drag as a link

  planets.forEach((planet) => {
    planet.addEventListener('pointerenter', (e) => { hovered = e.pointerType === 'mouse'; });
    planet.addEventListener('pointerleave', () => { hovered = false; });
  });
  orbit.addEventListener('focusin', (e) => {
    if (e.target.matches(':focus-visible')) focused = planets.indexOf(e.target);
  });
  orbit.addEventListener('focusout', () => { focused = -1; });

  // Runs only while on screen; the other mode's orbit is hidden, so it never is
  const resized = new ResizeObserver(fit);
  resized.observe(orbit);
  resized.observe(sun); // its letters change size once the font arrives
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible || running) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  }).observe(orbit);
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
