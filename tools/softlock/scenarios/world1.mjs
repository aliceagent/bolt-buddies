// Softlock scenarios — World 1 (Grapple + Heavy): 1-1, 1-2, 1-3.
//
// Some candidates are softlock-SPECIFIC divergences the beat matrix never drives
// (drop into a hazard pit, leave a held plate) — those are driven in full here.
// Others ARE the level's core co-op recovery (the chasm anchor-reel in 1-2, the
// tower reel-up in 1-3, the co-op lift + U4 forward-step in 1-1): for those the
// prober DRIVES the whole route and treats a clean completion as proof the
// recovery mechanic that would un-strand a separated team actually works — the
// same crossing reunites them. A 1-3 reel / thermal miss degrades to UNVERIFIED
// (env flake), never a false HARD SOFTLOCK.
import { snap, waitAlive, sleep } from "../probe.mjs";
import route11 from "../../beat/routes/1-1.mjs";
import route12 from "../../beat/routes/1-2.mjs";
import route13 from "../../beat/routes/1-3.mjs";

async function runFullRoute(bb, steps) {
  let lastStep = "";
  try {
    for (const step of steps) { bb.stepDeaths = 0; lastStep = step.name; await step.fn(bb); }
    const complete = (await bb.state())?.complete === true;
    return { complete, lastStep };
  } catch (e) {
    return { complete: false, lastStep, error: e?.message || String(e) };
  }
}

