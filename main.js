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
    // Clean's banner plays its entrance for the newcomer; Manga always starts at the top, with its intro
    if (mode === 'clean') show(current, false);
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

// Every visit opens on the choice of mode; a reload in the same tab doesn't ask again
const dialog = document.querySelector('.mode-dialog');
let asked = false;
try { asked = sessionStorage.getItem('rsw-asked') === '1'; } catch { /* private mode: ask */ }
if (!asked) {
  setTimeout(() => {
    dialog.showModal();
    dialog.focus(); // not the first side's button, so neither side starts out picked
  }, 1200);
}
dialog.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick]');
  if (!pick) return;
  const origin = pick.getBoundingClientRect();
  dialog.close();
  setMode(pick.dataset.pick, origin);
});
// Closed with Escape: keep the current mode
dialog.addEventListener('close', () => {
  if (!savedMode()) saveMode(root.dataset.mode);
  try { sessionStorage.setItem('rsw-asked', '1'); } catch { /* private mode: it asks again next load */ }
});

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
// The launcher keeps out of the way: off the hero (the first impression) and the footer (it has the
// contact links). They count until only the top 30% shows them: after the Shop link, the hero's last
// strip sits under the bar.
const chatToggle = document.querySelector('.chat-toggle');
const inView = new Set();
const inTheWay = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) inView.add(e.target);
    else inView.delete(e.target);
  });
  chatToggle.classList.toggle('is-shown', !inView.size);
}, { rootMargin: '-30% 0px 0px' });
document.querySelectorAll('.hero, .footer').forEach((el) => inTheWay.observe(el));

// ---------- Music: on by default, from the visitor's first click or key (browsers allow sound only after one) ----------
// Picking a mode in the opening dialog is that first click. The switch mutes it and the choice is kept; it
// rests while the tab is hidden, and fades in whenever it starts.
const music = document.querySelector('.music');
const soundToggle = document.querySelector('.sound-toggle');
if (music) {
  let wanted = true;
  try { wanted = localStorage.getItem('rsw-music') !== 'off'; } catch { /* private mode: on */ }
  let started = false; // it has played, or the song failed to load: no more starting on a click
  const loud = 0.6;
  const play = () => music.play().catch(() => { /* not allowed yet, or no song: stays off */ });
  const sync = () => soundToggle.setAttribute('aria-pressed', !music.paused);
  music.addEventListener('play', () => {
    sync();
    music.volume = 0;
    const from = performance.now();
    requestAnimationFrame(function fade(now) {
      music.volume = Math.min(loud, Math.max(0, (now - from) / 1500) * loud); // a frame can start before the play
      if (music.volume < loud && !music.paused) requestAnimationFrame(fade);
    });
  });
  music.addEventListener('pause', sync);
  music.addEventListener('error', () => {
    started = true;
    soundToggle.hidden = true;
  });
  soundToggle.hidden = false;
  const start = (e) => {
    if (started || !wanted || soundToggle.contains(e.target)) return; // the switch's own click decides for itself
    music.play().then(() => { started = true; }, () => { /* not allowed yet (Esc doesn't count): the next click */ });
  };
  addEventListener('pointerdown', start, true);
  addEventListener('keydown', start, true);
  soundToggle.addEventListener('click', () => {
    started = true;
    wanted = music.paused;
    try { localStorage.setItem('rsw-music', wanted ? 'on' : 'off'); } catch { /* private mode: not kept */ }
    if (wanted) play();
    else music.pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) music.pause();
    else if (wanted && started && !music.error) play();
  });
}

// ---------- Spin the plate: the brief's reward game, with a gym plate for the wheel ----------
// The reward is picked first, by the brief's odds, then the plate is thrown to land on it. Each spin
// earns 5 XP, up to 50.
// shortcut: the odds and the XP live in the browser, so anyone can spin until they like the result; at
// launch the shop's server should pick the reward and keep the XP per account.
const spinRoom = document.querySelector('.spin');
const plateWrap = spinRoom.querySelector('.plate-wrap');
const plate = plateWrap.querySelector('.plate');
const pin = plateWrap.querySelector('.plate-pin');
const spinGo = spinRoom.querySelector('.spin-go');
const spinResult = spinRoom.querySelector('.spin-result');
const xpNum = spinRoom.querySelector('.xp b');
const xpBar = spinRoom.querySelector('.xp-bar');

