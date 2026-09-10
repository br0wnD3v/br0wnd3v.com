(function () {
  'use strict';
  var root = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)');
  var themeButton = document.getElementById('themeToggle');
  themeButton.hidden = false;
  function themeLabel() {
    var dark = root.dataset.theme === 'dark';
    themeButton.textContent = dark ? 'Silver' : 'Graphite';
    themeButton.setAttribute('aria-label', dark ? 'Switch to silver theme' : 'Switch to graphite theme');
  }
  themeLabel();
  themeButton.addEventListener('click', function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('workbench-theme', root.dataset.theme); } catch (_) {}
    themeLabel();
    drawScope();
  });

  var motionButton = document.getElementById('orbitToggle');
  var field = document.getElementById('signalField').getContext('2d');
  var back = document.getElementById('gyroBack');
  var front = document.getElementById('gyroFront');
  var svgNS = 'http://www.w3.org/2000/svg';
  var elapsed = 0, previous = null, motionFrame = 0, inView = true;
  var moving = !reduced.matches;
  var rings = [
    {radius:190, width:11, color:'url(#foil)', dot:'#d9693b', pitch:.9, yaw:.2, roll:-.45, speed:.18},
    {radius:156, width:5, color:'#8b9e9f', dot:'#546c71', pitch:1.4, yaw:.65, roll:.9, speed:-.25},
    {radius:121, width:3.5, color:'url(#foil)', dot:'#af8cba', pitch:.3, yaw:1.1, roll:-.3, speed:.32}
  ];
  function svgElement(tag, attrs, parent) {
    var el = document.createElementNS(svgNS, tag);
    Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    parent.appendChild(el);
    return el;
  }
  rings.forEach(function (ring) {
    ring.paths = [back, front].map(function (group) {
      return svgElement('path', {stroke:ring.color, 'stroke-width':ring.width, 'stroke-linecap':'round'}, group);
    });
    ring.edges = [back, front].map(function (group) {
      return svgElement('path', {stroke:'#637b7c', 'stroke-width':.65, 'stroke-opacity':.5}, group);
    });
    ring.dot = svgElement('circle', {r:5, fill:ring.dot, stroke:'#f6f6ef', 'stroke-width':1.5}, front);
  });
  // Each ring turns about different axes, with alternating handedness. Orthographic
  // projection keeps the shared center fixed; depth separates the near/far halves.
  function point(ring, angle, time) {
    var x = Math.cos(angle) * ring.radius, y = Math.sin(angle) * ring.radius;
    var pitch = ring.pitch + time * ring.speed;
    var yaw = ring.yaw + time * ring.speed * .63;
    var roll = ring.roll + time * ring.speed * .28;
    var py = y * Math.cos(pitch), pz = y * Math.sin(pitch);
    var px = x * Math.cos(yaw) + pz * Math.sin(yaw);
    var z = -x * Math.sin(yaw) + pz * Math.cos(yaw);
    return {x:300 + px * Math.cos(roll) - py * Math.sin(roll),
      y:205 + px * Math.sin(roll) + py * Math.cos(roll), z:z};
  }
  function coordinate(p) { return p.x.toFixed(2) + ',' + p.y.toFixed(2); }
  function drawGyroscope(time) {
    rings.forEach(function (ring) {
      var paths = ['', ''];
      var previousPoint = point(ring, 0, time);
      for (var step = 1; step <= 128; step++) {
        var next = point(ring, step / 128 * Math.PI * 2, time);
        var side = (previousPoint.z + next.z) / 2 >= 0 ? 1 : 0;
        paths[side] += 'M' + coordinate(previousPoint) + 'L' + coordinate(next);
        previousPoint = next;
      }
      paths.forEach(function (path, side) {
        ring.paths[side].setAttribute('d', path);
        ring.edges[side].setAttribute('d', path);
      });
      var marker = point(ring, time * ring.speed * .5 + .7, time);
      ring.dot.setAttribute('cx', marker.x.toFixed(2));
      ring.dot.setAttribute('cy', marker.y.toFixed(2));
      (marker.z >= 0 ? front : back).appendChild(ring.dot);
    });
  }
  function drawField(time) {
    if (!field) return;
    field.clearRect(0, 0, 600, 410);
    field.font = '16px Consolas, monospace';
    field.textAlign = 'center';
    // Sparse terminal-like streams stay at the edges of the instrument.
    [55, 89, 123, 477, 511, 545].forEach(function (x, column) {
      var head = ((time * (18 + column * 2) + column * 67) % 570) - 80;
      for (var row = 0; row < 9; row++) {
        var y = head - row * 22;
        if (y < 35 || y > 375) continue;
        field.fillStyle = row === 0 ? '#647d77' : '#81968f';
        field.globalAlpha = (1 - row / 10) * .5;
        var index = (column * 11 + row * 7 + Math.floor(time * 1.4)) % 18;
        field.fillText('01.:/+*<>ABCDEF[]{}'[index], x, y);
      }
    });
    field.globalAlpha = 1;
  }
  function paintMotion() { drawGyroscope(elapsed); drawField(elapsed); }
  function motionLabel() {
    motionButton.disabled = reduced.matches;
    motionButton.setAttribute('aria-pressed', String(moving && !reduced.matches));
    motionButton.textContent = reduced.matches ? 'Motion reduced' : moving ? 'Pause motion Ⅱ' : 'Play motion ▷';
    motionButton.setAttribute('aria-label', reduced.matches ? 'Motion disabled by your system preference' : moving ? 'Pause gyroscope and signal animation' : 'Resume gyroscope and signal animation');
  }
  function animate(now) {
    if (previous !== null) elapsed += Math.min((now - previous) / 1000, .1);
    previous = now;
    paintMotion();
    motionFrame = requestAnimationFrame(animate);
  }
  function syncMotion() {
    cancelAnimationFrame(motionFrame);
    previous = null;
    motionLabel();
    if (moving && !reduced.matches && !document.hidden && inView) motionFrame = requestAnimationFrame(animate);
  }
  paintMotion();
  document.getElementById('gyroFallback').style.display = 'none';
  motionButton.hidden = false;
  motionButton.addEventListener('click', function () { moving = !moving; syncMotion(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      syncMotion();
      syncScope();
    }).observe(document.querySelector('.workbench'));
  }

  var audio = document.getElementById('bgm');
  var music = document.getElementById('musicToggle');
  var soundText = music.querySelector('.sound-text');
  var soundSymbol = music.querySelector('.play-symbol');
  var soundStatus = document.getElementById('soundStatus');
  var scope = document.getElementById('soundScope');
  var painter = scope.getContext('2d');
  var scopeFrame = 0, starting = false;
  var envelope = window.themeWaveform;
  var levels = envelope ? atob(envelope.levels) : '';
  music.hidden = false;
  audio.volume = .45;
  // Keep native media output intact, including file:// previews. A small envelope
  // extracted from this track drives the display without rerouting its audio.
  function drawScope() {
    if (!painter) return;
    painter.clearRect(0, 0, scope.width, scope.height);
    var styles = getComputedStyle(root);
    painter.fillStyle = styles.getPropertyValue('--accent').trim();
    if (audio.paused || reduced.matches || !levels.length) {
      painter.fillStyle = styles.getPropertyValue('--muted').trim();
      painter.globalAlpha = .5;
      painter.fillRect(0, 23, 240, 2);
      painter.globalAlpha = 1;
      return;
    }
    var sample = audio.currentTime / envelope.step;
    for (var i = 0; i < 40; i++) {
      var position = (sample + i - 20 + levels.length) % levels.length;
      var lower = Math.floor(position), blend = position - lower;
      var amplitude = (levels.charCodeAt(lower) * (1 - blend) + levels.charCodeAt((lower + 1) % levels.length) * blend) / 255;
      var height = Math.max(2, Math.sqrt(amplitude) * 42);
      painter.fillRect(i * 6 + 1, (48 - height) / 2, 3, height);
    }
  }
  function animateScope() { drawScope(); scopeFrame = requestAnimationFrame(animateScope); }
  function syncScope() {
    cancelAnimationFrame(scopeFrame);
    drawScope();
    if (!audio.paused && !reduced.matches && !document.hidden && inView) scopeFrame = requestAnimationFrame(animateScope);
  }
  function musicLabel() {
    var playing = !audio.paused;
    music.setAttribute('aria-pressed', String(playing));
    music.setAttribute('aria-busy', String(starting));
    soundText.textContent = starting ? 'Loading' : playing ? 'Sound off' : 'Sound on';
    soundSymbol.textContent = playing ? 'Ⅱ' : '▶';
    music.setAttribute('aria-label', playing || starting ? 'Pause workspace music' : 'Play workspace music');
    syncScope();
  }
  music.addEventListener('click', async function () {
    if (!audio.paused || starting) { starting = false; audio.pause(); musicLabel(); return; }
    soundStatus.textContent = '';
    starting = true;
    musicLabel();
    try {
      await audio.play();
    } catch (error) {
      if (error.name !== 'AbortError') soundStatus.textContent = 'Audio could not start. Try the sound button again.';
    } finally { starting = false; musicLabel(); }
  });
  audio.addEventListener('playing', function () { starting = false; musicLabel(); });
  audio.addEventListener('pause', musicLabel);
  audio.addEventListener('error', function () {
    starting = false;
    musicLabel();
    soundStatus.textContent = 'The track could not load. Try the sound button again.';
  });
  reduced.addEventListener('change', function () {
    if (reduced.matches) moving = false;
    syncMotion(); syncScope();
  });
  document.addEventListener('visibilitychange', function () { syncMotion(); syncScope(); });
  musicLabel();
  syncMotion();
})();
