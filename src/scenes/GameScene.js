import Phaser from "phaser";
import { TILE, COLORS, PHYS, DEPTH, SKILL_INFO } from "../constants.js";
import { LEVELS } from "../levels/registry.js";
import { makeGrid } from "../levels/builder.js";
import { completeLevel } from "../save.js";
import { sfx } from "../audio.js";
import Player from "../objects/Player.js";

const FONT = "'Courier New', monospace";
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

    this.add.tileSprite(0, 0, this.worldW, this.worldH, "bggrid").setOrigin(0).setDepth(DEPTH.bg).setAlpha(0.5);

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
    this.pods = [];
    this.ropeFlashes = [];
    this.crane = null;
    this.craneDefeated = false;
    this.opened = new Set();
    this.keysHeld = 0;
    this.coresGot = [false, false, false];
    this.coreIdx = 0;
    this.complete = false;

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

    this.buildTerrain();

    // players + input
    this.players = def.spawns.map(([tx, ty], i) => {
      const p = new Player(this, tx * TILE + 24, ty * TILE + 24, i);
      p.setCollideWorldBounds(true);
      return p;
    });
    const kb = this.input.keyboard;
    this.players[0].keys = kb.addKeys({ left: "A", right: "D", jump: "W", act: "E" });
    this.players[1].keys = kb.addKeys({ left: "LEFT", right: "RIGHT", jump: "UP", act: "L" });
    this.escKey = kb.addKey("ESC");
    this.rKey = kb.addKey("R");
    this.cpPos = def.spawns.map(([tx, ty]) => ({ x: tx * TILE + 24, y: ty * TILE + 24 }));

    def.entities.forEach((e) => this.spawnEntity(e));

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
    cam.setBackgroundColor(COLORS.bg);
    this.camPos = { x: this.players[0].x, y: this.players[0].y, zoom: 1 };

    this.rope = this.add.graphics().setDepth(DEPTH.rope);
    this.beamGfx = this.add.graphics().setDepth(DEPTH.fx - 1);
    this.wardens.forEach((w) => this.physics.add.collider(this.players, w.img));
    this.reticles = this.players.map(() => this.add.image(0, 0, "reticle").setDepth(DEPTH.reticle).setVisible(false));

    this.boom = this.add.particles(0, 0, "px", {
      speed: { min: 60, max: 260 }, scale: { start: 1, end: 0 }, lifespan: 450,
      gravityY: 600, emitting: false,
    }).setDepth(DEPTH.fx);

    this.scene.launch("UI", { levelIndex: this.levelIndex });
    this.time.delayedCall(400, () => this.game.events.emit("bb:blip", def.blips.start));

    if (typeof window !== "undefined") {
      window.__BB = window.__BB || {};
      window.__BB.scene = this;
    }
  }

  // --- terrain -------------------------------------------------------------
  buildTerrain() {
    const g = this.grid;
    for (let y = 0; y < this.def.rows; y++) {
      let runStart = -1;
      const flush = (endX) => {
        if (runStart < 0) return;
        const w = (endX - runStart) * TILE;
        const ts = this.add.tileSprite(runStart * TILE + w / 2, y * TILE + 24, w, TILE, "tile").setDepth(DEPTH.terrain);
        this.physics.add.existing(ts, true);
        this.solidObjs.push(ts);
        runStart = -1;
      };
      for (let x = 0; x < this.def.cols; x++) {
        const c = g[y][x];
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
        } else if (c === "~") {
          const img = this.phaseWalls.create(x * TILE + 24, y * TILE + 24, "phasewall");
          img.setDepth(DEPTH.terrain);
          this.tweens.add({ targets: img, alpha: { from: 0.55, to: 0.95 }, duration: 900, yoyo: true, repeat: -1 });
        } else if (c === "d") {
          // vent lip: blocks the top of the tile, leaving a crawl gap only Tiny fits
          const img = this.ducts.create(x * TILE + 24, y * TILE + 10, "duct");
          img.setDepth(DEPTH.terrain);
        }
      }
      flush(this.def.cols);
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
        const img = this.add.image(px, py + 2, "pedestal").setDepth(DEPTH.entity);
        const info = SKILL_INFO[e.skill];
        const icon = this.add.image(px, py - 34, `icon_${e.skill}`).setDepth(DEPTH.entity).setScale(1.2);
        this.tweens.add({ targets: icon, y: py - 40, duration: 800, yoyo: true, repeat: -1, ease: "sine.inOut" });
        // stagger card heights so neighbouring pedestals' cards don't overlap
        const cardY = py - 110 - this.pedestals.length * 92;
        const card = this.add.text(px, cardY, `${info.name}\n${info.card}\n[ACTION to equip]`, {
          fontFamily: FONT, fontSize: "13px", color: "#c6d2f2", align: "center",
          backgroundColor: "#0a0f1eee", padding: { x: 8, y: 6 },
        }).setOrigin(0.5).setDepth(DEPTH.fx);
        this.pedestals.push({ x: px, y: py, skill: e.skill, taken: false, img, icon, card });
        break;
      }
      case "anchor": {
        const img = this.add.image(px, py, "anchor").setDepth(DEPTH.entity);
        this.tweens.add({ targets: img, angle: 360, duration: 6000, repeat: -1 });
        this.anchors.push({ x: px, y: py, img });
        break;
      }
      case "lever": {
        const img = this.add.image(px, py + 4, "lever").setDepth(DEPTH.entity);
        this.levers.push({ id: e.id, x: px, y: py, on: false, img });
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
        const img = this.doorGroup.create(cx, cy, "door");
        img.setDisplaySize(TILE - 6, h).refreshBody();
        img.setDepth(DEPTH.entity);
        if (e.t === "exit") img.setTint(0x77ffb0);
        const door = {
          id: e.id || "exit", img, needs: e.needs || {}, latch: !!e.latch || e.t === "exit",
          timer: e.timer || 0, closeAt: 0,
          open: false, isExit: e.t === "exit",
          zone: new Phaser.Geom.Rectangle(cx - TILE, e.y * TILE, TILE * 2, h),
          baseY: cy, h,
        };
        this.doors.push(door);
        if (door.isExit) {
          this.exitDoor = door;
          this.exitLabel = this.add.text(cx, e.y * TILE - 18, "EXIT", {
            fontFamily: FONT, fontSize: "14px", fontStyle: "bold", color: "#59ff9c",
          }).setOrigin(0.5).setDepth(DEPTH.entity);
        }
        break;
      }
      case "bridge": {
        const tiles = [];
        for (let i = 0; i < e.w; i++) {
          const img = this.bridgeGroup.create(e.x * TILE + 24 + i * TILE, e.y * TILE + 24, "bridgetile");
          img.setDepth(DEPTH.terrain).setAlpha(0.13);
          img.body.enable = false;
          tiles.push(img);
        }
        this.bridges.push({ id: e.id, tiles, needs: e.needs || {}, open: false });
        break;
      }
      case "key": {
        const img = this.add.image(px, py, "key").setDepth(DEPTH.pickup);
        this.tweens.add({ targets: img, y: py - 8, duration: 900, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.keyItems.push(img);
        break;
      }
      case "core": {
        const img = this.add.image(px, py, "core").setDepth(DEPTH.pickup);
        img.coreIndex = this.coreIdx++;
        this.tweens.add({ targets: img, y: py - 8, angle: 8, duration: 1100, yoyo: true, repeat: -1, ease: "sine.inOut" });
        this.coreItems.push(img);
        break;
      }
      case "checkpoint": {
        const img = this.add.image(px, py - 9, "checkpoint").setDepth(DEPTH.entity).setAlpha(0.65);
        this.checkpoints.push({ x: px, y: py, img, active: false });
        break;
      }
      case "bug": {
        const bug = this.bugs.create(px, py + 8, "bug");
        bug.setDepth(DEPTH.entity);
        bug.body.setSize(38, 22).setOffset(3, 4);
        bug.setVelocityX(60);
        bug.minX = e.min * TILE;
        bug.maxX = (e.max + 1) * TILE;
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
        const img = this.add.tileSprite(e.x * TILE + w / 2, e.y * TILE + 10, w, 20, "liftplat").setDepth(DEPTH.entity);
        this.physics.add.existing(img);
        img.body.setAllowGravity(false);
        img.body.setImmovable(true);
        const lift = {
          img, topY: e.toY * TILE + 10, botY: e.y * TILE + 10,
          threshold: e.threshold || 2, holdTimer: 0,
          label: this.add.text(e.x * TILE + w / 2, e.y * TILE + 34, `needs ${e.threshold} weight`, {
            fontFamily: FONT, fontSize: "12px", color: "#8fa3d9",
          }).setOrigin(0.5).setDepth(DEPTH.entity),
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
        this.rollers.push({
          img, minX: e.min * TILE, maxX: (e.max + 1) * TILE, dir: 1,
          state: "patrol", timer: 0, beamLen: e.beam || 140,
        });
        break;
      }
      case "warden": {
        const img = this.add.image(px, e.y * TILE + 48 - 31, "warden").setDepth(DEPTH.entity);
        img.setFlipX(e.facing === -1);
        this.physics.add.existing(img, true);
        this.wardens.push({ id: e.id, img, facing: e.facing || 1, defeated: false, x: px });
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
        const zone = new Phaser.Geom.Rectangle(e.x * TILE + 4, topRow * TILE, TILE - 8, (e.y - topRow) * TILE + 24);
        const puffs = this.add.particles(px, py + 16, "px", {
          speedY: { min: -260, max: -160 }, speedX: { min: -20, max: 20 },
          scale: { start: 0.5, end: 0 }, lifespan: { min: 400, max: 900 },
          quantity: 1, frequency: 90, tint: 0x59ff9c, alpha: 0.5,
        }).setDepth(DEPTH.fx);
        this.fans.push({ zone, puffs });
        break;
      }
      case "crane": {
        const railY = 2 * TILE + 20;
        for (let x = e.minX - 1; x <= e.maxX + 1; x++) {
          this.add.image(x * TILE + 24, railY, "rail").setDepth(DEPTH.terrain);
        }
        const hoverY = e.y * TILE + 24;
        const body = this.add.image((e.minX + e.maxX) / 2 * TILE, hoverY, "crane").setDepth(DEPTH.entity);
        const plates = [
          { off: { x: -44, y: 0 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), attached: true },
          { off: { x: 0, y: 18 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), attached: true },
          { off: { x: 44, y: 0 }, img: this.add.image(0, 0, "crane_plate").setDepth(DEPTH.entity + 1), attached: true },
        ];
        this.crane = {
          body, plates, hoverY, minX: e.minX * TILE + 60, maxX: e.maxX * TILE - 60,
          floorY: 14 * TILE, state: "patrol", timer: 2000, podsStomped: 0,
          hpText: this.add.text(body.x, hoverY - 60, "", { fontFamily: FONT, fontSize: "14px", fontStyle: "bold", color: "#ff9daa" }).setOrigin(0.5).setDepth(DEPTH.fx),
        };
        break;
      }
    }
  }

  // --- actions ---------------------------------------------------------------
  handleAction(p) {
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
      ped.card.setText(`${SKILL_INFO[ped.skill].name}\n${SKILL_INFO[ped.skill].hint}`);
      this.time.delayedCall(6000, () => ped.card.setAlpha(0.35));
      p.setSkill(ped.skill);
      sfx.pickup();
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
      const tgt = this.findGrappleTarget(p);
      if (tgt) {
        this.fireGrapple(p, tgt);
        return;
      }
    } else if (p.skill === "heavy" && !p.grounded && !p.zip) {
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
    sfx.pickup();
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
    if (p.keys.jump.isDown) {
      q.setVelocity(p.facing * 120, -PHYS.tossY * (q.skill === "tiny" ? 1.08 : 1)); // high toss
    } else {
      q.setVelocity(
        p.facing * (heavyThrower ? PHYS.heavyThrowX : PHYS.throwX) * flyBoost,
        -(heavyThrower ? PHYS.heavyThrowY : PHYS.throwY)
      );
    }
    q.pickupCd = 450;
    p.pickupCd = 450;
    sfx.throwIt();
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
    lev.img.setFlipX(true);
    lev.img.setTint(0x9dffc4);
    sfx.lever();
  }

  findGrappleTarget(p) {
    const cands = [];
    for (const a of this.anchors) {
      if (p.zip && p.zip.arrived && Math.abs(p.zip.x - a.x) < 4 && Math.abs(p.zip.y - a.y - 44 + 44) < 50 && p.zip.y === a.y) continue;
      cands.push({ kind: "anchor", x: a.x, y: a.y, bias: 60 });
    }
    for (const l of this.levers) {
      if (!l.on && Math.abs(l.x - p.x) >= 54) cands.push({ kind: "lever", x: l.x, y: l.y, obj: l, bias: 40 });
    }
    if (this.crane && this.crane.state === "rest") {
      for (const pl of this.crane.plates) {
        if (pl.attached) cands.push({ kind: "plate", x: pl.img.x, y: pl.img.y, obj: pl, bias: 90 });
      }
    }
    const q = p.partner;
    if (q && !q.dead && !q.carriedBy && !q.zip && !q.reeled && Math.hypot(q.x - p.x, q.y - p.y) > 72) {
      cands.push({ kind: "partner", x: q.x, y: q.y, obj: q, bias: 0 });
    }
    let best = null;
    let bestScore = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d > PHYS.grappleRange || d < 30) continue;
      if (!this.hasLOS(p.x, p.y, c.x, c.y)) continue;
      const score = d - (c.y < p.y - 20 ? 50 : 0) - c.bias;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
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
    sfx.stomp();
    this.cameras.main.shake(strong ? 160 : 90, strong ? 0.005 : 0.002);
    this.boom.explode(strong ? 20 : 10, fx, fy);
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
    this.boom.explode(12, bug.x, bug.y);
    sfx.pop();
    bug.destroy();
  }

  // --- crane fight ---------------------------------------------------------------
  yankCranePlate(plate) {
    plate.attached = false;
    sfx.yank();
    this.tweens.add({
      targets: plate.img, x: plate.img.x + Phaser.Math.Between(-160, 160), y: plate.img.y - 200,
      angle: 720, alpha: 0, duration: 700, onComplete: () => plate.img.destroy(),
    });
    const c = this.crane;
    const podX = Phaser.Math.Clamp(c.body.x + Phaser.Math.Between(-80, 80), c.minX, c.maxX);
    const pod = this.add.image(podX, c.floorY - 20, "pod").setDepth(DEPTH.entity);
    this.tweens.add({ targets: pod, scale: { from: 1, to: 1.12 }, duration: 400, yoyo: true, repeat: -1 });
    this.pods.push(pod);
    this.game.events.emit("bb:blip", "KOBI: A core is EXPOSED! Somebody STAND ON— no wait, STOMP it! No! DON'T!");
  }

  stompPod(pod) {
    this.boom.explode(18, pod.x, pod.y);
    sfx.pop();
    pod.destroy();
    const c = this.crane;
    c.podsStomped++;
    if (c.podsStomped >= 3) {
      c.state = "dead";
      c.hpText.setText("");
      this.craneDefeated = true;
      sfx.crush();
      this.cameras.main.shake(400, 0.006);
      this.tweens.add({ targets: c.body, y: c.floorY - 40, angle: 8, duration: 900, ease: "bounce.out" });
      c.body.setTint(0x666a80);
      this.game.events.emit("bb:blip", this.def.blips.craneDown || "KOBI: MY CRANE!");
    }
  }

  updateCrane(delta) {
    const c = this.crane;
    if (!c || c.state === "dead") return;
    const dt = delta / 1000;
    const b = c.body;
    c.plates.forEach((pl) => {
      if (pl.attached) pl.img.setPosition(b.x + pl.off.x, b.y + pl.off.y);
    });
    c.hpText.setPosition(b.x, b.y - 58);
    c.hpText.setText(c.state === "rest" ? "YANK A PLATE!" : "");
    c.timer -= delta;
    switch (c.state) {
      case "patrol": {
        const target = this.nearestAlivePlayerX(b.x);
        const tx = Phaser.Math.Clamp(target, c.minX, c.maxX);
        b.x += Phaser.Math.Clamp(tx - b.x, -150 * dt, 150 * dt);
        if (c.timer <= 0) {
          c.state = "telegraph";
          c.timer = 650;
          b.setTint(0xffb3b3);
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
          sfx.crush();
          this.cameras.main.shake(120, 0.004);
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
    sfx.die();
    this.boom.explode(16, p.x, p.y);
    this.time.delayedCall(900, () => {
      const cp = this.cpPos[p.idx];
      p.body.reset(cp.x, cp.y - 8); // slight lift so a big body never spawns embedded
      p.setVelocity(0, 0);
      p.dead = false;
      p.body.enable = true;
      p.setVisible(true);
      p.invuln = 1500;
      p.wasGround = false;
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

  // --- main loop -----------------------------------------------------------------
  update(time, delta) {
    if (this.complete) return;
    const dt = delta / 1000;

    if (J(this.escKey)) {
      this.scene.stop("UI");
      this.scene.start("Hub", { sel: this.levelIndex });
      return;
    }
    if (J(this.rKey)) {
      this.scene.stop("UI");
      this.scene.restart({ levelIndex: this.levelIndex });
      return;
    }

    this.beltSprites.forEach((b) => (b.tilePositionX += b.beltDir * 60 * dt));

    for (const p of this.players) {
      if (p.dead) continue;
      if (J(p.keys.act)) this.handleAction(p);
      if (p.dead || p.carriedBy) continue;

      // ghost shimmer while inside a phase-wall
      p.inPhaseWall = this.tileAt(p.x, p.y) === "~";
      if (p.invuln <= 0) p.setAlpha(p.inPhaseWall ? 0.55 : 1);

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
          sfx.core();
          c.destroy();
          this.game.events.emit("bb:cores", this.coresGot);
        }
      });
      this.keyItems.forEach((k) => {
        if (k.active && Math.hypot(k.x - p.x, k.y - p.y) < 42) {
          this.keysHeld++;
          sfx.key();
          k.destroy();
          this.game.events.emit("bb:keys", this.keysHeld);
        }
      });
      this.checkpoints.forEach((cp) => {
        if (!cp.active && Math.abs(cp.x - p.x) < 44 && Math.abs(cp.y - p.y) < 60) {
          this.checkpoints.forEach((o) => {
            o.active = false;
            o.img.setAlpha(0.65).clearTint();
          });
          cp.active = true;
          cp.img.setAlpha(1).setTint(0x9dffc4);
          sfx.blip();
          this.cpPos = this.players.map((_, i) => ({ x: cp.x - 14 + i * 28, y: cp.y - 10 }));
        }
      });
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
        p.setVelocity(0, -180);
      } else {
        p.setVelocity((dx / d) * PHYS.reelSpeed, (dy / d) * PHYS.reelSpeed);
      }
    }

    // grapple reticles
    this.players.forEach((p, i) => {
      const ret = this.reticles[i];
      if (p.skill === "grapple" && !p.dead && !p.carrying && !p.carriedBy) {
        const tgt = this.findGrappleTarget(p);
        if (tgt) {
          ret.setVisible(true).setPosition(tgt.x, tgt.y);
          ret.setTint(p.idx === 0 ? COLORS.beep : COLORS.boop);
          ret.setAlpha(0.55 + 0.35 * Math.sin(time / 150));
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
        pl.img.scaleY = pl.baseScaleY * (active ? 0.45 : 1);
        if (active) {
          pl.img.setTint(0xccffcc);
          sfx.blip();
        } else {
          pl.img.clearTint();
        }
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
            l.img.setFlipX(false);
            l.img.clearTint();
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
            sfx.key();
          }
          if ((d.keysGiven || 0) >= d.needs.keys) shouldOpen = this.evalNeeds(d.needs, d);
        }
      }
      if (d.latch && d.openedOnce) shouldOpen = true;
      if (shouldOpen && !d.open) {
        d.open = true;
        if (d.timer) d.closeAt = time + d.timer;
        else d.openedOnce = true;
        this.opened.add(d.id);
        d.img.body.enable = false;
        sfx.door();
        this.tweens.add({ targets: d.img, y: d.baseY - d.h + 10, duration: 600, ease: "sine.inOut" });
      } else if (!shouldOpen && d.open) {
        // momentary doors close again — but never on top of someone
        const blocked = this.players.some((p) => !p.dead && Phaser.Geom.Rectangle.Contains(d.zone, p.x, p.y));
        if (!blocked) {
          d.open = false;
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
        sfx.door();
        br.tiles.forEach((t, i) => {
          this.tweens.add({ targets: t, alpha: 1, duration: 300, delay: i * 70 });
          this.time.delayedCall(i * 70, () => {
            t.body.enable = true;
            this.boom.explode(4, t.x, t.y - 10);
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
            sfx.crush();
            this.cameras.main.shake(70, 0.0015);
          }
          break;
        }
        case "rest":
          body.setVelocityY(0);
          cr.timer -= delta;
          if (cr.timer <= 0) cr.state = "rise";
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
      for (const p of this.players) {
        if (p.dead || p.invuln > 0 || p.carriedBy) continue;
        if (Math.abs(p.x - bug.x) < 38 && Math.abs(p.y - bug.y) < 36) {
          const fromAbove = p.body.velocity.y > 120 && p.body.bottom < bug.y + 6;
          if (fromAbove) {
            if (p.skill === "heavy") this.squishBug(bug);
            else {
              p.setVelocityY(-380);
              sfx.bounce();
            }
          } else if (p.skill === "heavy") {
            bug.setVelocityX(p.x > bug.x ? -60 : 60); // bonk, turn away
          } else {
            this.killPlayer(p);
          }
        }
      }
    });

    this.updateCrane(delta);
    this.updateWorld2(time, delta, dt);

    // ropes
    this.rope.clear();
    for (const p of this.players) {
      if (p.zip) {
        this.rope.lineStyle(3, p.idx === 0 ? COLORS.beep : COLORS.boop, 0.9);
        this.rope.lineBetween(p.x, p.y - 8, p.zip.x, p.zip.y);
      }
      if (p.reeled) {
        this.rope.lineStyle(3, p.reeled.idx === 0 ? COLORS.beep : COLORS.boop, 0.9);
        this.rope.lineBetween(p.reeled.x, p.reeled.y - 8, p.x, p.y);
      }
    }
    this.ropeFlashes = this.ropeFlashes.filter((f) => {
      f.t -= delta;
      if (f.t > 0) {
        this.rope.lineStyle(3, 0xffffff, f.t / 200);
        this.rope.lineBetween(f.x1, f.y1, f.x2, f.y2);
        return true;
      }
      return false;
    });

    // exit: both buddies through the open door
    if (this.exitDoor && this.exitDoor.open) {
      const inZone = this.players.filter(
        (p) => !p.dead && Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.x, p.y)
      ).length;
      const bothIn = this.players.every(
        (p) => !p.dead && (Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.x, p.y) || (p.carriedBy && Phaser.Geom.Rectangle.Contains(this.exitDoor.zone, p.carriedBy.x, p.carriedBy.y)))
      );
      this.exitLabel.setText(inZone === 1 ? "WAITING FOR BUDDY..." : "EXIT");
      if (bothIn) this.finishLevel();
    }

    this.players.forEach((p) => (p.standingOn = null));
    this.updateCamera(dt);
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
        sfx.blip();
      } else if (r.state === "alert") {
        r.timer -= delta;
        if (!seen) r.state = "patrol";
        else if (r.timer <= 0) {
          this.killPlayer(seen);
          r.state = "cool";
          r.timer = 900;
        }
      } else if (r.state === "cool") {
        r.timer -= delta;
        if (r.timer <= 0) r.state = "patrol";
      }
      this.beamGfx.fillStyle(r.state === "alert" ? 0xff5566 : 0xffe066, r.state === "alert" ? 0.4 : 0.16);
      this.beamGfx.fillRect(r.beamRect.x, r.beamRect.y, r.beamRect.width, r.beamRect.height);
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
          sfx.denied();
          this.tweens.add({ targets: w.img, x: w.x + w.facing * 4, duration: 70, yoyo: true });
        } else {
          w.defeated = true;
          this.boom.explode(16, w.img.x, w.img.y);
          sfx.pop();
          w.img.body.enable = false;
          this.tweens.add({ targets: w.img, angle: -w.facing * 84, alpha: 0.25, y: w.img.y + 18, duration: 500 });
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
        j.gfx.fillStyle(0xdfe8ff, 0.3 + 0.12 * Math.sin(time / 45));
        j.gfx.fillRect(j.x - 9, j.topY, 18, j.len);
        for (const p of this.players) {
          if (!p.dead && p.invuln <= 0 && Phaser.Geom.Rectangle.Overlaps(j.zone, bodyRect(p))) this.killPlayer(p);
        }
      }
    }

    for (const f of this.fans) {
      for (const p of this.players) {
        if (p.dead || p.carriedBy || p.zip) continue;
        if (Phaser.Geom.Rectangle.Overlaps(f.zone, bodyRect(p))) {
          if (p.skill === "tiny") p.body.velocity.y = Math.max(p.body.velocity.y - 2100 * dt, -275);
          else p.body.velocity.y -= 320 * dt; // too heavy to lift, just a breeze
        }
      }
    }
  }

  finishLevel() {
    if (this.complete) return;
    this.complete = true;
    sfx.win();
    completeLevel(this.levelIndex, this.def.id, this.coresGot);
    this.physics.pause();
    if (this.def.blips.clear) this.game.events.emit("bb:blip", this.def.blips.clear);
    this.time.delayedCall(500, () => {
      this.game.events.emit("bb:complete", {
        index: this.levelIndex, id: this.def.id, name: this.def.name, cores: this.coresGot,
      });
    });
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
    cam.setZoom(this.camPos.zoom);
    cam.centerOn(this.camPos.x, this.camPos.y);
  }
}