// [big print, small print, its headline and line when it lands, weight out of 1,000, rare]
const rewards = [
  ['30%', 'OFF', 'Rare! 30% off', 'Your first order, 30% off. One spin in 500 lands this.', 2, true],
  ['COMIC', '3 PAGES', 'Comic pages', 'Three pages of the RSW comic, free, when the Vault opens.', 280],
  ['₹50', 'OFF', '₹50 off', 'Off your first order.', 220],
  ['TRY', 'AGAIN', 'So close', 'Better luck on the next spin.', 150],
  ['FREE', 'SHAKER', 'Rare! Free shaker', 'An RSW shaker with your first order.', 4, true],
  ['₹100', 'OFF', '₹100 off', 'Off your first order.', 100],
  ['+10', 'XP', '+10 XP', 'Bonus XP on top of your spin.', 94],
  ['TRY', 'AGAIN', 'So close', 'Better luck on the next spin.', 150],
];
const sliceAngle = 360 / rewards.length;

// The plate, drawn round its middle: a reward on each slice of the rim, then the grips, the embossed
// lettering and the hub, which the RSW logo covers (index.html)
const draw = (name, attrs, parent) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent.append(node);
  return node;
};
const at = (r, deg) => `${(r * Math.sin((deg * Math.PI) / 180)).toFixed(2)} ${(-r * Math.cos((deg * Math.PI) / 180)).toFixed(2)}`;
const slice = (r0, r1, a0, a1) => `M${at(r1, a0)}A${r1} ${r1} 0 0 1 ${at(r1, a1)}L${at(r0, a1)}A${r0} ${r0} 0 0 0 ${at(r0, a0)}Z`;
draw('circle', { r: 99, class: 'p-iron' }, plate);
const slices = rewards.map(([big, small, , , , rare], i) => {
  const g = draw('g', { class: `p-seg${i % 2 ? ' alt' : ''}${rare ? ' rare' : ''}` }, plate);
  draw('path', { d: slice(64, 95, (i - 0.5) * sliceAngle, (i + 0.5) * sliceAngle) }, g);
  const label = draw('text', { transform: `rotate(${i * sliceAngle})` }, g);
  draw('tspan', { x: 0, y: -80 }, label).textContent = big;
  draw('tspan', { x: 0, y: -70.5, class: 'small' }, label).textContent = small;
  return g;
});
for (const a of [0, 120, 240]) draw('path', { d: slice(38, 54, a - 25, a + 25), class: 'p-grip' }, plate);
draw('path', { id: 'plate-ring', d: 'M0 -58.5A58.5 58.5 0 1 1 0 58.5A58.5 58.5 0 1 1 0 -58.5', fill: 'none' }, plate);
draw('textPath', { href: '#plate-ring', textLength: (Math.PI * 117 - 6).toFixed(1), lengthAdjust: 'spacing' },
  draw('text', { class: 'p-emboss' }, plate)).textContent = 'REAL SAIYAN WELLNESS · 20 KG · TAP INTO YOUR FINAL FORM · 20 KG ·';
draw('circle', { r: 31, class: 'p-hub' }, plate);

let turned = 0; // the plate's turn in degrees, clockwise
let spinning = false;
let xp = 0;
try { xp = Math.min(50, Number(localStorage.getItem('rsw-xp')) || 0); } catch { /* private mode: XP starts at 0 */ }
const showXp = () => {
  xpNum.textContent = xp;
  xpBar.style.setProperty('--xp', xp / 50);
};
showXp();

// power 0 to 1: a harder throw spins longer
function throwPlate(direction, power) {
  if (spinning) return;
  spinning = true;
  spinGo.disabled = true;
  spinResult.textContent = '';
  slices.forEach((g) => g.classList.remove('is-won'));
  let roll = Math.random() * 1000;
  const won = rewards.findIndex((reward) => (roll -= reward[4]) < 0);
  const rest = -won * sliceAngle + (Math.random() - 0.5) * sliceAngle * 0.6; // under the pin, a little off the slice's middle
  let turn = (((rest - turned) % 360) + 360) % 360; // clockwise to there
  if (direction < 0) turn -= 360;
  turned += turn + direction * 360 * Math.round(3 + 3 * power);
  const seconds = 3 + 2 * power;
  plate.style.transition = `rotate ${seconds}s cubic-bezier(0.2, 0.7, 0.15, 1)`;
  plate.style.rotate = `${turned}deg`;
  pin.classList.add('is-kicked');
  setTimeout(() => land(won), reduceMotion ? 0 : seconds * 1000);
  if (!reduceMotion) requestAnimationFrame(clicks);
}

