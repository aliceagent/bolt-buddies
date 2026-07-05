import Phaser from "phaser";
import { TILE, COLORS, PHYS, DEPTH, SKILL_INFO, WORLD_THEMES, FONT, FS, TEXT } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { makeGrid } from "../levels/builder.js";
import { completeLevel, loadSave } from "../save.js";
import { sfx, installMute, playTrack, setMusicLayer, playJingle, trackForLevel, setListener, clearListener, proximity, setLoop, stopLoops, pauseDuck } from "../audio.js";
import { addGradient, addMotes } from "../backdrop.js";
import Player from "../objects/Player.js";

const J = Phaser.Input.Keyboard.JustDown;

export default class GameScene extends Phaser.Scene {
  constructor() {
    super("Game");
  }

  init(data) {
    this.levelIndex = data.levelIndex ?? 0;
  }

  create() {
    const def = LEVELS[this.levelIndex];
    this.def = def;
    const gb = makeGrid(def.cols, def.rows);
    def.build(gb);
    this.grid = gb.g;
    this.worldW = def.cols * TILE;
    this.worldH = def.rows * TILE;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.buildBackground();

    // level state
    this.solidObjs = [];
    this.beltSprites = [];
    this.hazardZones = [];
    this.anchors = [];
    this.levers = [];
    this.plates = [];
    this.doors = [];
    this.bridges = [];
    this.lifts = [];
    this.crushers = [];
    this.pedestals = [];
    this.coreItems = [];
    this.keyItems = [];
    this.checkpoints = [];
    this.triggers = []; // Sprint 10: one-shot AABB zones (blip and/or key-glyph reveal)
    this.pods = [];
    this.ropeFlashes = [];
    this.crane = null;
    this.craneDefeated = false;
    this.opened = new Set();
    this.keysHeld = 0;
    this.coresGot = [false, false, false];
    this.coreIdx = 0;
    this.complete = false;
    this.leaving = false; // guards ESC/R fades so input during a fade can't double-trigger

    this.crackies = this.physics.add.staticGroup();
    this.bridgeGroup = this.physics.add.staticGroup();
    this.doorGroup = this.physics.add.staticGroup();
    this.phaseWalls = this.physics.add.staticGroup();
    this.ducts = this.physics.add.staticGroup();
    this.bugs = this.physics.add.group();
    this.rollers = [];
    this.wardens = [];
    this.jets = [];
    this.fans = [];
    this.phaseFlows = []; // drifting inner-pattern overlays for phase-walls
    this.phaseFlow = 0; // single shared scroll counter (no per-frame alloc)

    this.buildTerrain();

    // players + input
    this.players = def.spawns.map(([tx, ty], i) => {
      const p = new Player(this, tx * TILE + 24, ty * TILE + 24, i);
      p.setCollideWorldBounds(true);
      return p;
    });
    const kb = this.input.keyboard;
    this.players[0].keys = kb.addKeys({ left: "A", right: "D", jump: "W", act: "SPACE", down: "S" });
    this.players[0].keys.actAlt = kb.addKey("E"); // silent fallback: E still works, SPACE is what we teach
    this.players[1].keys = kb.addKeys({ left: "LEFT", right: "RIGHT", jump: "UP", act: "L", down: "DOWN" });
    this.escKey = kb.addKey("ESC");
    this.rKey = kb.addKey("R");
    this.pKey = kb.addKey("P"); // S4: in-game pause overlay
    this.paused = false;
    this.cpPos = def.spawns.map(([tx, ty]) => ({ x: tx * TILE + 24, y: ty * TILE + 24 }));

    def.entities.forEach((e) => this.spawnEntity(e));

    // Sprint 10: static key-glyph clusters declared in the level def (tutorial).
    (def.glyphs || []).forEach((gz) => this.addGlyphs(gz.x * TILE + 24, gz.y * TILE + 24, gz.caps));

    // physics wiring
    const rideCb = (pl, mv) => {
      if (pl.body.touching.down && mv.body.touching.up) pl.standingOn = mv;
    };
    this.physics.add.collider(this.players, this.solidObjs);
    this.physics.add.collider(this.players, this.crackies);
    this.physics.add.collider(this.players, this.bridgeGroup);
    this.physics.add.collider(this.players, this.doorGroup);
    this.physics.add.collider(this.players, this.ducts);
    // phase-walls: the phase-walker ghosts through; a buddy within hand-holding
    // range gets escorted through too
    this.physics.add.collider(this.players, this.phaseWalls, null, (pl, wall) => {
      if (pl.skill === "phase") return false;
      const q = pl.partner;
      if (q && !q.dead && q.skill === "phase" && Math.hypot(q.x - pl.x, q.y - pl.y) < 78) return false;
      return true;
    });
    if (this.lifts.length) this.physics.add.collider(this.players, this.lifts.map((l) => l.img), rideCb);
    this.physics.add.collider(this.bugs, this.solidObjs);
    this.physics.add.collider(this.bugs, this.crackies);
    this.physics.add.collider(this.bugs, this.doorGroup);
    if (this.crushers.length) this.physics.add.collider(this.crushers.map((c) => c.img), this.solidObjs);

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.worldW, this.worldH);
    // camera background colour is the world's bgBottom, set in buildBackground()
    this.camPos = { x: this.players[0].x, y: this.players[0].y, zoom: 1 };
    // 250ms fade-in on every entry (unifies title/hub/game transitions). Visual
    // only — never blocks input, so the beat runner + suites drive immediately.
    cam.fadeIn(250, 4, 6, 20);

    this.rope = this.add.graphics().setDepth(DEPTH.rope);
    this.beamGfx = this.add.graphics().setDepth(DEPTH.fx - 1);
    this.wardens.forEach((w) => this.physics.add.collider(this.players, w.img));
    this.reticles = this.players.map(() => this.add.image(0, 0, "reticle").setDepth(DEPTH.reticle).setVisible(false));

