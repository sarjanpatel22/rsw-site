"""Smoke test for the RSW site: python3 check.py [screenshot_dir]

Drives headless Chromium through the mode popup and switch, Clean's shop, cart, slider, the universe orbit
(drift, drag, swipe, Tab, click) and gates, scroll effects, Manga's power-up hero and comic strip, smooth scrolling, product
boxes, Gujarati font, phone menu and the AI Sensei chat, and checks there is no sideways scrolling
on a small phone.
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
    js("localStorage.clear()")
    driver.refresh()

    dialog = driver.find_element(By.CSS_SELECTOR, ".mode-dialog")
    assert not dialog.get_attribute("open"), "popup should wait before opening"
    time.sleep(1.6)
    assert dialog.get_attribute("open") is not None, "popup did not open"

    driver.find_element(By.CSS_SELECTOR, '[data-pick="manga"]').click()
    time.sleep(1)
    assert mode() == "manga", "picking Manga did not switch mode"
    assert js("return localStorage.getItem('rsw-mode')") == "manga", "mode not saved"

    driver.refresh()
    time.sleep(1.6)
    assert mode() == "manga", "saved mode not restored"
    assert driver.find_element(By.CSS_SELECTOR, ".mode-dialog").get_attribute("open") is None, "popup reappeared"

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

    # The modes are different pages: each shows only its own hero, universe and creatine story
    def shown(sel):
        return js(f"return getComputedStyle(document.querySelector('{sel}')).display") != "none"

    clean_parts, manga_parts = [".slider", ".gates", ".tank"], [".hero-stage", ".universe > .orbit", ".strip"]
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
    assert top_of("#lab") < top_of("#story"), "Clean should show the shop before the story"
    adds = driver.find_elements(By.CSS_SELECTOR, ".add")
    js("arguments[0].click(); arguments[1].click()", adds[0], adds[1])
    assert driver.find_element(By.CSS_SELECTOR, ".cart-count").text == "2", "cart badge should count 2 items"
    driver.find_element(By.CSS_SELECTOR, ".cart-toggle").click()
    assert "2 items" in driver.find_element(By.CSS_SELECTOR, "#cart").text, "cart panel should list 2 items"
    js("document.querySelector('#cart').hidePopover()")

    # Clean: Apple-style scroll effects
    vh = js("return innerHeight")
    assert js("return document.documentElement.classList.contains('lenis')"), "Lenis smooth scrolling not running"
    assert js("return document.querySelectorAll('.box').length") == 9, "expected 4 banner boxes + 5 card boxes"

    def jump(y):
        js(f"scrollTo({{top: {y}, behavior: 'instant'}})")
        time.sleep(0.4)

    def protein_spin():
        return float(js("return parseFloat(getComputedStyle(document.querySelector('.showcase .product:last-child')).getPropertyValue('--spin'))"))

    jump(0)
    time.sleep(1.6)  # the dot click above replayed the boxes' spin-in
    resting = protein_spin()
    jump(js("return document.querySelector('.hero').offsetHeight / 2"))
    assert protein_spin() - resting > 60, "hero boxes should turn as the hero scrolls away"

    def universe_scale():
        return float(js("return getComputedStyle(document.querySelector('.universe')).scale"))

    top = js("return document.querySelector('.universe').getBoundingClientRect().top + scrollY")
    jump(top - vh + 50)
    assert universe_scale() < 0.95, "Universe should start as a card"
    jump(top - vh * 0.2)
    assert universe_scale() == 1, "Universe should grow to full width"

    # Halfway through the gates' hold the Warriors fill the screen and the Vault's gate stands in them
    def world_at(x, y):
        return js(f"return document.elementFromPoint(innerWidth * {x}, innerHeight * {y}).closest('.gate').querySelector('.h1').textContent")

    box = js("const b = document.querySelector('.gates').getBoundingClientRect(); return [b.top + scrollY, b.height]")
    jump(box[0] + 0.5 * (box[1] - vh))
    assert world_at(0.1, 0.5) == "The Warriors", "the second world should fill the screen halfway through"
    assert world_at(0.76, 0.53) == "The Vault", "the next world's gate should stand open a crack"

    # Every world's words fit on screen while it holds, and never sit under the next gate's door. The hub
    # (the orbit's screen) has no door: its words stay off the orbit, whose planets and logo stay inside
    # its box, and the near half of the ring passes clear of the logo's letters.
    def gate_words_clear(w, h):
        driver.set_window_size(w, h)
        time.sleep(0.4)
        jump(js("return document.querySelector('.gates').getBoundingClientRect().top + scrollY"))  # measure once the universe has grown to full size
        box = js("const b = document.querySelector('.gates').getBoundingClientRect(); return [b.top + scrollY, b.height, innerHeight]")
        for i in range(-1, 4):
            for f in (0.72, 0.85, 0.95):  # just opened, mid hold, end of the hold
                jump(box[0] + max(0, (i + f) / 4) * (box[1] - box[2]))
                bad = js("""const [g, next] = [...document.querySelectorAll('.gate')].slice(arguments[0] + 1, arguments[0] + 3);
                    const copy = g.querySelector('.gate-copy');
                    if (parseFloat(getComputedStyle(copy).opacity) < 0.05) return '';
                    const r = document.createRange();
                    const shown = [...copy.children].filter(c => c.checkVisibility());
                    const words = shown.map(c => { r.selectNodeContents(c); return r.getBoundingClientRect(); });
                    const nav = document.querySelector('.nav').getBoundingClientRect().bottom;
                    if (words.some(b => b.top < nav || b.bottom > innerHeight)) return 'off screen';
                    if (g.classList.contains('hub')) {
                      const o = g.querySelector('.orbit'), ob = o.getBoundingClientRect();
                      const meets = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
                      if (words.some((b, k) => shown[k] !== o && meets(b, ob))) return 'on the orbit';
                      const parts = [...o.querySelectorAll('.planet, .sun')].map((e) => e.getBoundingClientRect());
                      if (parts.some((b) => b.left < ob.left - 1 || b.right > ob.right + 1 || b.top < ob.top - 1 || b.bottom > ob.bottom + 1)) return 'beside a planet or logo that leaves the orbit';
                      const sun = o.querySelector('.sun').getBoundingClientRect(), ring = o.querySelectorAll('.ring path')[1];
                      for (let n = 0; n <= 60; n++) {
                        const pt = ring.getPointAtLength((ring.getTotalLength() * n) / 60);
                        const x = ob.left + pt.x, y = ob.top + pt.y;
                        if (x > sun.left + 4 && x < sun.right - 4 && y > sun.top + 4 && y < sun.bottom - 4) return 'beside a ring that cuts through the logo';
                      }
                      return '';
                    }
                    const photo = g.querySelector('.gate-photo');
                    const p = photo?.checkVisibility() && photo.getBoundingClientRect();
                    if (p && words.some(b => b.right > p.left && b.left < p.right && b.bottom > p.top && b.top < p.bottom)) return 'under its photo';
                    if (!next || !(parseFloat(getComputedStyle(next).scale) > 0)) return '';
                    const st = getComputedStyle(document.querySelector('.gates')), pc = (n) => parseFloat(st.getPropertyValue(n)) / 100;
                    const door = {top: innerHeight * pc('--dt'), left: innerWidth * pc('--dl'), right: innerWidth * (1 - pc('--dr')), bottom: innerHeight * (1 - pc('--db'))};
                    return words.some(b => b.right > door.left && b.left < door.right && b.bottom > door.top && b.top < door.bottom) ? 'under the next door' : '';""", i)
                assert not bad, f"{w}x{h}: world {i + 1}'s words are {bad} at {f:.0%} of its quarter"

    sizes = [(1440, 900), (1366, 768), (1280, 720), (1920, 1080), (1024, 911), (768, 1167), (390, 844), (360, 740), (375, 667)]
    for size in sizes:  # window sizes: laptops, a landscape and a portrait iPad, phones
        gate_words_clear(*size)
    driver.set_window_size(1440, 900)
    time.sleep(0.4)

    # The orbit: the worlds drift round the logo; one tabbed to comes to the front and a click opens it;
    # dragging spins them without opening one; and as the gates begin, the Lab's world opens out of its planet
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

    gates_top, gates_track = js("const b = document.querySelector('.gates').getBoundingClientRect(); return [b.top + scrollY, b.height - innerHeight]")
    jump(gates_top)
    time.sleep(1)
    assert drifts(".hub"), "the worlds should drift round the logo"

    js("arguments[0].focus()", driver.find_element(By.CSS_SELECTOR, ".hub + .gate .gate-copy > a"))
    ActionChains(driver).key_down(Keys.SHIFT).send_keys(Keys.TAB).key_up(Keys.SHIFT).perform()
    time.sleep(1.5)
    assert js("return document.activeElement.getAttribute('href')") == "#vault", "Shift+Tab from the Lab's link should reach the Vault planet"
    assert front(".hub") == 2 and planets(".hub")[2][3] == "4", "a world tabbed to should come to the front"
    driver.find_element(By.CSS_SELECTOR, '.hub .planet[href="#vault"]').click()
    time.sleep(2.5)
    assert 0 <= top_of("#vault") < 150, f"clicking the Vault planet should open the Vault, it's {top_of('#vault')}px from the top"

    def mouse(kind, x, y, **more):
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, **more})

    jump(gates_top)
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
    assert js("return [location.hash, scrollY]") == where, "dragging a planet should spin the worlds, not open it"
    assert planets(".hub")[k][0] - x > 100, "dragging right should carry the front world right"
    mouse("mouseMoved", 5, 5)  # off the planets, so they drift again

    jump(gates_top + 0.03 * gates_track)  # the gates begin
    time.sleep(1.2)
    assert front(".hub") == 0, "as the gates begin, the Lab should come to the front"
    lx, ly = js("const s = document.querySelector('.gates-stage').style; return ['--lx', '--ly'].map((v) => parseFloat(s.getPropertyValue(v)))")
    assert js(f"return document.elementFromPoint({lx}, {ly}).closest('.gate') === document.querySelector('.hub + .gate')"), \
        "the Lab's world should open out of its planet"
    jump(gates_top)
    time.sleep(0.5)
    x, y = planets(".hub")[front(".hub")][:2]
    assert js(f"return document.elementFromPoint({x}, {y}).closest('.gate').classList.contains('hub')"), "before the gates begin, the Lab's world stays shut"

    # Clean's creatine tank: while its stage holds, training drains the level and creatine refills it
    def tank_at(f):
        box = js("const b = document.querySelector('.tank').getBoundingClientRect(); return [b.top + scrollY, b.height, innerHeight]")
        jump(box[0] + f * (box[1] - box[2]))
        return js("const t = document.querySelector('.tank'); return [t.dataset.step, getComputedStyle(t).getPropertyValue('--atp').trim()]")

    for f, want in [(0.3, ["1", "20"]), (0.6, ["2", "60"]), (1, ["3", "100"])]:
        assert tank_at(f) == want, f"{f:.0%} through the tank should show step {want[0]} at {want[1]}%, got {tank_at(f)}"
        assert js("return document.querySelector('.tank-stage').getBoundingClientRect().top") == 0, "the tank should hold still"

    # The level runs in a bar of its own (a column, or a band on phones): at every size it's big enough to
    # see, and the words stay out of it and on the screen
    for w, h in sizes:
        driver.set_window_size(w, h)
        for f in (0.3, 0.6, 1):
            tank_at(f)
            time.sleep(0.5)  # the step's words slide in
            bad = js("""const tank = document.querySelector('.tank'), r = document.createRange();
                const bar = tank.querySelector('.tank-bar').getBoundingClientRect();
                if (bar.width < innerWidth * 0.35 || bar.height < 80) return 'beside a level bar too thin to see';
                const boxes = [...tank.querySelectorAll(`.tank-view > h3, .tank-steps li:nth-child(${tank.dataset.step})`)]
                  .map((el) => { r.selectNodeContents(el); return r.getBoundingClientRect(); }).concat(tank.querySelector('.tank-level').getBoundingClientRect());
                if (boxes.some((b) => b.right > bar.left && b.left < bar.right && b.bottom > bar.top && b.top < bar.bottom)) return 'into the level bar';
                const nav = document.querySelector('.nav').getBoundingClientRect().bottom;
                return boxes.some((b) => b.top < nav || b.bottom > innerHeight) ? 'off the screen' : ''""")
            assert not bad, f"{w}x{h}: the tank's words run {bad} at {f:.0%}"
    driver.set_window_size(1440, 900)
    time.sleep(0.4)

    # The photos of people training all load (the lazy ones once scrolled to); each mode shows its own
    def photos_load(label):
        shown_imgs = "[...document.querySelectorAll('main img')].filter((img) => img.checkVisibility())"
        for i in range(js(f"return {shown_imgs}.length")):
            js(f"{shown_imgs}[{i}].scrollIntoView({{block: 'center'}})")
            time.sleep(0.3)
        broken = js(f"return {shown_imgs}.filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'))")
        assert not broken, f"{label}: photos failed to load: {broken}"

    photos_load("Clean")

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

    # A portrait iPad with touch: finger swipes play the pinned scenes (the gates and the creatine tank
    # in Clean, the power-up in Manga) while their stages hold still
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
    for sel in (".gates", ".tank"):
        jump(js(f"return document.querySelector('{sel}').getBoundingClientRect().top + scrollY"))
        played = []
        for _ in range(3):
            swipe(400)
            played.append(js(f"const e = document.querySelector('{sel}'); return [parseFloat(e.style.getPropertyValue('--s')), e.firstElementChild.getBoundingClientRect().top]"))
        assert all(top == 0 for _, top in played) and played[0][0] > 0.05 and played[0][0] < played[1][0] < played[2][0], f"swipes should play {sel} while it holds: {played}"
    # A sideways swipe on the orbit spins the worlds and leaves the page where it is
    jump(js("return document.querySelector('.gates').getBoundingClientRect().top + scrollY"))
    time.sleep(1)
    k = front(".hub")
    x, y = planets(".hub")[k][:2]
    held = js("return scrollY")
    driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    for n in range(1, 21):
        driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + 15 * n, "y": y}]})
        time.sleep(0.016)
    driver.execute_cdp_cmd("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    time.sleep(0.3)
    assert js("return scrollY") == held, "a sideways swipe on the orbit should not scroll the page"
    assert planets(".hub")[k][0] - x > 100, "a sideways swipe should spin the worlds"

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

    # A phone held sideways (844x390): too short to pin a scene, so Clean's gates and tank stack instead,
    # and Manga's hero words fit between the bar and the bottom of the screen
    driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {"width": 844, "height": 390, "deviceScaleFactor": 1, "mobile": True})
    for m in ("clean", "manga"):
        js(f"localStorage.setItem('rsw-mode', '{m}')")
        driver.refresh()
        jump(0)
        time.sleep(2)
        if m == "clean":
            pinned = js("return ['.gates-stage', '.tank-stage'].map((s) => getComputedStyle(document.querySelector(s)).position)")
            assert "sticky" not in pinned, f"a sideways phone should get the stacked scenes, got {pinned}"
        else:
            room = js("""const nav = document.querySelector('.nav').getBoundingClientRect().bottom, r = document.createRange();
                const boxes = [...document.querySelectorAll('.hero-copy > *')].map((e) => { r.selectNodeContents(e); return r.getBoundingClientRect(); });
                return [Math.min(...boxes.map((b) => b.top)) - nav, innerHeight - Math.max(...boxes.map((b) => b.bottom))]""")
            assert min(room) >= 0, f"on a sideways phone the hero's words should fit between the bar and the bottom, room {room}"
    driver.execute_cdp_cmd("Emulation.clearDeviceMetricsOverride", {})

    # AI Sensei chat: the launcher keeps off the hero and the pinned scenes; the chat asks the brief's three
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
    jump(js("const g = document.querySelector('.gates'); return g.getBoundingClientRect().top + scrollY + 0.3 * (g.offsetHeight - innerHeight)"))
    time.sleep(0.5)
    assert not launcher.is_displayed(), "the Sensei launcher should keep off the pinned gates"
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
    # The AI Sensei world's button in the gates and the AI Sensei card open the same chat
    for sel in ('.gate-copy > button[popovertarget="chat"]', "#sensei .btn"):
        js("arguments[0].click()", driver.find_element(By.CSS_SELECTOR, sel))
        assert chat_open(), f"{sel} should open the chat"
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

    # No script errors anywhere along the way (the browser's own WebGL performance notes aside)
    errors = [e["message"] for e in driver.get_log("browser") if e["level"] == "SEVERE" and "GL Driver Message" not in e["message"]]
    assert not errors, "console errors:\n" + "\n".join(errors)

    print("all checks passed")
finally:
    driver.quit()