// The pin kicks as each slice clicks past it
let lastSlice = 0;
function clicks() {
  if (!spinning) return;
  const now = Math.floor((parseFloat(getComputedStyle(plate).rotate) || 0) / sliceAngle + 0.5);
  if (now !== lastSlice) restart([pin]);
  lastSlice = now;
  requestAnimationFrame(clicks);
}

function land(won) {
  spinning = false;
  spinGo.disabled = false;
  pin.classList.remove('is-kicked');
  const [big, , headline, line, , rare] = rewards[won];
  xp = Math.min(50, xp + 5 + (big === '+10' ? 10 : 0));
  try { localStorage.setItem('rsw-xp', xp); } catch { /* private mode: XP won't persist */ }
  showXp();
  slices[won].classList.add('is-won');
  spinResult.innerHTML = `<b>${headline}</b>${line}`;
  spinRoom.classList.remove('is-rare');
  if (rare) {
    void spinRoom.offsetWidth; // replay the flash
    spinRoom.classList.add('is-rare');
  }
}

spinGo.addEventListener('click', () => throwPlate(1, 0.6));

// Grab and throw: the plate follows a sideways drag (above its middle, right turns it clockwise), and a
// quick one throws it that way. A tap spins it too.
let grab = null;
plateWrap.addEventListener('pointerdown', (e) => {
  if (spinning || e.button) return;
  const box = plateWrap.getBoundingClientRect();
  grab = { id: e.pointerId, x: e.clientX, from: turned, at: e.timeStamp, speed: 0, moved: false,
    side: e.clientY < box.top + box.height / 2 ? 1 : -1 };
});
plateWrap.addEventListener('pointermove', (e) => {
  if (e.pointerId !== grab?.id) return;
  const dx = e.clientX - grab.x;
  if (!grab.moved) {
    if (Math.abs(dx) < 6) return; // still a tap
    grab.moved = true;
    plateWrap.setPointerCapture(e.pointerId);
    plate.style.transition = 'none';
  }
  const now = grab.from + dx * 0.4 * grab.side;
  const dt = e.timeStamp - grab.at;
  if (dt > 0) grab.speed += ((now - turned) / dt - grab.speed) * 0.6; // degrees a millisecond, smoothed
  grab.at = e.timeStamp;
  turned = now;
  plate.style.rotate = `${turned}deg`;
});
plateWrap.addEventListener('pointerup', (e) => {
  if (e.pointerId !== grab?.id) return;
  const { moved, speed, at } = grab;
  grab = null;
  if (!moved) throwPlate(1, 0.5);
  else if (Math.abs(speed) > 0.15 && e.timeStamp - at < 80) throwPlate(Math.sign(speed), Math.min(1, Math.abs(speed) / 1.5));
});
plateWrap.addEventListener('pointercancel', (e) => {
  if (e.pointerId === grab?.id) grab = null; // a vertical swipe: the page scrolls instead
});

// ---------- Clean hero slider: the active control's bar fills over 5 s and moves it on ----------
const slider = document.querySelector('.slider');
const slides = [...slider.querySelectorAll('.slide')];
const dots = [...slider.querySelectorAll('.dot')];
const pause = slider.querySelector('.pause');
let current = 0;

// Scene i comes on. With push it pushes in over the one on show (styles.css); without, the scene on show
// plays its entrance again. Its bar starts filling.
function show(i, push = true) {
  const last = current;
  current = (i + slides.length) % slides.length;
  slider.classList.toggle('has-moved', push && last !== current);
  slides.forEach((s, n) => {
    s.classList.remove('is-active');
    s.classList.toggle('was-active', push && n === last && last !== current);
    s.inert = n !== current;
  });
  dots.forEach((d) => d.setAttribute('aria-current', false));
  void slider.offsetWidth; // so the entrance and the bar start over
  slides[current].classList.add('is-active');
  dots[current].setAttribute('aria-current', true);
}

