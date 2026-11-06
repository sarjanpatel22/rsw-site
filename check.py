"""Smoke test for the RSW site: python3 check.py [screenshot_dir]

Drives headless Chromium through the mode popup and switch, Clean's shop, cart, slider, the universe orbit
(drift, drag, swipe, Tab) and the worlds its planets open, scroll effects, the spin-the-plate game, Manga's power-up hero and comic
strip, smooth scrolling, product boxes, Gujarati font, phone menu and the AI Sensei chat, and checks there is no
sideways scrolling on a small phone.
"""
import pathlib
import re
import sys
import time
import urllib.parse

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys

PAGE = (pathlib.Path(__file__).parent / "index.html").resolve().as_uri()

# Dela Gothic One is loaded as a subset of just the Japanese the page uses (katakana, and the kanji of
# Sensei's stamp), so every letter must be in it
site = pathlib.Path(__file__).parent
source = "".join((site / f).read_text() for f in ("index.html", "styles.css", "hero.js"))
subset = urllib.parse.unquote(re.search(r"family=Dela\+Gothic\+One&text=([^\"&]+)", source).group(1))
missing = sorted({ch for ch in source if "\u3040" <= ch <= "\u30ff" or "\u4e00" <= ch <= "\u9fff"} - set(subset))
assert not missing, f"Japanese missing from the Dela Gothic One subset in index.html: {''.join(missing)}"
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

opts = webdriver.ChromeOptions()
opts.add_argument("--headless=new")
opts.add_argument("--enable-unsafe-swiftshader")  # headless Chromium only gets WebGL through SwiftShader
opts.binary_location = "/usr/bin/chromium"
opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})  # so the console can be checked for errors
driver = webdriver.Chrome(options=opts, service=Service("/usr/bin/chromedriver"))
js = driver.execute_script


def mode():
    return js("return document.documentElement.dataset.mode")


def no_sideways_scroll(label):
    over = js("return document.documentElement.scrollWidth - innerWidth")
    assert over <= 0, f"{label}: page scrolls sideways by {over}px"


def page_shots(name, width):
    """Screenshot screen by screen; a page-tall window would stretch the 100svh hero."""
    if not shots:
        return
    driver.set_window_size(width, 900)
    js("scrollTo(0, 0)")
    time.sleep(1)
    height, screen = js("return [document.documentElement.scrollHeight, innerHeight]")
    for n, y in enumerate(range(0, height, screen)):
        js(f"scrollTo(0, {y})")
        time.sleep(1.2)  # smooth scroll + reveals settle
        driver.save_screenshot(str(shots / f"{name}-{n:02}.png"))


