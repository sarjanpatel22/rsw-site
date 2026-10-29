// ---------- Manga power-up hero: the RSW tub in 3D, drawn with three.js ----------
// main.js turns the hero's scroll into --power (0 → 1). Every frame this reads it and charges
// the scene: aura, rising sparks and rocks, lightning, then the final-form burst. It only runs
// while Manga's stage is on screen (Clean has its own slider). With reduced motion it draws one
// still frame; without three.js or WebGL the text hero stands on its own.
(async () => {
  // Clean never shows this stage, so three.js only loads once Manga is picked
  const root = document.documentElement;
  if (root.dataset.mode !== 'manga') {
    await new Promise((resolve) => {
      const watch = new MutationObserver(() => {
        if (root.dataset.mode !== 'manga') return;
        watch.disconnect();
        resolve();
      });
      watch.observe(root, { attributes: true, attributeFilter: ['data-mode'] });
    });
  }

  const hero = document.querySelector('.hero');
  const stage = hero.querySelector('.hero-stage');
  const canvas = hero.querySelector('.hero-canvas');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  // The label is painted with the page's fonts, so wait for them; a missing one just falls back
  const fonts = Promise.all([
    document.fonts.load('900 16px Archivo', 'RSW'),
    document.fonts.load('800 16px Montserrat', 'RSW'),
    document.fonts.load('16px "Dela Gothic One"', 'プロテイン'),
    document.fonts.load('800 16px "Anek Gujarati"', 'પ્રોટીન'),
  ]).catch(() => {});

  let THREE, renderer;
  try {
    [THREE] = await Promise.all([import('three'), fonts]);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return; // offline, blocked or no WebGL
  }
  const { smoothstep } = THREE.MathUtils;
  const color = (name) => new THREE.Color(css(name));
  const [crimson, cream, coal, flare] = ['--crimson', '--cream', '--coal', '--flare'].map(color);
  const deepRed = coal.clone().lerp(crimson, 0.35);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const lens = 2 * Math.tan(THREE.MathUtils.degToRad(15)); // screen height per unit of distance

  // Three flat bands of light: the cel shading of an anime frame
  const bands = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
  bands.needsUpdate = true;
  const toon = (props) => new THREE.MeshToonMaterial({ gradientMap: bands, ...props });

  // A canvas painted once and wrapped onto a mesh
  function paint(width, height, draw) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, width, height);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  function text(g, str, x, y, font, fill = css('--cream'), spacing = '0px') {
    g.font = font;
    g.letterSpacing = spacing;
    g.fillStyle = fill;
    g.fillText(str, x, y);
  }

  // The label unrolled: front in the middle, katakana and Gujarati either side, barcode round the back
  const label = paint(2048, 740, (g, w, h) => {
    g.fillStyle = css('--crimson');
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(0 0 0 / 0.16)'; // halftone dots, denser towards the bottom like a printed manga page
    for (let y = 8; y < h; y += 16) {
      for (let x = 8; x < w; x += 16) {
        g.beginPath();
        g.arc(x, y, 0.8 + (3.6 * y) / h, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = css('--coal');
    g.fillRect(0, 0, w, 56);
    g.fillRect(0, h - 56, w, 56);
    g.fillStyle = css('--cream');
    g.fillRect(0, h - 160, w, 66);
    // The flavour on the stripe, front and back; the back copies at 0 and w meet across the seam
    for (const x of [0, 0.5, 1]) text(g, 'DOUBLE CHOCOLATE · 1 KG', w * x, h - 126, '800 34px Montserrat', css('--crimson'), '6px');
    text(g, 'REAL SAIYAN WELLNESS', w / 2, 112, '800 30px Montserrat', undefined, '10px');
    text(g, 'RSW', w / 2 + 10, 300, '900 215px Archivo', css('--coal')); // manga drop shadow
    text(g, 'RSW', w / 2, 290, '900 215px Archivo');
    text(g, 'WHEY PROTEIN', w / 2, 470, '800 56px Montserrat', undefined, '8px');
    [...'プロテイン'].forEach((ch, i) => text(g, ch, w * 0.3, 140 + i * 80, '68px "Dela Gothic One"'));
    text(g, 'પ્રોટીન', w * 0.76, 270, '800 112px "Anek Gujarati"');
    text(g, 'અમદાવાદ', w * 0.76, 390, '600 44px "Anek Gujarati"');
    ['LAB TESTED', 'EVERY BATCH', 'TAP INTO YOUR', 'FINAL FORM'].forEach((line, i) => {
      text(g, line, w * 0.93, 170 + i * 56, '800 32px Montserrat', undefined, '6px');
    });
    g.fillStyle = css('--cream');
    g.fillRect(w * 0.1 - 110, 300, 220, 150);
    g.fillStyle = css('--coal');
    for (let i = 0, x = 0; x < 190; i++) {
      const bar = 2 + ((i * 7) % 4);
      g.fillRect(w * 0.1 - 95 + x, 316, bar, 118);
      x += bar + 3 + ((i * 5) % 4);
    }
  });

  // Lid: grip ridges round the side, the brand seal on top
  const ridges = paint(512, 4, (g, w, h) => {
    g.fillStyle = css('--coal');
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(255 255 255 / 0.07)';
    for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 4, h);
  });
  const seal = paint(512, 512, (g, w, h) => {
    g.fillStyle = css('--coal');
    g.fillRect(0, 0, w, h);
    g.strokeStyle = css('--crimson');
    g.lineWidth = 20;
    g.beginPath();
    g.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
    g.stroke();
    text(g, 'RSW', w / 2, h / 2, '900 120px Archivo');
  });

  // The tub, with an ink outline: a slightly bigger copy that shows only its back faces
  const coalPaint = toon({ color: coal });
  const labelPaint = toon({ map: label, emissive: crimson, emissiveIntensity: 0 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.4, 96), [labelPaint, coalPaint, coalPaint]);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.26, 96), [toon({ map: ridges }), toon({ map: seal }), coalPaint]);
  body.rotation.y = Math.PI; // the label's middle faces the camera
  lid.position.y = 0.83;
  const ink = new THREE.MeshBasicMaterial({ color: coal, side: THREE.BackSide });
  for (const part of [body, lid]) {
    const outline = new THREE.Mesh(part.geometry, ink);
    outline.scale.setScalar(1.035);
    part.add(outline);
  }
  const tub = new THREE.Group();
  tub.add(body, lid);
  scene.add(tub);

  scene.add(new THREE.AmbientLight(cream, 1.1));
  const key = new THREE.DirectionalLight(cream, 2.3);
  key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(flare, 0); // the aura lighting the tub's edges from behind
  rim.position.set(2, 1, -4);
  scene.add(key, rim);

  const uniforms = {
    uTime: { value: 0 },
    uPower: { value: 0 },
    uFinal: { value: 0 },
    uShock: { value: -1 },
    uSize: { value: 1 },
    uCore: { value: cream },
    uMid: { value: flare },
    uRim: { value: crimson },
  };
  const material = (vertexShader, fragmentShader, props) => new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    ...props,
  });

  // Aura: flat cel-shaded flames on a card that always faces the camera. It's drawn first and
  // ignores depth, so the tub simply covers its middle.
  const aura = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 5.8).translate(0, 0.6, 0),
    material(
      /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
      /* glsl */ `
      uniform float uTime, uPower, uFinal;
      uniform vec3 uCore, uMid, uRim;
      varying vec2 vPos;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      // Distance to the tub's outline: below 0 inside, above 0 outside
      float tub(vec2 p) {
        vec2 q = abs(p) - vec2(0.64, 0.84) + 0.12;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
      }

      void main() {
        vec2 p = vPos - vec2(0.0, 0.13);
        float d = tub(p);
        float power = uPower + uFinal * 0.4;
        // Flames scroll upwards, hug the sides and gather into a peak above the lid
        float peak = smoothstep(0.4, 1.3, p.y) * (1.0 - smoothstep(0.1, 0.9, abs(p.x)));
        float reach = (0.1 + 0.55 * power) * mix(0.55, 1.0, smoothstep(-0.8, 0.8, p.y)) * (1.0 + 1.6 * peak);
        // A soft red glow fills the room
        vec3 light = uRim * exp(-max(d, 0.0) * 2.2) * 0.35 * power;
        // Flames and bolts never reach past 1.6 × reach, so most of the card skips the noise
        if (d < reach * 1.6) {
          float n = fbm(vec2(p.x * 3.0, p.y * 1.1 - uTime * (1.2 + 1.6 * power)));
          float f = 1.0 - (d + (0.5 - n) * reach * 1.5) / reach; // 1 at the outline, 0 at the tips
          // Cel-shaded bands: crimson edge, golden middle, white-hot core
          vec3 flame = mix(uRim, uMid, smoothstep(0.45, 0.52, f));
          flame = mix(flame, uCore, smoothstep(0.78, 0.84, f));
          light += flame * smoothstep(0.0, 0.06, f) * smoothstep(0.02, 0.12, power);
          // Lightning from 45% power: a few thin ridges of a noise that re-rolls eight times a second
          if (power > 0.45 && d > 0.0) {
            float roll = floor(uTime * 8.0);
            float e = abs(fbm(p * 2.2 + roll * 1.7) - 0.5);
            light += uCore * smoothstep(0.012, 0.0, e) * step(0.62, noise(p * 1.4 + roll * 3.1))
              * smoothstep(0.45, 0.7, power) * smoothstep(reach * 1.5, reach * 0.7, d);
          }
        }
        gl_FragColor = vec4(light, 1.0);
        #include <colorspace_fragment>
      }`,
      { depthTest: false },
    ),
  );
  aura.renderOrder = -1;
  scene.add(aura);

  // Sparks rise round the tub, faster and brighter with the power; the shader moves them
  const count = innerWidth < 700 ? 300 : 700;
  const sparkShape = new THREE.BufferGeometry();
  sparkShape.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  sparkShape.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(count * 4).map(Math.random), 4));
  const sparks = new THREE.Points(sparkShape, material(
    /* glsl */ `
    attribute vec4 seed;
    uniform float uTime, uPower, uFinal, uSize;
    varying float vFade, vHeat;
    void main() {
      float power = uPower + uFinal * 0.5;
      float life = fract(seed.w + uTime * (0.08 + 0.2 * seed.z) * (0.4 + 1.2 * power));
      float angle = seed.x * 6.2832 + uTime * (0.3 + 0.5 * seed.z);
      float radius = mix(0.75, 2.1, seed.y) + uFinal * life * 1.2;
      vec4 view = modelViewMatrix * vec4(cos(angle) * radius, mix(-0.9, 3.0, life), sin(angle) * radius, 1.0);
      gl_Position = projectionMatrix * view;
      gl_PointSize = uSize * mix(0.008, 0.024, seed.z) * (0.6 + power) / -view.z;
      vFade = sin(life * 3.1416) * (0.25 + 0.75 * smoothstep(0.0, 0.3, power));
      vHeat = seed.z;
    }`,
    /* glsl */ `
    uniform vec3 uCore, uMid;
    varying float vFade, vHeat;
    void main() {
      float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vFade;
      gl_FragColor = vec4(mix(uMid, uCore, vHeat) * a, 1.0);
      #include <colorspace_fragment>
    }`,
    { transparent: true },
  ));
  sparks.frustumCulled = false; // their real positions only exist in the shader
  scene.add(sparks);

  // Floor: a glow under the tub, a hot ring round its foot, and the shockwave
  const floorY = -0.72;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), material(
    /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
    /* glsl */ `
    uniform float uPower, uShock;
    uniform vec3 uCore, uMid, uRim;
    varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      float glow = smoothstep(0.6, 0.0, r) * (0.1 + 0.5 * uPower);
      float foot = smoothstep(0.2, 0.16, r) * smoothstep(0.12, 0.15, r) * uPower;
      float ring = uShock < 0.0 ? 0.0 : smoothstep(0.04, 0.0, abs(r - uShock)) * (1.0 - uShock);
      gl_FragColor = vec4(uRim * glow + uMid * foot + uCore * ring, 1.0);
      #include <colorspace_fragment>
    }`,
    { transparent: true },
  ));
  floor.position.y = floorY;
  scene.add(floor);

  // Rocks lift off the ground one by one as the power builds, and blast outwards at the final form
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), toon({ color: '#5a4038' }), 18);
  const rockSeeds = Array.from({ length: rocks.count }, () => [Math.random(), Math.random(), Math.random()]);
  const dummy = new THREE.Object3D();
  scene.add(rocks);

  // ---------- Every frame ----------
  const bg = new THREE.Color();
  let time = 0;
  let last = 0;
  let final = 0;
  let kick = 0; // camera shake from an impact, fading out
  let shockAt = -Infinity;
  let landed = still;
  let introAt = 0; // when the tub's current drop began
  let wasFinal = false;
  let resized = true;

  // Sharp up to a 1080p screen's worth of pixels; bigger or denser screens render at that budget
  function fit() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return false; // hidden: Clean mode
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5, Math.sqrt(2.1e6 / (w * h))));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    uniforms.uSize.value = (h * renderer.getPixelRatio()) / lens;
    return true;
  }

  function frame(now = 0) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    time += dt;
    if (resized) {
      if (!fit()) return;
      resized = false;
    }

    const power = still ? 0.5 : parseFloat(hero.style.getPropertyValue('--power')) || 0;
    const pose = still ? 0 : power; // a still hero is charged, but posed like the start: tub beside the text
    const isFinal = hero.classList.contains('is-final');
    if (isFinal && !wasFinal) {
      kick = 1;
      shockAt = time;
    }
    wasFinal = isFinal;
    final += ((isFinal ? 1 : 0) - final) * (1 - Math.exp(-dt * 4));
    kick *= Math.exp(-dt * 6);

    // The intro: the tub drops in and lands with a thud
    const drop = still ? 1 : Math.min(1, (time - introAt) / 0.55);
    if (!landed && drop === 1) {
      landed = true;
      kick = 1;
      shockAt = time;
      hero.classList.add('is-landed');
    }

    // Camera: frame the tub 3.6 units tall (3 wide on a phone), beside the intro text at first,
    // then circle round, push in and drop low as the power builds; impacts shake it. For the
    // final form it backs off and looks up a little, so the tub sits below the title.
    const aspect = camera.aspect;
    const dist = (Math.max(3.6, 3 / aspect) / lens) * (1 - 0.18 * smoothstep(pose, 0.2, 1) + 0.2 * final);
    const aside = 1 - smoothstep(pose, 0, 0.3);
    const sideX = aspect > 1 ? aside * dist * lens * aspect * 0.24 : 0; // tub at ~74% of the width
    const raise = aspect > 1 ? 0 : aside * dist * lens * 0.21; // tub above the text on a phone
    const orbit = pose * 0.8 + Math.sin(time * 0.2) * 0.06;
    const shake = 0.004 + 0.025 * smoothstep(power, 0.5, 0.92) + 0.12 * kick;
    const rx = Math.cos(orbit);
    const rz = -Math.sin(orbit);
    camera.position.set(
      Math.sin(orbit) * dist - sideX * rx + Math.sin(time * 41) * shake,
      0.55 - 0.6 * pose + Math.sin(time * 53 + 1) * shake,
      Math.cos(orbit) * dist - sideX * rz,
    );
    camera.lookAt(-sideX * rx, 0.13 + 0.25 * pose + 0.5 * final - raise, -sideX * rz);

    // Tub: one full turn over the power-up, ending face-on; it levitates and squashes on impact
    tub.position.y = 3.6 * (1 - drop * drop) + 0.35 * pose + Math.sin(time * 1.4) * 0.03 * (1 + 2 * power);
    tub.rotation.y = pose * Math.PI * 2 + orbit + Math.sin(time * 0.5) * 0.12 * (1 - pose);
    tub.scale.set(1 + 0.06 * kick, 1 - 0.12 * kick, 1 + 0.06 * kick);
    labelPaint.emissiveIntensity = 0.25 * power + 0.15 * final;
    rim.intensity = 3 * power + 2 * final;
    aura.position.copy(tub.position);
    aura.quaternion.copy(camera.quaternion);

    rockSeeds.forEach(([a, b, c], i) => {
      const lift = smoothstep(power, 0.2 + 0.4 * a, 0.75 + 0.2 * a);
      const angle = a * Math.PI * 2 + time * 0.15 * lift;
      const radius = 0.95 + 1.2 * b + final * 2.5;
      dummy.position.set(
        Math.cos(angle) * radius,
        floorY + 0.08 + lift * (0.3 + 2.4 * c) + Math.sin(time * 1.3 + a * 9) * 0.05 * lift,
        Math.sin(angle) * radius,
      );
      dummy.rotation.set(time * (0.3 + c) * lift + a * 5, time * 0.4 * lift + b * 5, 0);
      dummy.scale.setScalar(0.6 + 1.2 * c);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.instanceMatrix.needsUpdate = true;

    const shock = (time - shockAt) / 0.9;
    uniforms.uShock.value = shock >= 0 && shock < 1 ? shock : -1;
    uniforms.uTime.value = time;
    uniforms.uPower.value = power;
    uniforms.uFinal.value = final;
    renderer.setClearColor(bg.copy(coal).lerp(deepRed, power * 0.6 + final * 0.4));
    renderer.render(scene, camera);
  }

  // main.js asks for the animation again: the intro's drop (back at the top, or Manga picked),
  // or the final form's shockwave
  hero.addEventListener('intro', () => {
    introAt = time;
    landed = still;
    hero.classList.remove('is-landed'); // so the landing sound effect can play again
  });
  hero.addEventListener('final', () => {
    kick = 1;
    shockAt = time;
  });

  // Resizing waits for the next frame, so the canvas never shows a cleared frame
  new ResizeObserver(() => {
    resized = true;
    if (still) frame();
  }).observe(canvas);

  // Only animate while Manga's stage is on screen (in Clean it's hidden, so it never is)
  if (!still) {
    new IntersectionObserver(([entry]) => renderer.setAnimationLoop(entry.isIntersecting ? frame : null)).observe(stage);
  }
})();