show(0, false);
slider.addEventListener('animationend', (e) => {
  if (e.target === dots[current].lastElementChild) show(current + 1);
});
dots.forEach((d, n) => d.addEventListener('click', () => show(n)));
pause.addEventListener('click', () => {
  const paused = slider.classList.toggle('is-paused');
  pause.textContent = paused ? '▶' : '❚❚';
  pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
});
// Scrolled away it waits, so you come back to the scene you left
new IntersectionObserver(([e]) => slider.classList.toggle('is-away', !e.isIntersecting)).observe(slider);

// ---------- Clean's cursor: a red dot on the pointer and a ring that trails it ----------
// The ring swells over anything clickable and names what a drag does there (data-cursor). Mouse only,
// and only when motion is welcome; styles.css hands the system cursor back in Manga and over text fields.
if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
  const [dot, ring] = ['cursor-dot', 'cursor-ring'].map((className) => {
    const el = Object.assign(document.createElement('i'), { className });
    el.setAttribute('aria-hidden', 'true');
    return el;
  });
  ring.dataset.label = '';
  document.body.append(dot, ring);
  root.classList.add('has-cursor');
  let x = 0, y = 0, rx = 0, ry = 0, trailing = false;
  const trail = () => {
    rx += (x - rx) * 0.22;
    ry += (y - ry) * 0.22;
    ring.style.translate = `${rx}px ${ry}px`;
    trailing = Math.abs(x - rx) + Math.abs(y - ry) > 0.2;
    if (trailing) requestAnimationFrame(trail);
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    dot.style.translate = `${x}px ${y}px`;
    const over = e.target.closest?.('[data-cursor], a, button, label, summary, select');
    ring.dataset.label = over?.dataset.cursor || '';
    ring.classList.toggle('is-over', Boolean(over));
    root.classList.remove('cursor-out');
    if (!trailing) {
      trailing = true;
      requestAnimationFrame(trail);
    }
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget) root.classList.add('cursor-out'); // left the window
  });
}

// ---------- Clean's shop: drag a carton round with the mouse; it swings back when let go ----------
document.querySelectorAll('.products .stage').forEach((stage) => {
  const product = stage.querySelector('.product');
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || root.dataset.mode !== 'clean') return;
    e.preventDefault(); // no text selection
    const from = e.clientX;
    const start = parseFloat(getComputedStyle(product).getPropertyValue('--spin'));
    const turn = (m) => product.style.setProperty('--spin', `${start + (m.clientX - from) * 0.6}deg`);
    stage.setPointerCapture(e.pointerId);
    product.classList.add('is-turning');
    stage.addEventListener('pointermove', turn);
    stage.addEventListener('lostpointercapture', () => {
      stage.removeEventListener('pointermove', turn);
      product.classList.remove('is-turning');
      product.style.removeProperty('--spin');
    }, { once: true });
  });
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

// ---------- Section order: Clean is a shop, so its products, Warriors, photo strip and universe come straight after the hero ----------
// Manga tells the story first. CSS order shows that from the first paint; moving the sections too
// keeps Tab and screen readers in the order on screen.
const [lab, warriors, strip, universe, story] = ['#lab', '#warriors', '.strip-photo', '#universe', '#story'].map((sel) => document.querySelector(sel));
function orderSections() {
  if (root.dataset.mode === 'clean') hero.after(lab, warriors, strip, universe);
  else story.after(universe, lab, warriors);
}
orderSections();

// ---------- The orbit: the Lab, the Warriors and the Vault circle the RSW logo ----------
// Every frame places the planets on a tilted circle seen in perspective, so the nearest is the
// biggest and passes in front of the logo. They drift round, wait under the mouse, spin when dragged
// or swiped sideways, and one tabbed to comes to the front. They fly out from behind the logo the first
// time the orbit is well in view.
const third = (Math.PI * 2) / 3;
const near = 3; // the eye is 3 orbit radii from the logo
const drift = (Math.PI * 2) / 36; // one lap in 36 s
const smooth = (t) => t * t * (3 - 2 * t);