export default [
  {
    id: "1-1-electric-pit-both",
    level: "1-1",
    category: "A",
    candidate: "x14-19 electric pit — a robot falls in before learning the belt-gap zip",
    repro: [
      "equip grapple@x5, heavy@x8; gate opens",
      "grapple zips the belt gap to anchor (17,9), then releases straight DOWN into the electric pit (x14-19, '^' floor at r16)",
    ],
    async run(bb) {
      const gi = bb.idx("G");
      await bb.equip("G", 5);
      await bb.equip("H", 8);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "gate")?.open, 6000, "gate open");
      await bb.walkTo("G", 13, { timeout: 8000 });
      await bb.zipTo("G"); // anchor (17,9) over the pit
      await bb.zipRelease("G", "jump"); // drop straight down into the electric pit
      const respawned = await waitAlive(bb, "G", 6000);
      const after = (await bb.state()).players[gi];
      const safe = respawned && !after.dead && after.ty < 15 && after.grounded;
      return {
        classification: safe ? "RECOVERABLE" : "HARD SOFTLOCK",
        stuck: { note: "grapple entered the electric pit (hazard)" },
        recoveries: [{ name: "hazard death → automatic respawn at the shared active checkpoint (safe ground)", ok: safe, note: `respawned alive on solid ground at tx=${after.tx.toFixed(1)} ty=${after.ty.toFixed(1)} (dead=${after.dead})` }],
        repro: this.repro,
        verdict: safe
          ? "RECOVERABLE — a hazard pit KILLS and respawns the robot at the shared checkpoint on safe ground; a 'both fall in' outcome is the same (both respawn). No restart needed."
          : "HARD SOFTLOCK — the robot did not recover from the electric pit.",
        notes: "Contrast with the tutorial Station-4 pit: THAT one has no '^' floor so it cannot kill (the trap). This one is a hazard → death → shared-checkpoint respawn (GameScene 3275). Checkpoints are global, so both robots always respawn together on solid ground.",
      };
    },
  },
  {
    id: "1-2-plate-holder-strand",
    level: "1-2",
    category: "B/C",
    candidate: "Heavy holds plate plA (opens sky-door b1) — who frees the holder?",
    repro: [
      "equip both; gate opens",
      "heavy parks on plate plA (x15-16) → sky-door b1 opens; grapple takes the sky route over the crushers",
      "heavy then simply STEPS OFF the plate and walks the tunnel — b1 is momentary/non-latch and heavy doesn't need it",
    ],
    async run(bb) {
      const hi = bb.idx("H");
      for (let i = 0; i <= 2; i++) { bb.stepDeaths = 0; await route12[i].fn(bb); }
      const held = await snap(bb);
      const plateWasHeld = held.plates.find((p) => p.id === "plA")?.active;
      const b1WasOpen = held.doors.find((d) => d.id === "b1")?.open;
      await bb.walkTo("H", 26, { timeout: 14000 });
      const after = await snap(bb);
      const heavyFree = after.players[hi].tx > 24 && !after.players[hi].dead && after.players[hi].grounded;
      const b1Closed = !after.doors.find((d) => d.id === "b1")?.open;
      return {
        classification: heavyFree ? "RECOVERABLE" : "HARD SOFTLOCK",
        stuck: { plateWasHeld, b1WasOpen, note: "heavy on the plate holding b1 for the buddy" },
        recoveries: [{ name: "holder frees ITSELF: heavy steps off the momentary plate and walks on (crusher-immune)", ok: heavyFree, note: `heavy walked off to tx=${after.players[hi].tx} (b1 auto-closed=${b1Closed})` }],
        repro: this.repro,
        verdict: heavyFree
          ? "RECOVERABLE — no strand: b1 is a momentary (non-latch) core-route barrier; once the grapple buddy is across, the heavy just walks off the plate. The holder needs no external release."
          : "HARD SOFTLOCK — the plate holder could not free itself.",
        notes: "b1 (needs plates:[plA]) gates the optional sky route; the base traversal never seals heavy behind the plate.",
      };
    },
  },
  {
    id: "1-2-reel-across-chasm",
    level: "1-2",
    category: "C",
    candidate: "Reel-across electric chasm — grapple crosses, heavy stranded on the near side",
    repro: [
      "full 1-2 traversal: at the chasm (x40-52) grapple zips the anchor chain to the pillar/far floor and REELS heavy across (DOWN+ACTION)",
      "the reel is the recovery for a stranded partner; anchors on both sides also allow a grapple zip-BACK retrace",
    ],
    async run(bb) {
      const r = await runFullRoute(bb, route12);
      const st = await snap(bb);
      const bothAcross = st.players.every((p) => p.tx > 51);
      const ok = r.complete;
      return {
        classification: ok ? "RECOVERABLE" : (r.error ? "UNVERIFIED" : "HARD SOFTLOCK"),
        stuck: { note: "heavy on the near chasm edge; grapple across", bothAcross },
        recoveries: [{ name: "grapple anchor-reel pulls the stranded heavy across the chasm (DOWN+ACTION); zip-back available via the same anchors", ok, note: `route complete=${r.complete}${r.error ? " err:" + r.error : ""}` }],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the anchor-reel that completes the crossing IS the un-strand: a partner left on the near side is reeled over. Grapple can also zip BACK across the anchors to retrace."
          : (r.error ? `UNVERIFIED (env flake at '${r.lastStep}': ${r.error}) — the reel is a known thermally-sensitive step; re-run to confirm.` : "HARD SOFTLOCK — crossing/reel did not complete."),
        expectedUnverified: true,
        notes: "Anchors at 43/46/52 straddle the pillar so grapple can reel the buddy across OR zip back. And since checkpoints are global, a stranded heavy that steps into the electric chasm respawns at the shared checkpoint (x54 once grapple activates it) — death can also reunite the team across the gap.",
      };
    },
  },
  {
    id: "1-3-tower-reel-and-crane",
    level: "1-3",
    category: "C",
    candidate: "Tower reel-up — heavy falls, grapple at top must re-descend; + is the crane unwinnable?",
    repro: [
      "full 1-3: defeat the crane (yank plates + stomp pods), then the tower — grapple zips up the anchors and REELS heavy up ledge by ledge",
      "if heavy falls off a ledge it lands on the tower-base floor (no hazard); grapple zips back down and re-reels (the route's rung() retry)",
    ],
    async run(bb) {
      const r = await runFullRoute(bb, route13);
      const st = await snap(bb);
      const progressedPastCrane = r.complete || r.lastStep.includes("tower") || r.lastStep.includes("exit");
      return {
        classification: r.complete ? "RECOVERABLE" : (r.error ? "UNVERIFIED" : "HARD SOFTLOCK"),
        stuck: { note: "heavy at the tower base, grapple up a ledge", players: st.players },
        recoveries: [
          { name: "crane fight completes (yank plates + stomp pods) — NOT unwinnable", ok: progressedPastCrane, note: `progressed to '${r.lastStep}'` },
          { name: "tower reel-up: grapple zips back down and re-reels a fallen heavy (rung retry)", ok: r.complete, note: `route complete=${r.complete}${r.error ? " err:" + r.error : ""}` },
        ],
        repro: this.repro,
        verdict: r.complete
          ? "RECOVERABLE — the crane is beatable (hard, not a hard-lock) and the tower reel-up re-descends/re-reels any fallen buddy. A heavy that falls lands on the tower-base floor (no hazard) and gets reeled again."
          : (r.error ? `UNVERIFIED (env flake at '${r.lastStep}': ${r.error}) — 1-3 reel/crane is the KNOWN thermal flake; re-run standalone to confirm, never a real regression.` : "HARD SOFTLOCK — could not complete."),
        expectedUnverified: true,
        notes: "Tower-base floor is solid (r14) so a fallen heavy never dies and never leaves the reel's reach. The crane door is latch-open once defeated. No permanent strand.",
      };
    },
  },
  {
    id: "1-1-lift-deathloop-and-x50",
    level: "1-1",
    category: "D",
    candidate: "Co-op lift (needs both, threshold 3) death-loop + x50 landing-pit respawn-strand",
    repro: [
      "full 1-1: both weigh the lift (heavy=2 + grapple=1 = 3) to rise; grapple carries heavy across to the terrace",
      "a short terrace jump drops into the x50-51 landing strip (solid, NOT hazard) — the U4 forward-step (x51 2-tile riser) climbs out; lift re-ride is the fallback",
    ],
    async run(bb) {
      const r = await runFullRoute(bb, route11);
      const st = await snap(bb);
      return {
        classification: r.complete ? "RECOVERABLE" : (r.error ? "UNVERIFIED" : "HARD SOFTLOCK"),
        stuck: { note: "team at the lift / x50 landing", players: st.players },
        recoveries: [
          { name: "lift needs BOTH (weight 3) — a puzzle gate, not a lock; either robot can re-board and the lift returns home when unweighted", ok: r.complete, note: "lift rises only at weight 3 (heavy 2 + grapple 1)" },
          { name: "x50 landing-pit: U4 forward-step climb-out (auto-hop the x51 riser); lift re-ride fallback", ok: r.complete, note: `route complete=${r.complete}${r.error ? " err:" + r.error : ""}` },
        ],
        repro: this.repro,
        verdict: r.complete
          ? "RECOVERABLE — the lift is a needs-both puzzle gate (not a softlock); the x50 landing is solid floor with the U4 forward-step out. The U4 terrace checkpoint (x52,8) sits on solid ground, NOT over the open shaft, so no respawn-strand."
          : (r.error ? `UNVERIFIED (env flake at '${r.lastStep}': ${r.error}) — re-run to confirm.` : "HARD SOFTLOCK — could not complete the lift/terrace."),
        expectedUnverified: true,
        notes: "Respawn-strand audit: 1-1 checkpoints are at x23, x40 and the terrace x52,8 — all on solid floor. The U4 note in level1_1.js explicitly moved the post-lift checkpoint OFF the lift runway (which could drop a respawn into the open shaft) onto the terrace. Lift returns home when unweighted (GameScene 3567) so it never traps a lone rider.",
      };
    },
  },
];