try:
    driver.set_window_size(1440, 900)
    driver.get(PAGE)
    js("localStorage.clear(); sessionStorage.clear()")
    driver.refresh()

    dialog = driver.find_element(By.CSS_SELECTOR, ".mode-dialog")
    assert not dialog.get_attribute("open"), "popup should wait before opening"
    time.sleep(1.6)
    assert dialog.get_attribute("open") is not None, "popup did not open"
    assert js("return document.activeElement === document.querySelector('.mode-dialog')"), "neither side should start out picked"

    driver.find_element(By.CSS_SELECTOR, '[data-pick="manga"]').click()
    time.sleep(1)
    assert mode() == "manga", "picking Manga did not switch mode"
    assert js("return localStorage.getItem('rsw-mode')") == "manga", "mode not saved"

    driver.refresh()
    time.sleep(1.6)
    assert mode() == "manga", "saved mode not restored"
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is None, "a reload in the same tab shouldn't ask again"

    # A new visit asks again; Escape keeps the saved mode
    js("sessionStorage.clear()")
    driver.refresh()
    time.sleep(1.6)
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is not None, "a new visit should ask again"
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(0.4)
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is None and mode() == "manga", \
        "Escape should close the popup and keep Manga"

    # Music (once the page has its song): silent until the first click, which starts it; the switch mutes it
    # for good. Escape, the only key so far, doesn't count as a click.
    switch = driver.find_element(By.CSS_SELECTOR, ".sound-toggle")
    if js("return Boolean(document.querySelector('.music'))"):
        playing = lambda: not js("return document.querySelector('.music').paused")
        assert not playing(), "music started before any click"
        driver.find_element(By.CSS_SELECTOR, ".logo").click()
        time.sleep(0.5)
        assert playing() and switch.get_attribute("aria-pressed") == "true", "the first click should start the music"
        switch.click()
        assert not playing() and js("return localStorage.getItem('rsw-music')") == "off", "the switch should mute the music"
        driver.refresh()
        time.sleep(1.6)
        driver.find_element(By.CSS_SELECTOR, ".logo").click()
        time.sleep(0.5)
        assert not playing(), "muted music should stay off after a reload"
    else:
        assert not switch.is_displayed(), "a music switch with no song to play"

    toggle = driver.find_element(By.CSS_SELECTOR, ".mode-switch")
    toggle.click()
    time.sleep(1)
    assert mode() == "clean" and toggle.get_attribute("aria-pressed") == "false", "switch to Clean failed"

    assert js("return [...document.fonts].some((f) => f.family.includes('Anek Gujarati') && f.status === 'loaded')"), \
        "Gujarati font did not load"

    # Clean's slider moves on every 5 s, pauses, and jumps with the dots
    active = lambda: js("return [...document.querySelectorAll('.slide')].findIndex(s => s.classList.contains('is-active'))")
    assert active() == 0
    time.sleep(5.5)
    assert active() == 1, "slider did not advance after 5s"
    driver.find_element(By.CSS_SELECTOR, ".pause").click()
    time.sleep(5.5)
    assert active() == 1, "slider advanced while paused"
    driver.find_element(By.CSS_SELECTOR, ".dot").click()
    assert active() == 0, "dot did not jump to slide 1"  # stays paused, so screenshots show slide 1
    srcs = js("return [...document.querySelectorAll('.slide-photo')].map((i) => i.currentSrc)")
    assert len(srcs) == 2 and not any("-tall" in src for src in srcs), f"a wide screen got the upright crops: {srcs}"

    # The modes are different pages: each shows only its own hero, universe and creatine story
    def shown(sel):
        return js(f"return getComputedStyle(document.querySelector('{sel}')).display") != "none"

    clean_parts, manga_parts = [".slider", ".hub", ".creatine", ".strip-photo", ".strip-facts"], [".hero-stage", ".universe > .orbit", ".strip"]
    assert all(map(shown, clean_parts)) and not any(map(shown, manga_parts)), "Clean should show only its own parts"
    gujarati_shown = "return [...document.querySelectorAll('[lang=\"gu\"]')].some((el) => el.checkVisibility())"
    assert not js(gujarati_shown), "Clean should show no Gujarati"

    # Keyboard and screen-reader order (the page's order) matches the order on screen
    def order_matches(label):
        dom, seen = js("""const kids = [...document.querySelector('main').children].filter((e) => e.checkVisibility());
            return [kids, [...kids].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)].map((l) => l.map((e) => e.id || e.className))""")
        assert dom == seen, f"{label}: page order {dom} differs from screen order {seen}"

    order_matches("Clean")

    # Clean is a shop: the products come before the story, and Add to cart fills the cart
    top_of = lambda sel: js(f"return document.querySelector('{sel}').getBoundingClientRect().top")
    assert top_of("#lab") < top_of("#warriors") < top_of(".strip-photo") < top_of("#universe") < top_of("#story"), \
        "Clean should show the shop, the Warriors, the photo strip and the universe before the story"
    assert top_of("#story") < top_of(".strip-facts") < top_of(".creatine") < top_of(".soon"), \
        "Clean should follow the story with the facts label and how creatine works"
    adds = driver.find_elements(By.CSS_SELECTOR, ".add")
    js("arguments[0].click(); arguments[1].click()", adds[0], adds[1])
    assert driver.find_element(By.CSS_SELECTOR, ".cart-count").text == "2", "cart badge should count 2 items"
    driver.find_element(By.CSS_SELECTOR, ".cart-toggle").click()
    assert "2 items" in driver.find_element(By.CSS_SELECTOR, "#cart").text, "cart panel should list 2 items"
    js("document.querySelector('#cart').hidePopover()")

    # Clean's shop: dragging a carton with the mouse turns it; let go, it swings back
    stage = driver.find_element(By.CSS_SELECTOR, ".products .stage")
    spin_of = lambda: float(js("return getComputedStyle(document.querySelector('.products .product')).getPropertyValue('--spin')").removesuffix("deg"))
    js("arguments[0].scrollIntoView({block: 'center'})", stage)
    time.sleep(2)  # the cards and boxes play their entrances
    rest = spin_of()
    ActionChains(driver).move_to_element(stage).click_and_hold().move_by_offset(150, 0).perform()
    held = spin_of()
    ActionChains(driver).release().perform()
    time.sleep(1.5)
    assert held - rest > 60, f"dragging the carton did not turn it ({rest} -> {held})"
    assert abs(spin_of() - rest) < 1, "the carton did not swing back when let go"

    # Clean: nothing follows the scroll position; each entrance plays once, the first time it comes into view
    vh = js("return innerHeight")
    assert js("return document.documentElement.classList.contains('lenis')"), "Lenis smooth scrolling not running"
    assert js("return document.querySelectorAll('.box').length") == 11, "expected 3 banner boxes, 5 card boxes and 3 in the Lab's world"

    def jump(y):
        js(f"scrollTo({{top: {y}, behavior: 'instant'}})")
        time.sleep(0.4)

    def played(sel):
        return js(f"return document.querySelector('{sel}').classList.contains('is-in')")

    def risen(sel):  # every split letter back in its place
        return js(f"return [...document.querySelectorAll('{sel} .c')].every((c) => ['none', '0px'].includes(getComputedStyle(c).translate))")

    heading = "#story > h2"
    assert not played(heading), "the story's heading shouldn't play before it's reached"
    assert js("return getComputedStyle(document.querySelector('.universe')).scale") == "0.9", "Universe should start as a card"
    at_heading = js(f"return document.querySelector('{heading}').getBoundingClientRect().top + scrollY - innerHeight / 2")
    jump(at_heading)
    time.sleep(1.6)
    assert played(heading) and risen(heading), "the story's heading should rise in once it's in view"
    sr_words = js(f"return [...document.querySelectorAll('{heading} .sr')].map((s) => s.textContent).join(' ')").split()
    assert " ".join(sr_words) == "Gym was never meant to be boring.", "screen readers should get the heading's words whole"
    jump(0)
    jump(at_heading)
    assert risen(heading), "scrolling back to it shouldn't play it again"

    # The universe grows to the full width once, into a night sky of twinkling stars round the orbit
    jump(js("return document.querySelector('.universe').getBoundingClientRect().top + scrollY - innerHeight / 2"))
    time.sleep(1.6)
    assert js("return getComputedStyle(document.querySelector('.universe')).scale") in ("1", "none"), "Universe should grow to full width"
    assert js("""const s = document.querySelector('.stars');
        return s.checkVisibility() && getComputedStyle(s).backgroundImage.includes('radial-gradient')
          && getComputedStyle(s, '::after').animationName === 'twinkle'"""), "the orbit should sit among twinkling stars"

    # The hub's words fit on its screen and stay off the orbit, whose planets and logo stay inside its box, and
    # the near half of the ring passes clear of the logo's letters. Each world's words fit on its screen, clear
    # of its picture and its ×.
    js("document.querySelectorAll('.universe, .universe [data-anim]').forEach((el) => el.classList.add('is-in'))")
    time.sleep(2.5)  # the universe's entrances all done (the rest still play when reached)
    measure = """const r = document.createRange();
        // a split title is measured by its letters: its screen-reader copy is laid out unclipped
        const box = (el) => {
          const ls = [...el.querySelectorAll('.c')].map((l) => l.getBoundingClientRect());
          if (!ls.length) { r.selectNodeContents(el); return r.getBoundingClientRect(); }
          return {left: Math.min(...ls.map(b => b.left)), right: Math.max(...ls.map(b => b.right)),
                  top: Math.min(...ls.map(b => b.top)), bottom: Math.max(...ls.map(b => b.bottom))};
        };
        const meets = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;"""

    def universe_words_fit(w, h):
        driver.set_window_size(w, h)
        time.sleep(0.4)
        jump(js("return document.querySelector('.hub').getBoundingClientRect().top + scrollY"))
        bad = js(measure + """
            const shown = [...document.querySelector('.hub-copy').children].filter(c => c.checkVisibility());
            const words = shown.map(box);
            const nav = document.querySelector('.nav').getBoundingClientRect().bottom;
            if (words.some(b => b.top < nav || b.bottom > innerHeight)) return 'off screen';
            const o = document.querySelector('.hub .orbit'), ob = o.getBoundingClientRect();
            if (words.some((b, k) => shown[k] !== o && meets(b, ob))) return 'on the orbit';
            const parts = [...o.querySelectorAll('.planet, .sun')].map((e) => e.getBoundingClientRect());
            if (parts.some((b) => b.left < ob.left - 1 || b.right > ob.right + 1 || b.top < ob.top - 1 || b.bottom > ob.bottom + 1)) return 'beside a planet or logo that leaves the orbit';
            const sun = o.querySelector('.sun').getBoundingClientRect(), ring = o.querySelectorAll('.ring path')[1];
            for (let n = 0; n <= 60; n++) {
              const pt = ring.getPointAtLength((ring.getTotalLength() * n) / 60);
              const x = ob.left + pt.x, y = ob.top + pt.y;
              if (x > sun.left + 4 && x < sun.right - 4 && y > sun.top + 4 && y < sun.bottom - 4) return 'beside a ring that cuts through the logo';
            }
            return '';""")
        assert not bad, f"{w}x{h}: the universe's words are {bad}"
        for world in ("lab", "warriors", "vault"):
            bad = js(measure + """
                const g = document.getElementById(arguments[0]);
                g.showModal();  // straight to how it ends up: words risen, no circle growing
                [g, ...g.querySelectorAll('[data-anim]')].forEach((el) => el.classList.add('is-in'));
                g.getAnimations({ subtree: true }).forEach((a) => a.effect.getComputedTiming().endTime < Infinity && a.finish());  // the cartons float for ever
                const shown = [...g.querySelector('.world-copy').children].filter(c => c.checkVisibility());
                const words = shown.map(box);
                const x = g.querySelector('.world-close').getBoundingClientRect();
                const photo = g.querySelector('.world-photo'), p = photo.getBoundingClientRect();
                const result = words.some(b => b.top < 0 || b.bottom > innerHeight || b.right > innerWidth) ? 'off screen'
                  : words.some(b => meets(b, x)) ? 'under its ×'
                  : p.height > 0 && words.some(b => meets(b, p)) ? 'under its picture' : '';
                g.close();
                return result;""", f"world-{world}")
            assert not bad, f"{w}x{h}: the {world} world's words are {bad}"

    sizes = [(1440, 900), (1366, 768), (1280, 720), (1920, 1080), (1024, 911), (768, 1167), (390, 844), (360, 740), (375, 667)]
    for size in sizes:  # window sizes: laptops, a landscape and a portrait iPad, phones
        universe_words_fit(*size)
    driver.set_window_size(1440, 900)
    time.sleep(0.4)

    # The orbit: the worlds drift round the logo, and one tabbed to comes to the front. A click opens its world: a
    # circle of the planet's colour grows out of it to fill the screen and the words rise in; Esc or × shrinks it
    # back into the planet, and its link closes it and jumps to its part of the page. Dragging spins the worlds
    # without opening one.
    def planets(orbit):
        """[centre x, centre y, scale, z-index] of each planet: the Lab, the Warriors, the Vault"""
        return js(f"""return [...document.querySelectorAll('{orbit} .planet')].map((p) => {{ const b = p.getBoundingClientRect();
            return [b.left + b.width / 2, b.top + b.height / 2, parseFloat(p.style.scale), p.style.zIndex]; }})""")

    def drifts(orbit):
        before = planets(orbit)
        time.sleep(1)
        return any(abs(a[0] - b[0]) + abs(a[1] - b[1]) > 3 for a, b in zip(before, planets(orbit)))

    def front(orbit):
        ps = planets(orbit)
        return max(range(3), key=lambda k: ps[k][2])

    def world_open():
        return js("return document.querySelector('.world[open]')?.id || ''")

    hub_top = js("return document.querySelector('.hub').getBoundingClientRect().top + scrollY")
    jump(hub_top)
    time.sleep(1)
    assert drifts(".hub"), "the worlds should drift round the logo"

    js("arguments[0].focus()", driver.find_element(By.CSS_SELECTOR, "#sensei .btn"))
    time.sleep(1)  # focus scrolls it into view, smoothly
    ActionChains(driver).key_down(Keys.SHIFT).send_keys(Keys.TAB).key_up(Keys.SHIFT).perform()
    time.sleep(1.5)
    assert js("return document.activeElement.getAttribute('href')") == "#vault", "Shift+Tab from the Sensei card should reach the Vault planet"
    assert front(".hub") == 2 and planets(".hub")[2][3] == "4", "a world tabbed to should come to the front"
    where = js("return [location.hash, scrollY]")
    driver.find_element(By.CSS_SELECTOR, '.hub .planet[href="#vault"]').click()
    time.sleep(0.3)
    assert world_open() == "world-vault" and js("return document.querySelector('#world-vault').getAnimations().length") == 1, \
        "clicking the Vault planet should grow its world out of it"
    time.sleep(1.5)
    assert js("return getComputedStyle(document.querySelector('#world-vault')).clipPath") == "none", "the Vault's world should fill the screen"
    assert risen("#world-vault .h1") and js("return document.activeElement.id") == "world-vault", "the Vault's title should rise in, with focus in its world"
    assert js("return getComputedStyle(document.documentElement).overflow") == "hidden", "the page should hold still behind a world"
    ActionChains(driver).send_keys(Keys.ESCAPE).perform()
    time.sleep(0.25)
    assert world_open() == "world-vault", "Esc should first shrink the world back into its planet"
    time.sleep(0.8)
    assert world_open() == "" and js("return document.activeElement.getAttribute('href')") == "#vault", \
        "Esc should close the world and hand focus back to its planet"
    now = js("return [location.hash, scrollY, getComputedStyle(document.documentElement).overflow]")
    assert now == where + ["visible"], f"a world opened and closed should leave the page where it was, scrolling: {where} -> {now}"
    js("document.querySelector('.hub .planet[href=\"#warriors\"]').click()")
    time.sleep(1.5)
    assert js("return document.querySelector('#world-warriors .world-photo').naturalWidth") > 0, "the Warriors' world should show its photo"
    driver.find_element(By.CSS_SELECTOR, "#world-warriors .world-close").click()
    time.sleep(1)
    assert world_open() == "", "the × should close the world"
    js("document.querySelector('.hub .planet[href=\"#lab\"]').click()")
    time.sleep(1.5)
    driver.find_element(By.CSS_SELECTOR, "#world-lab .world-copy > a").click()
    time.sleep(2.5)
    assert world_open() == "" and 0 <= top_of("#lab") < 150, f"the Lab's link should close its world and open the shop, it's {top_of('#lab')}px from the top"

    def mouse(kind, x, y, **more):
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, **more})

    jump(hub_top)
    time.sleep(1)
    k = front(".hub")
    x, y = planets(".hub")[k][:2]
    where = js("return [location.hash, scrollY]")
    mouse("mouseMoved", x, y)
    mouse("mousePressed", x, y, button="left", clickCount=1)
    for n in range(1, 11):
        mouse("mouseMoved", x + 25 * n, y, button="left", buttons=1)
        time.sleep(0.016)
    mouse("mouseReleased", x + 250, y, button="left", clickCount=1)
    time.sleep(0.3)
    assert js("return [location.hash, scrollY]") == where and not world_open(), "dragging a planet should spin the worlds, not open one"
    assert planets(".hub")[k][0] - x > 100, "dragging right should carry the front world right"
    mouse("mouseMoved", 5, 5)  # off the planets, so they drift again

    # Clean's creatine tank plays like a short film each time it comes into view: training drains the level
    # to 20%, creatine refills it to 60%, then to 100%, each step's words in turn
    def tank():
        return js("""const t = document.querySelector('.tank');
            return [+getComputedStyle(t).getPropertyValue('--atp'), [...t.querySelectorAll('.tank-steps li')].map((li) => +getComputedStyle(li).opacity > 0.5)]""")

    jump(js("return document.querySelector('.tank').getBoundingClientRect().top + scrollY"))
    seen = []
    for _ in range(40):
        seen.append(tank())
        time.sleep(0.2)
    assert any(level <= 25 and steps == [True, False, False] for level, steps in seen), f"training should drain the level on the first step: {seen}"
    assert any(50 <= level <= 70 and steps == [False, True, False] for level, steps in seen), f"creatine should refill it on the second step: {seen}"
    assert seen[-1] == [100, [False, False, True]], f"the film should end full, on the last step: {seen[-1]}"
    jump(0)
    time.sleep(0.5)
    jump(js("return document.querySelector('.tank').getBoundingClientRect().top + scrollY"))
    again = []
    for _ in range(15):
        again.append(tank())
        time.sleep(0.2)
    assert any(level <= 25 and steps == [True, False, False] for level, steps in again), f"coming back, the film should play again: {again}"

    # The level runs in a bar of its own (a column, or a band on phones): at every size it's big enough to
    # see, and the words stay out of it and on the screen
    for w, h in sizes:
        driver.set_window_size(w, h)
        jump(js("return document.querySelector('.tank').getBoundingClientRect().top + scrollY"))
        bad = js("""const tank = document.querySelector('.tank'), r = document.createRange();
            const bar = tank.querySelector('.tank-bar').getBoundingClientRect();
            if (bar.width < innerWidth * 0.35 || bar.height < 80) return 'beside a level bar too thin to see';
            const box = (el) => {  // a split title is measured by its letters (see the universe above)
              const ls = [...el.querySelectorAll('.c')].map((l) => l.getBoundingClientRect());
              if (!ls.length) { r.selectNodeContents(el); return r.getBoundingClientRect(); }
              return {left: Math.min(...ls.map(b => b.left)), right: Math.max(...ls.map(b => b.right)),
                      top: Math.min(...ls.map(b => b.top)), bottom: Math.max(...ls.map(b => b.bottom))};
            };
            const boxes = [...tank.querySelectorAll('.tank-view > h2, .tank-steps li:nth-child(3)')].map(box)
              .concat(tank.querySelector('.tank-level').getBoundingClientRect());
            if (boxes.some((b) => b.right > bar.left && b.left < bar.right && b.bottom > bar.top && b.top < bar.bottom)) return 'into the level bar';
            const nav = document.querySelector('.nav').getBoundingClientRect().bottom;
            return boxes.some((b) => b.top < nav || b.bottom > innerHeight) ? 'off the screen' : ''""")
        assert not bad, f"{w}x{h}: the tank's words run {bad}"
    driver.set_window_size(1440, 900)
    time.sleep(0.4)

    # Spin the plate: the reward is picked by the brief's odds and the plate stops with it under the pin,
    # every spin earns 5 XP, and a quick sideways throw spins it too
    def plate_turn():
        return js("return parseFloat(getComputedStyle(document.querySelector('.plate')).rotate) || 0")

    jump(js("return document.querySelector('.plate-wrap').getBoundingClientRect().top + scrollY - 100"))
    xp = int(js("return document.querySelector('.xp b').textContent"))
    js("window.realRandom = Math.random; Math.random = () => 0.0019")  # rolls 1.9 in 1,000: the one-in-500 slice
    driver.find_element(By.CSS_SELECTOR, ".spin-go").click()
    assert js("return document.querySelector('.spin-go').disabled"), "Spin should wait while the plate spins"
    time.sleep(4.6)
    js("Math.random = window.realRandom")
    landed = plate_turn() % 360
    assert min(landed, 360 - landed) < 360 / 16, f"the plate should stop with the 30% slice under the pin, it's {landed:.1f}° round"
    assert js("return document.querySelector('.spin-result b').textContent") == "Rare! 30% off", "the rare reward should show"
    assert js("return [...document.querySelectorAll('.p-seg')].findIndex((g) => g.classList.contains('is-won'))") == 0, \
        "the slice it landed on should light up"
    assert int(js("return document.querySelector('.xp b').textContent")) == min(50, xp + 5), "a spin should earn 5 XP"
    px, py = js("const b = document.querySelector('.plate-wrap').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 4]")
    before = plate_turn()
    mouse("mouseMoved", px - 120, py)
    mouse("mousePressed", px - 120, py, button="left", clickCount=1)
    for n in range(1, 9):
        mouse("mouseMoved", px - 120 + 30 * n, py, button="left", buttons=1)
        time.sleep(0.016)
    mouse("mouseReleased", px + 120, py, button="left", clickCount=1)
    time.sleep(1)
    assert plate_turn() - before > 360, f"a throw to the right above the middle should spin the plate clockwise, it turned {plate_turn() - before:.0f}°"
    time.sleep(4.5)
    assert js("return document.querySelector('.spin-result').textContent"), "the thrown plate should land on a reward"
    logo, middle = js("""const l = document.querySelector('.plate-logo').getBoundingClientRect(), p = document.querySelector('.plate').getBoundingClientRect();
        return [[l.left + l.width / 2, l.top + l.height / 2], [p.left + p.width / 2, p.top + p.height / 2]]""")
    assert max(abs(a - b) for a, b in zip(logo, middle)) < 2 and js("return getComputedStyle(document.querySelector('.plate-logo')).rotate") == "none", \
        f"the RSW logo should sit upright in the middle of the plate: {logo} vs {middle}"

    # The photos of people training all load (the lazy ones once scrolled to); each mode shows its own
    def photos_load(label):
        shown_imgs = "[...document.querySelectorAll('main img')].filter((img) => img.checkVisibility())"
        for i in range(js(f"return {shown_imgs}.length")):
            js(f"{shown_imgs}[{i}].scrollIntoView({{block: 'center'}})")
            time.sleep(0.3)
        broken = js(f"return {shown_imgs}.filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'))")
        assert not broken, f"{label}: photos failed to load: {broken}"

    photos_load("Clean")
    greyed = js("return [...document.querySelectorAll('img')].filter((img) => img.checkVisibility() && getComputedStyle(img).filter !== 'none').map((img) => img.getAttribute('src'))")
    assert not greyed, f"Clean shows its photos in full colour, but these are filtered: {greyed}"

    # Whatever has played its entrance shows: nothing is left invisible
    def nothing_stuck(label):
        end = js("return document.documentElement.scrollHeight - innerHeight")
        for y in range(0, int(end) + 1, int(vh * 0.6)):
            jump(y)
        time.sleep(1.5)
        stuck = js("""return [...document.querySelectorAll('.reveal.is-in, [data-anim].is-in, [data-anim~=cards].is-in > *, [data-anim~=deal].is-in > *')]
            .filter((el) => el.checkVisibility() && getComputedStyle(el).opacity === '0').map((el) => el.tagName + '.' + el.className)""")
        assert not stuck, f"{label}: played its entrance but still invisible: {stuck}"
        # Firefox (on a GPU) draws a 3D carton in loose pieces when any parent is turned
        tilted = js("""return [...document.querySelectorAll('.box')].filter((box) => {
            for (let el = box.parentElement; el; el = el.parentElement) {
              const cs = getComputedStyle(el), m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
              if (cs.rotate !== 'none' || m.b || m.c) return true;
            }
          }).map((box) => box.textContent)""")
        assert not tilted, f"{label}: cartons inside a tilted parent: {tilted}"

    nothing_stuck("Clean")

    # Manga: picking it jumps to the top, then the 3D power-up hero stays pinned while --power
    # climbs to the final form
    def wait_for_landing():
        for _ in range(80):  # the tub drops in (three.js may still be loading)
            if js("return document.querySelector('.hero').classList.contains('is-landed')"):
                return True
            time.sleep(0.1)
        return False

    driver.find_element(By.CSS_SELECTOR, ".mode-switch").click()
    time.sleep(1)
    assert mode() == "manga" and js("return scrollY") == 0, "picking Manga should start from the top"
    order_matches("Manga")
    wait_for_landing()
    assert all(map(shown, manga_parts)) and not any(map(shown, clean_parts)), "Manga should show only its own parts"
    assert js(gujarati_shown), "Manga should show the Gujarati words"
    inked = js("return [...document.querySelectorAll('.story-photo img, .warrior-shots img')].filter((img) => img.checkVisibility()).map((img) => [img.getAttribute('src'), getComputedStyle(img).filter])")
    assert len(inked) == 6 and all(src.startswith("img/manga-") and f == "grayscale(1) contrast(1.35)" for src, f in inked), f"Manga should show its own photos as inked panels, got {inked}"

    def power():
        return float(js("return document.querySelector('.hero').style.getPropertyValue('--power')"))

    def hero_has(name):
        return js(f"return document.querySelector('.hero').classList.contains('{name}')")

    assert hero_has("is-landed"), "the 3D tub never dropped in (three.js or WebGL failed)"
    assert power() == 0 and not hero_has("is-charging"), "hero should start uncharged"
    track = js("return document.querySelector('.hero').offsetHeight") - vh
    jump(track * 0.85 / 2)
    assert 0.45 < power() < 0.55, f"half way down the pin the power is {power()}"
    assert abs(js("return document.querySelector('.hero-stage').getBoundingClientRect().top")) < 2, "hero stage should stay pinned"
    assert js("return document.querySelector('.sfx[data-at=\"0.45\"]').classList.contains('is-on')"), "sound effect at 45% missing"
    assert js("return getComputedStyle(document.querySelector('.hero-copy')).visibility") == "hidden", "intro text should leave"
    jump(track * 0.95)
    assert hero_has("is-final"), "no final form at full power"
    assert js("return getComputedStyle(document.querySelector('.final')).visibility") == "visible", "final form hidden"

    # Sitting at either end, the animation comes round again every 5 s
    def replays_within(part, seconds):
        js(f"window.replays = 0; document.querySelector('.hero').addEventListener('{part}', () => window.replays++)")
        time.sleep(seconds)
        return js("return window.replays")

    assert replays_within("final", 5.6) >= 1, "at the final form, its burst should play again within 5 s"

    # Back at the top, the intro plays again: the tub drops and lands once more
    jump(0)
    assert not hero_has("is-landed"), "scrolling back to the top should restart the tub's drop"
    assert wait_for_landing(), "the tub did not land again after scrolling back to the top"
    assert replays_within("intro", 5.6) >= 1, "sitting at the top, the intro should play again within 5 s"

    # Charged, then away below the hero for over 10 s: coming back up, it's fresh again. It shows
    # uncharged as it slides in, then rewinds to the top once its stage fills the screen.
    jump(track * 0.95)
    jump(js("return document.querySelector('#story').getBoundingClientRect().top + scrollY"))
    time.sleep(10.5)
    jump(track + vh / 2)  # half the stage back on screen
    assert power() == 0 and not hero_has("is-final"), f"back after 10 s the hero should be uncharged, power {power()}"
    jump(track - 10)  # the stage fills the screen again
    assert js("return scrollY") == 0, "the fresh hero should rewind to the top"


    # Manga's orbit: the inked worlds drift round the logo too
    jump(js("return document.querySelector('.universe > .orbit').getBoundingClientRect().top + scrollY - 80"))
    time.sleep(1.5)
    assert drifts(".universe > .orbit"), "Manga's worlds should drift round the logo"

    # Manga's creatine strip reveals as it scrolls in
    jump(js("return document.querySelector('.strip-panels').getBoundingClientRect().top + scrollY") - vh / 2)
    time.sleep(0.6)
    revealed = js("return [...document.querySelectorAll('.strip-panels li')].filter((li) => li.classList.contains('is-in')).length")
    assert revealed == 3, f"{revealed} of 3 comic panels revealed"
    photos_load("Manga")
    nothing_stuck("Manga")
    js("document.documentElement.dataset.mode = 'clean'")

    # Phones: links live behind the Menu button; product cards swipe sideways
    driver.set_window_size(390, 844)
    jump(0)
    menu = driver.find_element(By.CSS_SELECTOR, "#menu")
    assert not menu.is_displayed(), "phone menu should start closed"
    driver.find_element(By.CSS_SELECTOR, ".menu-toggle").click()
    time.sleep(0.4)
    assert menu.is_displayed(), "Menu button did not open the links"
    menu.find_element(By.CSS_SELECTOR, 'a[href="#lab"]').click()
    time.sleep(2)  # Lenis eases the jump
    assert not menu.is_displayed(), "menu stayed open after picking a link"
    lab_top = js("return document.querySelector('#lab').getBoundingClientRect().top")
    assert 0 <= lab_top < 120, f"The Lab link landed {lab_top}px from the top"
    assert js("const p = document.querySelector('.products'); return p.scrollWidth > p.clientWidth"), "phone product cards should swipe"

    # The bar fits every phone, down to a folding phone's 280px outer screen
    for w in (280, 320, 360, 375):
        driver.set_window_size(w, 800)
        time.sleep(0.3)
        cut = js("return document.querySelector('.mode-switch').getBoundingClientRect().right - document.documentElement.clientWidth")
        assert cut <= 0, f"header cut off by {cut}px at {w}px wide"

    # Tablets: portrait ones get the phones' bar; from 901px the whole bar fits on one line in both modes
    for m in ("clean", "manga"):
        js(f"document.documentElement.dataset.mode = '{m}'")
        for w in (768, 834, 901, 1024, 1180):
            driver.set_window_size(w, 900)
            time.sleep(0.3)
            cut, wrapped = js("""const r = document.createRange();
                const wrapped = [...document.querySelectorAll('.nav-links a')].filter((a) => {
                  r.selectNodeContents(a); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1; });
                return [document.querySelector('.mode-switch').getBoundingClientRect().right - document.documentElement.clientWidth, wrapped.length]""")
            assert cut <= 0 and not wrapped, f"{m} @ {w}px: the bar is cut by {cut}px and {wrapped} links wrap"

    for m in ("clean", "manga"):
        js(f"document.documentElement.dataset.mode = '{m}'")
        for w in (360, 768, 1440):
            driver.set_window_size(w, 800)
            time.sleep(0.5)
            no_sideways_scroll(f"{m} @ {w}px")
        page_shots(f"{m}-desktop", 1440)
        page_shots(f"{m}-mobile", 390)

    # A portrait iPad with touch: Clean scrolls natively, a sideways swipe spins the orbit, and in Manga finger
    # swipes charge the power-up while its stage holds still
    def swipe(dy, x=380, y0=800):
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
        for k in range(1, 21):
            driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y0 - dy * k / 20}]})
            time.sleep(0.016)
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        time.sleep(0.9)  # the fling settles

    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": 768, "height": 1024, "deviceScaleFactor": 1, "mobile": True})
    driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    js("localStorage.setItem('rsw-mode', 'clean')")
    driver.refresh()
    time.sleep(1.5)
    srcs = js("return [...document.querySelectorAll('.slide-photo')].map((i) => i.currentSrc)")
    assert len(srcs) == 2 and all(src.endswith("-tall.webp") for src in srcs), f"an upright screen should get the upright crops: {srcs}"
    assert not js("return document.documentElement.classList.contains('lenis')"), \
        "touch screens should scroll natively: Lenis's blocking touch listeners make swipes wait"
    # A sideways swipe on the orbit spins the worlds and leaves the page where it is
    jump(js("return document.querySelector('.hub').getBoundingClientRect().top + scrollY"))
    time.sleep(1)
    ps = planets(".hub")
    k = min((i for i in range(3) if ps[i][2] > 1), key=lambda i: ps[i][0])  # the leftmost in front, which a swipe right carries right
    x, y = ps[k][:2]
    held = js("return scrollY")
    driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for n in range(1, 21):
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + 15 * n, "y": y}]})
        time.sleep(0.016)
    driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    moved = planets(".hub")[k][0] - x  # as the finger lifts: the throw then carries the worlds on round
    time.sleep(0.3)
    after = js("return scrollY")
    assert after == held, f"a sideways swipe on the orbit should not scroll the page: {held} -> {after}"
    assert moved > 100, f"a sideways swipe should spin the worlds: the front one moved {moved:.0f}px"

    js("localStorage.setItem('rsw-mode', 'manga')")
    driver.refresh()
    jump(0)  # a reload keeps the old scroll position, far below the hero
    time.sleep(3)
    charged = []
    for _ in range(3):
        swipe(400)
        charged.append(power())
    assert 0 < charged[0] < charged[1] < charged[2], f"swipes should charge the Manga hero: {charged}"
    driver.execute_cdp_cmd("Emulation.setTouchEmulationEnabled", {"enabled": False})
    driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})

    # A phone held sideways (844x390): too short to pin a scene, so Clean's creatine scene stacks instead,
    # and Manga's hero words fit between the bar and the bottom of the screen
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": 844, "height": 390, "deviceScaleFactor": 1, "mobile": True})
    for m in ("clean", "manga"):
        js(f"localStorage.setItem('rsw-mode', '{m}')")
        driver.refresh()
        jump(0)
        time.sleep(2)
        if m == "clean":
            pinned = js("return ['.tank-stage'].map((s) => getComputedStyle(document.querySelector(s)).position)")
            assert "sticky" not in pinned, f"a sideways phone should get the stacked scenes, got {pinned}"
        else:
            room = js("""const nav = document.querySelector('.nav').getBoundingClientRect().bottom, r = document.createRange();
                const boxes = [...document.querySelectorAll('.hero-copy > *')].map((e) => { r.selectNodeContents(e); return r.getBoundingClientRect(); });
                return [Math.min(...boxes.map((b) => b.top)) - nav, innerHeight - Math.max(...boxes.map((b) => b.bottom))]""")
            assert min(room) >= 0, f"on a sideways phone the hero's words should fit between the bar and the bottom, room {room}"
    driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})

    # AI Sensei chat: the launcher keeps off the hero and the footer; the chat asks the brief's three
    # questions, reads typed answers (Hinglish too), asks again rather than guess at a "no", builds a plan
    # whose pick goes in the cart, and answers shop questions with the page's own prices
    driver.set_window_size(1440, 900)
    js("localStorage.setItem('rsw-mode', 'clean')")
    driver.refresh()
    jump(0)
    time.sleep(1)
    launcher = driver.find_element(By.CSS_SELECTOR, ".chat-toggle")
    assert not launcher.is_displayed(), "the Sensei launcher should keep off the hero"
    driver.find_element(By.CSS_SELECTOR, '.nav-links a[href="#lab"]').click()
    time.sleep(2)
    assert launcher.is_displayed(), "after the Shop link, the Sensei launcher should show over the shop"
    jump(js("return document.querySelector('.footer').getBoundingClientRect().top + scrollY"))
    time.sleep(0.5)
    assert not launcher.is_displayed(), "the Sensei launcher should keep off the footer and its contact links"
    jump(js("return document.querySelector('#lab').getBoundingClientRect().top + scrollY"))
    time.sleep(0.5)
    launcher.click()
    chat_open = lambda: js("return document.querySelector('#chat').matches(':popover-open')")
    picks = lambda: js("return [...document.querySelectorAll('.chat-picks button')].map((b) => b.textContent)")
    said = lambda: driver.find_elements(By.CSS_SELECTOR, ".from-sensei:not(.is-typing)")[-1].text
    assert chat_open(), "the launcher should open the chat"
    assert js("return document.activeElement.name") == "q", "with a mouse, the chat should be ready to type in"
    assert picks() == ["Build muscle", "Lose weight"], f"Sensei should start with the goal, offering {picks()}"
    driver.find_element(By.CSS_SELECTOR, ".chat-picks button").click()
    time.sleep(1)
    box = driver.find_element(By.CSS_SELECTOR, ".chat-form input")
    box.send_keys("I don't eat meat", Keys.ENTER)
    time.sleep(1)
    assert said() == "What do you eat?" and picks() == ["Non-vegetarian", "Vegetarian"], "a 'no' should get the question again"
    for answer in ("main non veg khata hu", "ghar pe"):
        box.send_keys(answer, Keys.ENTER)
        time.sleep(1)
    plan = js("""const p = document.querySelector('.chat-plan'), name = p.querySelector('.chat-pick-name');
        return [p.querySelector('.chat-for').textContent, [name.textContent, name.nextElementSibling.textContent],
          p.querySelector('.chat-pick .box').getBoundingClientRect().width, document.querySelector('#chat').dataset.step]""")
    assert plan[0] == "Build muscle · Non-vegetarian · Home", f"the plan should be for the answers given, got {plan[0]}"
    assert plan[1] == ["Creatine Monohydrate", "₹999"], f"the plan should pick creatine, got {plan[1]}"
    assert plan[2] > 0 and plan[3] == "3", f"the pick should show its carton ({plan[2]}px) and the steps be full ({plan[3]})"
    driver.find_element(By.CSS_SELECTOR, ".chat-plan .add").click()
    assert driver.find_element(By.CSS_SELECTOR, ".cart-count").text == "1", "Sensei's pick should go in the cart"
    box.send_keys("price kitna hai?", Keys.ENTER)
    time.sleep(1)
    assert "Whey Protein ₹2,499" in said(), f"Sensei should quote the shop's prices, said: {said()}"
    box.send_keys(Keys.ESCAPE)
    assert not chat_open(), "Escape should close the chat"
    # The AI Sensei card opens the same chat
    js("arguments[0].click()", driver.find_element(By.CSS_SELECTOR, "#sensei .btn"))
    assert chat_open(), "the AI Sensei card should open the chat"
    js("document.querySelector('#chat').hidePopover()")
    # Typed answers are read by keywords tried in order ("non veg" isn't veg, "gain weight" isn't losing it);
    # a "no" in the answer means ask again rather than guess. Picks are preset so any plan can be built.
    cases = [(0, "I want to lose weight", "lose"), (0, "gain weight", "muscle"), (0, "weight kam karna hai", "lose"),
             (0, "body banana hai", "muscle"), (0, "loose weight", "lose"), (0, "I don't want to gain fat", None),
             (1, "pure veg", "veg"), (1, "non-veg", "nonveg"), (1, "eggetarian", "nonveg"), (1, "meat nahi khata", None),
             (2, "Gym", "gym"), (2, "ghar pe", "home"), (2, "home gym", "gym"), (2, "outdoors", None)]
    read = js("""Object.assign(picked, {goal: 'muscle', diet: 'veg', train: 'gym'});
        return arguments[0].map(([s, text]) => { step = s; hear(text); return step > s ? picked[questions[s][0]] : null; })""", cases)
    wrong = [(text, want, got) for (_, text, want), got in zip(cases, read) if got != want]
    assert not wrong, f"Sensei misread typed answers (text, wanted, got): {wrong}"
    time.sleep(1)  # let the queued replies land before moving on
    # On a phone the chat is a sheet along the bottom edge
    driver.set_window_size(390, 844)
    time.sleep(0.5)
    js("document.querySelector('#chat').showPopover()")
    sheet = js("const r = document.querySelector('#chat').getBoundingClientRect(); return [r.left, r.right - document.documentElement.clientWidth, r.bottom - innerHeight, r.top]")
    assert sheet[:3] == [0, 0, 0] and sheet[3] > 0, f"on a phone the chat should be a full-width sheet at the bottom, got {sheet}"
    js("document.querySelector('#chat').hidePopover()")

    # Older Safari (before 17: older iPhones and iPads) has no popovers. Simulate it: no popover API for
    # main.js, no popover attributes, and the CSS fallback that only such browsers apply. The closed menu
    # and cart stay hidden, ☰ opens the menu, picking a link closes it, and the cart opens.
    no_popovers = driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": """
        for (const name of ['togglePopover', 'showPopover', 'hidePopover']) delete HTMLElement.prototype[name];
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && n.removeAttribute('popover'))))
          .observe(document, {childList: true, subtree: true});"""})
    driver.set_window_size(390, 844)
    js("localStorage.setItem('rsw-mode', 'clean')")
    driver.refresh()
    time.sleep(1)
    fallback = re.search(r"@supports not selector\(:popover-open\) \{(.*?)\n\}\n", (site / "styles.css").read_text(), re.S).group(1)
    js("const s = document.createElement('style'); s.textContent = arguments[0]; document.head.append(s)", fallback)
    shown_now = lambda sel: js(f"return getComputedStyle(document.querySelector('{sel}')).display") != "none"
    assert not any(map(shown_now, ("#menu", "#cart", "#chat"))), "without popovers, the closed menu, cart and chat should stay hidden"
    driver.find_element(By.CSS_SELECTOR, ".menu-toggle").click()
    assert shown_now("#menu"), "without popovers, ☰ should open the menu"
    driver.find_element(By.CSS_SELECTOR, '#menu a[href="#lab"]').click()
    assert not shown_now("#menu"), "without popovers, picking a link should close the menu"
    driver.find_element(By.CSS_SELECTOR, ".cart-toggle").click()
    assert shown_now("#cart"), "without popovers, the cart button should open the cart"
    js("document.querySelector('.chat-toggle').click()")
    assert shown_now("#chat"), "without popovers, the Sensei launcher should open the chat"
    driver.execute_cdp_cmd("Page.removeScriptToEvaluateOnNewDocument", {"identifier": no_popovers["identifier"]})
    driver.set_window_size(1440, 900)

    # Reduced motion: nothing may wait for a scroll animation to become visible
    driver.execute_cdp_cmd("Emulation.setEmulatedMedia", {
        "features": [{"name": "prefers-reduced-motion", "value": "reduce"}],
    })
    js("localStorage.setItem('rsw-mode', 'clean')")  # the Manga test above saved Manga
    driver.refresh()
    hidden = js("return [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length")
    assert hidden == 0, f"{hidden} elements stay hidden with reduced motion"
    assert not driver.find_element(By.CSS_SELECTOR, ".pause").is_displayed(), "pause shown without a timer"
    assert not js("return document.documentElement.classList.contains('lenis')"), "smooth scrolling despite reduced motion"
    assert js("return getComputedStyle(document.querySelector('.hero-stage')).position") != "sticky", "hero pinned despite reduced motion"
    assert js("return document.querySelector('.hero').style.getPropertyValue('--power')") == "", "hero charged despite reduced motion"
    faded = js("return [...document.querySelectorAll('.tank-steps li')].filter(li => getComputedStyle(li).opacity !== '1').length")
    assert faded == 0, f"{faded} creatine steps hidden with reduced motion"
    jump(js("return document.querySelector('.hub .orbit').getBoundingClientRect().top + scrollY - 100"))
    time.sleep(0.5)
    assert not drifts(".hub"), "the worlds should hold still with reduced motion"
    js("document.querySelector('.hub .planet[href=\"#lab\"]').click()")
    assert js("return document.querySelector('#world-lab').open && !document.querySelector('#world-lab').getAnimations().length"), \
        "with reduced motion a world should open at once"
    js("document.querySelector('#world-lab .world-close').click()")
    assert world_open() == "", "with reduced motion the × should close a world at once"
    js("document.querySelector('.spin-go').click()")
    time.sleep(0.2)
    assert js("return document.querySelector('.spin-result').textContent"), "with reduced motion the plate should land at once"
    covered = js("""return [...document.querySelectorAll('[data-anim]')].filter((el) => el.checkVisibility() && (
        getComputedStyle(el).opacity !== '1'
        || (el.matches('[data-anim~=curtain]') && getComputedStyle(el, '::before').content !== 'none')
        || [...el.querySelectorAll('.c')].some((c) => !['none', '0px'].includes(getComputedStyle(c).translate)))).length""")
    assert covered == 0, f"{covered} entrances hide or shift things with reduced motion"

    # No script errors anywhere along the way (the browser's own WebGL performance notes aside)
    errors = [e["message"] for e in driver.get_log("browser") if e["level"] == "SEVERE" and "GL Driver Message" not in e["message"]]
    assert not errors, "console errors:\n" + "\n".join(errors)

    print("all checks passed")
finally:
    driver.quit()