document.querySelectorAll('.orbit').forEach((orbit) => {
  const sun = orbit.querySelector('.sun');
  const [farRing, nearRing] = orbit.querySelectorAll('.ring');
  const planets = [...orbit.querySelectorAll('.planet')];
  for (let z = 1; z <= 12; z++) { // the logo's depth: copies of its letters stacked behind it
    const layer = sun.firstElementChild.cloneNode(true);
    layer.style.setProperty('--z', z);
    sun.append(layer);
  }

  let angle = 2; // the Lab at the front left, the Warriors far left, the Vault at the right
  let speed = 0;
  let cosT, sinT, cosR, sinR, radius, pr, cx, cy;

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

    if (drag?.moved) {
      // the pointer turns it
    } else if (focused >= 0) {
      const off = Math.PI / 2 - focused * third - angle; // a quarter turn round is the front
      const turn = off - Math.round(off / (Math.PI * 2)) * Math.PI * 2; // the short way round
      angle += reduceMotion ? turn : turn * (1 - Math.exp(-dt * 6));
      speed = 0;
    } else {
      speed += ((hovered || reduceMotion ? 0 : drift) - speed) * (1 - Math.exp(-dt * 1.5));
      angle += speed * dt;
    }

    // They fly out from behind the logo once it's well in view
    const out = reduceMotion ? 1 : flyFrom ? smooth(clamp01((now - flyFrom) / 1400)) : 0;
    planets.forEach((planet, k) => {
      const a = angle + k * third;
      const [x, y, scale] = project(a);
      planet.style.translate = `${(cx + x * radius * out - pr).toFixed(1)}px ${(cy + y * radius * out - pr).toFixed(1)}px`;
      planet.style.scale = (scale * (0.3 + 0.7 * out)).toFixed(3);
      planet.style.zIndex = Math.sin(a) > 0 && out > 0.6 ? 4 : 1;
    });
    for (const ring of [farRing, nearRing]) ring.style.scale = out.toFixed(3);
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
  let flyFrom = 0;
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (entry.intersectionRatio >= 0.4) flyFrom ||= performance.now();
    if (!visible || running) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  }, { threshold: [0, 0.4] }).observe(orbit);
});

// ---------- Clean's worlds: a planet tapped opens its world full screen ----------
// The world grows out of the planet as a circle of the planet's colour, then its words rise in (styles.css).
// ×, Esc or its link shrinks it back into the planet, wherever the planet has drifted to by then; the link
// closes it at once instead, as the page jumps to that part of the shop.
function portal(world, planet, opening) {
  const disc = planet.firstElementChild.getBoundingClientRect(); // the planet as drawn, grown on hover
  const x = disc.left + disc.width / 2;
  const y = disc.top + disc.height / 2;
  const cover = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const circles = [`circle(${disc.width / 2}px at ${x}px ${y}px)`, `circle(${cover}px at ${x}px ${y}px)`];
  return world.animate({ clipPath: opening ? circles : circles.reverse() }, {
    duration: opening ? 800 : 550,
    easing: opening ? 'cubic-bezier(0.7, 0, 0.2, 1)' : 'cubic-bezier(0.6, 0, 0.8, 0.4)',
  }).finished;
}

document.querySelectorAll('.hub .planet').forEach((planet) => {
  const world = document.getElementById(`world-${planet.hash.slice(1)}`);
  const parts = [world, ...world.querySelectorAll('[data-anim]')];
  planet.setAttribute('aria-haspopup', 'dialog');

  let closing = false;
  const lock = () => world.open && !closing && root.classList.add('world-open'); // styles.css: once it covers the page

  planet.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Lenis's anchor jump listens further up
    parts.forEach((el) => el.classList.remove('is-in'));
    world.showModal();
    world.focus();
    void world.offsetWidth; // its words' starting places, so they rise from there
    parts.forEach((el) => el.classList.add('is-in'));
    if (reduceMotion) lock();
    else portal(world, planet, true).then(lock);
  });

  async function shut(animate) {
    if (closing || !world.open) return;
    closing = true;
    root.classList.remove('world-open'); // the page settles back before the circle shrinks over it
    if (animate && !reduceMotion) await portal(world, planet, false);
    world.close();
    closing = false;
  }
  world.addEventListener('close', () => root.classList.remove('world-open')); // however it closed
  world.addEventListener('cancel', (e) => { // Esc
    if (!e.cancelable) return; // the browser closes it at once
    e.preventDefault();
    shut(true);
  });
  world.querySelector('.world-close').addEventListener('click', () => shut(true));
  world.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', () => shut(false)));
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

