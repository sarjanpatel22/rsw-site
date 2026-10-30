"""Smoke test for the RSW site: python3 check.py [screenshot_dir]

Drives headless Chromium through the mode popup and switch, Clean's shop, cart, slider, universe gates and
scroll effects, Manga's power-up hero and comic strip, smooth scrolling, product
boxes, Gujarati font and phone menu, and checks there is no sideways scrolling
on a small phone.
"""
import pathlib
import sys
import time

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

PAGE = (pathlib.Path(__file__).parent / "index.html").resolve().as_uri()
shots = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None

opts = webdriver.ChromeOptions()
opts.add_argument("--headless=new")
opts.add_argument("--enable-unsafe-swiftshader")  # headless Chromium only gets WebGL through SwiftShader
opts.binary_location = "/usr/bin/chromium"
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

    clean_parts, manga_parts = [".slider", ".gates", ".tank"], [".hero-stage", ".worlds", ".strip"]
    assert all(map(shown, clean_parts)) and not any(map(shown, manga_parts)), "Clean should show only its own parts"
    gujarati_shown = "return [...document.querySelectorAll('[lang=\"gu\"]')].some((el) => el.checkVisibility())"
    assert not js(gujarati_shown), "Clean should show no Gujarati"

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

    # Every world's words fit on screen while it holds, and never sit under the next gate's door
    def gate_words_clear(w, h):
        driver.set_window_size(w, h)
        time.sleep(0.4)
        box = js("const b = document.querySelector('.gates').getBoundingClientRect(); return [b.top + scrollY, b.height, innerHeight]")
        for i in range(-1, 4):
            for f in (0.72, 0.85, 0.95):  # just opened, mid hold, end of the hold
                jump(box[0] + max(0, (i + f) / 4) * (box[1] - box[2]))
                bad = js("""const [g, next] = [...document.querySelectorAll('.gate')].slice(arguments[0] + 1, arguments[0] + 3);
                    const copy = g.querySelector('.gate-copy');
                    if (parseFloat(getComputedStyle(copy).opacity) < 0.05) return '';
                    const r = document.createRange();
                    const words = [...copy.children].map(c => { r.selectNodeContents(c); return r.getBoundingClientRect(); });
                    const nav = document.querySelector('.nav').getBoundingClientRect().bottom;
                    if (words.some(b => b.top < nav || b.bottom > innerHeight)) return 'off screen';
                    const photo = g.querySelector('.gate-photo');
                    const p = photo?.checkVisibility() && photo.getBoundingClientRect();
                    if (p && words.some(b => b.right > p.left && b.left < p.right && b.bottom > p.top && b.top < p.bottom)) return 'under its photo';
                    if (!next || !(parseFloat(getComputedStyle(next).scale) > 0)) return '';
                    const st = getComputedStyle(document.querySelector('.gates')), pc = (n) => parseFloat(st.getPropertyValue(n)) / 100;
                    const door = {top: innerHeight * pc('--dt'), left: innerWidth * pc('--dl'), right: innerWidth * (1 - pc('--dr')), bottom: innerHeight * (1 - pc('--db'))};
                    return words.some(b => b.right > door.left && b.left < door.right && b.bottom > door.top && b.top < door.bottom) ? 'under the next door' : '';""", i)
                assert not bad, f"{w}x{h}: world {i + 1}'s words are {bad} at {f:.0%} of its quarter"

    for size in [(1440, 900), (1366, 768), (1920, 1080), (390, 844), (360, 740), (375, 667)]:
        gate_words_clear(*size)
    driver.set_window_size(1440, 900)
    time.sleep(0.4)

    # Clean's creatine tank: while its stage holds, training drains the level and creatine refills it
    def tank_at(f):
        box = js("const b = document.querySelector('.tank').getBoundingClientRect(); return [b.top + scrollY, b.height]")
        jump(box[0] + f * (box[1] - vh))
        return js("const t = document.querySelector('.tank'); return [t.dataset.step, getComputedStyle(t).getPropertyValue('--atp').trim()]")

    for f, want in [(0.3, ["1", "20"]), (0.6, ["2", "60"]), (1, ["3", "100"])]:
        assert tank_at(f) == want, f"{f:.0%} through the tank should show step {want[0]} at {want[1]}%, got {tank_at(f)}"
        assert js("return document.querySelector('.tank-stage').getBoundingClientRect().top") == 0, "the tank should hold still"
        # The level runs in its own column: no word may reach into it
        bar = js("return innerWidth - parseFloat(getComputedStyle(document.querySelector('.tank-stage'), '::after').width)")
        words = js("""const r = document.createRange();
            return [...document.querySelectorAll('.tank-view > h3, .tank-steps li')].map(el => { r.selectNodeContents(el); return r.getBoundingClientRect().right; })
              .concat(document.querySelector('.tank-level').getBoundingClientRect().right)""")
        assert max(words) <= bar, f"the tank's words reach {max(words) - bar:.0f}px into its level column"

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

    for m in ("clean", "manga"):
        js(f"document.documentElement.dataset.mode = '{m}'")
        for w in (360, 1440):
            driver.set_window_size(w, 800)
            time.sleep(0.5)
            no_sideways_scroll(f"{m} @ {w}px")
        page_shots(f"{m}-desktop", 1440)
        page_shots(f"{m}-mobile", 390)

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

    print("all checks passed")
finally:
    driver.quit()