    // floating "SPACE = ACTION" / "L = ACTION" key hints above each robot until
    // that player first presses their action key — the button was unclear
    this.actionHints = this.players.map((p) => {
      const color = p.idx === 0 ? COLORS.beep : COLORS.boop;
      const hw = p.idx === 0 ? 74 : 56; // half-width: P1's label is longer
      const g = this.add.graphics();
      g.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-hw, -15, hw * 2, 30, 8);
      g.lineStyle(2, color).strokeRoundedRect(-hw, -15, hw * 2, 30, 8);
      const t = this.add.text(0, 0, p.idx === 0 ? "SPACE = ACTION" : "L = ACTION", {
        fontFamily: FONT, fontSize: FS.body, fontStyle: "bold",
        color: p.idx === 0 ? "#4dc9ff" : "#ffa14d",
      }).setOrigin(0.5);
      return this.add.container(p.x, p.y - 64 - p.idx * 34, [g, t]).setDepth(DEPTH.fx);
    });

    this.boom = this.add.particles(0, 0, "px", {
      speed: { min: 60, max: 260 }, scale: { start: 1, end: 0 }, lifespan: 450,
      gravityY: 600, emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled spark burst: lever flips & checkpoint activations flick sparks
    this.sparks = this.add.particles(0, 0, "px", {
      speed: { min: 120, max: 320 }, scale: { start: 0.7, end: 0 },
      lifespan: 360, gravityY: 420, tint: 0xffd94d,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled run-dust: soft low puffs kicked up at the feet while running
    this.dust = this.add.particles(0, 0, "px", {
      speed: { min: 20, max: 70 }, angle: { min: 200, max: 340 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 0.5, end: 0 },
      lifespan: 380, gravityY: -30, tint: 0xb8c2dc, emitting: false,
    }).setDepth(DEPTH.fx - 2);

    // pooled purple shell-shards flung when a scuttlebug is squished (pre-coloured
    // "shard" texture — particle tint is unreliable under the Canvas renderer)
    this.shards = this.add.particles(0, 0, "shard", {
      speed: { min: 90, max: 260 }, angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0.2 }, rotate: { start: 0, end: 360 },
      lifespan: 520, gravityY: 620, emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled crane smoke puffs on defeat (grey, drifts up)
    this.craneSmoke = this.add.particles(0, 0, "px", {
      speed: { min: 30, max: 90 }, angle: { min: 250, max: 290 },
      scale: { start: 2.4, end: 0 }, alpha: { start: 0.5, end: 0 },
      lifespan: { min: 700, max: 1300 }, gravityY: -40, tint: 0x9aa0b4,
      emitting: false,
    }).setDepth(DEPTH.fx);

    // pooled star sprites, recycled for warden shove-impacts and the ring of
    // dizzy-stars circling a toppled warden (no per-event image allocation)
    this._starHead = 0;
    this.starPool = [];
    for (let i = 0; i < 10; i++) {
      this.starPool.push(this.add.image(0, 0, "star").setDepth(DEPTH.fx).setVisible(false));
    }
    // single reusable shockwave ring for the crane slam impact
    this.slamRing = this.add.image(0, 0, "shockring").setDepth(DEPTH.fx - 1)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);

    // pooled phase-walk afterimages: a fixed ring of ghost sprites recycled and
    // faded manually (no per-frame allocation). One head index cycles the pool.
    this.ghosts = [];
    for (let i = 0; i < 8; i++) {
      const gi = this.add.image(0, 0, "robot_b").setDepth(DEPTH.player - 1).setVisible(false);
      this.ghosts.push({ img: gi, life: 0 });
    }
    this._ghostHead = 0;

    // --- Sprint 8 game-feel FX pools (all created here, never per frame) ------
    // additive zoom offset consumed + decayed inside updateCamera; NEVER alters
    // camPos.zoom (world coords the beat kit + audio listener read stay exact).
    this.zoomKick = 0;

    // speed-line streaks flicked backward while a grappler zips
    this.zipLines = this.add.particles(0, 0, "streak", {
      speed: { min: 140, max: 300 }, scale: { start: 1, end: 0 },
      lifespan: 240, alpha: { start: 0.8, end: 0 },
      blendMode: Phaser.BlendModes.ADD, emitting: false, rotate: { min: 0, max: 360 },
    }).setDepth(DEPTH.rope - 1);

    // small hook head parked at the far end of each player's rope
    this.hooks = this.players.map(() =>
      this.add.image(0, 0, "hookhead").setDepth(DEPTH.rope + 1).setVisible(false));

    // radial star burst when a data-core is collected (pre-coloured star texture)
    this.starBurst = this.add.particles(0, 0, "star", {
      speed: { min: 90, max: 240 }, scale: { start: 1, end: 0 },
      lifespan: 480, rotate: { start: 0, end: 200 },
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(DEPTH.fx);

    // bolt/gear debris flung on death
    this.bolts = this.add.particles(0, 0, "bolt", {
      speed: { min: 80, max: 240 }, angle: { min: 200, max: 340 },
      scale: { start: 1, end: 0.4 }, rotate: { start: 0, end: 360 },
      lifespan: 620, gravityY: 700, emitting: false,
    }).setDepth(DEPTH.fx);

    // steam-jet drip droplets seeping from active nozzles
    this.jetDrips = this.add.particles(0, 0, "drip", {
      speedX: { min: -14, max: 14 }, speedY: { min: 20, max: 60 },
      scale: { start: 1, end: 0.3 }, lifespan: 520, gravityY: 500,
      alpha: { start: 0.85, end: 0 }, emitting: false,
    }).setDepth(DEPTH.fx - 1);

    // single reusable stomp shockwave ring (separate from the crane slamRing)
    this.stompRing = this.add.image(0, 0, "shockring").setDepth(DEPTH.fx - 1)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);

    // pooled respawn beam columns + phase-cross ripple rings (2 each is plenty)
    this.respawnBeams = [];
    for (let i = 0; i < 2; i++) {
      this.respawnBeams.push(this.add.image(0, 0, "beamcol").setOrigin(0.5, 1)
        .setDepth(DEPTH.player - 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._beamHead = 0;
    this.phaseRipples = [];
    for (let i = 0; i < 2; i++) {
      this.phaseRipples.push(this.add.image(0, 0, "ring").setDepth(DEPTH.fx)
        .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    this._rippleHead = 0;

    // reusable point buffer for the catenary rope (mutated in place, no alloc)
    this._ropePts = [];
    for (let i = 0; i <= 10; i++) this._ropePts.push(new Phaser.Geom.Point(0, 0));

    // M mutes from in-game too; the visible corner icon is drawn by the UI
    // overlay (unzoomed), so this scene only wires the key.
    installMute(this, { icon: false });
    // tear down ambience loops + the proximity listener when the level unloads
    this.events.once("shutdown", () => { stopLoops(); clearListener(); pauseDuck(false); });

    // per-level music: requested in create (crossfades from the hub track). A
    // no-op if this track is already playing, so death/respawn never restart it.
    // 1-3 starts with the `tension` layer ON by default (crane alive).
    playTrack(trackForLevel(def.id));

    this.scene.launch("UI", { levelIndex: this.levelIndex });

    // __BB.scene must be available synchronously — the beat runner + suites read
    // it right after scene.start, so nothing below may gate it.
    if (typeof window !== "undefined") {
      window.__BB = window.__BB || {};
      window.__BB.scene = this;
    }

    // Level intro card slides over the top third, holds ~1.6s, slides out. KOBI's
    // start blip fires AFTER the banner leaves (was a flat 400ms delay). The banner
    // is purely visual (setScrollFactor(0), no input capture) so players can move
    // under it and the test suites never wait on it.
    this.showIntroBanner();
  }

  showIntroBanner() {
    const def = this.def;
    const W = this.scale.width;
    const theme = this.theme || WORLD_THEMES[1];
    const accent = theme.accent;
    const accentHex = "#" + accent.toString(16).padStart(6, "0");
    const bw = 560, bh = 88;
    const restY = 132, offY = -70;

    const c = this.add.container(W / 2, offY).setScrollFactor(0).setDepth(DEPTH.fx + 50);
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.94).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    g.lineStyle(3, accent, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 14);
    // accent end caps
    g.fillStyle(accent, 0.9).fillRoundedRect(-bw / 2, -bh / 2, 7, bh, { tl: 14, bl: 14, tr: 0, br: 0 });
    g.fillStyle(accent, 0.9).fillRoundedRect(bw / 2 - 7, -bh / 2, 7, bh, { tr: 14, br: 14, tl: 0, bl: 0 });

    // the tutorial has no chamber number ("tut"), so show just its name; real
    // levels keep the "CHAMBER <id> — <NAME>" plate.
    const headStr = def.tutorial ? def.name.toUpperCase() : `CHAMBER ${def.id} — ${def.name.toUpperCase()}`;
    const head = this.add.text(0, -15, headStr, {
      fontFamily: FONT, fontSize: FS.title, fontStyle: "bold", color: TEXT.bright,
    }).setOrigin(0.5);
    const pair = (def.skills || []).map((k) => (SKILL_INFO[k] ? SKILL_INFO[k].name : k.toUpperCase())).join("   +   ");
    const sub = this.add.text(0, 18, pair, {
      fontFamily: FONT, fontSize: FS.body, fontStyle: "bold", color: accentHex,
    }).setOrigin(0.5);
    c.add([g, head, sub]);
    this.introBanner = c;

    this.tweens.add({
      targets: c, y: restY, duration: 240, ease: "back.out",
      onComplete: () => {
        this.time.delayedCall(1600, () => {
          this.tweens.add({
            targets: c, y: offY, duration: 240, ease: "back.in",
            onComplete: () => {
              c.destroy();
              this.introBanner = null;
              if (def.blips && def.blips.start) this.game.events.emit("bb:blip", def.blips.start);
            },
          });
        });
      },
    });
  }

  // --- background ----------------------------------------------------------
  // Layered, world-themed backdrop (all below DEPTH.terrain): fixed gradient,
  // two parallax grid layers, scattered additive glow blobs, and drifting motes.
  buildBackground() {
    const world = WORLD_THEMES[this.def.world] ? this.def.world : 1;
    const theme = WORLD_THEMES[world];
    this.theme = theme;
    const W = this.scale.width;
    const H = this.scale.height;

    // (1) fixed vertical gradient, sized 2x viewport (see backdrop.js)
    addGradient(this, world);

    // (2) far parallax grid — dim, larger tile scale to avoid moire with the near layer
    this.add
      .tileSprite(-2 * W, -2 * H, this.worldW + 4 * W, this.worldH + 4 * H, "bggrid")
      .setOrigin(0)
      .setScrollFactor(0.4)
      .setTileScale(1.7)
      .setAlpha(0.2)
      .setDepth(DEPTH.bg - 9);

    // (3) near parallax grid — brighter (accent tint shows under WebGL only)
    this.add
      .tileSprite(-2 * W, -2 * H, this.worldW + 4 * W, this.worldH + 4 * H, "bggrid")
      .setOrigin(0)
      .setScrollFactor(0.75)
      .setAlpha(0.36)
      .setTint(theme.accent2)
      .setDepth(DEPTH.bg - 8);

    // (4) scattered soft-glow blobs, additive, world glow colour baked in
    const n = 5;
    for (let i = 0; i < n; i++) {
      const bx = ((i + 0.5) / n) * this.worldW + (i % 2 ? -90 : 90);
      const by = this.worldH * (0.24 + 0.46 * ((i * 0.37) % 1));
      this.add
        .image(bx, by, `glowBlob${world}`)
        .setScrollFactor(0.85)
        .setDepth(DEPTH.bg - 7)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.32)
        .setScale(2.6 + (i % 3) * 0.7);
    }

    // (5) ambient dust motes
    addMotes(this, theme.accent2);
  }

  // --- terrain -------------------------------------------------------------
  buildTerrain() {
    const g = this.grid;
    const accent = (this.theme && this.theme.accent) || WORLD_THEMES[1].accent;
    for (let y = 0; y < this.def.rows; y++) {
      let runStart = -1;
      let hazStart = -1;
      const flush = (endX) => {
        if (runStart < 0) return;
        const w = (endX - runStart) * TILE;
        const cx = runStart * TILE + w / 2;
        const ts = this.add.tileSprite(cx, y * TILE + 24, w, TILE, "tile").setDepth(DEPTH.terrain);
        this.physics.add.existing(ts, true);
        this.solidObjs.push(ts);
        // walkable-edge highlight: thin accent strip along the run's top edge,
        // dark drop-shadow strip just below its bottom edge.
        this.add.rectangle(cx, y * TILE + 1.5, w, 3, accent, 0.5).setDepth(DEPTH.terrain + 1);
        this.add.rectangle(cx, (y + 1) * TILE + 2, w, 4, COLORS.dark, 0.45).setDepth(DEPTH.terrain);
        runStart = -1;
      };
      // one soft pulsing glow per contiguous hazard run (not per tile)
      const flushHaz = (endX) => {
        if (hazStart < 0) return;
        const w = (endX - hazStart) * TILE;
        const cx = hazStart * TILE + w / 2;
        const glow = this.add.rectangle(cx, y * TILE + 30, w, 26, COLORS.hazard, 0.3).setDepth(DEPTH.terrain + 1);
        this.tweens.add({ targets: glow, alpha: { from: 0.15, to: 0.45 }, duration: 640, yoyo: true, repeat: -1, ease: "sine.inOut" });
        hazStart = -1;
      };
      for (let x = 0; x < this.def.cols; x++) {
        const c = g[y][x];
        if (c !== "^") flushHaz(x);
        if (c === "#") {
          if (runStart < 0) runStart = x;
          continue;
        }
        flush(x);
        if (c === "%") {
          const img = this.crackies.create(x * TILE + 24, y * TILE + 24, "crack");
          img.setDepth(DEPTH.terrain);
          img.gridX = x;
          img.gridY = y;
        } else if (c === "<" || c === ">") {
          const ts = this.add.tileSprite(x * TILE + 24, y * TILE + 24, TILE, TILE, "belt").setDepth(DEPTH.terrain);
          ts.setFlipX(c === "<");
          ts.beltDir = c === "<" ? -1 : 1;
          this.physics.add.existing(ts, true);
          this.solidObjs.push(ts);
          this.beltSprites.push(ts);
        } else if (c === "^") {
          this.add.image(x * TILE + 24, y * TILE + 24, "hazard").setDepth(DEPTH.terrain);
          this.hazardZones.push(new Phaser.Geom.Rectangle(x * TILE + 2, y * TILE + 26, TILE - 4, TILE - 26));
          if (hazStart < 0) hazStart = x;
        } else if (c === "~") {
          const img = this.phaseWalls.create(x * TILE + 24, y * TILE + 24, "phasewall");
          img.setDepth(DEPTH.terrain);
          this.tweens.add({ targets: img, alpha: { from: 0.55, to: 0.95 }, duration: 900, yoyo: true, repeat: -1 });
          // second drifting inner pattern; tilePositionY scrolled by shared counter
          const flow = this.add
            .tileSprite(x * TILE + 24, y * TILE + 24, TILE, TILE, "phaseflow")
            .setDepth(DEPTH.terrain + 1)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.45);
          this.phaseFlows.push(flow);
        } else if (c === "d") {
          // vent lip: blocks the top of the tile, leaving a crawl gap only Tiny fits
          const img = this.ducts.create(x * TILE + 24, y * TILE + 10, "duct");
          img.setDepth(DEPTH.terrain);
        }
      }
      flush(this.def.cols);
      flushHaz(this.def.cols);
    }
  }

  tileAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (ty < 0 || ty >= this.def.rows || tx < 0 || tx >= this.def.cols) return ".";
    return this.grid[ty][tx];
  }

  isSolidChar(c) {
    return c === "#" || c === "%" || c === "<" || c === ">";
  }

  hasLOS(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 14);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidChar(this.tileAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))) return false;
    }
    return true;
  }

  // --- entities --------------------------------------------------------------
  spawnEntity(e) {
    const px = e.x * TILE + 24;
    const py = e.y * TILE + 24;
    switch (e.t) {
      case "pedestal": {
        const info = SKILL_INFO[e.skill];
        // holo-pillar: light beam rising from the base (additive, gentle pulse)
        const beam = this.add.image(px, py - 52, "holobeam").setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2);
        this.tweens.add({ targets: beam, alpha: { from: 0.12, to: 0.3 }, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });
        const img = this.add.image(px, py + 2, "pedestal").setDepth(DEPTH.entity);
        // floating skill icon orbited by 2 sparkle particles (icon = container so
        // handleAction's ped.icon.destroy() removes the sparkles too)
        const iconImg = this.add.image(0, 0, `icon_${e.skill}`).setScale(1.2);
        const orbit = this.add.container(0, 0);
        orbit.add(this.add.image(15, 0, "px").setScale(0.6).setBlendMode(Phaser.BlendModes.ADD));
        orbit.add(this.add.image(-15, 0, "px").setScale(0.6).setBlendMode(Phaser.BlendModes.ADD));
        const icon = this.add.container(px, py - 34, [iconImg, orbit]).setDepth(DEPTH.entity);
        this.tweens.add({ targets: icon, y: py - 40, duration: 800, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.tweens.add({ targets: orbit, angle: 360, duration: 1800, repeat: -1 });
        // stagger card heights so neighbouring pedestals' cards don't overlap
        const cardY = py - 118 - this.pedestals.length * 96;
        const ped = { x: px, y: py, skill: e.skill, taken: false, img, icon, beam };
        this.buildItemCard(ped, px, cardY, info);
        this.pedestals.push(ped);
        break;
      }
      case "anchor": {
        // faint radius-hint circle, shown only while a grapple reticle targets it
        const hint = this.add.graphics().setDepth(DEPTH.entity - 1).setVisible(false);
        hint.lineStyle(2, COLORS.neon, 0.5).strokeCircle(px, py, 22);
        hint.fillStyle(COLORS.neon, 0.06).fillCircle(px, py, 22);
        const img = this.add.image(px, py, "anchor").setDepth(DEPTH.entity);
        this.tweens.add({ targets: img, angle: 360, duration: 6000, repeat: -1 });
        // inner slow pulse: a soft glow dot breathing at the hub
        const pulse = this.add.image(px, py, "px").setDepth(DEPTH.entity)
          .setScale(1.2).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: pulse, scale: { from: 0.9, to: 2.2 }, alpha: { from: 0.7, to: 0.2 }, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.anchors.push({ x: px, y: py, img, hint, pulse });
        break;
      }
      case "lever": {
        const img = this.add.image(px, py + 4, "lever").setDepth(DEPTH.entity);
        // drawn handle, pivots at the base hub — a flip is a rotation tween
        const handle = this.add.image(px, py + 8, "lever_handle")
          .setOrigin(0.5, 1).setDepth(DEPTH.entity + 1).setAngle(-6);
        this.levers.push({ id: e.id, x: px, y: py, on: false, img, handle });
        break;
      }
      case "plate": {
        const w = (e.w || 1) * TILE;
        const img = this.add.image(e.x * TILE + w / 2, py + 17, "plate").setDepth(DEPTH.entity);
        img.setDisplaySize(w - 8, 14);
        this.plates.push({
          id: e.id, threshold: e.threshold || 1, active: false, img, baseScaleY: img.scaleY,
          rect: new Phaser.Geom.Rectangle(e.x * TILE, py + 4, w, 30),
        });
        break;
      }
      case "door":
      case "exit": {
        const h = (e.h || 3) * TILE;
        const cx = px;
        const cy = e.y * TILE + h / 2;
        const top = e.y * TILE;
        const halfW = (TILE - 6) / 2;
        // frame: side rails + top light-bar housing (static, behind the panel)
        const frame = this.add.graphics().setDepth(DEPTH.entity - 1);
        frame.fillStyle(0x161d30);
        frame.fillRect(cx - halfW - 5, top, 5, h);
        frame.fillRect(cx + halfW, top, 5, h);
        frame.lineStyle(2, 0x2f4066);
        frame.strokeRect(cx - halfW - 5, top, 5, h);
        frame.strokeRect(cx + halfW, top, 5, h);
        frame.fillStyle(0x2a3350).fillRect(cx - halfW - 5, top - 14, (halfW + 5) * 2, 12);
        frame.lineStyle(1, 0x44548c).strokeRect(cx - halfW - 5, top - 14, (halfW + 5) * 2, 12);
        const img = this.doorGroup.create(cx, cy, e.t === "exit" ? "door_exit" : "door");
        img.setDisplaySize(TILE - 6, h).refreshBody();
        img.setDepth(DEPTH.entity);
        if (e.t === "exit") img.setTint(0x77ffb0);
        // status lamp on the light bar: red = closed, green = opening
        const lamp = this.add.image(cx, top - 8, "lamp_red").setDepth(DEPTH.entity);
        const door = {
          id: e.id || "exit", img, frame, lamp, needs: e.needs || {}, latch: !!e.latch || e.t === "exit",
          timer: e.timer || 0, closeAt: 0,
          open: false, isExit: e.t === "exit",
          zone: new Phaser.Geom.Rectangle(cx - TILE, e.y * TILE, TILE * 2, h),
          baseY: cy, h,
        };
        this.doors.push(door);
        if (door.isExit) {
          this.exitDoor = door;
          // EXIT light panel above the door with a soft glow pulse (Sprint 4 sign)
          const ly = top - 20;
          const glow = this.add.image(cx, ly, "glowBlob").setDepth(DEPTH.entity - 1)
            .setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.3);
          this.tweens.add({ targets: glow, alpha: { from: 0.16, to: 0.42 }, scale: { from: 0.46, to: 0.64 }, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
          const panel = this.add.graphics().setDepth(DEPTH.entity);
          panel.fillStyle(0x0a1f16, 0.95).fillRoundedRect(cx - 34, ly - 13, 68, 26, 7);
          panel.lineStyle(2, COLORS.green).strokeRoundedRect(cx - 34, ly - 13, 68, 26, 7);
          this.add.text(cx, ly, "EXIT", {
            fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.good,
          }).setOrigin(0.5).setDepth(DEPTH.entity + 1);

          // "waiting for buddy" bubble floating above the EXIT sign — shows the
          // missing buddy's icon + a pulsing down-arrow while one player waits.
          // exitLabel is now this container (kept non-null for the update logic).
          const by = top - 60;
          this.exitLabel = this.add.container(cx, by).setDepth(DEPTH.entity + 2).setVisible(false);
          const bbg = this.add.graphics();
          bbg.fillStyle(COLORS.hudBg, 0.92).fillRoundedRect(-34, -28, 68, 40, 9);
          bbg.lineStyle(2, 0xffffff, 0.55).strokeRoundedRect(-34, -28, 68, 40, 9);
          const bIcon = this.add.image(0, -8, "robot_b").setScale(0.5).setVisible(false);
          const oIcon = this.add.image(0, -8, "robot_o").setScale(0.5).setVisible(false);
          const arrow = this.add.graphics();
          arrow.fillStyle(0xffffff, 0.95).fillTriangle(-8, 16, 8, 16, 0, 30);
          this.exitLabel.add([bbg, bIcon, oIcon, arrow]);
          this.exitLabel.buddyIcons = [bIcon, oIcon];
          this.exitLabel.waitIdx = -1;
          this.exitLabel.pulse = this.tweens.add({
            targets: arrow, y: 5, alpha: { from: 1, to: 0.35 },
            duration: 520, yoyo: true, repeat: -1, ease: "sine.inOut", paused: true,
          });
        }
        break;
      }
      case "bridge": {
        const tiles = [];
        for (let i = 0; i < e.w; i++) {
          const img = this.bridgeGroup.create(e.x * TILE + 24 + i * TILE, e.y * TILE + 24, "bridgetile");
          img.setDepth(DEPTH.terrain).setAlpha(0.13);
          img.body.enable = false;
          // slow shimmer while the bridge is still a ghost
          this.tweens.add({
            targets: img, alpha: { from: 0.09, to: 0.2 },
            duration: 1400, yoyo: true, repeat: -1, ease: "sine.inOut",
            delay: i * 120,
          });
          tiles.push(img);
        }
        this.bridges.push({ id: e.id, tiles, needs: e.needs || {}, open: false });
        break;
      }
      case "key": {
        const cont = this.add.container(px, py).setDepth(DEPTH.pickup);
        const keyImg = this.add.image(0, 0, "key");
        const glint = this.add.image(-2, 0, "glint").setAngle(28).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        cont.add([keyImg, glint]);
        this.tweens.add({ targets: cont, y: py - 8, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // white diagonal glint sweeping across the key ~every 2s
        this.tweens.add({
          targets: glint, x: { from: -13, to: 13 }, alpha: { from: 0, to: 0.9 },
          duration: 500, yoyo: true, repeat: -1, repeatDelay: 1200, ease: "sine.inOut",
        });
        this.keyItems.push(cont);
        break;
      }
      case "core": {
        const cont = this.add.container(px, py).setDepth(DEPTH.pickup);
        cont.coreIndex = this.coreIdx++;
        const glow = this.add.image(0, 0, "glowBlob").setScale(0.42).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5);
        const coreImg = this.add.image(0, 0, "core");
        const orbit = this.add.container(0, 0);
        orbit.add(this.add.image(14, 0, "px").setScale(0.7).setBlendMode(Phaser.BlendModes.ADD));
        cont.add([glow, coreImg, orbit]);
        this.tweens.add({ targets: cont, y: py - 8, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" }); // bob
        this.tweens.add({ targets: coreImg, angle: 360, duration: 9000, repeat: -1 }); // slow spin
        this.tweens.add({ targets: orbit, angle: 360, duration: 2200, repeat: -1 }); // orbiting sparkle
        this.coreItems.push(cont);
        break;
      }
      case "checkpoint": {
        const img = this.add.image(px, py - 9, "checkpoint").setDepth(DEPTH.entity).setAlpha(0.85);
        // short light-cone fanning below the lamp, shown only while active
        const cone = this.add.graphics().setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        cone.fillStyle(COLORS.green, 0.16).fillTriangle(px, py - 30, px - 20, py + 8, px + 20, py + 8);
        this.tweens.add({ targets: cone, alpha: { from: 0.55, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.checkpoints.push({ x: px, y: py, img, active: false, cone });
        break;
      }
      case "trigger": {
        // Sprint 10: a one-shot AABB zone (tile coords). When any player enters it
        // fires its KOBI blip and/or reveals a floating key-glyph cluster. Checked
        // cheaply in the per-player update loop and skipped once fired.
        this.triggers.push({
          rect: new Phaser.Geom.Rectangle(e.x * TILE, e.y * TILE, (e.w || 1) * TILE, (e.h || 1) * TILE),
          blip: e.blip || null,
          glyphs: e.glyphs || null, // { x, y, caps } in tile coords, revealed on entry
          fired: false,
        });
        break;
      }
      case "bug": {
        const bug = this.bugs.create(px, py + 8, "bug");
        bug.setDepth(DEPTH.entity);
        bug.body.setSize(38, 22).setOffset(3, 4);
        bug.setVelocityX(60);
        bug.minX = e.min * TILE;
        bug.maxX = (e.max + 1) * TILE;
        // additive eye-glow overlay: alpha ramps up when a player is within ~200px
        bug.glow = this.add.image(bug.x, bug.y, "bug_glow").setDepth(DEPTH.entity + 1)
          .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        break;
      }
      case "crusher": {
        const img = this.add.image(px + 18, py + 6, "crusher").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setImmovable(true);
        this.crushers.push({
          img, restY: py + 6, botY: (e.y + 3) * TILE + 6,
          state: "hold", timer: 1100 + (e.offset || 0),
        });
        break;
      }
      case "lift": {
        const w = e.w * TILE;
        const cx = e.x * TILE + w / 2;
        const img = this.add.tileSprite(cx, e.y * TILE + 10, w, 20, "liftplat").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setImmovable(true);
        // weight requirement shown as N mini-robot pips that light as weight loads.
        // `label` stays the container the lift loop's setAlpha(0/1) calls drive.
        const N = e.threshold || 2;
        const pips = [];
        const spacing = 18;
        const startX = -((N - 1) * spacing) / 2;
        const label = this.add.container(cx, e.y * TILE + 34).setDepth(DEPTH.entity);
        for (let i = 0; i < N; i++) {
          const pip = this.add.image(startX + i * spacing, 0, "pip_off");
          pips.push(pip);
          label.add(pip);
        }
        // engine glow strip beneath the platform, lit while the lift is moving
        const glow = this.add.image(cx, e.y * TILE + 22, "px").setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w - 12, 9).setTint(0xffd9a0).setAlpha(0);
        const lift = {
          img, topY: e.toY * TILE + 10, botY: e.y * TILE + 10,
          threshold: N, holdTimer: 0, label, pips, glow,
        };
        this.lifts.push(lift);
        break;
      }
      case "roller": {
        const img = this.add.image(px, py + 7, "roller").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(true);
        img.body.setSize(38, 30);
        this.physics.add.collider(img, this.solidObjs);
        // sliding pupil overlay, two spinning spoke-dot wheels, and a pooled "!"
        // alert popup (all bounded per-roller — no per-frame allocation).
        const pupil = this.add.image(img.x, img.y, "roller_pupil").setDepth(DEPTH.entity + 1);
        const wheels = [
          this.add.image(0, 0, "roller_wheel").setDepth(DEPTH.entity + 1),
          this.add.image(0, 0, "roller_wheel").setDepth(DEPTH.entity + 1),
        ];
        const excl = this.add.image(img.x, img.y - 34, "excl").setDepth(DEPTH.fx).setVisible(false);
        this.rollers.push({
          img, minX: e.min * TILE, maxX: (e.max + 1) * TILE, dir: 1,
          state: "patrol", timer: 0, beamLen: e.beam || 140,
          pupil, wheels, excl, wheelAngle: 0,
        });
        break;
      }
      case "warden": {
        const img = this.add.image(px, e.y * TILE + 48 - 31, "warden").setDepth(DEPTH.entity);
        const facing = e.facing || 1;
        img.setFlipX(e.facing === -1);
        this.physics.add.existing(img, true);
        // visor glow (additive; static warden so positioned once) with a soft pulse
        const glow = this.add.image(img.x + facing * 9, img.y - 12, "glowBlob").setDepth(DEPTH.entity - 1)
          .setBlendMode(Phaser.BlendModes.ADD).setScale(0.13).setAlpha(0.4);
        this.tweens.add({ targets: glow, alpha: { from: 0.28, to: 0.6 }, duration: 1200, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // idle sway ±2°
        const sway = this.tweens.add({ targets: img, angle: { from: -2, to: 2 }, duration: 1600, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.wardens.push({ id: e.id, img, facing, defeated: false, x: px, glow, sway });
        break;
      }
      case "jet": {
        // steam jet firing downward; on/off on a timer until its valve lever latches
        const img = this.add.image(px, e.y * TILE + 8, "nozzle").setDepth(DEPTH.entity);
        const len = (e.len || 3) * TILE;
        this.jets.push({
          img, x: px, topY: e.y * TILE + 16, len,
          period: e.period || 2600, on: e.on || 1200, offset: e.offset || 0,
          disabledBy: e.disabledBy, active: false,
          zone: new Phaser.Geom.Rectangle(px - 10, e.y * TILE + 16, 20, len),
          gfx: this.add.graphics().setDepth(DEPTH.fx),
        });
        break;
      }
      case "fan": {
        this.add.image(px, py + 13, "fan").setDepth(DEPTH.entity);
        // updraft column reaches up to the first solid tile
        let topRow = 0;
        for (let ty = e.y - 1; ty >= 0; ty--) {
          if (this.isSolidChar(this.grid[ty][e.x])) {
            topRow = ty + 1;
            break;
          }
        }
        // FL-008: zone must reach the FLOOR (e.y*TILE+48), not mid-tile (+24) —
        // a standing Tiny's small body sits below +24, so walking into the fan
        // did nothing; only falling through it (or jumping) caught the draft.
        const zone = new Phaser.Geom.Rectangle(e.x * TILE + 4, topRow * TILE, TILE - 8, (e.y - topRow) * TILE + 48);
        const puffs = this.add.particles(px, py + 16, "px", {
          speedY: { min: -260, max: -160 }, speedX: { min: -20, max: 20 },
          scale: { start: 0.5, end: 0 }, lifespan: { min: 400, max: 900 },
          quantity: 1, frequency: 90, tint: 0x59ff9c, alpha: 0.5,
        }).setDepth(DEPTH.fx);
        // soft updraft column whose alpha gently wobbles (see updateWorld2)
        const col = this.add.rectangle(zone.centerX, zone.centerY, zone.width, zone.height, 0x59ff9c, 0.09)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx - 3);
        this.fans.push({ zone, puffs, col });
        break;
      }
      case "crane": {
        const railY = 2 * TILE + 20;
        for (let x = e.minX - 1; x <= e.maxX + 1; x++) {
          this.add.image(x * TILE + 24, railY, "rail").setDepth(DEPTH.terrain);
        }
        const hoverY = e.y * TILE + 24;
        const body = this.add.image((e.minX + e.maxX) / 2 * TILE, hoverY, "crane").setDepth(DEPTH.entity);
        // magenta pulse-glow behind each plate (rest-state yankable cue), and a
        // trolley clamped to the rail with a shared-Graphics cable down to the body.
        const mkGlow = () => this.add.image(0, 0, "plate_glow").setDepth(DEPTH.entity)
          .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        const plates = [
          { off: { x: -44, y: 0 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), glow: mkGlow(), attached: true },
          { off: { x: 0, y: 18 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), glow: mkGlow(), attached: true },
          { off: { x: 44, y: 0 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), glow: mkGlow(), attached: true },
        ];
        const trolley = this.add.image(body.x, railY, "trolley").setDepth(DEPTH.terrain + 1);
        this.craneGfx = this.add.graphics().setDepth(DEPTH.entity - 1); // cable + telegraph stripes
        this.crane = {
          body, plates, hoverY, minX: e.minX * TILE + 60, maxX: e.maxX * TILE - 60,
          floorY: 14 * TILE, state: "patrol", timer: 2000, podsStomped: 0,
          trolley, railY, railMin: (e.minX - 1) * TILE + 24, railMax: (e.maxX + 1) * TILE + 24,
          hpText: this.add.text(body.x, hoverY - 60, "", { fontFamily: FONT, fontSize: FS.small, fontStyle: "bold", color: TEXT.warn }).setOrigin(0.5).setDepth(DEPTH.fx),
        };
        break;
      }
    }
  }

  // Sprint 10: render a floating key-glyph prompt — key-cap images + letter texts
  // in a gently-bobbing container. `caps` is e.g. [{k:'A'},{k:'D'},{gap:8},{k:'←'}].
  // Each cap is coloured by its player: cap.p (0=P1 beep-blue, 1=P2 boop-orange);
  // when omitted, arrow glyphs default to P2, everything else to P1. Colours are
  // DRAWN (border + text), not tinted — setTint no-ops under the Canvas renderer.
  addGlyphs(x, y, caps) {
    const CAP = 34, GAP = 7;
    // measure total width so the cluster is centred on (x, y)
    let total = 0;
    for (const c of caps) total += c.gap ? c.gap : CAP + GAP;
    total -= GAP;
    const cont = this.add.container(x, y).setDepth(DEPTH.fx);
    let cx = -total / 2 + CAP / 2;
    for (const c of caps) {
      if (c.gap) { cx += c.gap; continue; }
      const p = c.p != null ? c.p : (/[←→↑↓]/.test(c.k) ? 1 : 0);
      const col = p === 0 ? COLORS.beep : COLORS.boop;
      const hex = p === 0 ? "#4dc9ff" : "#ffa14d";
      const cap = this.add.image(cx, 0, "keycap");
      const bdr = this.add.graphics();
      bdr.lineStyle(2.5, col, 1).strokeRoundedRect(cx - 17, -17, 34, 34, 8);
      const t = this.add.text(cx, -1, c.k, {
        fontFamily: FONT, fontSize: FS.large, fontStyle: "bold", color: hex,
      }).setOrigin(0.5);
      cont.add([cap, bdr, t]);
      cx += CAP + GAP;
    }
    // gentle vertical bob
    this.tweens.add({ targets: cont, y: y - 6, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
    return cont;
  }

  // Item card: a proper panel — dark rounded body, skill-coloured title bar +
  // border. Stored in pieces so `equipItemCard` can shrink it to a small tag.
  buildItemCard(ped, x, cardY, info) {
    const col = info.color;
    const W = 236, H = 90, TB = 24;
    const g = this.add.graphics();
    g.fillStyle(COLORS.hudBg, 0.96).fillRoundedRect(-W / 2, -H / 2, W, H, 10);
    g.fillStyle(col, 0.9).fillRoundedRect(-W / 2, -H / 2, W, TB, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.lineStyle(2, col).strokeRoundedRect(-W / 2, -H / 2, W, H, 10);
    const title = this.add.text(0, -H / 2 + 12, info.name, {
      fontFamily: FONT, fontSize: FS.mini, fontStyle: "bold", color: "#0a0f1e",
    }).setOrigin(0.5);
    const body = this.add.text(0, 8, `${info.card}\n[ACTION to equip]`, {
      fontFamily: FONT, fontSize: FS.mini, color: TEXT.body, align: "center",
    }).setOrigin(0.5);
    // sit above the floating "SPACE/L = ACTION" hints (also DEPTH.fx): at spawn a
    // robot stands under its pedestal and its hint would otherwise occlude the
    // card's own "[ACTION to equip]" line. Card wins; the hints separate as the
    // robots walk off. Still below the intro banner (DEPTH.fx + 50).
    ped.card = this.add.container(x, cardY, [g, title, body]).setDepth(DEPTH.fx + 2);
    ped.cardG = g;
    ped.cardTitle = title;
    ped.cardBody = body;
  }

  // Once equipped the card shrinks to a compact skill tag (title only).
  equipItemCard(ped) {
    const col = SKILL_INFO[ped.skill].color;
    ped.cardBody.destroy();
    const W = 132, H = 30;
    ped.cardG.clear();
    ped.cardG.fillStyle(COLORS.hudBg, 0.96).fillRoundedRect(-W / 2, -H / 2, W, H, 8);
    ped.cardG.lineStyle(2, col).strokeRoundedRect(-W / 2, -H / 2, W, H, 8);
    ped.cardTitle.setColor("#" + col.toString(16).padStart(6, "0")).setFontSize(12).setPosition(0, 0);
    this.tweens.add({ targets: ped.card, scaleX: { from: 1.12, to: 1 }, scaleY: { from: 1.12, to: 1 }, duration: 260, ease: "back.out" });
    this.time.delayedCall(6000, () => ped.card && ped.card.setAlpha(0.55));
  }

  // --- actions ---------------------------------------------------------------
  handleAction(p) {
    if (this.actionHints && this.actionHints[p.idx]) {
      this.actionHints[p.idx].destroy();
      this.actionHints[p.idx] = null;
    }
    if (p.dead || p.carriedBy) return;
    if (p.carrying) {
      this.throwPartner(p);
      return;
    }
    // pedestal pickup
    const ped = this.pedestals.find((d) => !d.taken && !p.skill && Math.abs(d.x - p.x) < 56 && Math.abs(d.y - p.y) < 70);
    if (ped) {
      ped.taken = true;
      ped.icon.destroy();
      this.equipItemCard(ped);
      p.setSkill(ped.skill);
      sfx.equip();
      this.game.events.emit("bb:skill", { idx: p.idx, skill: ped.skill, name: SKILL_INFO[ped.skill].name });
      if (this.players.every((q) => q.skill) && this.def.blips.skills) {
        this.game.events.emit("bb:blip", this.def.blips.skills);
      }
      return;
    }
    // adjacent lever (anyone can pull)
    const lev = this.levers.find((l) => !l.on && Math.abs(l.x - p.x) < 54 && Math.abs(l.y - p.y) < 64);
    if (lev) {
      this.pullLever(lev);
      return;
    }
    if (p.skill === "grapple") {
      // FL-004 rev: UP+ACTION zips to the best target almost directly above —
      // completing the modifier language (UP = up, DOWN = buddy, plain =
      // where you're looking). Near-vertical anchors lose plain-ACTION
      // contests by margins too thin to trust.
      if (p.keys.jump.isDown && !p.keys.down.isDown) {
        let best = null, bestD = Infinity;
        for (const a of this.anchors) {
          const d = Math.hypot(a.x - p.x, a.y - p.y);
          if (Math.abs(a.x - p.x) > 130 || a.y > p.y - 40) continue;
          if (d > PHYS.grappleRange || d < 30) continue;
          if (!this.hasLOS(p.x, p.y, a.x, a.y)) continue;
          if (d < bestD) {
            bestD = d;
            best = a;
          }
        }
        if (best) this.fireGrapple(p, { kind: "anchor", x: best.x, y: best.y });
        else sfx.denied();
        return;
      }
      // FL-001 rev2: DOWN+ACTION is the buddy-rope chord — partner only,
      // no world-target ambiguity. Plain ACTION never targets the buddy.
      if (p.keys.down.isDown) {
        const q = p.partner;
        if (
          q && !q.dead && !q.carriedBy && !q.zip && !q.reeled &&
          Math.hypot(q.x - p.x, q.y - p.y) > 72 &&
          Math.hypot(q.x - p.x, q.y - p.y) <= PHYS.grappleRange &&
          // FL-005: the rope may arc over a ledge lip — accept the direct line
          // OR a head-to-head line (reeling a buddy below your floor otherwise
          // demands pixel-perfect edge-standing)
          (this.hasLOS(p.x, p.y, q.x, q.y) || this.hasLOS(p.x, p.y - 44, q.x, q.y - 24))
        ) {
          this.fireGrapple(p, { kind: "partner", x: q.x, y: q.y, obj: q });
        } else {
          sfx.denied();
        }
        return;
      }
      const tgt = this.findGrappleTarget(p);
      if (tgt) {
        this.fireGrapple(p, tgt);
        return;
      }
    } else if (p.skill === "heavy" && !p.grounded && !p.zip) {
      sfx.stompLaunch(); // heavy winds up the dive
      p.startStomp();
      return;
    }
    // pick up partner
    const q = p.partner;
    if (
      q && !q.dead && !q.carriedBy && !q.carrying && !q.zip && !q.reeled &&
      p.grounded && p.pickupCd <= 0 && q.pickupCd <= 0 &&
      Math.abs(q.x - p.x) < 58 && Math.abs(q.y - p.y) < 60
    ) {
      this.pickupPartner(p, q);
      return;
    }
    sfx.denied();
  }

  pickupPartner(p, q) {
    q.clearStates();
    p.carrying = q;
    q.carriedBy = p;
    q.body.enable = false;
    sfx.grab();
  }

  throwPartner(p) {
    const q = p.carrying;
    if (!q) return;
    p.carrying = null;
    q.carriedBy = null;
    q.body.enable = true;
    q.body.reset(p.x + p.facing * 10, p.y - p.displayHeight / 2 - 20);
    const heavyThrower = p.skill === "heavy";
    const flyBoost = q.skill === "tiny" ? 1.9 : 1; // Tiny is built to be luggage
    let highToss = false;
    if (p.keys.jump.isDown) {
      highToss = true;
      q.setVelocity(p.facing * 120, -PHYS.tossY * (q.skill === "tiny" ? 1.08 : 1)); // high toss
    } else {
      q.setVelocity(
        p.facing * (heavyThrower ? PHYS.heavyThrowX : PHYS.throwX) * flyBoost,
        -(heavyThrower ? PHYS.heavyThrowY : PHYS.throwY)
      );
    }
    q.pickupCd = 450;
    p.pickupCd = 450;
    this.dust.emitParticleAt(q.x, q.y + 8, 6); // small poof at release
    q._landDust = true; // landing dust kicks up when the thrown buddy touches down
    if (highToss) sfx.tossHigh();
    else sfx.throwIt();
  }

  detachCarry(carrier, carried, hop) {
    carrier.carrying = null;
    carried.carriedBy = null;
    carried.body.enable = true;
    carried.body.reset(carrier.x + carrier.facing * 6, carrier.y - 40);
    carried.setVelocity(0, hop ? -330 : 0);
    carried.pickupCd = 400;
    carrier.pickupCd = 400;
  }

  pullLever(lev) {
    lev.on = true;
    if (lev.handle) {
      this.tweens.add({ targets: lev.handle, angle: 60, duration: 240, ease: "back.out" });
      this.sparks.explode(10, lev.handle.x, lev.y - 22); // spark burst at the knob
    }
    sfx.lever();
  }

  findGrappleTarget(p) {
    const cands = [];
    for (const a of this.anchors) {
      if (p.zip && p.zip.arrived && Math.abs(p.zip.x - a.x) < 4 && Math.abs(p.zip.y - a.y - 44 + 44) < 50 && p.zip.y === a.y) continue;
      cands.push({ kind: "anchor", x: a.x, y: a.y, obj: a, bias: 60 });
    }
    for (const l of this.levers) {
      if (!l.on && Math.abs(l.x - p.x) >= 54) cands.push({ kind: "lever", x: l.x, y: l.y, obj: l, bias: 40 });
    }
    if (this.crane && this.crane.state === "rest") {
      for (const pl of this.crane.plates) {
        if (pl.attached) cands.push({ kind: "plate", x: pl.img.x, y: pl.img.y, obj: pl, bias: 90 });
      }
    }
    // FL-001 rev2: the partner is never a plain-ACTION candidate — the buddy
    // rope lives on the DOWN+ACTION chord (see handleAction).
    // FL-002: the hook goes where you're looking — when any valid target lies
    // in the facing direction, targets behind are ignored; near-vertical ones
    // count as neutral (reachable only when nothing is ahead).
    let bestAhead = null, bestAheadScore = Infinity;
    let bestAny = null, bestAnyScore = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > PHYS.grappleRange || d < 30) continue;
      if (!this.hasLOS(p.x, p.y, c.x, c.y)) continue;
      const score = d - (c.y < p.y - 20 ? 50 : 0) - c.bias;
      if (score < bestAnyScore) {
        bestAnyScore = score;
        bestAny = c;
      }
      if (Math.abs(c.x - p.x) > 24 && Math.sign(c.x - p.x) === p.facing && score < bestAheadScore) {
        bestAheadScore = score;
        bestAhead = c;
      }
    }
    return bestAhead || bestAny;
  }

  fireGrapple(p, tgt) {
    if (tgt.kind === "anchor") {
      p.beginZip(tgt.x, tgt.y, true);
    } else if (tgt.kind === "lever") {
      this.ropeFlashes.push({ x1: p.x, y1: p.y, x2: tgt.x, y2: tgt.y, t: 200 });
      this.pullLever(tgt.obj);
      sfx.yank();
    } else if (tgt.kind === "plate") {
      this.ropeFlashes.push({ x1: p.x, y1: p.y, x2: tgt.x, y2: tgt.y, t: 200 });
      this.yankCranePlate(tgt.obj);
    } else if (tgt.kind === "partner") {
      if (p.grounded) tgt.obj.startReeled(p); // pull buddy to me
      else p.beginZip(tgt.obj.x, tgt.obj.y - 20, false); // buddy is my anchor
    }
  }

  // --- heavy impact ------------------------------------------------------------
  heavyImpact(p, strong) {
    const radius = strong ? 100 : 74;
    const fx = p.x;
    const fy = p.body.bottom;
    sfx.stomp(fx, fy);
    this.cameras.main.shake(strong ? 160 : 90, strong ? 0.005 : 0.002);
    this.boom.explode(strong ? 20 : 10, fx, fy);
    // expanding shockwave ring + floor dust burst + a brief zoom-punch
    const ring = this.stompRing;
    this.tweens.killTweensOf(ring);
    ring.setVisible(true).setPosition(fx, fy).setAlpha(0.9)
      .setScale(strong ? 0.28 : 0.2);
    this.tweens.add({
      targets: ring, scale: strong ? 2.4 : 1.6, alpha: 0,
      duration: strong ? 420 : 320, ease: "cubic.out",
      onComplete: () => ring.setVisible(false),
    });
    this.dust.emitParticleAt(fx, fy, strong ? 16 : 10);
    this.zoomKick = Math.min(0.03, this.zoomKick + 0.03); // consumed in updateCamera
    this.crackies.children.each((tile) => {
      if (!tile.active) return;
      if (Math.hypot(tile.x - fx, tile.y - fy) < radius + 30) {
        this.grid[tile.gridY][tile.gridX] = ".";
        this.boom.explode(8, tile.x, tile.y);
        tile.destroy();
      }
    });
    this.bugs.children.each((bug) => {
      if (bug.active && Math.hypot(bug.x - fx, bug.y - fy) < radius + 20) this.squishBug(bug);
    });
    this.pods.forEach((pod) => {
      if (pod.active && Math.hypot(pod.x - fx, pod.y - fy) < radius + 30) this.stompPod(pod);
    });
  }

  squishBug(bug) {
    this.boom.explode(12, bug.x, bug.y); // keep the purple pop
    this.shards.explode(9, bug.x, bug.y); // + flung shell-shards
    sfx.squish(bug.x, bug.y);
    if (bug.glow) bug.glow.destroy();
    bug.destroy();
  }

  // Grab the next pooled ghost sprite and stamp it with the phasing robot's
  // current pose (texture/flip/scale/tint) at full-ish alpha; it fades in update.
  spawnGhost(p) {
    const g = this.ghosts[this._ghostHead];
    this._ghostHead = (this._ghostHead + 1) % this.ghosts.length;
    g.img.setTexture(p.texture.key);
    g.img.setPosition(p.x, p.y);
    g.img.setFlipX(p.flipX);
    g.img.setScale(p.scaleX, p.scaleY);
    g.img.setAngle(p.angle);
    g.img.setTint(0xc39dff);
    g.life = 1;
    g.img.setAlpha(0.4).setVisible(true);
  }

  // Next pooled star sprite (cycles a fixed ring — no per-event allocation).
  takeStar() {
    const s = this.starPool[this._starHead];
    this._starHead = (this._starHead + 1) % this.starPool.length;
    this.tweens.killTweensOf(s);
    return s;
  }

  // A single star popping at a contact point (warden shove impact).
  popStar(x, y) {
    const s = this.takeStar().setPosition(x, y).setAlpha(1).setScale(0.3).setAngle(0).setVisible(true);
    this.tweens.add({
      targets: s, scale: 1.1, angle: 40, alpha: 0, duration: 340,
      ease: "quad.out", onComplete: () => s.setVisible(false),
    });
  }

  // A ring of dizzy-stars orbiting a fallen warden for ~1s (one proxy tween
  // repositions three pooled stars — no per-frame allocation).
  dizzyStars(x, y) {
    const stars = [this.takeStar(), this.takeStar(), this.takeStar()];
    stars.forEach((s) => s.setVisible(true).setAlpha(0.95).setScale(0.7));
    const spin = { a: 0 };
    this.tweens.add({
      targets: spin, a: Math.PI * 4, duration: 1000, ease: "linear",
      onUpdate: () => {
        stars.forEach((s, i) => {
          const ang = spin.a + (i * Math.PI * 2) / 3;
          s.setPosition(x + Math.cos(ang) * 20, y - 20 + Math.sin(ang) * 7);
        });
      },
      onComplete: () => stars.forEach((s) => s.setVisible(false)),
    });
  }

  // --- crane fight ---------------------------------------------------------------
  yankCranePlate(plate) {
    plate.attached = false;
    sfx.craneYank(plate.img.x, plate.img.y);
    this.tweens.add({
      targets: plate.img, x: plate.img.x + Phaser.Math.Between(-160, 160), y: plate.img.y - 200,
      angle: 720, alpha: 0, duration: 700, onComplete: () => plate.img.destroy(),
    });
    const c = this.crane;
    const podX = Phaser.Math.Clamp(c.body.x + Phaser.Math.Between(-80, 80), c.minX, c.maxX);
    const pod = this.add.image(podX, c.floorY - 20, "pod").setDepth(DEPTH.entity);
    this.tweens.add({ targets: pod, scale: { from: 1, to: 1.12 }, duration: 400, yoyo: true, repeat: -1 });
    // concentric warning pulse-rings radiating from the exposed pod
    const ring = this.add.image(pod.x, pod.y, "pod_ring").setDepth(DEPTH.entity - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: { from: 0.5, to: 1.8 }, alpha: { from: 0.75, to: 0 }, duration: 900, repeat: -1 });
    pod.ring = ring;
    this.pods.push(pod);
    this.game.events.emit("bb:blip", "KOBI: A core is EXPOSED! Somebody STAND ON— no wait, STOMP it! No! DON'T!");
  }

  stompPod(pod) {
    this.boom.explode(18, pod.x, pod.y);
    sfx.podCrunch(pod.x, pod.y);
    if (pod.ring) pod.ring.destroy();
    pod.destroy();
    const c = this.crane;
    c.podsStomped++;
    if (c.podsStomped >= 3) {
      c.state = "dead";
      c.hpText.setText("");
      this.craneDefeated = true;
      setMusicLayer("tension", false); // crane down -> calm coda
      sfx.craneDefeat(c.body.x, c.body.y);
      this.cameras.main.shake(400, 0.006);
      this.tweens.add({ targets: c.body, y: c.floorY - 40, angle: 8, duration: 900, ease: "bounce.out" });
      // grey-out via texture swap (setTint no-ops on Canvas) + smoke + sparks
      c.body.setTexture("crane_dead");
      c.plates.forEach((pl) => pl.glow.setVisible(false));
      this.craneSmoke.explode(22, c.body.x, c.body.y);
      this.sparks.explode(26, c.body.x, c.body.y);
      this.game.events.emit("bb:blip", { text: this.def.blips.craneDown || "KOBI: MY CRANE!", mood: "angry" });
    }
  }

  updateCrane(delta) {
    const c = this.crane;
    if (!c) return;
    const dt = delta / 1000;
    const b = c.body;
    const g = this.craneGfx;
    g.clear();
    // trolley clamped to the rail above the body + a 1-segment cable down to it
    const tx = Phaser.Math.Clamp(b.x, c.railMin + 20, c.railMax - 20);
    c.trolley.setPosition(tx, c.railY);
    g.lineStyle(4, 0x2a3350).lineBetween(tx, c.railY + 7, b.x, b.y - 30);
    g.lineStyle(1.5, 0x6b78a8, 0.85).lineBetween(tx, c.railY + 7, b.x, b.y - 30);
    if (c.state === "dead") { c.plates.forEach((pl) => pl.glow.setVisible(false)); return; }
    c.plates.forEach((pl) => {
      if (pl.attached) pl.img.setPosition(b.x + pl.off.x, b.y + pl.off.y);
      // magenta pulse behind yankable plates while the crane rests (canvas-safe)
      if (pl.attached && c.state === "rest") {
        const a = 0.35 + 0.35 * Math.sin(this.time.now / 130);
        pl.glow.setPosition(pl.img.x, pl.img.y).setAlpha(a).setVisible(true);
      } else pl.glow.setVisible(false);
    });
    c.hpText.setPosition(b.x, b.y - 58);
    c.hpText.setText(c.state === "rest" ? "YANK A PLATE!" : "");
    // an exposed core pod pulses a warning alarm until it's crunched
    if (this.pods.some((p) => p.active)) sfx.podAlarm(b.x, c.floorY);
    // telegraph/slam: project a hazard warning-stripe column onto the floor
    if (c.state === "telegraph" || c.state === "slam") {
      const zw = 124, top = b.y + 36, h = c.floorY - top;
      if (h > 0) {
        for (let sx = b.x - zw / 2; sx < b.x + zw / 2; sx += 16) {
          g.fillStyle(COLORS.hazard, 0.16).fillRect(sx, top, 8, h);
        }
        g.lineStyle(2, COLORS.hazard, 0.5).strokeRect(b.x - zw / 2, top, zw, h);
      }
    }
    c.timer -= delta;
    switch (c.state) {
      case "patrol": {
        const target = this.nearestAlivePlayerX(b.x);
        const tx = Phaser.Math.Clamp(target, c.minX, c.maxX);
        const step = Phaser.Math.Clamp(tx - b.x, -150 * dt, 150 * dt);
        b.x += step;
        if (Math.abs(step) > 0.5) sfx.craneServo(b.x, b.y); // rate-limited patrol servo
        if (c.timer <= 0) {
          c.state = "telegraph";
          c.timer = 650;
          b.setTint(0xffb3b3);
          sfx.craneAlarm(b.x, b.y); // two-tone "I'm about to SLAM" telegraph
        }
        break;
      }
      case "telegraph":
        if (c.timer <= 0) {
          c.state = "slam";
          b.clearTint();
        }
        break;
      case "slam": {
        b.y += 720 * dt;
        const bottom = b.y + 36;
        for (const p of this.players) {
          if (p.dead || p.invuln > 0) continue;
          if (Math.abs(p.x - b.x) < 62 && Math.abs(p.y - b.y) < 60) {
            if (p.skill === "heavy") this.boom.explode(4, p.x, p.y - 30);
            else this.killPlayer(p);
          }
        }
        if (bottom >= c.floorY - 6) {
          c.state = "rest";
          c.timer = 2600;
          sfx.craneSlam(b.x, c.floorY);
          this.cameras.main.shake(120, 0.004);
          // impact shockwave ring + dust burst at the floor
          this.slamRing.setPosition(b.x, c.floorY).setScale(0.2).setAlpha(0.9).setVisible(true);
          this.tweens.killTweensOf(this.slamRing);
          this.tweens.add({
            targets: this.slamRing, scale: 1.7, alpha: 0, duration: 420, ease: "quad.out",
            onComplete: () => this.slamRing.setVisible(false),
          });
          this.boom.explode(14, b.x, c.floorY);
          this.dust.explode(10, b.x, c.floorY);
        }
        break;
      }
      case "rest":
        if (c.timer <= 0) c.state = "rise";
        break;
      case "rise":
        b.y -= 300 * dt;
        if (b.y <= c.hoverY) {
          b.y = c.hoverY;
          c.state = "patrol";
          c.timer = 2000;
        }
        break;
    }
  }

  nearestAlivePlayerX(x) {
    const alive = this.players.filter((p) => !p.dead);
    if (!alive.length) return x;
    return alive.reduce((a, b) => (Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b)).x;
  }

  // --- death & respawn --------------------------------------------------------
  killPlayer(p) {
    if (p.dead || p.invuln > 0 || this.complete) return;
    if (p.carrying) this.detachCarry(p, p.carrying, false);
    if (p.carriedBy) this.detachCarry(p.carriedBy, p, false);
    p.clearStates();
    p.dead = true;
    p.body.enable = false;
    p.setVisible(false);
    sfx.die(p.x, p.y);
    this.boom.explode(16, p.x, p.y);
    this.bolts.explode(8, p.x, p.y); // + a few bolt/gear shards
    this.time.delayedCall(900, () => {
      const cp = this.cpPos[p.idx];
      p.body.reset(cp.x, cp.y - 8); // slight lift so a big body never spawns embedded
      p.setVelocity(0, 0);
      p.dead = false;
      p.body.enable = true;
      p.setVisible(true);
      p.invuln = 1500;
      p.wasGround = false;
      sfx.respawn(); // beam back in
      this.respawnFx(cp.x, cp.y, p); // beam-in column + materialize blink
    });
  }

  // Beam-in column that scales down onto the checkpoint + a materialize blink on
  // the robot. Uses pooled beam images; the blink rides p.alpha during invuln
  // (update() only forces alpha once invuln clears, so it never fights the tween).
  respawnFx(x, y, p) {
    const beam = this.respawnBeams[this._beamHead];
    this._beamHead = (this._beamHead + 1) % this.respawnBeams.length;
    this.tweens.killTweensOf(beam);
    beam.setVisible(true).setPosition(x, y + 22).setAlpha(0.9)
      .setScale(0.5, 1.4);
    this.tweens.add({
      targets: beam, scaleX: 0.15, scaleY: 0.2, alpha: 0,
      duration: 380, ease: "cubic.in",
      onComplete: () => beam.setVisible(false),
    });
    p.setAlpha(0.15);
    this.tweens.add({ targets: p, alpha: 1, duration: 90, yoyo: true, repeat: 3,
      onComplete: () => p.setAlpha(1) });
  }

  // A brief expanding ripple ring where a robot crosses a phase-wall boundary.
  phaseRipple(x, y) {
    const r = this.phaseRipples[this._rippleHead];
    this._rippleHead = (this._rippleHead + 1) % this.phaseRipples.length;
    this.tweens.killTweensOf(r);
    r.setVisible(true).setPosition(x, y).setAlpha(0.7).setScale(0.25);
    this.tweens.add({
      targets: r, scale: 1.5, alpha: 0, duration: 420, ease: "cubic.out",
      onComplete: () => r.setVisible(false),
    });
  }

  // --- conditions ---------------------------------------------------------------
  evalNeeds(needs, door) {
    if (!needs) return true;
    if (needs.skills && !this.players.every((p) => p.skill)) return false;
    if (needs.levers && !needs.levers.every((id) => this.levers.find((l) => l.id === id)?.on)) return false;
    if (needs.plates && !needs.plates.every((id) => this.plates.find((pl) => pl.id === id)?.active)) return false;
    if (needs.keys && ((door && door.keysGiven) || 0) < needs.keys) return false;
    if (needs.opened && !needs.opened.every((id) => this.opened.has(id))) return false;
    if (needs.crane && !this.craneDefeated) return false;
    if (needs.wardens && !needs.wardens.every((id) => this.wardens.find((w) => w.id === id)?.defeated)) return false;
    return true;
  }

  // --- pause (S4) ----------------------------------------------------------------
  // P toggles the pause overlay. `physics.pause()` freezes bodies; the update
  // guard below freezes all game logic (handleAction/lifts/enemies/crane). The M
  // mute key keeps working (it lives on a keydown listener, not in update). NOTE:
  // time.delayedCall timers (e.g. the respawn beam-in) keep running while paused —
  // acceptable, a respawn landing during a pause is harmless. Pause is impossible
  // during the clear overlay because update() early-returns on this.complete
  // before it ever reads the P key.
  togglePause() {
    if (this.paused) this.resumeGame();
    else this.pauseGame();
  }

  pauseGame() {
    if (this.paused || this.complete) return;
    this.paused = true;
    this.physics.pause();
    pauseDuck(true); // music continues at 0.5x; saved volume untouched
    sfx.menuSelect();
    this.scene.launch("Pause", { levelIndex: this.levelIndex });
    this.scene.bringToTop("Pause");
  }

  resumeGame() {
    if (!this.paused) return;
    this.paused = false;
    this.physics.resume();
    pauseDuck(false);
    this.scene.stop("Pause");
  }

  // --- main loop -----------------------------------------------------------------
  update(time, delta) {
    if (this.complete) return;
    // P pauses/resumes. Handled before the pause guard so a paused game can still
    // catch P to resume (physics.pause() freezes bodies, not the scene's update()).
    if (J(this.pKey)) this.togglePause();
    if (this.paused) return;
    const dt = delta / 1000;

    if (J(this.escKey) && !this.leaving) {
      this.leaving = true; // fade out, then hand off — guard blocks a double ESC
      this.cameras.main.fadeOut(250, 4, 6, 20);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.stop("UI");
        this.scene.start("Hub", { sel: this.levelIndex });
      });
      return;
    }
    if (J(this.rKey) && !this.leaving) {
      this.leaving = true;
      this.cameras.main.fadeOut(250, 4, 6, 20);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.stop("UI");
        this.scene.restart({ levelIndex: this.levelIndex });
      });
      return;
    }

    this.beltSprites.forEach((b) => (b.tilePositionX += b.beltDir * 60 * dt));

    // drifting phase-wall shimmer: one shared counter, applied to every overlay
    if (this.phaseFlows.length) {
      this.phaseFlow += dt * 22;
      for (const pf of this.phaseFlows) pf.tilePositionY = this.phaseFlow;
    }

    // fade the pooled phase afterimages
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt * 3.2;
      if (g.life <= 0) g.img.setVisible(false);
      else g.img.setAlpha(g.life * 0.4);
    }

    for (const p of this.players) {
      if (p.dead) continue;
      if (J(p.keys.act) || (p.keys.actAlt && J(p.keys.actAlt))) this.handleAction(p);
      if (p.dead || p.carriedBy) continue;

      // action-key hint follows its robot
      const hint = this.actionHints[p.idx];
      if (hint) hint.setPosition(p.x, p.y - 64 - p.idx * 34 + Math.sin(time / 300) * 4);

      // ghost shimmer while inside a phase-wall
      const wasInWall = p.inPhaseWall;
      p.inPhaseWall = this.tileAt(p.x, p.y) === "~";
      if (p.inPhaseWall !== wasInWall) {
        this.phaseRipple(p.x, p.y); // brief ripple ring at the crossing point
        if (p.inPhaseWall) sfx.phaseIn();
        else sfx.phaseOut();
      }

      // landing dust for a freshly-thrown buddy the moment it touches down
      if (p._landDust && p.grounded) {
        this.dust.emitParticleAt(p.x, p.body.bottom, 8);
        p._landDust = false;
      }
      // phase ghost: alpha shimmer + a faint afterimage trail while phasing
      if (p.invuln <= 0) p.setAlpha(p.inPhaseWall ? 0.42 + 0.16 * Math.sin(time / 55) : 1);
      p.ghostCd -= delta;
      if (p.inPhaseWall && p.skill === "phase" && p.ghostCd <= 0) {
        this.spawnGhost(p);
        p.ghostCd = 90;
      }

      // run dust: small puffs at the feet while grounded and moving fast
      p.dustCd -= delta;
      if (p.grounded && Math.abs(p.body.velocity.x) > 100 && p.dustCd <= 0) {
        this.dust.emitParticleAt(p.x - p.facing * 8, p.body.bottom - 2, 1);
        p.dustCd = 130;
      }

      // conveyor drift (Heavyweight stands his ground)
      if (p.skill !== "heavy" && p.grounded && !p.zip) {
        const c = this.tileAt(p.x, p.body.bottom + 6);
        if (c === "<") p.x -= PHYS.beltPush * dt;
        else if (c === ">") p.x += PHYS.beltPush * dt;
      }
      // ride moving platforms (standingOn is cleared at the end of update,
      // after the lift weight checks have read it)
      if (p.standingOn && p.standingOn.body) {
        p.y += p.standingOn.body.deltaY();
        p.x += p.standingOn.body.deltaX();
      }

      // hazards
      const rect = new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height);
      if (p.invuln <= 0 && this.hazardZones.some((h) => Phaser.Geom.Rectangle.Overlaps(h, rect))) {
        this.killPlayer(p);
        continue;
      }
      if (p.y > this.worldH + 60) {
        this.killPlayer(p);
        continue;
      }

      // pickups & checkpoints
      this.coreItems.forEach((c) => {
        if (c.active && Math.hypot(c.x - p.x, c.y - p.y) < 42) {
          this.coresGot[c.coreIndex] = true;
          this.boom.explode(10, c.x, c.y);
          this.starBurst.explode(9, c.x, c.y); // radial star burst
          sfx.core();
          // bonus fanfare the moment the third core of the level is collected
          if (this.coresGot.every(Boolean)) this.time.delayedCall(220, () => sfx.coresFanfare());
          this.game.events.emit("bb:cores", this.coresGot); // state authority (pip)
          // a star flies to the HUD pip: hand UIScene the world->screen coords
          const cam = this.cameras.main;
          this.game.events.emit("bb:coreFly", {
            x: (c.x - cam.worldView.x) * cam.zoom,
            y: (c.y - cam.worldView.y) * cam.zoom,
            index: c.coreIndex,
          });
          c.destroy();
        }
      });
      this.keyItems.forEach((k) => {
        if (k.active && Math.hypot(k.x - p.x, k.y - p.y) < 42) {
          this.keysHeld++;
          sfx.key(k.x, k.y);
          k.destroy();
          this.game.events.emit("bb:keys", this.keysHeld);
        }
      });
      this.checkpoints.forEach((cp) => {
        if (!cp.active && Math.abs(cp.x - p.x) < 44 && Math.abs(cp.y - p.y) < 60) {
          this.checkpoints.forEach((o) => {
            o.active = false;
            o.img.setTexture("checkpoint").setAlpha(0.85); // dim grey lamp
            if (o.cone) o.cone.setVisible(false);
          });
          cp.active = true;
          cp.img.setTexture("checkpoint_on").setAlpha(1); // green lamp
          if (cp.cone) cp.cone.setVisible(true); // light-cone below
          // expanding ring burst on activation
          const ring = this.add.image(cp.x, cp.y - 31, "ring").setDepth(DEPTH.fx)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.tweens.add({
            targets: ring, scale: { from: 0.3, to: 2.6 }, alpha: { from: 0.85, to: 0 },
            duration: 520, ease: "cubic.out", onComplete: () => ring.destroy(),
          });
          this.sparks.explode(8, cp.x, cp.y - 31);
          sfx.checkpoint();
          this.cpPos = this.players.map((_, i) => ({ x: cp.x - 14 + i * 28, y: cp.y - 10 }));
        }
      });
      // one-shot triggers (Sprint 10): cheap AABB, skipped once fired
      for (const tr of this.triggers) {
        if (tr.fired) continue;
        if (!Phaser.Geom.Rectangle.Contains(tr.rect, p.x, p.y)) continue;
        tr.fired = true;
        if (tr.blip) this.game.events.emit("bb:blip", tr.blip);
        if (tr.glyphs) {
          const cont = this.addGlyphs(tr.glyphs.x * TILE + 24, tr.glyphs.y * TILE + 24, tr.glyphs.caps);
          cont.setAlpha(0);
          this.tweens.add({ targets: cont, alpha: 1, duration: 260 });
        }
      }
    }

    // reeling
    for (const p of this.players) {
      if (!p.reeled) continue;
      const r = p.reeled;
      if (r.dead || p.dead) {
        p.endReeled();
        continue;
      }
      const dx = r.x - p.x;
      const dy = r.y - 24 - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 46 || p.body.blocked.left || p.body.blocked.right || p.body.blocked.up) {
        p.endReeled();
        // FL-003 — "the rope always gets your buddy to you": arriving against
        // the reeler's ledge wall used to cancel dead and drop the buddy, and a
        // fixed-size hop only worked near the lip. Pop the buddy level with the
        // reeler (LOS-checked at that height so the rope can't pull through
        // walls), then arc them onto the ledge.
        if (d < 150 && this.hasLOS(p.x, r.y - 6, r.x, r.y - 6)) {
          p.body.reset(p.x, r.y - 6);
          p.setVelocity(Math.sign(dx) * 180, -170);
        } else {
          p.setVelocity(0, -180);
        }
      } else {
        p.setVelocity((dx / d) * PHYS.reelSpeed, (dy / d) * PHYS.reelSpeed);
      }
    }

    // grapple reticles
    // hide every anchor radius-hint; re-show only the one currently targeted
    for (const a of this.anchors) if (a.hint) a.hint.setVisible(false);
    this.players.forEach((p, i) => {
      const ret = this.reticles[i];
      if (p.skill === "grapple" && !p.dead && !p.carrying && !p.carriedBy) {
        const tgt = this.findGrappleTarget(p);
        if (tgt) {
          ret.setVisible(true).setPosition(tgt.x, tgt.y);
          ret.setTint(p.idx === 0 ? COLORS.beep : COLORS.boop);
          ret.setAlpha(0.55 + 0.35 * Math.sin(time / 150));
          if (tgt.kind === "anchor" && tgt.obj && tgt.obj.hint) tgt.obj.hint.setVisible(true);
          return;
        }
      }
      ret.setVisible(false);
    });

    // plates
    for (const pl of this.plates) {
      let weight = 0;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        const rect = new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height + 6);
        if (p.grounded && Phaser.Geom.Rectangle.Overlaps(pl.rect, rect)) weight += p.weight;
      }
      const active = weight >= pl.threshold;
      if (active !== pl.active) {
        pl.active = active;
        // LED strip lights (accent) via texture swap — setTint no-ops on Canvas
        pl.img.setTexture(active ? "plate_on" : "plate");
        pl.img.scaleY = pl.baseScaleY * (active ? 0.45 : 1);
        if (active) sfx.platePress(pl.rect.centerX, pl.rect.centerY);
        else sfx.plateRelease(pl.rect.centerX, pl.rect.centerY);
      }
    }

    // doors
    for (const d of this.doors) {
      // timed doors re-arm: expire the window and pop their levers back out
      if (d.open && d.timer && time > d.closeAt) {
        (d.needs.levers || []).forEach((id) => {
          const l = this.levers.find((v) => v.id === id);
          if (l && l.on) {
            l.on = false;
            if (l.handle) this.tweens.add({ targets: l.handle, angle: -6, duration: 200 });
          }
        });
      }
      let shouldOpen = this.evalNeeds(d.needs, d);
      // key doors consume carried keys on approach
      if (!shouldOpen && d.needs.keys && this.keysHeld > 0) {
        const near = this.players.some((p) => !p.dead && Phaser.Geom.Rectangle.Contains(
          new Phaser.Geom.Rectangle(d.zone.x - 80, d.zone.y, d.zone.width + 160, d.zone.height), p.x, p.y));
        if (near) {
          const need = d.needs.keys - (d.keysGiven || 0);
          const give = Math.min(need, this.keysHeld);
          if (give > 0) {
            d.keysGiven = (d.keysGiven || 0) + give;
            this.keysHeld -= give;
            this.game.events.emit("bb:keys", this.keysHeld);
            sfx.lockTurn(d.zone.centerX, d.baseY);
          }
          if ((d.keysGiven || 0) >= d.needs.keys) shouldOpen = this.evalNeeds(d.needs, d);
        }
      }
      if (d.latch && d.openedOnce) shouldOpen = true;
      // Sprint 10: a door may be LATCHED permanently open by a named lever even
      // after its momentary condition (e.g. a held pressure plate) lapses — the
      // tutorial's "you first, then me" gate: heavy holds the plate so the buddy
      // slips through, the buddy pulls the far lever, and heavy is freed.
      if (d.needs.latchLever && this.levers.find((l) => l.id === d.needs.latchLever)?.on) {
        d.openedOnce = true;
        shouldOpen = true;
      }
      if (shouldOpen && !d.open) {
        d.open = true;
        if (d.timer) d.closeAt = time + d.timer;
        else d.openedOnce = true;
        this.opened.add(d.id);
        d.img.body.enable = false;
        if (d.lamp) d.lamp.setTexture("lamp_green"); // lamp flips green on open
        // dust jets venting from both sides of the frame at the floor
        const fy = d.baseY + d.h / 2 - 4;
        this.dust.emitParticleAt(d.zone.centerX - TILE * 0.4, fy, 6);
        this.dust.emitParticleAt(d.zone.centerX + TILE * 0.4, fy, 6);
        if (d.isExit) sfx.exitDoor(d.zone.centerX, d.baseY);
        else sfx.door(d.zone.centerX, d.baseY);
        this.tweens.add({ targets: d.img, y: d.baseY - d.h + 10, duration: 600, ease: "sine.inOut" });
      } else if (!shouldOpen && d.open) {
        // momentary doors close again — but never on top of someone
        const blocked = this.players.some((p) => !p.dead && Phaser.Geom.Rectangle.Contains(d.zone, p.x, p.y));
        if (!blocked) {
          d.open = false;
          if (d.lamp) d.lamp.setTexture("lamp_red"); // lamp back to red on close
          sfx.doorClose(d.zone.centerX, d.baseY);
          this.tweens.add({
            targets: d.img, y: d.baseY, duration: 400, ease: "sine.inOut",
            onComplete: () => {
              if (!d.open) d.img.body.enable = true;
            },
          });
        }
      }
    }

    // bridges (latch once conditions met)
    for (const br of this.bridges) {
      if (!br.open && this.evalNeeds(br.needs)) {
        br.open = true;
        this.opened.add(br.id);
        br.tiles.forEach((t, i) => {
          this.tweens.killTweensOf(t); // stop the ghost shimmer before solidifying
          this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: i * 70 });
          this.time.delayedCall(i * 70, () => {
            t.body.enable = true;
            this.boom.explode(4, t.x, t.y - 10);
            sfx.bridgeTick(t.x, t.y); // one materialise tick per tile, rising left-to-right
          });
        });
      }
    }

    // lifts
    for (const lf of this.lifts) {
      let weight = 0;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        if (p.standingOn === lf.img || (p.grounded && Math.abs(p.body.bottom - lf.img.body.top) < 8 &&
          p.x > lf.img.x - lf.img.width / 2 - 10 && p.x < lf.img.x + lf.img.width / 2 + 10)) weight += p.weight;
      }
      const body = lf.img.body;
      // pips light up as weight accumulates toward the threshold
      if (lf.pips) {
        const lit = Math.min(Math.round(weight), lf.pips.length);
        for (let i = 0; i < lf.pips.length; i++) {
          const want = i < lit ? "pip_on" : "pip_off";
          if (lf.pips[i].texture.key !== want) lf.pips[i].setTexture(want);
        }
      }
      const goingUp = lf.topY < lf.botY;
      const atTarget = goingUp ? lf.img.y <= lf.topY + 2 : lf.img.y >= lf.topY - 2;
      if (weight >= lf.threshold) {
        lf.holdTimer = 4000;
        lf.label.setAlpha(0);
      }
      if (lf.holdTimer > 0) {
        lf.holdTimer -= delta;
        if (!atTarget) body.setVelocityY(goingUp ? -80 : 80);
        else body.setVelocityY(0);
      } else {
        const home = goingUp ? lf.img.y >= lf.botY - 2 : lf.img.y <= lf.botY + 2;
        if (!home) body.setVelocityY(goingUp ? 80 : -80);
        else {
          body.setVelocityY(0);
          lf.label.setAlpha(1);
        }
      }
      // start/stop chirps at the edges of travel (the soft motor loop while it
      // moves is driven in updateLoops)
      const moving = Math.abs(body.velocity.y) > 1;
      // engine glow strip under the platform while it travels
      if (lf.glow) {
        lf.glow.setPosition(lf.img.x, body.bottom + 4);
        lf.glow.setAlpha(moving ? 0.55 : 0);
      }
      if (moving && !lf.movingWas) sfx.liftStart(lf.img.x, lf.img.y);
      else if (!moving && lf.movingWas) sfx.liftStop(lf.img.x, lf.img.y);
      lf.movingWas = moving;
    }

    // crushers
    for (const cr of this.crushers) {
      const img = cr.img;
      const body = img.body;
      cr.timerLast = cr.timer;
      switch (cr.state) {
        case "hold":
          body.setVelocityY(0);
          cr.timer -= delta;
          if (cr.timer <= 0) cr.state = "slam";
          break;
        case "slam": {
          body.setVelocityY(560);
          let stopped = false;
          for (const p of this.players) {
            if (p.dead) continue;
            const overlapX = Math.abs(p.x - img.x) < 60;
            const touching = p.body.top < img.y + 30 && p.body.bottom > img.y - 10;
            if (overlapX && touching) {
              if (p.skill === "heavy") {
                stopped = true; // Heavy stands his ground
                this.boom.explode(3, img.x, img.y + 26);
              } else if (p.invuln <= 0) {
                this.killPlayer(p);
              }
            }
          }
          if (stopped || body.blocked.down || img.y >= cr.botY) {
            body.setVelocityY(0);
            cr.state = "rest";
            cr.timer = 1300;
            sfx.crush(img.x, img.y);
            this.cameras.main.shake(70, 0.0015);
          }
          break;
        }
        case "rest":
          body.setVelocityY(0);
          cr.timer -= delta;
          if (cr.timer <= 0) {
            cr.state = "rise";
            sfx.crusherServo(img.x, img.y); // servo whine as it hauls back up
          }
          break;
        case "rise":
          body.setVelocityY(-140);
          if (img.y <= cr.restY) {
            img.y = cr.restY;
            body.setVelocityY(0);
            cr.state = "hold";
            cr.timer = 1400;
          }
          break;
      }
    }

    // bugs: patrol, turn at walls/edges, resolve player contact
    this.bugs.children.each((bug) => {
      if (!bug.active) return;
      const dir = Math.sign(bug.body.velocity.x) || 1;
      const aheadX = bug.x + dir * 26;
      const floorAhead = this.isSolidChar(this.tileAt(aheadX, bug.body.bottom + 10));
      if (bug.body.blocked.left || bug.x < bug.minX) bug.setVelocityX(60);
      else if (bug.body.blocked.right || bug.x > bug.maxX) bug.setVelocityX(-60);
      else if (!floorAhead && bug.body.blocked.down) bug.setVelocityX(-dir * 60);
      bug.setFlipX(bug.body.velocity.x < 0);
      // leg wiggle: alternate the two leg-splay frames every ~130ms while moving
      const legFrame = Math.abs(bug.body.velocity.x) > 5 && (time % 260) < 130;
      if (bug._lf !== legFrame) { bug._lf = legFrame; bug.setTexture(legFrame ? "bug_step" : "bug"); }
      // eyes glow brighter as the nearest player closes to ~200px
      const near = this.players.reduce((m, p) => p.dead ? m : Math.min(m, Math.hypot(p.x - bug.x, p.y - bug.y)), Infinity);
      const glowA = near < 200 ? Phaser.Math.Clamp((200 - near) / 150, 0, 1) : 0;
      bug.glow.setPosition(bug.x, bug.y).setAlpha(glowA);
      // idle skitter chitter when a player is nearby (rate-limited + proximity)
      if (this.players.some((p) => !p.dead && Math.abs(p.x - bug.x) < 160 && Math.abs(p.y - bug.y) < 120)) {
        sfx.bugSkitter(bug.x, bug.y);
      }
      for (const p of this.players) {
        if (p.dead || p.invuln > 0 || p.carriedBy) continue;
        if (Math.abs(p.x - bug.x) < 38 && Math.abs(p.y - bug.y) < 36) {
          const fromAbove = p.body.velocity.y > 120 && p.body.bottom < bug.y + 6;
          if (fromAbove) {
            if (p.skill === "heavy") this.squishBug(bug);
            else {
              p.setVelocityY(-380);
              sfx.bugBounce(bug.x, bug.y);
            }
          } else if (p.skill === "heavy") {
            bug.setVelocityX(p.x > bug.x ? -60 : 60); // bonk, turn away
            sfx.bugBonk(bug.x, bug.y);
          } else {
            this.killPlayer(p);
          }
        }
      }
    });

    this.updateCrane(delta);
    this.updateWorld2(time, delta, dt);

    // ropes: slight catenary sag, a hook head at the far end, and speed-lines
    // while the grappler is zipping. Reeling gets the same rope + pull dust.
    this.rope.clear();
    this.hooks.forEach((h) => h.setVisible(false));
    for (const p of this.players) {
      if (p.zip) {
        const col = p.idx === 0 ? COLORS.beep : COLORS.boop;
        this.drawRope(p.x, p.y - 8, p.zip.x, p.zip.y, col, 0.9, p.zip.arrived ? 1 : 0.35);
        this.placeHook(p.idx, p.zip.x, p.zip.y, p.x, p.y - 8);
        if (!p.zip.arrived && (this._zipTick = (this._zipTick || 0) + 1) % 2 === 0) {
          this.zipLines.emitParticleAt(p.x, p.y - 6, 1);
        }
      }
      if (p.reeled) {
        const col = p.reeled.idx === 0 ? COLORS.beep : COLORS.boop;
        this.drawRope(p.reeled.x, p.reeled.y - 8, p.x, p.y, col, 0.9, 1);
        this.placeHook(p.idx, p.x, p.y, p.reeled.x, p.reeled.y - 8);
        if ((this._reelTick = (this._reelTick || 0) + 1) % 6 === 0) {
          this.dust.emitParticleAt(p.x, p.body ? p.body.bottom : p.y + 20, 2);
        }
      }
    }
    this.ropeFlashes = this.ropeFlashes.filter((f) => {
      f.t -= delta;
      if (f.t > 0) {
        this.drawRope(f.x1, f.y1, f.x2, f.y2, 0xffffff, f.t / 200, 0.5);
        return true;
      }
      return false;
    });

    // exit: both buddies through the open door
    if (this.exitDoor && this.exitDoor.open) {
      const inState = this.players.map(
        (p) => !p.dead && Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.x, p.y)
      );
      const inZone = inState.filter(Boolean).length;
      const bothIn = this.players.every(
        (p, i) => !p.dead && (inState[i] || (p.carriedBy && Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.carriedBy.x, p.carriedBy.y)))
      );
      if (inZone === 1) this.showExitWaiting(inState.findIndex((v) => !v));
      else this.hideExitWaiting();
      if (bothIn) this.finishLevel();
    }

    this.players.forEach((p) => (p.standingOn = null));
    this.updateLoops();
    this.updateCamera(dt);
  }

  // Ambience loops: one persistent gain-wrapped source per emitter KIND, whose
  // gain is set each frame from the nearest emitter's proximity (silent when
  // off-screen). No per-frame node creation — setLoop just ramps a live gain.
  updateLoops() {
    // track the x of the emitter that yields the loudest proximity so the loop's
    // stereo pan can follow it (setLoop updates pan on its existing per-tick gain
    // ramp — no per-frame nodes).
    if (this.beltSprites.length) {
      let prox = 0, px = null;
      for (const p of this.players) {
        if (p.dead) continue;
        const c = this.tileAt(p.x, p.body.bottom + 6);
        if ((c === "<" || c === ">") && p.grounded) { const q = proximity(p.x, p.y); if (q > prox) { prox = q; px = p.x; } }
      }
      setLoop("conveyor", prox, px);
    }
    if (this.rollers.length) {
      let prox = 0, px = null;
      for (const r of this.rollers) { const q = proximity(r.img.x, r.img.y); if (q > prox) { prox = q; px = r.img.x; } }
      setLoop("motor", prox, px);
    }
    if (this.jets.length) {
      let prox = 0, px = null;
      for (const j of this.jets) if (j.active) { const q = proximity(j.x, j.topY + j.len / 2); if (q > prox) { prox = q; px = j.x; } }
      setLoop("hiss", prox, px);
    }
    if (this.fans.length) {
      let prox = 0, px = null;
      for (const f of this.fans) {
        const inCol = this.players.some((p) => !p.dead && !p.carriedBy && Phaser.Geom.Rectangle.Contains(f.zone, p.x, p.y));
        if (inCol) { const q = proximity(f.zone.centerX, f.zone.centerY); if (q > prox) { prox = q; px = f.zone.centerX; } }
      }
      setLoop("fan", prox, px);
    }
    if (this.lifts.length) {
      let prox = 0, px = null;
      for (const lf of this.lifts) if (Math.abs(lf.img.body.velocity.y) > 1) { const q = proximity(lf.img.x, lf.img.y); if (q > prox) { prox = q; px = lf.img.x; } }
      setLoop("lift", prox, px);
    }
  }

  // --- world 2: rollers, wardens, steam jets, fans -----------------------------
  updateWorld2(time, delta, dt) {
    const bodyRect = (p) => new Phaser.Geom.Rectangle(p.body.x, p.body.y, p.body.width, p.body.height);

    this.beamGfx.clear();
    for (const r of this.rollers) {
      const img = r.img;
      if (r.state === "patrol") {
        img.body.setVelocityX(58 * r.dir);
        if (img.body.blocked.left || img.x < r.minX + 20) r.dir = 1;
        else if (img.body.blocked.right || img.x > r.maxX - 20) r.dir = -1;
        img.setFlipX(r.dir === -1);
      } else {
        img.body.setVelocityX(0);
      }
      // vision beam: eye-level only, blocked by walls (and shimmer-walls)
      const eyeY = img.y - 5;
      let len = r.beamLen;
      for (let s = 12; s <= r.beamLen; s += 12) {
        const c = this.tileAt(img.x + r.dir * (22 + s), eyeY);
        if (this.isSolidChar(c) || c === "~") {
          len = s;
          break;
        }
      }
      const bx = img.x + r.dir * 22;
      r.beamRect = new Phaser.Geom.Rectangle(r.dir === 1 ? bx : bx - len, eyeY - 13, len, 26);
      const seen = this.players.find(
        (p) => !p.dead && p.invuln <= 0 && !p.carriedBy && p.skill !== "tiny" &&
          Phaser.Geom.Rectangle.Overlaps(r.beamRect, bodyRect(p))
      );
      if (r.state === "patrol" && seen) {
        r.state = "alert";
        r.timer = 500;
        sfx.rollerAlert(img.x, img.y); // rising "?!" chirp
      } else if (r.state === "alert") {
        r.timer -= delta;
        if (!seen) r.state = "patrol";
        else if (r.timer <= 0) {
          sfx.rollerZap(img.x, img.y); // discharge crack
          this.killPlayer(seen);
          r.state = "cool";
          r.timer = 900;
        }
      } else if (r.state === "cool") {
        r.timer -= delta;
        if (r.timer <= 0) r.state = "patrol";
      }
      // beam as a gradient wedge: bright/wide at the eye, fading + narrowing out
      // (3 stacked alpha rects). Red when alert, warning-yellow otherwise.
      const bright = r.state === "alert" ? 0xff5566 : 0xffe066;
      const baseA = r.state === "alert" ? 0.5 : 0.26;
      const seg = len / 3;
      for (let i = 0; i < 3; i++) {
        const h = 26 - i * 5;
        this.beamGfx.fillStyle(bright, baseA * (1 - i * 0.34));
        const sx = r.dir === 1 ? bx + i * seg : bx - (i + 1) * seg;
        this.beamGfx.fillRect(sx, eyeY - h / 2, seg, h);
      }
      // pupil slides toward the patrol direction; wheels spin with travel
      r.pupil.setPosition(img.x + r.dir * 14, img.y - 5);
      if (r.state === "patrol") r.wheelAngle += r.dir * 320 * dt;
      r.wheels[0].setPosition(img.x - 9, img.y + 11).setAngle(r.wheelAngle);
      r.wheels[1].setPosition(img.x + 9, img.y + 11).setAngle(r.wheelAngle);
      // alert = red flash (texture swap; setTint no-ops on Canvas) + "!" popup
      const wantTex = r.state === "alert" ? ((time % 200) < 100 ? "roller_alert" : "roller") : "roller";
      if (r._tex !== wantTex) { r._tex = wantTex; img.setTexture(wantTex); }
      if (r.state === "alert") {
        if (!r.excl.visible) {
          r.excl.setVisible(true).setScale(0.4).setAlpha(1);
          this.tweens.add({ targets: r.excl, scale: 1, duration: 160, ease: "back.out" });
        }
        r.excl.setPosition(img.x, img.y - 34);
      } else if (r.excl.visible) {
        r.excl.setVisible(false);
      }
    }

    for (const w of this.wardens) {
      if (w.defeated) continue;
      if (w.shoveCd > 0) w.shoveCd -= delta;
      for (const p of this.players) {
        if (p.dead || p.carriedBy) continue;
        const dx = p.x - w.img.x;
        if (Math.abs(dx) > 48 || Math.abs(p.y - w.img.y) > 62) continue;
        if (Math.sign(dx) === w.facing || dx === 0) {
          if (w.shoveCd > 0 || Math.abs(dx) > 44) continue;
          p.setVelocity(w.facing * 430, -230); // firm but polite shove
          w.shoveCd = 500;
          sfx.wardenShove(w.img.x, w.img.y); // thud + comic HMPH buzz
          this.popStar(w.img.x + w.facing * 22, p.y); // impact star at contact
          this.tweens.add({ targets: w.img, x: w.x + w.facing * 4, duration: 70, yoyo: true });
        } else {
          w.defeated = true;
          this.boom.explode(16, w.img.x, w.img.y);
          sfx.wardenTopple(w.img.x, w.img.y); // descending slide-whistle topple
          w.img.body.enable = false;
          if (w.sway) w.sway.stop(); // stop idle sway so the topple reads cleanly
          if (w.glow) { this.tweens.killTweensOf(w.glow); w.glow.setVisible(false); }
          this.tweens.add({ targets: w.img, angle: -w.facing * 84, alpha: 0.25, y: w.img.y + 18, duration: 500 });
          this.dizzyStars(w.img.x, w.img.y); // stars circle the fallen body ~1s
          this.game.events.emit("bb:blip", "KOBI: WARDEN DOWN?! You went THROUGH the WALL?! That is CHEATING and also very clever.");
        }
        break;
      }
    }

    for (const j of this.jets) {
      if (j.disabledBy && this.levers.find((l) => l.id === j.disabledBy)?.on) {
        if (j.active) {
          j.active = false;
          j.gfx.clear();
        }
        continue;
      }
      j.active = (time + j.offset) % j.period < j.on;
      j.gfx.clear();
      if (j.active) {
        // soft-edge gradient plume: a wide faint halo + a bright core, both
        // fading toward the tip, with a gentle alpha wobble.
        const baseA = 0.34 + 0.1 * Math.sin(time / 45);
        const segs = 6;
        for (let s = 0; s < segs; s++) {
          const ay = j.topY + (j.len * s) / segs;
          const ah = j.len / segs + 1;
          const fade = 1 - (s / segs) * 0.72;
          j.gfx.fillStyle(0xcdd8ff, baseA * 0.42 * fade);
          j.gfx.fillRect(j.x - 11, ay, 22, ah); // soft halo
          j.gfx.fillStyle(0xeef4ff, baseA * fade);
          j.gfx.fillRect(j.x - 5, ay, 10, ah);  // bright core
        }
        // drip droplets seeping from the nozzle, rate-limited per jet
        j.dripCd = (j.dripCd || 0) - delta;
        if (j.dripCd <= 0) { this.jetDrips.emitParticleAt(j.x, j.topY + 2, 1); j.dripCd = 200; }
        for (const p of this.players) {
          if (!p.dead && p.invuln <= 0 && Phaser.Geom.Rectangle.Overlaps(j.zone, bodyRect(p))) this.killPlayer(p);
        }
      }
    }

    for (const f of this.fans) {
      if (f.col) f.col.setAlpha(0.06 + 0.05 * Math.sin(time / 130 + f.zone.x)); // column alpha wobble
      for (const p of this.players) {
        if (p.dead || p.carriedBy || p.zip) continue;
        if (Phaser.Geom.Rectangle.Overlaps(f.zone, bodyRect(p))) {
          if (p.skill === "tiny") {
            if (!p.grounded) sfx.fanFlutter(p.x, p.y); // rate-limited updraft flutter
            p.body.velocity.y = Math.max(p.body.velocity.y - 2100 * dt, -275);
            // FL-010: gentle keyless centering — airborne momentum never decays,
            // so without this, riding the one-tile draft demands frame-perfect
            // zigzagging (the roadmap's intent is "floats up"). Steering keys
            // always win: only applied while neither direction is held.
            if (!p.grounded && !p.keys.left.isDown && !p.keys.right.isDown) {
              const pull = Phaser.Math.Clamp((f.zone.centerX - p.x) * 3, -120, 120);
              p.body.velocity.x = Phaser.Math.Linear(p.body.velocity.x, pull, 0.12);
            }
          } else {
            p.body.velocity.y -= 320 * dt; // too heavy to lift, just a breeze
          }
        }
      }
    }
  }

  showExitWaiting(idx) {
    const c = this.exitLabel;
    if (idx < 0 || c.waitIdx === idx) return;
    c.waitIdx = idx;
    c.setVisible(true);
    c.buddyIcons.forEach((ic, i) => ic.setVisible(i === idx));
    c.pulse.restart();
  }

  hideExitWaiting() {
    const c = this.exitLabel;
    if (!c || c.waitIdx === -1) return;
    c.waitIdx = -1;
    c.setVisible(false);
    c.pulse.pause();
  }

  finishLevel() {
    if (this.complete) return;
    this.complete = true;
    stopLoops(); // silence all ambience the instant the level is cleared
    sfx.win();
    // Sprint 10: the tutorial NEVER touches the save (no unlock/core writes) — its
    // clear overlay reads "ORIENTATION COMPLETE!" and continue returns to Title.
    let newlyUnlocked = false;
    if (!this.def.tutorial) {
      const before = loadSave().unlocked;
      completeLevel(this.levelIndex, this.def.id, this.coresGot);
      newlyUnlocked = loadSave().unlocked > before;
    }
    playJingle("jingle_clear"); // stops the level track, plays the clear cadence
    this.physics.pause();
    if (this.def.blips && this.def.blips.clear) this.game.events.emit("bb:blip", this.def.blips.clear);
    this.time.delayedCall(500, () => {
      this.game.events.emit("bb:complete", {
        index: this.levelIndex, id: this.def.id, name: this.def.name, cores: this.coresGot,
        newlyUnlocked, tutorial: !!this.def.tutorial,
      });
    });
  }

  // Draw a rope as a slightly sagging catenary (quadratic Bezier) into the shared
  // rope Graphics, sampling the reusable point buffer (no per-frame allocation).
  // sagScale scales the droop: ~1 slack, ~0.35 taut mid-zip.
  drawRope(x1, y1, x2, y2, color, alpha, sagScale = 1) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const sag = Phaser.Math.Clamp(dist * 0.13, 5, 42) * sagScale;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + sag; // control point pulled down by "gravity"
    const pts = this._ropePts;
    const n = pts.length - 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts[i].x = u * u * x1 + 2 * u * t * mx + t * t * x2;
      pts[i].y = u * u * y1 + 2 * u * t * my + t * t * y2;
    }
    this.rope.lineStyle(3, color, alpha);
    this.rope.strokePoints(pts, false, false);
  }

  // Park a player's pooled hook head at the far rope end, angled along the rope.
  placeHook(idx, hx, hy, fromX, fromY) {
    this.hooks[idx].setVisible(true).setPosition(hx, hy)
      .setRotation(Math.atan2(hy - fromY, hx - fromX) + Math.PI / 2);
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const alive = this.players.filter((p) => !p.dead);
    if (!alive.length) return;
    const xs = alive.map((p) => p.x);
    const ys = alive.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);
    const zx = this.scale.width / (dx + 520);
    const zy = this.scale.height / (dy + 380);
    const targetZoom = Phaser.Math.Clamp(Math.min(zx, zy), 0.62, 1.06);
    const k = Math.min(1, dt * 5);
    this.camPos.x += (cx - this.camPos.x) * k;
    this.camPos.y += (cy - this.camPos.y) * k;
    this.camPos.zoom += (targetZoom - this.camPos.zoom) * k;
    // zoom-punch: a stomp adds a brief additive kick that decays to zero here.
    // It only touches the RENDERED zoom — camPos.zoom (world coords the beat kit
    // and the audio listener read) is never changed, so gameplay stays frozen.
    if (this.zoomKick > 0.0005) this.zoomKick = Phaser.Math.Linear(this.zoomKick, 0, Math.min(1, dt * 16));
    else this.zoomKick = 0;
    cam.setZoom(this.camPos.zoom + this.zoomKick);
    cam.centerOn(this.camPos.x, this.camPos.y);
    // publish the camera midpoint + on-screen half-extents for proximity SFX
    setListener(this.camPos.x, this.camPos.y, this.scale.width / 2 / this.camPos.zoom, this.scale.height / 2 / this.camPos.zoom);
  }
}