// ---------- Clean's entrances: each plays once, the first time it scrolls into view (the creatine film each time) ----------
// data-anim names the effect and styles.css draws it. Titles split into letters here first (a hidden copy
// keeps the words whole for screen readers), and labels decode from scrambled letters.
const graphemes = window.Intl?.Segmenter ? new Intl.Segmenter() : null; // keeps a letter and its accents together
const lettersOf = (text) => (graphemes ? [...graphemes.segment(text)].map((g) => g.segment) : [...text]);

function splitLetters(el) {
  let n = 0;
  (function walk(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) walk(child);
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) continue;
      const shown = document.createElement('span');
      shown.setAttribute('aria-hidden', 'true');
      for (const part of child.textContent.split(/(\s+)/)) {
        if (!part.trim()) {
          shown.append(part);
          continue;
        }
        const word = Object.assign(document.createElement('span'), { className: 'w' });
        for (const letter of lettersOf(part)) {
          const c = Object.assign(document.createElement('span'), { className: 'c', textContent: letter });
          c.style.setProperty('--i', n++);
          word.append(c);
        }
        shown.append(word);
      }
      child.replaceWith(Object.assign(document.createElement('span'), { className: 'sr', textContent: child.textContent }), shown);
    }
  })(el);
}

const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?';
function scramble(el) {
  const texts = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) if (walker.currentNode.textContent.trim()) texts.push([walker.currentNode, walker.currentNode.textContent]);
  const start = performance.now();
  requestAnimationFrame(function tick(now) {
    const t = Math.min(1, (now - start) / 750);
    for (const [node, text] of texts) {
      const settled = Math.floor(t * text.length);
      node.textContent = text.slice(0, settled) + [...text.slice(settled)]
        .map((ch) => (ch.trim() ? glyphs[Math.floor(Math.random() * glyphs.length)] : ch)).join('');
    }
    if (t < 1) requestAnimationFrame(tick);
  });
}

const entrances = new IntersectionObserver((entries) => {
  for (const { isIntersecting, target } of entries) {
    if (!isIntersecting) continue;
    entrances.unobserve(target);
    target.classList.add('is-in');
    if (target.matches('[data-anim~="scramble"]') && root.dataset.mode === 'clean' && !reduceMotion) scramble(target);
  }
}, { rootMargin: '0px 0px -12% 0px' });
document.querySelectorAll('[data-anim~="letters"], .slider .display').forEach(splitLetters);
// A group's members go one after another (--k)
document.querySelectorAll('[data-anim~="cards"], [data-anim~="deal"]').forEach((group) => {
  [...group.children].forEach((el, k) => el.style.setProperty('--k', k));
});
document.querySelectorAll('[data-anim]').forEach((el) => el.closest('.world') || entrances.observe(el)); // a world plays its own on opening
// The creatine film rewinds once it's wholly off the screen, so it plays again the next time it comes into view
const rewind = new IntersectionObserver((entries) => {
  for (const { isIntersecting, target } of entries) {
    if (isIntersecting) continue;
    target.classList.remove('is-in');
    entrances.observe(target);
  }
});
document.querySelectorAll('[data-anim~="film"]').forEach((el) => rewind.observe(el));

// ---------- Scroll-linked effects (skipped when motion is unwelcome) ----------
// Only Manga's hero follows the scroll: it pins and charges up as you scroll its tall track. Clean's
// effects each play once (data-anim, above), so scrolling Clean costs no work at all.
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function onScroll() {
  if (root.dataset.mode !== 'manga') return;
  const vh = innerHeight;
  const pin = hero.getBoundingClientRect();

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
  // Lenis eases wheel scrolling and anchor jumps, and reports every scroll, keys and scrollbar included.
  // Touch screens scroll natively: Lenis would leave touch alone anyway, but its blocking touch listeners
  // make every swipe wait for the page's work
  if (window.Lenis && !matchMedia('(pointer: coarse)').matches) {
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
