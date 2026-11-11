(() => {
  "use strict";

  // ============================================================
  //  NEON NINJA — a 60 second cyberpunk arcade runner
  // ============================================================

  const DURATION = 60;
  const START_LIVES = 3;
  const STORAGE_BEST = "neonNinja.best";
  const STORAGE_MUTED = "neonNinja.muted";
  const TAU = Math.PI * 2;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const mod = (value, length) => ((value % length) + length) % length;
  const padScore = (value) => String(Math.max(0, Math.floor(value))).padStart(5, "0");

  function readBest() {
    try {
      return Number.parseInt(localStorage.getItem(STORAGE_BEST) || "0", 10) || 0;
    } catch (_error) {
      return 0;
    }
  }

  function writeBest(value) {
    try {
      localStorage.setItem(STORAGE_BEST, String(value));
    } catch (_error) {
      /* Storage can be unavailable in private browsing. */
    }
  }

  function readMuted() {
    try {
      return localStorage.getItem(STORAGE_MUTED) === "1";
    } catch (_error) {
      return false;
    }
  }

  function writeMuted(value) {
    try {
      localStorage.setItem(STORAGE_MUTED, value ? "1" : "0");
    } catch (_error) {
      /* Ignore storage failures. */
    }
  }

  // ------------------------------- DOM -------------------------------
  const app = $("#app");
  const canvas = $("#gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const hud = $("#hud");
  const livesEl = $("#lives");
  const timerValueEl = $("#timerValue");
  const timerFillEl = $("#timerFill");
  const comboHudEl = $("#comboHud");
  const comboValueEl = $("#comboValue");
  const comboFillEl = $("#comboFill");
  const scoreValueEl = $("#scoreValue");
  const bestHudEl = $("#bestHud");

  const startScreen = $("#startScreen");
  const pauseScreen = $("#pauseScreen");
  const gameOverScreen = $("#gameOverScreen");

  const startBtn = $("#startBtn");
  const pauseBtn = $("#pauseBtn");
  const resumeBtn = $("#resumeBtn");
  const quitBtn = $("#quitBtn");
  const replayBtn = $("#replayBtn");
  const menuBtn = $("#menuBtn");
  const jumpBtn = $("#btnJump");
  const slideBtn = $("#btnSlide");

  const bestStartEl = $("#bestStart");
  const goBanner = $("#goBanner");
  const hintBar = $("#hintBar");

  const finalScoreEl = $("#finalScore");
  const finalBestEl = $("#finalBest");
  const finalCoinsEl = $("#finalCoins");
  const finalDronesEl = $("#finalDrones");
  const finalDistanceEl = $("#finalDistance");
  const newBestEl = $("#newBest");
  const overTitleEl = $("#overTitle");
  const gameOverTitleEl = $("#gameOverTitle");

  const soundButtons = $$(".js-sound");
  const soundLabels = $$(".sound-label");

  // ----------------------------- AUDIO -------------------------------
  const Sound = (() => {
    let audio = null;
    let master = null;
    let musicBus = null;
    let sfxBus = null;
    let noiseBuffer = null;
    let muted = readMuted();
    let musicTimer = null;
    let musicOn = false;
    let nextNoteTime = 0;
    let musicStep = 0;

    const mtof = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

    function init() {
      if (audio) return true;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;

      try {
        audio = new AudioContextClass();
      } catch (_error) {
        return false;
      }

      master = audio.createGain();
      master.gain.value = muted ? 0 : 0.72;
      master.connect(audio.destination);

      musicBus = audio.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);

      sfxBus = audio.createGain();
      sfxBus.gain.value = 0.82;
      sfxBus.connect(master);

      const length = Math.floor(audio.sampleRate * 0.6);
      noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      return true;
    }

    function unlock() {
      if (!init()) return false;
      if (audio.state === "suspended") {
        audio.resume().catch(() => {});
      }
      return true;
    }

    function setMuted(value) {
      muted = Boolean(value);
      writeMuted(muted);
      if (audio && master) {
        master.gain.cancelScheduledValues(audio.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : 0.72, audio.currentTime, 0.02);
      }
      updateSoundUI();
    }

    function toggleMuted() {
      unlock();
      setMuted(!muted);
      if (!muted) sfx("ui");
    }

    function tone(freq, duration, type, volume, when = 0, endFreq = null, bus = null) {
      if (!audio) return;
      const start = audio.currentTime + when;
      const target = bus || sfxBus;
      const osc = audio.createOscillator();
      const gain = audio.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freq), start);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(target);
      osc.start(start);
      osc.stop(start + duration + 0.04);
    }

    function noise(duration, volume, when = 0, filterFreq = 1200, filterType = "bandpass") {
      if (!audio || !noiseBuffer) return;
      const start = audio.currentTime + when;
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();

      source.buffer = noiseBuffer;
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, start);
      gain.gain.setValueAtTime(Math.max(0.0002, volume), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(sfxBus);
      source.start(start);
      source.stop(start + duration + 0.03);
    }

    function sfx(name) {
      if (!init() || muted) return;

      switch (name) {
        case "jump":
          tone(180, 0.2, "sine", 0.15, 0, 640);
          tone(95, 0.16, "triangle", 0.1, 0, 230);
          break;
        case "slide":
          noise(0.3, 0.13, 0, 900, "bandpass");
          tone(85, 0.24, "sawtooth", 0.045, 0, 48);
          break;
        case "coin":
          tone(980, 0.09, "sine", 0.12);
          tone(1468, 0.13, "sine", 0.1, 0.055);
          break;
        case "kill":
          noise(0.25, 0.2, 0, 780, "lowpass");
          tone(180, 0.25, "sawtooth", 0.12, 0, 42);
          tone(720, 0.12, "triangle", 0.08, 0.02, 1100);
          break;
        case "hit":
          noise(0.32, 0.32, 0, 420, "lowpass");
          tone(110, 0.35, "sawtooth", 0.2, 0, 32);
          tone(55, 0.4, "sine", 0.17);
          break;
        case "combo":
          tone(660, 0.09, "triangle", 0.1);
          tone(880, 0.1, "triangle", 0.1, 0.08);
          tone(1320, 0.14, "sine", 0.09, 0.16);
          break;
        case "tick":
          tone(1480, 0.045, "square", 0.035);
          break;
        case "ui":
          tone(560, 0.06, "sine", 0.08, 0, 880);
          break;
        case "pause":
          tone(440, 0.09, "triangle", 0.08, 0, 280);
          break;
        case "start":
          tone(220, 0.35, "sawtooth", 0.07, 0, 440);
          tone(330, 0.35, "triangle", 0.08, 0.08, 660);
          tone(660, 0.45, "sine", 0.08, 0.16, 990);
          break;
        case "timeout":
          tone(440, 0.5, "triangle", 0.1, 0, 220);
          tone(330, 0.55, "triangle", 0.08, 0.18, 165);
          tone(220, 1.1, "sine", 0.12, 0.34, 110);
          break;
        case "gameover":
          tone(180, 0.65, "sawtooth", 0.09, 0, 80);
          tone(140, 0.8, "triangle", 0.1, 0.08, 60);
          tone(90, 1.2, "sine", 0.1, 0.22, 40);
          break;
        default:
          break;
      }
    }

    function scheduleTone(midi, start, duration, type, volume) {
      if (!audio) return;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(mtof(midi), start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(start);
      osc.stop(start + duration + 0.03);
    }

    function scheduleNoise(start, duration, volume, frequency) {
      if (!audio || !noiseBuffer) return;
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();

      source.buffer = noiseBuffer;
      filter.type = "highpass";
      filter.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(musicBus);
      source.start(start);
      source.stop(start + duration + 0.02);
    }

    function scheduleStep(step, time) {
      const bassPattern = [33, 33, 36, 33, 31, 31, 36, 38];
      if (step % 4 === 0) {
        const bass = bassPattern[Math.floor(step / 4) % bassPattern.length];
        scheduleTone(bass, time, 0.23, "sawtooth", 0.09);
      }

      if (step % 2 === 1) {
        scheduleNoise(time, 0.035, 0.025, 6500);
      }

      if (step === 0 || step === 8 || step === 16 || step === 24) {
        const kick = audio.createOscillator();
        const gain = audio.createGain();
        kick.type = "sine";
        kick.frequency.setValueAtTime(145, time);
        kick.frequency.exponentialRampToValueAtTime(48, time + 0.14);
        gain.gain.setValueAtTime(0.16, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
        kick.connect(gain);
        gain.connect(musicBus);
        kick.start(time);
        kick.stop(time + 0.18);
      }

      if (step === 4 || step === 12 || step === 20 || step === 28) {
        scheduleNoise(time, 0.1, 0.07, 1800);
      }

      const arpPattern = [69, 76, 72, 81, 76, 84, 72, 79];
      if (step % 2 === 0) {
        const note = arpPattern[(step / 2) % arpPattern.length];
        scheduleTone(note, time, 0.11, "triangle", 0.022);
      }
    }

    function schedulerTick() {
      if (!audio || !musicOn) return;
      const stepDuration = 60 / 128 / 4;
      while (nextNoteTime < audio.currentTime + 0.12) {
        scheduleStep(musicStep, nextNoteTime);
        musicStep = (musicStep + 1) % 32;
        nextNoteTime += stepDuration;
      }
    }

    function startMusic() {
      if (!init()) return;
      if (audio.state === "suspended") audio.resume().catch(() => {});

      musicOn = true;
      musicStep = 0;
      nextNoteTime = audio.currentTime + 0.08;
      musicBus.gain.cancelScheduledValues(audio.currentTime);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), audio.currentTime);
      musicBus.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + 0.5);

      if (!musicTimer) {
        schedulerTick();
        musicTimer = window.setInterval(schedulerTick, 50);
      }
    }

    function stopMusic() {
      musicOn = false;
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
      if (audio && musicBus) {
        musicBus.gain.cancelScheduledValues(audio.currentTime);
        musicBus.gain.setTargetAtTime(0.0001, audio.currentTime, 0.05);
      }
    }

    return {
      unlock,
      sfx,
      startMusic,
      stopMusic,
      toggleMuted,
      isMuted: () => muted,
    };
  })();

  // ----------------------------- STATE -------------------------------
  const state = {
    mode: "menu",
    timeLeft: DURATION,
    elapsed: 0,
    progress: 0,
    score: 0,
    best: readBest(),
    lives: START_LIVES,
    speed: 0,
    distance: 0,
    coins: 0,
    drones: 0,
    combo: 0,
    comboTimer: 0,
    nextComboAt: 5,
    scroll: 0,
    intro: 0,
    invuln: 0,
    hitFlash: 0,
    shake: 0,
    spawnTimer: 1.4,
    coinTimer: 0.8,
    lastHazard: "",
    lastSecond: DURATION,
    endReason: "",
    newBest: false,
    clock: 0,
    entities: [],
    particles: [],
    floaters: [],
    slashes: [],
    lastTouchTrail: 0,
  };

  const player = {
    x: 140,
    y: 0,
    vy: 0,
    onGround: true,
    sliding: false,
    slideTimer: 0,
    slideQueued: 0,
    runPhase: 0,
    scale: 1,
    width: 24,
    height: 76,
    landPulse: 0,
  };

  const scene = {
    floorY: 560,
    unit: 1,
    baseSpeed: 700,
    jumpHeight: 160,
    jumpVelocity: 800,
    gravity: 2000,
  };

  let W = 0;
  let H = 0;
  let DPR = 1;

  // ----------------------- PROCEDURAL CITY ---------------------------
  const bg = {
    stars: [],
    farBuildings: [],
    midBuildings: [],
    signs: [],
    cars: [],
    rain: [],
  };

  function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildCity() {
    const rng = mulberry32(0x51f15e + Math.round(W * 7 + H * 3));
    const starCount = Math.round(clamp(W / 7, 60, 190));
    bg.stars = Array.from({ length: starCount }, () => ({
      x: rng() * W,
      y: rng() * scene.floorY * 0.74,
      size: rng() < 0.12 ? 2 : 1,
      twinkle: 1 + rng() * 2.5,
      phase: rng() * TAU,
      warm: rng() < 0.18,
    }));

    const far = [];
    let cursor = -30;
    while (cursor < W + 10) {
      const width = 34 + rng() * 70;
      const height = H * (0.08 + rng() * 0.17);
      far.push({
        x: cursor,
        w: width,
        h: height,
        seed: Math.floor(rng() * 99999),
        antenna: rng() < 0.25,
        crown: rng() < 0.32,
      });
      cursor += width + rng() * 10;
    }
    bg.farBuildings = far;

    const mid = [];
    cursor = -60;
    while (cursor < W + 20) {
      const width = 48 + rng() * 86;
      const height = H * (0.12 + rng() * 0.22);
      mid.push({
        x: cursor,
        w: width,
        h: height,
        seed: Math.floor(rng() * 99999),
        antenna: rng() < 0.4,
        crown: rng() < 0.4,
        neonRoof: rng() < 0.55,
        sign: null,
      });
      cursor += width + rng() * 14;
    }

    const signWords = ["NEON", "2088", "夜", "RUN", "電脳", "NINJA", "//", "忍"];
    const signColors = ["#49f7ff", "#ff2e9f", "#875dff", "#ffd45e"];
    for (let i = 0; i < 6; i += 1) {
      const building = mid[Math.floor(rng() * mid.length)];
      if (!building || building.sign) continue;
      building.sign = {
        offsetX: building.w * (0.15 + rng() * 0.35),
        y: scene.floorY - building.h * (0.4 + rng() * 0.35),
        w: clamp(building.w * 0.62, 30, 67),
        h: 14 + rng() * 8,
        text: signWords[Math.floor(rng() * signWords.length)],
        color: signColors[Math.floor(rng() * signColors.length)],
        phase: rng() * TAU,
        rate: 0.5 + rng() * 2,
      };
    }
    bg.midBuildings = mid;

    bg.cars = Array.from({ length: 4 }, (_, index) => ({
      x: rng() * W,
      y: scene.floorY - H * (0.24 + rng() * 0.25),
      speed: 14 + rng() * 30,
      color: index % 2 === 0 ? "#49f7ff" : "#ff2e9f",
      phase: rng() * TAU,
    }));

    bg.rain = Array.from({ length: Math.round(clamp(W / 16, 34, 90)) }, () => ({
      x: rng() * W,
      y: rng() * H,
      length: 4 + rng() * 12,
      speed: 180 + rng() * 380,
      alpha: 0.05 + rng() * 0.1,
    }));
  }

  // --------------------------- RESIZE --------------------------------
  function computeSceneMetrics() {
    const oldFloor = scene.floorY;
    scene.unit = clamp(Math.min(W / 980, H / 700), 0.72, 1.3);
    scene.floorY = Math.round(H * 0.78);
    scene.baseSpeed = clamp(W * 0.58, 330, 850);
    scene.jumpHeight = clamp(H * 0.235, 102, 185);
    const jumpTime = 0.82;
    scene.gravity = (8 * scene.jumpHeight) / (jumpTime * jumpTime);
    scene.jumpVelocity = (4 * scene.jumpHeight) / jumpTime;

    player.scale = scene.unit;
    player.width = 26 * scene.unit;
    player.height = 78 * scene.unit;
    player.x = clamp(W * 0.22, 82, 270);

    if (oldFloor && oldFloor !== scene.floorY) {
      const delta = scene.floorY - oldFloor;
      for (const entity of state.entities) {
        entity.y += delta;
        if (typeof entity.baseY === "number") entity.baseY += delta;
      }
      if (player.onGround) player.y = scene.floorY;
      else player.y += delta;
    } else {
      player.y = scene.floorY;
    }
  }

  function resizeCanvas() {
    const rect = app.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width || window.innerWidth));
    H = Math.max(320, Math.round(rect.height || window.innerHeight));
    DPR = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    computeSceneMetrics();
    buildCity();
    updateHud();
  }

  // ------------------------------ UI --------------------------------
  const hudCache = {
    timer: "",
    score: "",
    best: "",
    combo: "",
    fraction: -1,
    comboFraction: -1,
    low: null,
  };

  let goTimer = 0;
  let hintTimer = 0;

  function setOverlay(element, visible) {
    element.classList.toggle("is-visible", visible);
    element.setAttribute("aria-hidden", String(!visible));
  }

  function updateSoundUI() {
    const muted = Sound.isMuted();
    app.classList.toggle("is-muted", muted);
    soundButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(muted));
      button.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
    });
    soundLabels.forEach((label) => {
      label.textContent = muted ? "SOUND OFF" : "SOUND ON";
    });
  }

  function setBestTexts() {
    const text = padScore(state.best);
    bestStartEl.textContent = text;
    bestHudEl.textContent = text;
  }

  function updateLives() {
    Array.from(livesEl.children).forEach((life, index) => {
      life.classList.toggle("is-lost", index >= state.lives);
    });
    livesEl.setAttribute("aria-label", `${state.lives} ${state.lives === 1 ? "life" : "lives"} remaining`);
  }

  function updateHud(force = false) {
    const seconds = Math.ceil(Math.max(0, state.timeLeft));
    const timerText = String(seconds);
    if (force || timerText !== hudCache.timer) {
      timerValueEl.textContent = timerText;
      hudCache.timer = timerText;
    }

    const fraction = clamp(state.timeLeft / DURATION, 0, 1);
    if (force || Math.abs(fraction - hudCache.fraction) > 0.0005) {
      timerFillEl.style.transform = `scaleX(${fraction})`;
      hudCache.fraction = fraction;
    }

    const scoreText = padScore(state.score);
    if (force || scoreText !== hudCache.score) {
      scoreValueEl.textContent = scoreText;
      hudCache.score = scoreText;
    }

    const bestText = padScore(state.best);
    if (force || bestText !== hudCache.best) {
      bestHudEl.textContent = bestText;
      hudCache.best = bestText;
    }

    const comboText = String(state.combo);
    if (force || comboText !== hudCache.combo) {
      comboValueEl.textContent = comboText;
      hudCache.combo = comboText;
    }

    const comboFraction = clamp(state.comboTimer / 3, 0, 1);
    if (force || Math.abs(comboFraction - hudCache.comboFraction) > 0.01) {
      comboFillEl.style.transform = `scaleX(${comboFraction})`;
      hudCache.comboFraction = comboFraction;
    }

    comboHudEl.classList.toggle("is-visible", state.combo >= 2 && state.mode === "playing");

    const low = state.mode === "playing" && state.timeLeft <= 10 && state.timeLeft > 0;
    if (low !== hudCache.low) {
      app.classList.toggle("is-low-time", low);
      hudCache.low = low;
    }
  }

  function setMode(mode) {
    state.mode = mode;
    app.dataset.mode = mode;
    app.classList.toggle("is-playing", mode === "playing");

    hud.classList.toggle("is-hidden", mode === "menu");
    setOverlay(startScreen, mode === "menu");
    setOverlay(pauseScreen, mode === "paused");
    setOverlay(gameOverScreen, mode === "gameover");

    pauseBtn.disabled = mode !== "playing";

    if (mode !== "playing") {
      goBanner.classList.remove("is-active");
      hintBar.classList.remove("is-visible");
    }

    if (mode !== "playing") {
      app.classList.remove("is-low-time");
      hudCache.low = false;
    }

    updateHud(true);
  }

  function hideHint() {
    window.clearTimeout(hintTimer);
    hintBar.classList.remove("is-visible");
  }

  function triggerGoBanner() {
    window.clearTimeout(goTimer);
    window.clearTimeout(hintTimer);
    goBanner.classList.remove("is-active");
    void goBanner.offsetWidth;
    goBanner.classList.add("is-active");
    goTimer = window.setTimeout(() => goBanner.classList.remove("is-active"), 950);
    hintBar.classList.add("is-visible");
    hintTimer = window.setTimeout(() => hintBar.classList.remove("is-visible"), 5600);
  }

  function resetRun() {
    state.timeLeft = DURATION;
    state.elapsed = 0;
    state.progress = 0;
    state.score = 0;
    state.lives = START_LIVES;
    state.speed = scene.baseSpeed * 0.8;
    state.distance = 0;
    state.coins = 0;
    state.drones = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.nextComboAt = 5;
    state.intro = 0.85;
    state.invuln = 0;
    state.hitFlash = 0;
    state.shake = 0;
    state.spawnTimer = 1.25;
    state.coinTimer = 0.75;
    state.lastHazard = "";
    state.lastSecond = DURATION;
    state.endReason = "";
    state.newBest = false;
    state.entities = [];
    state.particles = [];
    state.floaters = [];
    state.slashes = [];
    state.lastTouchTrail = 0;

    player.x = clamp(W * 0.22, 82, 270);
    player.y = scene.floorY;
    player.vy = 0;
    player.onGround = true;
    player.sliding = false;
    player.slideTimer = 0;
    player.slideQueued = 0;
    player.runPhase = 0;
    player.landPulse = 0;
    player.sparkTimer = 0;
    player.trailTimer = 0;

    updateLives();
    updateHud(true);
    setBestTexts();
    app.classList.remove("is-low-time");
  }

  function startGame() {
    if (state.mode === "playing" || state.mode === "paused") return;
    Sound.unlock();
    Sound.sfx("start");
    resetRun();
    Sound.startMusic();
    setMode("playing");
    triggerGoBanner();
  }

  function pauseGame() {
    if (state.mode !== "playing") return;
    setMode("paused");
    Sound.stopMusic();
    Sound.sfx("pause");
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    Sound.unlock();
    setMode("playing");
    Sound.startMusic();
    Sound.sfx("ui");
  }

  function quitToMenu() {
    Sound.stopMusic();
    state.entities = [];
    state.particles = [];
    state.floaters = [];
    state.slashes = [];
    state.speed = 0;
    state.invuln = 0;
    player.sliding = false;
    player.onGround = true;
    player.y = scene.floorY;
    player.vy = 0;
    setBestTexts();
    setMode("menu");
    updateLives();
  }

  function fillResults() {
    finalScoreEl.textContent = padScore(state.score);
    finalBestEl.textContent = padScore(state.best);
    finalCoinsEl.textContent = String(state.coins);
    finalDronesEl.textContent = String(state.drones);
    const metres = Math.max(0, Math.round(state.distance / (70 * scene.unit)));
    finalDistanceEl.textContent = `${metres}m`;
    newBestEl.hidden = !state.newBest;

    if (state.endReason === "timer") {
      overTitleEl.textContent = "60 SECONDS // SURVIVED";
      gameOverTitleEl.textContent = "TIME'S UP";
    } else {
      overTitleEl.textContent = "VITALS DEPLETED // RUN ENDED";
      gameOverTitleEl.textContent = "SIGNAL LOST";
    }
  }

  function endGame(reason) {
    if (state.mode !== "playing") return;

    state.endReason = reason;
    state.newBest = state.score > state.best;
    if (state.newBest) {
      state.best = state.score;
      writeBest(state.best);
    }

    if (reason === "timer") state.timeLeft = 0;
    Sound.stopMusic();
    Sound.sfx(reason === "timer" ? "timeout" : "gameover");
    fillResults();
    setBestTexts();
    updateHud(true);
    setMode("gameover");
    hideHint();
    goBanner.classList.remove("is-active");
  }

  // --------------------------- INPUT --------------------------------
  function requestJump() {
    if (state.mode !== "playing") return;
    if (!player.onGround) return;

    player.onGround = false;
    player.sliding = false;
    player.slideTimer = 0;
    player.slideQueued = 0;
    player.vy = -scene.jumpVelocity;
    player.y -= 1;
    player.landPulse = 0;
    Sound.sfx("jump");
    spawnBurst(player.x, player.y, "#49f7ff", 9, 150, { size: 2.2, life: 0.35, gravity: 380 });
    spawnRing(player.x, player.y, "#49f7ff", 22);
    hideHint();
  }

  function startSlide() {
    if (state.mode !== "playing") return;
    if (!player.onGround) return;
    if (!player.sliding) {
      Sound.sfx("slide");
      spawnBurst(player.x + player.width * 0.4, scene.floorY, "#ff2e9f", 10, 160, {
        size: 2.5,
        life: 0.45,
        gravity: 240,
      });
    }
    player.sliding = true;
    player.slideTimer = player.sliding ? Math.max(player.slideTimer, 0.78) : 0.78;
    hideHint();
  }

  function requestSlide() {
    if (state.mode !== "playing") return;
    if (player.onGround) {
      startSlide();
    } else {
      player.slideQueued = 0.34;
    }
  }

  function handleKeyDown(event) {
    const code = event.code;
    const isGameKey = [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyS",
      "KeyP",
      "KeyM",
      "Escape",
      "Enter",
    ].includes(code);

    if (isGameKey) event.preventDefault();

    if (code === "KeyM") {
      if (!event.repeat) Sound.toggleMuted();
      return;
    }

    if (state.mode === "menu") {
      if (!event.repeat && (code === "Enter" || code === "Space" || code === "NumpadEnter")) {
        startGame();
      }
      return;
    }

    if (state.mode === "gameover") {
      if (!event.repeat && (code === "Enter" || code === "Space" || code === "NumpadEnter")) {
        startGame();
      } else if (!event.repeat && code === "Escape") {
        quitToMenu();
      }
      return;
    }

    if (state.mode === "paused") {
      if (!event.repeat && (code === "Escape" || code === "KeyP" || code === "Enter")) {
        resumeGame();
      }
      return;
    }

    if (state.mode !== "playing") return;

    if (code === "Escape" || code === "KeyP") {
      if (!event.repeat) pauseGame();
      return;
    }

    if (event.repeat) return;

    if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
      requestJump();
    } else if (code === "ArrowDown" || code === "KeyS") {
      requestSlide();
    }
  }

  function bindInput() {
    window.addEventListener("keydown", handleKeyDown, { passive: false });

    startBtn.addEventListener("click", startGame);
    replayBtn.addEventListener("click", startGame);
    menuBtn.addEventListener("click", quitToMenu);
    pauseBtn.addEventListener("click", pauseGame);
    resumeBtn.addEventListener("click", resumeGame);
    quitBtn.addEventListener("click", quitToMenu);

    soundButtons.forEach((button) => {
      button.addEventListener("click", () => Sound.toggleMuted());
    });

    function bindTouchButton(button, action) {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.classList.add("is-pressed");
        action();
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
        button.addEventListener(type, () => button.classList.remove("is-pressed"));
      });
    }

    bindTouchButton(jumpBtn, requestJump);
    bindTouchButton(slideBtn, requestSlide);

    // Swipe or tap anywhere on the field for extra touch support.
    let gesture = null;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || state.mode !== "playing") return;
      gesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        acted: false,
      };
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!gesture || event.pointerId !== gesture.id || state.mode !== "playing") return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.acted || Math.abs(dx) + Math.abs(dy) < 24) return;

      gesture.acted = true;
      if (dy < 0) requestJump();
      else requestSlide();
    });

    canvas.addEventListener("pointerup", (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const elapsed = performance.now() - gesture.time;
      if (!gesture.acted && elapsed < 400) requestJump();
      gesture = null;
    });

    canvas.addEventListener("pointercancel", () => {
      gesture = null;
    });

    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.mode === "playing") pauseGame();
    });

    window.addEventListener("blur", () => {
      if (state.mode === "playing") pauseGame();
    });
  }

  // ------------------------- PARTICLES / FX -------------------------
  function spawnParticle(options) {
    if (state.particles.length > 460) state.particles.shift();
    state.particles.push({
      x: options.x,
      y: options.y,
      vx: options.vx || 0,
      vy: options.vy || 0,
      life: options.life || 0.5,
      maxLife: options.life || 0.5,
      size: options.size || 2,
      color: options.color || "#49f7ff",
      gravity: options.gravity || 0,
      drag: options.drag === undefined ? 0.92 : options.drag,
      shape: options.shape || "spark",
      rotation: options.rotation || 0,
      spin: options.spin || 0,
    });
  }

  function spawnBurst(x, y, color, count, speed, options = {}) {
    const size = options.size || 2.4;
    const life = options.life || 0.55;
    const gravity = options.gravity || 0;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const velocity = rand(speed * 0.25, speed);
      spawnParticle({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(life * 0.55, life),
        size: rand(size * 0.5, size * 1.4),
        color,
        gravity,
        drag: 0.9,
        shape: Math.random() < 0.28 ? "dot" : "spark",
        rotation: angle,
      });
    }
  }

  function spawnRing(x, y, color, radius) {
    state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.36,
      maxLife: 0.36,
      size: radius,
      color,
      gravity: 0,
      drag: 1,
      shape: "ring",
      rotation: 0,
      spin: 0,
    });
  }

  function spawnFloater(x, y, text, color, size = 15) {
    if (state.floaters.length > 28) state.floaters.shift();
    state.floaters.push({
      x,
      y,
      text,
      color,
      size,
      life: 0.9,
      maxLife: 0.9,
      vy: -44,
    });
  }

  function updateFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.pow(particle.drag, dt * 60);
      particle.vy *= Math.pow(particle.drag, dt * 60);
      particle.rotation += particle.spin * dt;
    }

    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const floater = state.floaters[i];
      floater.life -= dt;
      floater.y += floater.vy * dt;
      floater.vy *= Math.pow(0.96, dt * 60);
      if (floater.life <= 0) state.floaters.splice(i, 1);
    }

    for (let i = state.slashes.length - 1; i >= 0; i -= 1) {
      const slash = state.slashes[i];
      slash.life -= dt;
      if (slash.life <= 0) state.slashes.splice(i, 1);
    }

    state.hitFlash = Math.max(0, state.hitFlash - dt * 2.4);
    state.shake = Math.max(0, state.shake - dt * 52);
  }

  // --------------------------- PLAYER -------------------------------
  function updatePlayerIdle(dt) {
    player.x = clamp(W * 0.22, 82, 270);
    player.y = scene.floorY;
    player.onGround = true;
    player.sliding = false;
    player.runPhase += dt * 2.1;
  }

  function updatePlayer(dt) {
    player.runPhase += dt * (7 + state.speed / (scene.unit * 420));
    player.landPulse = Math.max(0, player.landPulse - dt * 4);
    if (player.slideQueued > 0) player.slideQueued -= dt;
    if (state.invuln > 0) state.invuln = Math.max(0, state.invuln - dt);

    if (!player.onGround) {
      player.vy += scene.gravity * dt;
      player.y += player.vy * dt;

      player.trailTimer = (player.trailTimer || 0) - dt;
      if (player.trailTimer <= 0) {
        player.trailTimer = 0.045;
        spawnParticle({
          x: player.x - player.width * 0.3,
          y: player.y - player.height * rand(0.15, 0.6),
          vx: rand(-35, -8),
          vy: rand(-16, 16),
          life: rand(0.18, 0.36),
          size: rand(1, 2.8),
          color: Math.random() < 0.3 ? "#ff2e9f" : "#49f7ff",
          drag: 0.94,
          shape: "dot",
        });
      }

      if (player.y >= scene.floorY) {
        player.y = scene.floorY;
        player.onGround = true;
        player.vy = 0;
        player.landPulse = 1;
        spawnBurst(player.x, scene.floorY, "#7defff", 8, 130, {
          size: 2,
          life: 0.35,
          gravity: 300,
        });
        if (player.slideQueued > 0) {
          player.slideQueued = 0;
          startSlide();
        }
      }
    }

    if (player.sliding) {
      player.slideTimer -= dt;
      player.sparkTimer = (player.sparkTimer || 0) - dt;
      if (player.sparkTimer <= 0) {
        player.sparkTimer = 0.04;
        spawnParticle({
          x: player.x + player.width * 0.45,
          y: scene.floorY - rand(1, 4),
          vx: rand(-130, -45),
          vy: rand(-60, 5),
          life: rand(0.15, 0.36),
          size: rand(1.2, 3.1),
          color: Math.random() < 0.5 ? "#ffd45e" : "#ff2e9f",
          gravity: 220,
          drag: 0.93,
          shape: "spark",
          rotation: rand(0, TAU),
        });
      }
      if (player.slideTimer <= 0) player.sliding = false;
    }
  }

  // --------------------------- SPAWNING -----------------------------
  function addCoin(x, y) {
    state.entities.push({
      type: "coin",
      x,
      y,
      r: 9.5 * scene.unit,
      phase: rand(0, TAU),
      spin: rand(0, TAU),
      dead: false,
    });
  }

  function addCoinArc(cx, obstacleHeight) {
    const u = scene.unit;
    const count = 5;
    const peak = obstacleHeight + 28 * u;
    for (let i = 0; i < count; i += 1) {
      const progress = (i + 1) / (count + 1);
      addCoin(
        cx + (i - (count - 1) / 2) * 31 * u,
        scene.floorY - 26 * u - Math.sin(progress * Math.PI) * (peak + 22 * u)
      );
    }
  }

  function spawnCoinGroup() {
    const u = scene.unit;
    const count = randInt(3, 6);
    const high = Math.random() < 0.34;
    const baseY = scene.floorY - (high ? rand(82, 116) : rand(24, 38)) * u;
    const startX = W + 90;
    const arc = Math.random() < 0.55;
    for (let i = 0; i < count; i += 1) {
      const wave = arc ? Math.sin(((i + 1) / (count + 1)) * Math.PI) * rand(20, 48) * u : 0;
      addCoin(startX + i * 32 * u, baseY - wave);
    }
  }

  function spawnGroundObstacle() {
    const u = scene.unit;
    const w = rand(34, 62) * u;
    const h = rand(56, 84) * u;
    const x = W + 90;
    const variant = randInt(0, 2);
    state.entities.push({
      type: "obstacle",
      variant,
      x,
      y: scene.floorY - h,
      w,
      h,
      phase: rand(0, TAU),
      dead: false,
    });
    if (Math.random() < 0.7) addCoinArc(x + w / 2, h);
  }

  function spawnLaser() {
    const u = scene.unit;
    const w = rand(78, 118) * u;
    const height = rand(50, 64) * u;
    const gap = 47 * u;
    const x = W + 90;
    state.entities.push({
      type: "laser",
      x,
      y: scene.floorY - gap - height,
      w,
      h: height,
      phase: rand(0, TAU),
      dead: false,
    });

    if (Math.random() < 0.72) {
      const count = 4;
      for (let i = 0; i < count; i += 1) {
        addCoin(x + w * (0.16 + (i / (count - 1)) * 0.68), scene.floorY - rand(17, 24) * u);
      }
    }
  }

  function spawnDrone() {
    const u = scene.unit;
    const r = 17 * u;
    const baseY = scene.floorY - rand(77, 88) * u;
    state.entities.push({
      type: "drone",
      x: W + 100,
      y: baseY,
      baseY,
      r,
      phase: rand(0, TAU),
      dead: false,
    });
  }

  function spawnHazard() {
    let roll = Math.random();
    let type = roll < 0.5 ? "obstacle" : roll < 0.82 ? "laser" : "drone";

    if (type === state.lastHazard && Math.random() < 0.62) {
      type = type === "obstacle" ? "laser" : type === "laser" ? "drone" : "obstacle";
    }
    state.lastHazard = type;

    if (type === "obstacle") spawnGroundObstacle();
    else if (type === "laser") spawnLaser();
    else spawnDrone();
  }

  function updateSpawning(dt) {
    if (state.intro > 0) return;

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnHazard();
      const p = state.progress;
      state.spawnTimer = rand(1.24 - 0.34 * p, 1.78 - 0.43 * p);
    }

    state.coinTimer -= dt;
    if (state.coinTimer <= 0) {
      spawnCoinGroup();
      state.coinTimer = rand(1.0, 2.0);
    }
  }

  // -------------------------- COLLISIONS ----------------------------
  function getPlayerHitbox() {
    const u = scene.unit;
    const width = (player.sliding ? 45 : 27) * u;
    const height = (player.sliding ? 32 : 76) * u;
    return {
      x: player.x - width / 2,
      y: player.y - height,
      w: width,
      h: height,
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function circleRect(cx, cy, radius, rect) {
    const nearX = clamp(cx, rect.x, rect.x + rect.w);
    const nearY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearX;
    const dy = cy - nearY;
    return dx * dx + dy * dy <= radius * radius;
  }

  function getHazardHitbox(entity) {
    if (entity.type === "laser") {
      return {
        x: entity.x + entity.w * 0.03,
        y: entity.y + 2,
        w: entity.w * 0.94,
        h: entity.h - 4,
      };
    }
    return {
      x: entity.x + entity.w * 0.1,
      y: entity.y + entity.h * 0.08,
      w: entity.w * 0.8,
      h: entity.h * 0.92,
    };
  }

  function addPoints(amount, x, y, label, color, size = 15) {
    state.score += amount;
    spawnFloater(x, y, label, color, size);
    updateHud();
  }

  function registerCombo() {
    state.combo += 1;
    state.comboTimer = 3;

    if (state.combo >= state.nextComboAt) {
      const bonus = 50;
      addPoints(bonus, player.x, player.y - player.height - 20, `CHAIN +${bonus}`, "#ffd45e", 18);
      state.nextComboAt += 5;
      Sound.sfx("combo");
      spawnRing(player.x, player.y - player.height * 0.5, "#ffd45e", 54 * scene.unit);
    }
    updateHud();
  }

  function resetCombo() {
    state.combo = 0;
    state.comboTimer = 0;
    state.nextComboAt = 5;
  }

  function collectCoin(entity) {
    entity.dead = true;
    state.coins += 1;
    addPoints(10, entity.x, entity.y - 6, "+10", "#ffd45e", 16);
    spawnBurst(entity.x, entity.y, "#ffd45e", 12, 180, {
      size: 2.2,
      life: 0.45,
      gravity: 180,
    });
    spawnRing(entity.x, entity.y, "#ffd45e", 20 * scene.unit);
    Sound.sfx("coin");
    registerCombo();
  }

  function killDrone(entity) {
    entity.dead = true;
    state.drones += 1;
    addPoints(25, entity.x, entity.y - 14, "+25", "#ff6eb7", 18);
    state.shake = Math.max(state.shake, 7);
    spawnBurst(entity.x, entity.y, "#ff2e9f", 24, 310, {
      size: 3,
      life: 0.7,
      gravity: 260,
    });
    spawnBurst(entity.x, entity.y, "#ffd45e", 10, 220, {
      size: 2,
      life: 0.45,
      gravity: 160,
    });
    spawnRing(entity.x, entity.y, "#ff2e9f", 34 * scene.unit);
    state.slashes.push({
      x: entity.x,
      y: entity.y,
      radius: 42 * scene.unit,
      angle: rand(-0.6, 0.6),
      life: 0.28,
      maxLife: 0.28,
    });
    Sound.sfx("kill");
    registerCombo();
  }

  function damagePlayer() {
    if (state.invuln > 0 || state.mode !== "playing") return;

    state.lives -= 1;
    state.invuln = 1.8;
    state.hitFlash = 1;
    state.shake = 22;
    state.combo = 0;
    state.comboTimer = 0;
    state.nextComboAt = 5;

    spawnBurst(player.x, player.y - player.height * 0.5, "#ff2e6d", 30, 360, {
      size: 3.2,
      life: 0.75,
      gravity: 380,
    });
    spawnRing(player.x, player.y - player.height * 0.5, "#ff2e6d", 42 * scene.unit);
    spawnFloater(player.x, player.y - player.height - 16, "SIGNAL LOST", "#ff6b8f", 14);
    Sound.sfx("hit");
    updateLives();
    updateHud(true);

    if (state.lives <= 0) endGame("lives");
  }

  function collideEntity(entity) {
    const hitbox = getPlayerHitbox();

    if (entity.type === "coin") {
      if (circleRect(entity.x, entity.y, entity.r * 1.16, hitbox)) collectCoin(entity);
      return;
    }

    if (entity.type === "drone") {
      if (!circleRect(entity.x, entity.y, entity.r * 0.86, hitbox)) return;
      if (!player.onGround) {
        killDrone(entity);
      } else if (state.invuln <= 0) {
        entity.dead = true;
        damagePlayer();
      }
      return;
    }

    if (state.invuln > 0) return;
    if (rectsOverlap(hitbox, getHazardHitbox(entity))) {
      damagePlayer();
    }
  }

  function updateEntities(dt) {
    const travel = state.speed * dt;
    for (const entity of state.entities) {
      entity.x -= travel;

      if (entity.type === "coin") {
        entity.spin += dt * (4 + state.speed / 260);
        entity.phase += dt * 2.4;
      } else if (entity.type === "drone") {
        entity.y = entity.baseY + Math.sin(state.clock * 3.2 + entity.phase) * 5 * scene.unit;
      }

      if (!entity.dead && entity.x > -150 && state.mode === "playing") {
        collideEntity(entity);
      }
    }

    state.entities = state.entities.filter((entity) => !entity.dead && entity.x > -150);
  }

  // ---------------------------- UPDATE ------------------------------
  function updateGame(dt) {
    if (state.intro > 0) {
      state.intro = Math.max(0, state.intro - dt);
    } else {
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      state.elapsed = DURATION - state.timeLeft;
      state.progress = clamp(state.elapsed / DURATION, 0, 1);

      const nextSecond = Math.ceil(state.timeLeft);
      if (nextSecond !== state.lastSecond) {
        state.lastSecond = nextSecond;
        if (nextSecond <= 10 && nextSecond > 0) Sound.sfx("tick");
      }

      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateHud(true);
        endGame("timer");
        return;
      }
    }

    const targetSpeed = scene.baseSpeed * (1 + 0.68 * Math.pow(state.progress, 0.92));
    state.speed = lerp(state.speed, targetSpeed, Math.min(1, dt * 2.6));
    state.distance += state.speed * dt;
    state.scroll += state.speed * dt;

    updatePlayer(dt);
    updateSpawning(dt);
    updateEntities(dt);

    if (state.comboTimer > 0) {
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer <= 0) resetCombo();
    }

    updateHud();
  }

  function update(dt) {
    state.clock += dt;

    if (state.mode === "paused") return;

    if (state.mode === "menu") {
      state.scroll += 46 * dt;
      updatePlayerIdle(dt);
      updateFx(dt);
      return;
    }

    if (state.mode === "gameover") {
      state.scroll += 16 * dt;
      updateFx(dt);
      return;
    }

    updateGame(dt);
    updateFx(dt);
  }

  // --------------------------- RENDERING ----------------------------
  function polygonPath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  }

  function drawSky(t) {
    const horizon = scene.floorY;
    const skyGradient = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGradient.addColorStop(0, "#040311");
    skyGradient.addColorStop(0.42, "#0b0621");
    skyGradient.addColorStop(0.72, "#1b0a33");
    skyGradient.addColorStop(0.9, "#37103f");
    skyGradient.addColorStop(1, "#5b1147");
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, W, H);

    // Distant pink haze behind the city.
    const haze = ctx.createRadialGradient(
      W * 0.68,
      horizon * 0.84,
      10,
      W * 0.68,
      horizon * 0.84,
      Math.max(W, H) * 0.48
    );
    haze.addColorStop(0, "rgba(237, 38, 152, 0.2)");
    haze.addColorStop(0.5, "rgba(127, 34, 177, 0.08)");
    haze.addColorStop(1, "rgba(6, 3, 18, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, horizon);

    // Neon sun/moon behind the skyline.
    const sunX = W * 0.72;
    const sunY = horizon - H * 0.2;
    const sunRadius = clamp(Math.min(W, H) * 0.15, 54, 138);
    const halo = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.1, sunX, sunY, sunRadius * 2.4);
    halo.addColorStop(0, "rgba(255, 76, 179, 0.3)");
    halo.addColorStop(0.35, "rgba(255, 50, 158, 0.12)");
    halo.addColorStop(1, "rgba(255, 47, 160, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - sunRadius * 2.4, sunY - sunRadius * 2.4, sunRadius * 4.8, sunRadius * 4.8);

    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, TAU);
    ctx.clip();
    const sunGradient = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
    sunGradient.addColorStop(0, "rgba(255, 238, 150, 0.94)");
    sunGradient.addColorStop(0.38, "rgba(255, 112, 178, 0.92)");
    sunGradient.addColorStop(0.72, "rgba(255, 48, 142, 0.82)");
    sunGradient.addColorStop(1, "rgba(121, 37, 175, 0.55)");
    ctx.fillStyle = sunGradient;
    ctx.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);
    ctx.fillStyle = "rgba(12, 4, 25, 0.68)";
    for (let y = sunY - sunRadius * 0.12; y < sunY + sunRadius; y += sunRadius * 0.23) {
      ctx.fillRect(sunX - sunRadius, y, sunRadius * 2, sunRadius * 0.055);
    }
    ctx.restore();

    // Twinkling stars.
    for (const star of bg.stars) {
      const flicker = 0.34 + 0.3 * (0.5 + 0.5 * Math.sin(t * star.twinkle + star.phase));
      ctx.globalAlpha = flicker;
      ctx.fillStyle = star.warm ? "#ffb4e1" : "#bdefff";
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    // Long horizontal cloud bands.
    ctx.fillStyle = "rgba(131, 56, 158, 0.07)";
    for (let i = 0; i < 4; i += 1) {
      const y = horizon * (0.34 + i * 0.11);
      const offset = mod(state.scroll * 0.012 + i * 310, W + 500) - 250;
      ctx.fillRect(offset, y, W * 0.6, 2 + i);
      ctx.fillRect(offset - W * 0.8, y + 9, W * 0.35, 1);
    }

    const horizonGlow = ctx.createLinearGradient(0, horizon - 80, 0, horizon + 2);
    horizonGlow.addColorStop(0, "rgba(255, 42, 156, 0)");
    horizonGlow.addColorStop(0.72, "rgba(255, 42, 156, 0.13)");
    horizonGlow.addColorStop(1, "rgba(73, 247, 255, 0.25)");
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, horizon - 80, W, 82);
  }

  function drawBuilding(building, x, baseY, options, t) {
    const top = baseY - building.h;
    if (x > W + 30 || x + building.w < -30) return;

    ctx.fillStyle = options.fill;
    ctx.fillRect(x, top, building.w, building.h);

    // Brighter inner spine gives the silhouette depth.
    const spine = ctx.createLinearGradient(x, 0, x + building.w, 0);
    spine.addColorStop(0, "rgba(255,255,255,0.025)");
    spine.addColorStop(0.52, options.spine);
    spine.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = spine;
    ctx.fillRect(x, top, building.w, building.h);

    // Lit windows.
    const cellX = options.cell * scene.unit;
    const cellY = Math.max(6, cellX * 0.85);
    const winW = Math.max(1, cellX * 0.26);
    const winH = Math.max(1.5, cellY * 0.34);
    const startX = x + cellX * 0.6;
    const startY = top + cellY * 0.8;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, top + 2, building.w - 4, building.h - 4);
    ctx.clip();
    for (let wy = startY, row = 0; wy < baseY - 6; wy += cellY, row += 1) {
      for (let wx = startX, col = 0; wx < x + building.w - 4; wx += cellX, col += 1) {
        const lit = (row * 7 + col * 13 + building.seed) % 13;
        if (lit < 3) {
          ctx.globalAlpha = lit === 0 ? 0.72 : 0.4;
          ctx.fillStyle = lit === 1 ? options.windowPink : options.window;
          ctx.fillRect(wx, wy, winW, winH);
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Roof edge and antenna.
    ctx.fillStyle = options.roof;
    ctx.fillRect(x, top, building.w, Math.max(1, scene.unit));
    if (building.neonRoof || options.alwaysRoofGlow) {
      ctx.save();
      ctx.shadowColor = options.roof;
      ctx.shadowBlur = 9;
      ctx.fillStyle = options.roof;
      ctx.fillRect(x + 2, top, building.w - 4, 1.2);
      ctx.restore();
    }

    if (building.antenna) {
      const antennaX = x + building.w * (0.28 + ((building.seed % 37) / 100));
      ctx.strokeStyle = "rgba(123, 198, 220, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(antennaX, top);
      ctx.lineTo(antennaX, top - 10 - (building.seed % 16));
      ctx.stroke();
      const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4 + building.seed));
      ctx.fillStyle = `rgba(255, 55, 133, ${blink})`;
      ctx.fillRect(antennaX - 1, top - 11 - (building.seed % 16), 2, 2);
    }

    if (building.crown) {
      ctx.fillStyle = "rgba(6, 4, 17, 0.9)";
      ctx.fillRect(x + building.w * 0.2, top - 4, building.w * 0.6, 4);
    }

    if (building.sign) drawSign(building.sign, x, t);
  }

  function drawSign(sign, buildingX, t) {
    const signX = buildingX + sign.offsetX;
    const flicker = Math.sin(t * sign.rate + sign.phase);
    if (flicker < -0.93) return;
    const alpha = 0.62 + 0.25 * (0.5 + 0.5 * flicker);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(4, 4, 16, 0.82)";
    ctx.fillRect(signX, sign.y, sign.w, sign.h);
    ctx.shadowColor = sign.color;
    ctx.shadowBlur = 11;
    ctx.strokeStyle = sign.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(signX + 0.5, sign.y + 0.5, sign.w - 1, sign.h - 1);
    ctx.fillStyle = sign.color;
    ctx.font = `700 ${Math.max(7, 8.5 * scene.unit)}px Orbitron, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(sign.text, signX + sign.w / 2, sign.y + sign.h / 2 + 0.5);
    ctx.restore();
  }

  function drawBuildingLayer(buildings, parallax, options, t) {
    const shift = mod(state.scroll * parallax, W);
    const baseY = scene.floorY + (options.baseOffset || 0);

    for (const building of buildings) {
      for (let copy = 0; copy <= 1; copy += 1) {
        const x = building.x - shift + copy * W;
        if (x > W + 20 || x + building.w < -20) continue;
        drawBuilding(building, x, baseY, options, t);
      }
    }
  }

  function drawFlyingCars(t) {
    for (const car of bg.cars) {
      const x = mod(car.x - state.scroll * 0.19 - t * car.speed, W + 140) - 70;
      const y = car.y + Math.sin(t * 0.7 + car.phase) * 5;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = car.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = car.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x - 20, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = car.color;
      ctx.fillRect(x - 1, y - 1.2, 3, 2.4);
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.moveTo(x - 44, y + 0.5);
      ctx.lineTo(x - 20, y + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCity(t) {
    drawBuildingLayer(bg.farBuildings, 0.055, {
      baseOffset: -8,
      fill: "rgba(9, 7, 28, 0.9)",
      spine: "rgba(78, 44, 131, 0.16)",
      roof: "rgba(81, 214, 255, 0.22)",
      window: "#42c7dc",
      windowPink: "#c34e9e",
      cell: 8,
      alwaysRoofGlow: false,
    }, t);

    drawBuildingLayer(bg.midBuildings, 0.14, {
      baseOffset: 2,
      fill: "rgba(6, 5, 21, 0.97)",
      spine: "rgba(108, 62, 195, 0.14)",
      roof: "rgba(255, 46, 159, 0.55)",
      window: "#5cd9e8",
      windowPink: "#ff4ea9",
      cell: 10,
      alwaysRoofGlow: false,
    }, t);

    drawFlyingCars(t);

    // A low band of roof haze.
    const haze = ctx.createLinearGradient(0, scene.floorY - H * 0.1, 0, scene.floorY);
    haze.addColorStop(0, "rgba(109, 33, 151, 0)");
    haze.addColorStop(1, "rgba(255, 46, 159, 0.09)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, scene.floorY - H * 0.1, W, H * 0.1);
  }

  function drawStreet(t) {
    const horizon = scene.floorY;
    const depth = H - horizon;
    const road = ctx.createLinearGradient(0, horizon, 0, H);
    road.addColorStop(0, "#08101c");
    road.addColorStop(0.22, "#070815");
    road.addColorStop(1, "#04030c");
    ctx.fillStyle = road;
    ctx.fillRect(0, horizon, W, depth);

    // Neon curb line and its reflected glow.
    ctx.save();
    ctx.shadowColor = "#49f7ff";
    ctx.shadowBlur = 18;
    const curb = ctx.createLinearGradient(0, 0, W, 0);
    curb.addColorStop(0, "rgba(255, 46, 159, 0.2)");
    curb.addColorStop(0.28, "#49f7ff");
    curb.addColorStop(0.72, "#875dff");
    curb.addColorStop(1, "rgba(255, 46, 159, 0.4)");
    ctx.fillStyle = curb;
    ctx.fillRect(0, horizon - 1, W, 2.2);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon + 2, W, depth);
    ctx.clip();

    // Perspective floor grid.
    ctx.strokeStyle = "rgba(86, 219, 255, 0.11)";
    ctx.lineWidth = 1;
    const rows = 9;
    for (let i = 1; i <= rows; i += 1) {
      const p = i / rows;
      const y = horizon + Math.pow(p, 1.72) * depth;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    for (let col = -7; col <= 14; col += 1) {
      const bottomX = (col / 7) * W * 0.72 + W * 0.16;
      const topX = W * 0.5 + (bottomX - W * 0.5) * 0.055;
      ctx.beginPath();
      ctx.moveTo(topX, horizon + 2);
      ctx.lineTo(bottomX, H);
      ctx.stroke();
    }

    // Moving lane markers.
    const dashOffset = mod(state.scroll * 0.82, 150);
    const laneY = horizon + depth * 0.33;
    ctx.strokeStyle = "rgba(73, 247, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.setLineDash([36, 56]);
    ctx.lineDashOffset = dashOffset;
    ctx.beginPath();
    ctx.moveTo(0, laneY);
    ctx.lineTo(W, laneY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 46, 159, 0.16)";
    ctx.lineDashOffset = -dashOffset * 0.65;
    ctx.beginPath();
    ctx.moveTo(0, horizon + depth * 0.62);
    ctx.lineTo(W, horizon + depth * 0.62);
    ctx.stroke();
    ctx.setLineDash([]);

    // Wet-road reflections.
    for (let i = 0; i < 8; i += 1) {
      const x = mod(i * 217 + state.scroll * 0.32, W);
      const color = i % 2 ? "73,247,255" : "255,46,159";
      const reflection = ctx.createLinearGradient(x, horizon, x, horizon + depth * 0.5);
      reflection.addColorStop(0, `rgba(${color}, 0.11)`);
      reflection.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = reflection;
      ctx.fillRect(x, horizon + 5, 2 + (i % 3) * 2, depth * 0.5);
    }
    ctx.restore();

    // Dark foreground fade.
    const fade = ctx.createLinearGradient(0, H - depth * 0.24, 0, H);
    fade.addColorStop(0, "rgba(3, 2, 8, 0)");
    fade.addColorStop(1, "rgba(3, 2, 8, 0.7)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, H - depth * 0.24, W, depth * 0.24);
  }

  function drawCoin(entity, t) {
    const u = scene.unit;
    const bob = Math.sin(entity.phase + t * 2.5) * 3.5 * u;
    const y = entity.y + bob;
    const squash = Math.max(0.2, Math.abs(Math.cos(entity.spin)) * 0.78 + 0.22);
    const radius = entity.r;

    ctx.save();
    ctx.translate(entity.x, y);
    ctx.scale(squash, 1);

    ctx.shadowColor = "#ffd45e";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffd45e";
    polygonPath([
      [0, -radius],
      [radius * 0.78, -radius * 0.5],
      [radius * 0.78, radius * 0.5],
      [0, radius],
      [-radius * 0.78, radius * 0.5],
      [-radius * 0.78, -radius * 0.5],
    ]);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 255, 230, 0.9)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 171, 46, 0.75)";
    polygonPath([
      [0, -radius * 0.56],
      [radius * 0.43, -radius * 0.28],
      [radius * 0.43, radius * 0.28],
      [0, radius * 0.56],
      [-radius * 0.43, radius * 0.28],
      [-radius * 0.43, -radius * 0.28],
    ]);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(-1, -radius * 0.36, 2, radius * 0.72);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.24 + 0.12 * Math.sin(t * 3 + entity.phase);
    ctx.strokeStyle = "#ffd45e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(entity.x, y, radius * 1.55, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawObstacle(entity, t) {
    const { x, y, w, h, variant } = entity;
    const u = scene.unit;
    const pulse = 0.7 + 0.3 * Math.sin(t * 7 + entity.phase);

    // Contact shadow.
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, scene.floorY + 3, w * 0.7, 5 * u, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (variant === 1) {
      // Neon spike barricade.
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#09091b";
      ctx.strokeStyle = "rgba(255, 46, 159, 0.65)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h - 7 * u);
      ctx.lineTo(w, h - 7 * u);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const spikes = 3;
      for (let i = 0; i < spikes; i += 1) {
        const sx = w * (0.14 + i * 0.27);
        const sw = w * 0.24;
        const tipY = h * (i === 1 ? 0.03 : 0.16);
        ctx.shadowColor = "#ff2e9f";
        ctx.shadowBlur = 14 * pulse;
        const spikeGradient = ctx.createLinearGradient(0, h, 0, tipY);
        spikeGradient.addColorStop(0, "rgba(255, 46, 159, 0.25)");
        spikeGradient.addColorStop(0.55, "rgba(255, 46, 159, 0.85)");
        spikeGradient.addColorStop(1, "#ffd6eb");
        ctx.fillStyle = spikeGradient;
        polygonPath([
          [sx, h - 6 * u],
          [sx + sw / 2, tipY],
          [sx + sw, h - 6 * u],
        ]);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255, 46, 159, ${0.45 + pulse * 0.3})`;
      ctx.fillRect(0, h - 4 * u, w, 1.4);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    const cut = Math.min(9 * u, w * 0.22);
    const cratePath = [
      [0, cut],
      [cut, 0],
      [w - cut * 0.4, 0],
      [w, cut * 0.7],
      [w, h],
      [0, h],
    ];
    const bodyGradient = ctx.createLinearGradient(0, 0, w, h);
    bodyGradient.addColorStop(0, "#151329");
    bodyGradient.addColorStop(0.55, "#09091a");
    bodyGradient.addColorStop(1, "#10142a");
    ctx.fillStyle = bodyGradient;
    polygonPath(cratePath);
    ctx.fill();

    const edgeColor = variant === 2 ? "#ff2e9f" : "#49f7ff";
    ctx.strokeStyle = edgeColor;
    ctx.globalAlpha = 0.7 + pulse * 0.18;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (variant === 2) {
      // Hologram pylon.
      ctx.fillStyle = "rgba(255, 46, 159, 0.08)";
      ctx.fillRect(w * 0.32, 5 * u, w * 0.36, h - 8 * u);
      ctx.shadowColor = "#ff2e9f";
      ctx.shadowBlur = 14;
      const beam = ctx.createLinearGradient(0, 0, 0, h);
      beam.addColorStop(0, "rgba(255, 160, 210, 0.25)");
      beam.addColorStop(0.5, "rgba(255, 46, 159, 0.9)");
      beam.addColorStop(1, "rgba(255, 46, 159, 0.2)");
      ctx.fillStyle = beam;
      ctx.fillRect(w * 0.43, 5 * u, Math.max(2, w * 0.14), h - 8 * u);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 220, 240, 0.35)";
      for (let sy = h * 0.2; sy < h * 0.8; sy += h * 0.18) {
        ctx.fillRect(w * 0.24, sy, w * 0.52, 1);
      }
      ctx.strokeStyle = "rgba(255, 46, 159, 0.65)";
      ctx.strokeRect(w * 0.18, 4 * u, w * 0.64, h - 7 * u);
      ctx.fillStyle = "#ff9acb";
      ctx.font = `700 ${Math.max(8, 10 * u)}px Orbitron, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("危", w / 2, h * 0.55);
    } else {
      // Neon cargo crate.
      ctx.fillStyle = "rgba(5, 6, 17, 0.8)";
      ctx.fillRect(w * 0.15, h * 0.16, w * 0.7, h * 0.28);
      ctx.strokeStyle = "rgba(73, 247, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w * 0.15, h * 0.16, w * 0.7, h * 0.28);
      ctx.fillStyle = `rgba(73, 247, 255, ${0.55 + pulse * 0.35})`;
      ctx.fillRect(w * 0.22, h * 0.24, w * 0.56, 2);
      ctx.fillStyle = "rgba(255, 46, 159, 0.45)";
      for (let stripe = 0; stripe < 3; stripe += 1) {
        ctx.save();
        ctx.translate(w * (0.2 + stripe * 0.2), h * 0.55);
        ctx.rotate(-0.45);
        ctx.fillRect(0, 0, 3, h * 0.22);
        ctx.restore();
      }
      ctx.shadowColor = "#49f7ff";
      ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(73, 247, 255, ${0.45 + pulse * 0.4})`;
      ctx.fillRect(w * 0.18, h - 2.5, w * 0.64, 1.5);
      ctx.shadowBlur = 0;
    }

    // Corner bolts.
    ctx.fillStyle = "rgba(214, 250, 255, 0.66)";
    const bolt = Math.max(1.2, 1.8 * u);
    ctx.fillRect(3 * u, h - 6 * u, bolt, bolt);
    ctx.fillRect(w - 5 * u, h - 6 * u, bolt, bolt);
    ctx.restore();
  }

  function drawLaser(entity, t) {
    const { x, y, w, h } = entity;
    const u = scene.unit;
    const flicker = 0.78 + 0.22 * Math.sin(t * 19 + entity.phase);

    ctx.save();
    // Holographic field.
    const field = ctx.createLinearGradient(0, y, 0, y + h);
    field.addColorStop(0, "rgba(255, 46, 159, 0.03)");
    field.addColorStop(0.5, "rgba(255, 46, 159, 0.14)");
    field.addColorStop(1, "rgba(255, 46, 159, 0.04)");
    ctx.fillStyle = field;
    ctx.fillRect(x, y, w, h);

    ctx.shadowColor = "#ff2e9f";
    ctx.shadowBlur = 16;
    for (let i = 0; i < 3; i += 1) {
      const beamY = y + h * (0.22 + i * 0.29);
      ctx.globalAlpha = flicker * (0.72 - i * 0.1);
      ctx.strokeStyle = i === 1 ? "#ffd2e8" : "#ff2e9f";
      ctx.lineWidth = i === 1 ? 2.2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 5, beamY);
      ctx.lineTo(x + w - 5, beamY);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Emitter diamonds.
    for (const sideX of [x + 2, x + w - 2]) {
      ctx.fillStyle = "#230914";
      ctx.strokeStyle = "#ff5aab";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(sideX, y + h * 0.5 - 12 * u);
      ctx.lineTo(sideX + 8 * u, y + h * 0.5);
      ctx.lineTo(sideX, y + h * 0.5 + 12 * u);
      ctx.lineTo(sideX - 8 * u, y + h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd7ea";
      ctx.fillRect(sideX - 1, y + h * 0.5 - 5 * u, 2, 10 * u);
    }

    // Warning chevrons below the beam point at the safe slide gap.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 5 + entity.phase);
    ctx.strokeStyle = "#ff2e9f";
    ctx.lineWidth = 1;
    const gapY = scene.floorY - 16 * u;
    for (let i = 0; i < 3; i += 1) {
      const cx = x + w * (0.26 + i * 0.24);
      ctx.beginPath();
      ctx.moveTo(cx - 5 * u, gapY - 4 * u);
      ctx.lineTo(cx, gapY);
      ctx.lineTo(cx + 5 * u, gapY - 4 * u);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDrone(entity, t) {
    const u = scene.unit;
    const sway = Math.sin(t * 2.2 + entity.phase) * 2 * u;
    const x = entity.x + sway;
    const y = entity.y;
    const r = entity.r;

    ctx.save();
    ctx.translate(x, y);

    // Rotor rings.
    ctx.save();
    ctx.rotate(t * 4.2 + entity.phase);
    ctx.strokeStyle = "rgba(255, 46, 100, 0.4)";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.65, r * 1.22, r * 0.32, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Thruster glow.
    ctx.shadowColor = "#49f7ff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(73, 247, 255, 0.65)";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.62, r * 0.35, r * 0.12, 0, 0, TAU);
    ctx.fill();

    // Body.
    ctx.shadowColor = "#ff2e5f";
    ctx.shadowBlur = 12;
    const body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, "#2a1023");
    body.addColorStop(0.5, "#130a1a");
    body.addColorStop(1, "#250d22");
    ctx.fillStyle = body;
    ctx.strokeStyle = "#ff4b77";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-r * 1.18, -r * 0.12);
    ctx.lineTo(-r * 0.55, -r * 0.58);
    ctx.lineTo(r * 0.58, -r * 0.58);
    ctx.lineTo(r * 1.16, -r * 0.08);
    ctx.lineTo(r * 0.58, r * 0.56);
    ctx.lineTo(-r * 0.55, r * 0.56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Central eye.
    const scan = Math.sin(t * 3.5 + entity.phase) * r * 0.32;
    ctx.shadowColor = "#ff2e5f";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ff2e5f";
    ctx.beginPath();
    ctx.ellipse(scan, -r * 0.06, r * 0.3, r * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#ffe2ea";
    ctx.beginPath();
    ctx.arc(scan - r * 0.07, -r * 0.08, r * 0.08, 0, TAU);
    ctx.fill();

    // Side blasters.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff8aaf";
    ctx.fillRect(-r * 0.9, r * 0.18, r * 0.22, r * 0.18);
    ctx.fillRect(r * 0.7, r * 0.18, r * 0.22, r * 0.18);
    ctx.restore();

    // Target brackets.
    ctx.save();
    ctx.globalAlpha = 0.34 + 0.12 * Math.sin(t * 4 + entity.phase);
    ctx.strokeStyle = "#ff2e6d";
    ctx.lineWidth = 1;
    const bracket = r * 1.55;
    const arm = r * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - bracket, y - bracket + arm);
    ctx.lineTo(x - bracket, y - bracket);
    ctx.lineTo(x - bracket + arm, y - bracket);
    ctx.moveTo(x + bracket - arm, y - bracket);
    ctx.lineTo(x + bracket, y - bracket);
    ctx.lineTo(x + bracket, y - bracket + arm);
    ctx.moveTo(x + bracket, y + bracket - arm);
    ctx.lineTo(x + bracket, y + bracket);
    ctx.lineTo(x + bracket - arm, y + bracket);
    ctx.moveTo(x - bracket + arm, y + bracket);
    ctx.lineTo(x - bracket, y + bracket);
    ctx.lineTo(x - bracket, y + bracket - arm);
    ctx.stroke();
    ctx.restore();

    // Ground tracking light.
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#ff2e5f";
    ctx.beginPath();
    ctx.ellipse(x, scene.floorY, r * 0.75, 3 * u, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEntities(t) {
    for (const entity of state.entities) {
      if (entity.type === "coin") drawCoin(entity, t);
      else if (entity.type === "obstacle") drawObstacle(entity, t);
      else if (entity.type === "laser") drawLaser(entity, t);
    }

    // Player is rendered between ground hazards and flying drones.
    drawPlayer(t);

    for (const entity of state.entities) {
      if (entity.type === "drone") drawDrone(entity, t);
    }
  }

  // ----------------------- NINJA CHARACTER --------------------------
  function drawLimb(x, y, upper, lower, angleA, angleB, width, color, accent = false) {
    const kneeX = x + Math.sin(angleA) * upper;
    const kneeY = y + Math.cos(angleA) * upper;
    const footX = kneeX + Math.sin(angleB) * lower;
    const footY = kneeY + Math.cos(angleB) * lower;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(73, 247, 255, 0.38)";
    ctx.shadowBlur = 7;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    if (accent) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(73, 247, 255, 0.9)";
      ctx.lineWidth = Math.max(1, width * 0.18);
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
      ctx.fillStyle = "#bffcff";
      ctx.beginPath();
      ctx.arc(footX, footY, Math.max(1.2, width * 0.23), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    return { kneeX, kneeY, footX, footY };
  }

  function drawScarf(t, pose) {
    const isSlide = pose === "slide";
    const isJump = pose === "jump";
    const baseX = isSlide ? -5 : -3;
    const baseY = isSlide ? -27 : -61;
    const strength = isJump ? 1.35 : isSlide ? 1.15 : 1;
    const phase = t * 8 + player.runPhase * 0.5;

    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "#ff2e9f";
    ctx.shadowBlur = 10;

    for (let ribbon = 0; ribbon < 2; ribbon += 1) {
      const wave = Math.sin(phase - ribbon * 1.1) * (4 + ribbon * 3);
      const lift = isJump ? -18 - ribbon * 4 : isSlide ? 5 + ribbon * 2 : wave * 0.6;
      ctx.strokeStyle = ribbon === 0 ? "#ff2e9f" : "rgba(255, 118, 190, 0.8)";
      ctx.lineWidth = ribbon === 0 ? 5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY + ribbon * 2);
      ctx.bezierCurveTo(
        baseX - 16 * strength,
        baseY - 4 + lift * 0.4,
        baseX - 32 * strength,
        baseY + wave + lift * 0.65,
        baseX - (47 + ribbon * 6) * strength,
        baseY + wave * 1.6 + lift
      );
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 218, 240, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY - 2);
    ctx.bezierCurveTo(
      baseX - 15 * strength,
      baseY + Math.sin(phase) * 3,
      baseX - 32 * strength,
      baseY + Math.sin(phase + 1) * 5,
      baseX - 43 * strength,
      baseY + Math.sin(phase + 2) * 7
    );
    ctx.stroke();
    ctx.restore();
  }

  function drawKatana(pose) {
    ctx.save();
    const slide = pose === "slide";
    const startX = slide ? -14 : -11;
    const startY = slide ? -17 : -43;
    const endX = slide ? 8 : 11;
    const endY = slide ? -29 : -73;

    ctx.lineCap = "round";
    ctx.strokeStyle = "#252e49";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.shadowColor = "#49f7ff";
    ctx.shadowBlur = 9;
    ctx.strokeStyle = "rgba(118, 251, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX + 1, startY + 2);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ff2e9f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX - 4, startY - 3);
    ctx.lineTo(startX + 3, startY + 3);
    ctx.stroke();
    ctx.restore();
  }

  function drawNinjaHead() {
    ctx.save();
    ctx.shadowColor = "rgba(73, 247, 255, 0.5)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#0b1023";
    ctx.strokeStyle = "rgba(107, 247, 255, 0.72)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(5, -83);
    ctx.lineTo(12, -77);
    ctx.lineTo(15, -68);
    ctx.lineTo(11, -60);
    ctx.lineTo(3, -58);
    ctx.lineTo(-5, -63);
    ctx.lineTo(-7, -71);
    ctx.lineTo(-2, -80);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mask.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#070a17";
    ctx.beginPath();
    ctx.moveTo(2, -68);
    ctx.lineTo(14, -67);
    ctx.lineTo(12, -60);
    ctx.lineTo(4, -59);
    ctx.lineTo(-1, -63);
    ctx.closePath();
    ctx.fill();

    // Cyan visor slash.
    ctx.shadowColor = "#49f7ff";
    ctx.shadowBlur = 13;
    ctx.fillStyle = "#bdfbff";
    polygonPath([
      [0, -73],
      [12, -70],
      [13, -67.2],
      [0.8, -70.2],
    ]);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(6, -72, 6, 1);

    // Hood notch and mask seam.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 46, 159, 0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, -83);
    ctx.lineTo(1, -74);
    ctx.stroke();
    ctx.strokeStyle = "rgba(142, 187, 214, 0.4)";
    ctx.beginPath();
    ctx.moveTo(3, -63);
    ctx.lineTo(11, -62.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawRunningNinja(t) {
    const phase = player.runPhase;
    const swing = Math.sin(phase);
    const bob = Math.sin(phase * 2) * 1.1;
    const isIdle = state.mode === "menu";

    ctx.save();
    ctx.translate(0, bob);
    drawScarf(t, "run");
    drawKatana("run");

    // Back limbs.
    drawLimb(-1, -33, 17, 17, -swing * 0.58 - (isIdle ? 0.06 : 0), -0.1 - swing * 0.22, 6.4, "#0b0e1d");
    drawLimb(1, -56, 12, 11, -swing * 0.72, -swing * 0.35 + 0.15, 5, "#0b0e1d");

    // Torso.
    ctx.save();
    ctx.shadowColor = "rgba(73, 247, 255, 0.3)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#11152a";
    ctx.strokeStyle = "rgba(100, 219, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -57);
    ctx.lineTo(3, -61);
    ctx.lineTo(9, -53);
    ctx.lineTo(6, -34);
    ctx.lineTo(-5, -32);
    ctx.lineTo(-8, -45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Chest neon seam and belt.
    ctx.strokeStyle = "rgba(73, 247, 255, 0.85)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(7, -53);
    ctx.lineTo(4, -40);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 46, 159, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -37);
    ctx.lineTo(5, -35);
    ctx.stroke();

    // Front limbs.
    drawLimb(1, -34, 17, 17, swing * 0.62, -0.12 + swing * 0.26, 7.2, "#171c36", true);
    drawLimb(3, -56, 12, 11, swing * 0.78 + 0.08, swing * 0.42 + 0.12, 5.4, "#181d38", true);

    drawNinjaHead();
    ctx.restore();
  }

  function drawJumpingNinja(t) {
    const rising = player.vy < 0;
    const lean = clamp(player.vy / scene.jumpVelocity, -1, 1) * 0.12;

    ctx.save();
    ctx.rotate(-lean);
    drawScarf(t, "jump");
    drawKatana("run");

    // Tucked back leg.
    drawLimb(-1, -33, 17, 17, -0.42, 1.2, 6.4, "#0b0e1d");
    // Trailing back arm.
    drawLimb(1, -56, 12, 11, -0.95, -1.35, 5, "#0b0e1d");

    ctx.save();
    ctx.shadowColor = "rgba(73, 247, 255, 0.38)";
    ctx.shadowBlur = 9;
    ctx.fillStyle = "#11152a";
    ctx.strokeStyle = "rgba(100, 219, 255, 0.62)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -57);
    ctx.lineTo(3, -61);
    ctx.lineTo(9, -53);
    ctx.lineTo(6, -34);
    ctx.lineTo(-5, -32);
    ctx.lineTo(-8, -45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(73, 247, 255, 0.85)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(7, -53);
    ctx.lineTo(4, -40);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 46, 159, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -37);
    ctx.lineTo(5, -35);
    ctx.stroke();

    // Leading tucked leg and arm.
    drawLimb(1, -34, 17, 17, 0.92, -0.35 + (rising ? 0.1 : 0.35), 7.2, "#171c36", true);
    drawLimb(3, -56, 12, 11, 0.72, 1.3, 5.4, "#181d38", true);

    drawNinjaHead();
    ctx.restore();
  }

  function drawSlidingNinja(t) {
    ctx.save();
    ctx.rotate(-0.06);
    drawScarf(t, "slide");
    drawKatana("slide");

    // Trailing leg.
    drawLimb(-2, -15, 16, 16, -0.2, -1.15, 6, "#0b0e1d");

    // Low torso.
    ctx.save();
    ctx.shadowColor = "rgba(73, 247, 255, 0.42)";
    ctx.shadowBlur = 9;
    ctx.fillStyle = "#11152a";
    ctx.strokeStyle = "rgba(100, 219, 255, 0.65)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, -24);
    ctx.lineTo(-2, -31);
    ctx.lineTo(8, -27);
    ctx.lineTo(10, -15);
    ctx.lineTo(-4, -11);
    ctx.lineTo(-14, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Leading leg, extended forward.
    drawLimb(6, -15, 16, 17, 1.18, 1.48, 7, "#171c36", true);
    // Front arm pulled back.
    drawLimb(-3, -25, 12, 11, -0.85, -0.15, 5, "#181d38", true);

    ctx.strokeStyle = "rgba(73, 247, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(6, -27);
    ctx.lineTo(8, -14);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 46, 159, 0.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-7, -16);
    ctx.lineTo(4, -14);
    ctx.stroke();

    // Slide-specific head position.
    ctx.save();
    ctx.translate(7, 46);
    drawNinjaHead();
    ctx.restore();
    ctx.restore();
  }

  function drawPlayer(t) {
    const u = scene.unit;
    const jumpAmount = clamp((scene.floorY - player.y) / Math.max(1, scene.jumpHeight), 0, 1);
    const shadowScale = 1 - jumpAmount * 0.36;

    ctx.save();
    ctx.globalAlpha = 0.42 * (1 - jumpAmount * 0.5);
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(player.x, scene.floorY + 3 * u, 29 * u * shadowScale, 6 * u * shadowScale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Ground aura.
    if (state.combo >= 5) {
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.08 * Math.sin(t * 6);
      ctx.strokeStyle = "#ffd45e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(player.x, scene.floorY + 2, 36 * u, 8 * u, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (state.invuln > 0 && Math.floor(state.invuln * 16) % 2 === 0) {
      ctx.globalAlpha = 0.32;
    }

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(u, u);

    if (player.sliding) {
      drawSlidingNinja(t);
    } else if (!player.onGround) {
      drawJumpingNinja(t);
    } else {
      drawRunningNinja(t);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (state.invuln > 0) {
      ctx.save();
      ctx.globalAlpha = 0.2 + 0.12 * Math.sin(t * 22);
      ctx.strokeStyle = "#49f7ff";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#49f7ff";
      ctx.shadowBlur = 13;
      ctx.beginPath();
      ctx.ellipse(player.x, player.y - player.height * 0.48, player.width * 1.25, player.height * 0.62, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ----------------------------- EFFECTS ----------------------------
  function drawParticles() {
    if (!state.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;

      if (particle.shape === "ring") {
        const progress = 1 - alpha;
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2 * alpha + 0.5;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.4 + progress * 1.5), 0, TAU);
        ctx.stroke();
      } else if (particle.shape === "dot") {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * (0.6 + alpha * 0.7), 0, TAU);
        ctx.fill();
      } else {
        const speed = Math.hypot(particle.vx, particle.vy) || 1;
        const nx = particle.vx / speed;
        const ny = particle.vy / speed;
        const length = particle.size * (1.2 + alpha * 2.2);
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = Math.max(0.8, particle.size * 0.7);
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x - nx * length, particle.y - ny * length);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawSlashes(t) {
    for (const slash of state.slashes) {
      const progress = 1 - slash.life / slash.maxLife;
      const alpha = 1 - progress;
      ctx.save();
      ctx.translate(slash.x, slash.y);
      ctx.rotate(slash.angle);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "#49f7ff";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "#dffcff";
      ctx.lineWidth = 4 * (1 - progress) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, slash.radius * (0.7 + progress * 0.6), -1.2, 1.1);
      ctx.stroke();
      ctx.strokeStyle = "#ff2e9f";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, slash.radius * (0.54 + progress * 0.65), -1.3, 0.8);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFloaters() {
    for (const floater of state.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = floater.color;
      ctx.shadowColor = floater.color;
      ctx.shadowBlur = 12;
      ctx.font = `700 ${floater.size}px Orbitron, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(floater.text, floater.x, floater.y);
      ctx.restore();
    }
  }

  function drawRain(t) {
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < bg.rain.length; i += 1) {
      const drop = bg.rain[i];
      const x = mod(drop.x - state.scroll * 0.055, W);
      const y = mod(drop.y + t * drop.speed, H);
      ctx.globalAlpha = drop.alpha;
      ctx.strokeStyle = i % 4 === 0 ? "#ff8fc9" : "#95e9ff";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2.5, y + drop.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSpeedStreaks(t) {
    if (state.mode !== "playing") return;
    const speedFactor = clamp((state.speed - scene.baseSpeed * 0.8) / (scene.baseSpeed * 0.8), 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i += 1) {
      const x = mod(i * 193 - state.scroll * 2.1 - t * 90, W + 220) - 110;
      const y = scene.floorY - ((i * 71) % Math.max(80, scene.floorY * 0.64));
      ctx.globalAlpha = 0.023 + speedFactor * 0.045;
      ctx.strokeStyle = i % 3 === 0 ? "#ff8fc9" : "#8cefff";
      ctx.lineWidth = i % 3 === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 35 + speedFactor * 70, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHitFlash() {
    if (state.hitFlash <= 0) return;
    const strength = clamp(state.hitFlash, 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(255, 27, 86, ${strength * 0.1})`;
    ctx.fillRect(0, 0, W, H);
    const edge = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.18, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    edge.addColorStop(0, "rgba(255, 20, 80, 0)");
    edge.addColorStop(0.72, `rgba(255, 20, 80, ${strength * 0.08})`);
    edge.addColorStop(1, `rgba(255, 20, 80, ${strength * 0.34})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawEffects(t) {
    drawRain(t);
    drawSlashes(t);
    drawParticles();
    drawFloaters();
    drawSpeedStreaks(t);
    drawHitFlash();
  }

  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (state.shake > 0.08) {
      const shakeX = rand(-1, 1) * state.shake;
      const shakeY = rand(-1, 1) * state.shake * 0.72;
      ctx.translate(shakeX, shakeY);
    }

    drawSky(t);
    drawCity(t);
    drawStreet(t);
    drawEntities(t);
    drawEffects(t);
    ctx.restore();
  }

  // ------------------------------ LOOP ------------------------------
  let lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    update(dt);
    render(state.clock);
    window.requestAnimationFrame(frame);
  }

  // ------------------------------ INIT ------------------------------
  let resizeRaf = 0;

  function scheduleResize() {
    window.cancelAnimationFrame(resizeRaf);
    resizeRaf = window.requestAnimationFrame(() => {
      resizeCanvas();
      detectTouch();
    });
  }

  function detectTouch() {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const hasTouch = coarse || navigator.maxTouchPoints > 0 || W < 760;
    document.body.classList.toggle("has-touch", hasTouch);
  }

  function init() {
    resizeCanvas();
    detectTouch();
    bindInput();
    updateSoundUI();
    setBestTexts();
    updateLives();
    player.y = scene.floorY;
    setMode("menu");
    updateHud(true);

    window.addEventListener("resize", scheduleResize, { passive: true });
    window.addEventListener("orientationchange", scheduleResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleResize, { passive: true });
    }

    window.requestAnimationFrame(frame);
  }

  init();
})();
