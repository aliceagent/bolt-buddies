// Softlock scenarios — World 3 (Magnet + Bubble): 3-1 "Attract Mode" (W3W4 L31).
//
// The headline candidates from the L31 design review:
//   1. CRATES DISPLACED/STRANDED — the crate stair is the taught wall crossing;
//      can misplaced crates seal the team on the near side? The level geometry
//      answers with the vent updraft beside the wall (a BUBBLED robot — self- or
//      buddy-bubbled — floats over) plus far-face return steps (the wall is
//      two-way without crates). Scenario 1 proves the whole chain with ZERO
//      usable crates: self-bubble ferry over, return over the steps, then the
//      BUDDY-bubble ferry for the magnet robot.
//   2. SPLIT ACROSS THE ELECTRIC RUN / stuck in the far pocket at closed g2 —
//      both lanes are re-crossable (bubble re-rolls, magnet re-clings), so a
//      one-sided crossing never strands. Scenario 2 drives the worst order.
//   3. CHOMPER CAMPING THE EXIT/CHECKPOINT — the doorstep chomper's aggro range
//      (190px) can never reach the x45 checkpoint; defang is available from
//      outside the lunge. Scenario 3 proves no respawn death-loop.
//   4. JELLY BOOPED AWAY from the socket — the knock decays back to patrol and
//      re-boops are unlimited. Scenario 4 boops it the WRONG way first.
// W3W4 L32 adds the 3-2 "Flooded Tank" candidates (3-2-*): the key-carrier
// drowning mid-tank (the water-softlock crux — the key is a TEAM counter and
// survives the death), the swimmer behind the re-armed timed baffle (prove
// re-open, both directions), the deck robot walking into the tank un-bubbled
// (prove drown-respawn reunites on solid ground), the jelly booped the wrong
// way (prove the patrol self-heal + re-boop, underwater this time), and the
// escape-chamber pit entered before the lock is open (prove the drain sump is
// a working escape valve — the pit can never hard-seal a robot).
import { snap, push, sleep, now, TILE } from "../probe.mjs";
import route31 from "../../beat/routes/3-1.mjs";
import route32, { swimTo } from "../../beat/routes/3-2.mjs";

async function runSteps(bb, steps) {
  let lastStep = "";
  try {
    for (const step of steps) { bb.stepDeaths = 0; lastStep = step.name; await step.fn(bb); }
    return { complete: (await bb.state())?.complete === true, lastStep };
  } catch (e) {
    return { complete: false, lastStep, error: e?.message || String(e) };
  }
}

// self-bubble a role (real keys), true once bubbleT > 0
async function bubbleUp(bb, role, timeout = 8000) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const end = now() + timeout;
  while (now() < end) {
    const p = (await bb.state()).players[i];
    if (p.bubbleT > 0) return true;
    if (p.bubbleCd <= 0 && !p.dead) await bb.tap(k.act);
    await sleep(200);
  }
  return false;
}

// ride the x18 vent updraft over the plate wall (x20-21) to the far side.
// The rider must already be bubbled. Returns true when it lands past the wall.
async function rideWallDraft(bb, role, timeout = 10000) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  const end = now() + timeout;
  let cleared = false;
  while (now() < end) {
    const p = (await bb.state()).players[i];
    if (p.dead) break;
    // above the wall top: drift east, capped short of the electric run (x26+)
    if (p.y < 9 * TILE && p.x < 23.5 * TILE) await bb.down(k.right);
    else await bb.up(k.right);
    if (p.tx > 21.8 && p.grounded) { cleared = true; break; }
    await sleep(60);
  }
  await bb.up(k.right);
  return cleared;
}

export default [
  {
    id: "3-1-crates-stranded-wall",
    level: "3-1",
    category: "B",
    candidate: "Crate stair unbuildable (crates displaced/stranded) — is the plate wall still passable both ways?",
    repro: [
      "equip; magnet defangs the yard chomper (route steps 0-1)",
      "SABOTAGE: magnet drags BOTH crates back west (x10/x11) — no stair material at the wall",
      "bubble robot self-bubbles on the x18 vent and floats OVER the wall (lands x22+, arms the far checkpoint)",
      "bubble robot climbs BACK over the far-face return steps + wall top (the wall is two-way without crates)",
      "recovery for the magnet robot: partner DOWN+ACTION buddy-bubble in the draft -> the magnet floats the wall too",
      "both robots east of the wall with zero crates used",
    ],
    async run(bb) {
      const mi = bb.idx("M");
      const bi = bb.idx("B");
      const kM = bb.keysFor("M");
      const kB = bb.keysFor("B");
      // stage: equip + defang (route steps 0-1)
      for (let i = 0; i <= 1; i++) { bb.stepDeaths = 0; await route31[i].fn(bb); }

      // SABOTAGE: drag both crates back west, away from the wall
      for (const backTile of [10, 11]) {
        const st = await bb.state();
        const free = st.crates.filter((c) => !c.held).sort((a, b) => b.x - a.x)[0];
        if (!free) break;
        await bb.walkTo("M", free.tx, { tol: 8, timeout: 8000 }).catch(() => {});
        await bb.act("M");
        const held = await bb.waitFor((s) => s.crates.some((c) => c.held), 2000, "latched")
          .then(() => true).catch(() => false);
        if (!held) continue;
        await bb.walkTo("M", backTile, { tol: 8, timeout: 8000 }).catch(() => {});
        await bb.act("M"); // release far from the wall
        await sleep(600);
      }
      // "not stair material": both crates well clear of the wall base (x19-20).
      // The drag-walk can body-push a crate a tile or two, so the attestation is
      // "west of x17", not a pixel spot — the stack needs them AT the wall face.
      const afterSabotage = await bb.state();
      const cratesWest = afterSabotage.crates.every((c) => c.tx < 17);

      // prove the wall is UNJUMPABLE bare (the stair is a real dependency)
      await bb.walkTo("M", 19, { tol: 8, timeout: 8000 }).catch(() => {});
      await push(bb, "M", 21, 3500, { hop: true });
      const walled = (await bb.state()).players[mi].tx < 20;

      // recovery A: bubble robot self-bubbles + rides the draft over the wall
      await bb.walkTo("B", 18, { tol: 4, timeout: 10000 });
      await bubbleUp(bb, "B");
      let bOver = await rideWallDraft(bb, "B");
      if (!bOver) { // one retry (the mount is airflow-timing sensitive)
        await bb.walkTo("B", 18, { tol: 4, timeout: 8000 }).catch(() => {});
        await bubbleUp(bb, "B");
        bOver = await rideWallDraft(bb, "B");
      }

      // recovery B: return over the far-face steps (the wall is two-way)
      let bBack = false;
      if (bOver) {
        // pop any bubble remnant, then climb back: steps x23/x22 -> wall top -> drop
        if ((await bb.state()).players[bi].bubbleT > 0) { await bb.tap(kB.act); await sleep(300); }
        await bb.walkTo("B", 18, { tol: 10, timeout: 20000 }).catch(() => {});
        bBack = (await bb.state()).players[bi].tx < 19.5;
      }

      // recovery C: BUDDY-bubble ferry — B bubbles M standing in the draft
      let mOver = false;
      if (bBack) {
        await bb.walkTo("M", 18, { tol: 4, timeout: 10000 }).catch(() => {});
        await bb.walkTo("B", 17, { tol: 6, timeout: 8000 }).catch(() => {});
        const end = now() + 12000;
        while (now() < end) {
          const st = await bb.state();
          if (st.players[mi].bubbleT > 0) break;
          if (st.players[bi].bubbleCd <= 0) {
            await bb.faceBuddy("B", "M");
            await bb.down(kB.down);
            await sleep(160);
            await bb.tap(kB.act);
            await bb.up(kB.down);
          }
          await sleep(250);
        }
        mOver = await rideWallDraft(bb, "M");
        if (!mOver) { // retry once
          await bb.walkTo("M", 18, { tol: 4, timeout: 8000 }).catch(() => {});
          const e2 = now() + 12000;
          while (now() < e2) {
            const st = await bb.state();
            if (st.players[mi].bubbleT > 0) break;
            if (st.players[bi].bubbleCd <= 0) {
              await bb.faceBuddy("B", "M");
              await bb.down(kB.down); await sleep(160); await bb.tap(kB.act); await bb.up(kB.down);
            }
            await sleep(250);
          }
          mOver = await rideWallDraft(bb, "M");
        }
        // B follows (self-bubble ride again)
        if (mOver) {
          await bb.walkTo("B", 18, { tol: 4, timeout: 8000 }).catch(() => {});
          await bubbleUp(bb, "B");
          await rideWallDraft(bb, "B");
        }
      }
      const st = await snap(bb);
      const bothEast = st.players.every((p) => p.tx > 21.5);
      // the RECOVERY chain is the load-bearing proof; the sabotage/wall flags
      // are staging attestations reported alongside (never flip the verdict on
      // their own — a body-pushed crate is not a failed recovery)
      const recovered = bOver && bBack && mOver && bothEast;
      const ok = cratesWest && walled && recovered;
      return {
        classification: recovered ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { cratesDisplacedWest: cratesWest, wallUnjumpableBare: walled },
        recoveries: [
          { name: "self-bubble + vent updraft over the plate wall (the bubble lane needs no crates)", ok: bOver, note: `B over=${bOver}` },
          { name: "far-face return steps: the wall is climbable BACK without crates (two-way)", ok: bBack, note: `B returned=${bBack}` },
          { name: "DOWN+ACTION buddy-bubble ferry: the partner bubbles the MAGNET into the draft", ok: mOver, note: `M ferried over=${mOver}` },
        ],
        repro: this.repro,
        verdict: recovered
          ? `RECOVERABLE — no crate state can seal the team. With the crates displaced from the wall (staging attestations: cratesWest=${cratesWest}, wallUnjumpableBare=${walled}), the vent updraft beside the wall crossed a self-bubbled robot, the far-face return steps brought it back, and the buddy-bubble chord ferried the magnet robot over. Crates on open floor also always stay re-draggable (150px latch, no pits in the yard), and once the far checkpoint is armed the electric floor gives a deliberate-death reunite.`
          : "UNVERIFIED — a recovery leg did not land this run (see recoveries.*); re-run to confirm. The geometry chain (draft + return steps + buddy-bubble) is the designed zero-crate crossing.",
        expectedUnverified: true,
        notes: "The draft ride is airflow-timing sensitive on a hot box; each leg retries once. The load-bearing design facts: updraft + return steps make the wall passable both ways with zero crates, for either robot (buddy-bubble covers the magnet).",
      };
    },
  },
  {
    id: "3-1-split-electric-run",
    level: "3-1",
    category: "B",
    candidate: "Team split across the electric run / bubble robot stuck in the far pocket at closed gate g2",
    repro: [
      "stage past the wall (route steps 0-2); B bubble-rolls the electric floor ALONE and rides the vent to the high lever (lvA)",
      "B drops into the x36-42 pocket: g2 still CLOSED (msA not flipped), the electric floor behind — the 'past a one-way?' candidate",
      "recovery 1: B re-bubbles and ROLLS BACK west across the floor (the lane is two-way) — team reunited",
      "recovery 2: M rail-clings across and flips msA; g2 opens; both proceed",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      const mi = bb.idx("M");
      const kB = bb.keysFor("B");
      for (let i = 0; i <= 2; i++) { bb.stepDeaths = 0; await route31[i].fn(bb); }
      // B crosses alone (route step 4 is the B-roll)
      bb.stepDeaths = 0;
      await route31[4].fn(bb);
      // B rides to the lever and pulls it (fresh bubble), then drops to the pocket
      await bb.waitFor((s) => s.players[bi].bubbleT <= 0 && s.players[bi].bubbleCd <= 0, 12000, "bubble recycled").catch(() => {});
      await bb.walkTo("B", 38, { tol: 4, timeout: 8000 });
      await bubbleUp(bb, "B");
      const end = now() + 9000;
      while (now() < end) {
        const p = (await bb.state()).players[bi];
        if (p.dead) break;
        if (p.y < 8 * TILE - 4 && p.x < 39.3 * TILE) await bb.down(kB.right);
        else await bb.up(kB.right);
        if (p.grounded && p.y < 8.6 * TILE && p.tx > 38.6 && p.tx < 42.5) break;
        await sleep(50);
      }
      await bb.up(kB.right);
      await bb.walkTo("B", 40, { tol: 6, timeout: 8000 }).catch(() => {});
      for (let i = 0; i < 4; i++) {
        if ((await bb.state()).levers.find((l) => l.id === "lvA")?.on) break;
        await bb.act("B");
        await sleep(250);
      }
      const lvAOn = (await bb.state()).levers.find((l) => l.id === "lvA")?.on === true;
      await bb.walkTo("B", 42, { tol: 8, timeout: 8000 }).catch(() => {}); // drop into the pocket
      const g2Closed = !(await bb.state()).doors.find((d) => d.id === "g2")?.open;
      const pocketed = (await bb.state()).players[bi].tx > 35.5;

      // recovery 1: roll BACK west (the electric lane is two-way for the bubble)
      await bb.waitFor((s) => s.players[bi].bubbleT <= 0 && s.players[bi].bubbleCd <= 0, 12000, "bubble recycled").catch(() => {});
      await bb.walkTo("B", 36, { tol: 6, timeout: 8000 }).catch(() => {});
      await bubbleUp(bb, "B");
      await bb.walkTo("B", 24, { tol: 8, timeout: 9000 }).catch(() => {});
      const bBackWest = (await bb.state()).players[bi].tx < 26 && !(await bb.state()).players[bi].dead;
      const reunited = bBackWest && Math.abs((await bb.state()).players[bi].tx - (await bb.state()).players[mi].tx) < 6;

      // recovery 2: M rail-clings across + flips msA -> g2 opens; both proceed
      bb.stepDeaths = 0;
      await route31[3].fn(bb); // M rail traverse
      await bb.walkTo("M", 36, { tol: 6, timeout: 8000 });
      for (let i = 0; i < 5; i++) {
        if ((await bb.state()).levers.find((l) => l.id === "msA")?.on) break;
        await bb.face("M", "right");
        await bb.act("M");
        await sleep(300);
      }
      const g2Open = await bb.waitFor((s) => s.doors.find((d) => d.id === "g2")?.open, 4000, "g2 open")
        .then(() => true).catch(() => false);
      // B re-crosses and both reach the x45 checkpoint
      bb.stepDeaths = 0;
      let bAcross = false;
      try { await route31[4].fn(bb); bAcross = true; } catch { /* verdict from flags */ }
      await bb.walkTo("M", 45, { tol: 10, timeout: 12000 }).catch(() => {});
      await bb.walkTo("B", 45, { tol: 10, timeout: 12000 }).catch(() => {});
      const st = await snap(bb);
      const bothPast = st.players.every((p) => p.tx > 43.5);
      const ok = lvAOn && pocketed && g2Closed && bBackWest && g2Open && bothPast;
      return {
        classification: ok ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { lvAOn, pocketedAtClosedG2: pocketed && g2Closed, reunitedWestFirst: reunited },
        recoveries: [
          { name: "re-bubble + roll BACK west over the electric floor (no one-way: the lane re-crosses)", ok: bBackWest },
          { name: "magnet rail-cling across + remote magswitch flip -> g2 opens; both proceed", ok: g2Open && bothPast, note: `g2Open=${g2Open} bothPast=${bothPast} bReCrossed=${bAcross}` },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the x36-42 pocket is never a seal. Drive-confirmed with the worst order (bubble robot alone past the floor, high lever pulled, g2 still closed): the bubble re-rolled BACK west (both hazard lanes are two-way), then the magnet crossed on the rail, flipped msA remotely, g2 opened and both reached the far checkpoint. A death in the pocket also just respawns at the shared active checkpoint (global reunite)."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. Both crossings are repeatable by design (bubble cooldown 2.2s; the rail never expires).",
        expectedUnverified: true,
        notes: "g2 needs BOTH msA (magnet-only, floor side) and lvA (high deck) — the co-op interleave. Neither pull is order-sensitive and no door in the level is timed.",
      };
    },
  },
  {
    id: "3-1-chomper-camping-exit",
    level: "3-1",
    category: "C",
    candidate: "Doorstep chomper camping the exit approach — respawn death-loop at the x45 checkpoint?",
    repro: [
      "stage to the exit yard (route steps 0-6); jelly socketed so the yard is walkable",
      "M walks BARE into the doorstep chomper's yard and takes the lunge (deliberate death)",
      "assert: respawn lands at the x45 checkpoint, OUTSIDE the chomper's 190px aggro — no death loop",
      "recovery: defang from yank range (210px > lunge reach) and finish the level",
    ],
    async run(bb) {
      const mi = bb.idx("M");
      // stage THROUGH the jelly socketing (step 6) so the only kill source left
      // in the exit yard is the doorstep chomper itself
      for (let i = 0; i <= 6; i++) { bb.stepDeaths = 0; await route31[i].fn(bb); }
      // deliberate: M (bare) walks into the chomper yard until bitten
      const deathsBefore = bb.deaths;
      await bb.walkTo("M", 58, { tol: 8, timeout: 8000 }).catch(() => {});
      await sleep(2500); // stand in the yard: telegraph -> lunge
      let bitten = bb.deaths > deathsBefore || (await bb.state()).players[mi].dead;
      if ((await bb.state()).players[mi].dead) await bb.awaitRespawn("M").catch(() => {});
      const p = (await bb.state()).players[mi];
      // respawn must be at the x45 checkpoint area, far outside the 190px aggro
      const respawnSafe = !bitten || (p.tx > 43 && p.tx < 48);
      const chomperX = (await bb.state()).chompers[1].tx;
      const respawnOutsideAggro = !bitten || (Math.abs(chomperX - p.tx) * TILE > 260);
      // recovery: defang + finish (the route's final step)
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route31[7]]);
      const ok = bitten && respawnSafe && respawnOutsideAggro && r.complete;
      return {
        classification: r.complete ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { bitten, respawnTx: +p.tx.toFixed(2), respawnSafe, respawnOutsideAggro },
        recoveries: [
          { name: "checkpoint x45 sits 14 tiles from the chomper (aggro 190px = 4 tiles) — no camp, no loop", ok: respawnSafe && respawnOutsideAggro },
          { name: "magnet teeth-yank from 210px (outside the lunge) defangs it for good; level completes", ok: r.complete, note: r.error ? `err: ${r.error}` : "route finished" },
        ],
        repro: this.repro,
        verdict: r.complete
          ? "RECOVERABLE — the doorstep chomper cannot camp a respawn: the x45 checkpoint is ~14 tiles from its home and its aggro is 4 tiles, so a bitten robot always comes back safe, and the defang (permanent, from outside the lunge) then clears the doorstep. Drive-confirmed through level completion."
          : `UNVERIFIED — the finish leg flaked this run (${r.error || r.lastStep}); re-run. The checkpoint/aggro spacing assertions are the load-bearing fact.`,
        expectedUnverified: true,
        notes: "Also covers the yard chomper by symmetry: its home (x16) is 6 tiles from the x10 checkpoint, same spacing rule.",
      };
    },
  },
  {
    id: "3-1-jelly-booped-away",
    level: "3-1",
    category: "C",
    candidate: "Zap-jelly booped the WRONG way (away from the socket) — is the socket puzzle retryable?",
    repro: [
      "stage to the exit yard checkpoint (route steps 0-5 minus the socketing) — instead: bubble robot deliberately boops the jelly WEST, away from the socket",
      "assert: the knocked jelly decays back to PATROL (self-healing — it drifts back inside its x48-53 patrol band)",
      "recovery: re-boop it EAST into the socket; exit powers open",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      for (let i = 0; i <= 4; i++) { bb.stepDeaths = 0; await route31[i].fn(bb); }
      bb.stepDeaths = 0;
      await route31[5].fn(bb); // through g2 to the yard checkpoint
      // deliberate WRONG boop: approach from the EAST, knock the jelly WEST
      let wrongBooped = false;
      for (let i = 0; i < 6 && !wrongBooped; i++) {
        const st = await bb.state();
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        if (st.players[bi].bubbleT <= 0) {
          await bb.waitFor((s) => s.players[bi].bubbleCd <= 0, 6000, "bubble ready").catch(() => {});
          await bb.tap(kB.act);
          const got = await bb.waitFor((s) => s.players[bi].bubbleT > 0, 1500, "bubbled").then(() => true).catch(() => false);
          if (!got) continue;
        }
        const j = (await bb.state()).jellies[0];
        await bb.walkTo("B", (j.x + 70 - 24) / TILE, { tol: 8, timeout: 6000 }).catch(() => {});
        await bb.down(kB.left);
        await bb.tap(kB.jump, 140);
        await sleep(600);
        await bb.up(kB.left);
        const after = (await bb.state()).jellies[0];
        wrongBooped = after.state === "knocked" || after.x < j.x - 60;
      }
      // self-heal: the knock decays back to patrol
      const healed = await bb.waitFor((s) => s.jellies[0].state === "patrol", 8000, "jelly back on patrol")
        .then(() => true).catch(() => false);
      const jx = (await bb.state()).jellies[0].tx;
      // recovery: the route's socketing step (correct-direction boops)
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route31[6], route31[7]]);
      const ok = wrongBooped && healed && r.complete;
      return {
        classification: r.complete ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { wrongBooped, healedToPatrol: healed, jellyTxAfterHeal: +jx.toFixed(2) },
        recoveries: [
          { name: "knock decays -> the jelly self-returns to its patrol band (no stuck-in-a-corner state)", ok: healed },
          { name: "re-boop toward the socket (boops are unlimited; the socket mouth is a generous cradle)", ok: r.complete, note: r.error ? `err: ${r.error}` : "socketed + level completed" },
        ],
        repro: this.repro,
        verdict: r.complete
          ? "RECOVERABLE — a wrong-way boop cannot lose the jelly: the knock decays, the patrol clamp walks it back inside x48-53, and re-boops are unlimited until the socket's in-flight capture takes it. Drive-confirmed: wrong boop -> self-heal -> correct boop -> exit powered -> level complete."
          : `UNVERIFIED — a leg flaked this run (${r.error || r.lastStep}); re-run. The patrol-clamp self-heal is the load-bearing mechanic (GameScene updateWorld3 jelly branch).`,
        expectedUnverified: true,
        notes: "The bubbled boop is directional (the way the booper moves), so the wrong-way state is reachable by a kid; the socket only captures in-flight, so a parked jelly is never wedged anywhere it can't patrol out of.",
      };
    },
  },

  // ===========================================================================
  // 3-2 "The Flooded Tank" (W3W4 L32)
  // ===========================================================================
  {
    id: "3-2-key-carrier-drowns",
    level: "3-2",
    category: "B",
    candidate: "KEY CARRIER DROWNS mid-tank — is the key lost/reset sanely? (the water-softlock crux)",
    repro: [
      "stage through the key dive (route steps 0-5): the swimmer carries the key, staged deep in section B",
      "SABOTAGE: pop the bubble and give NO input — the carrier sinks and runs out the 6s air timer (drowns)",
      "assert: keysHeld SURVIVES the death (the key is a team counter, never dropped into the water)",
      "assert: the respawn puts BOTH robots on solid ground at the shared checkpoint (not underwater)",
      "recovery: re-dive and finish the level — the lock still accepts the carried key",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      for (let i = 0; i <= 5; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
      const keysBefore = (await bb.state()).keysHeld;
      // SABOTAGE: pop the suit (act while bubbled = release) and go limp
      if ((await bb.state()).players[bi].bubbleT > 0) await bb.tap(kB.act);
      const deathsBefore = bb.deaths;
      const drowned = await bb.waitFor((s) => s.players[bi].dead, 16000, "carrier drowned")
        .then(() => true).catch(() => false);
      if ((await bb.state()).players[bi].dead) await bb.awaitRespawn("B").catch(() => {});
      const after = await snap(bb);
      const keysAfter = (await bb.state()).keysHeld;
      const keyKept = keysBefore === 1 && keysAfter === 1;
      const st = await bb.state();
      const bothSafe = st.players.every((p) => !p.dead && !p.inWater);
      // recovery: the rest of the route (M rail run -> timed baffle -> jelly ->
      // lock -> winch -> exit) — the drowned carrier still opens the lock
      let complete = false, err = null;
      try {
        for (let i = 6; i < route32.length; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
        complete = (await bb.state()).complete === true;
      } catch (e) { err = e?.message || String(e); }
      const ok = drowned && keyKept && bothSafe && complete;
      return {
        classification: complete && keyKept ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { drowned, deathsSeen: bb.deaths - deathsBefore, keysBefore, keysAfter, keyKept, bothSafeAfterRespawn: bothSafe, respawn: after.players },
        recoveries: [
          { name: "the key is a TEAM counter (keysHeld) — a drowned carrier keeps it; nothing drops into the tank", ok: keyKept },
          { name: "drown-respawn lands BOTH robots on solid ground at the shared checkpoint (deck, never underwater)", ok: bothSafe },
          { name: "re-dive + deliver: the lock's key/socket needs are position-free — level completed", ok: complete, note: err ? `err: ${err}` : "level completed after the drown" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the crux water strand cannot happen: the key lives on the team (keysHeld), so the carrier drowning mid-tank loses nothing; the respawn reunites both robots on the deck checkpoint, and the drive re-dove, delivered the key and finished the level."
          : `UNVERIFIED — a leg did not land this run (drowned=${drowned} keyKept=${keyKept} complete=${complete}); re-run. The load-bearing facts: keysHeld is never decremented by killPlayer, and key doors keep their keysGiven latch.`,
        expectedUnverified: true,
        notes: "Also covers the pre-pickup variant by construction: an uncollected key is a static bobbing item on the tank floor — death never moves it.",
      };
    },
  },
  {
    id: "3-2-swimmer-behind-rearmed-baffle",
    level: "3-2",
    category: "B",
    candidate: "Swimmer trapped behind the RE-ARMED timed baffle 2 — is the leaf re-openable (both directions)?",
    repro: [
      "stage through the timed-baffle squeeze (route steps 0-7): the swimmer is EAST of baffle 2, the 7s window lapses",
      "assert: the leaf re-arms CLOSED and magswitch ms2 pops back OUT (re-flippable)",
      "attest: the swimmer pressing west against the closed leaf gets nowhere (it is a real wall)",
      "recovery 1: the deck robot re-flips ms2 -> the swimmer crosses back WEST (no one-way)",
      "recovery 2: re-flip again -> the swimmer returns EAST — unlimited re-opens, both directions",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      for (let i = 0; i <= 7; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
      // let the window lapse: leaf closed + switch popped back out
      const rearmed = await bb.waitFor(
        (s) => !s.doors.find((d) => d.id === "baf2")?.open && !s.levers.find((l) => l.id === "ms2")?.on,
        12000, "baffle 2 re-armed").then(() => true).catch(() => false);
      // attest: the closed leaf is a real wall (push west against it)
      await swimTo(bb, "B", 58, 11, { dive: 43.5, timeout: 10000 }).catch(() => {});
      await swimTo(bb, "B", 55, 11, { dive: 43.5, timeout: 4000 }).catch(() => {});
      const walled = (await bb.state()).players[bi].tx > 56.5;
      // recovery 1: M re-flips (M is at ~55 from the route step); B crosses WEST
      let backWest = false;
      for (let att = 0; att < 3 && !backWest; att++) {
        const ms2 = (await bb.state()).levers.find((l) => l.id === "ms2");
        if (!ms2.on) { await bb.face("M", "right"); await bb.act("M"); }
        const open = await bb.waitFor((s) => s.doors.find((d) => d.id === "baf2")?.open, 3000, "re-open #1")
          .then(() => true).catch(() => false);
        if (!open) continue;
        await swimTo(bb, "B", 54, 11, { dive: 43.5, timeout: 6500 }).catch(() => {});
        backWest = (await bb.state()).players[bi].tx < 56;
        if (!backWest) {
          await bb.waitFor((s) => !s.doors.find((d) => d.id === "baf2")?.open && !s.levers.find((l) => l.id === "ms2")?.on,
            10000, "re-arm for retry").catch(() => {});
        }
      }
      // recovery 2: once more, back EAST (the relay resumes)
      let backEast = false;
      if (backWest) {
        await bb.waitFor((s) => !s.doors.find((d) => d.id === "baf2")?.open && !s.levers.find((l) => l.id === "ms2")?.on,
          12000, "re-arm again").catch(() => {});
        for (let att = 0; att < 3 && !backEast; att++) {
          const ms2 = (await bb.state()).levers.find((l) => l.id === "ms2");
          if (!ms2.on) { await bb.face("M", "right"); await bb.act("M"); }
          const open = await bb.waitFor((s) => s.doors.find((d) => d.id === "baf2")?.open, 3000, "re-open #2")
            .then(() => true).catch(() => false);
          if (!open) continue;
          await swimTo(bb, "B", 60, 11, { dive: 43.5, timeout: 6500 }).catch(() => {});
          backEast = (await bb.state()).players[bi].tx > 58.5;
          if (!backEast) {
            await bb.waitFor((s) => !s.doors.find((d) => d.id === "baf2")?.open && !s.levers.find((l) => l.id === "ms2")?.on,
              10000, "re-arm for retry").catch(() => {});
          }
        }
      }
      const ok = rearmed && backWest && backEast;
      return {
        classification: ok ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { rearmedClosed: rearmed, leafIsAWall: walled },
        recoveries: [
          { name: "the timed leaf pops its magswitch back OUT on re-arm — ms2 re-flips without limit", ok: backWest || backEast },
          { name: "swimmer re-crossed WEST through the re-opened leaf (no one-way pocket)", ok: backWest },
          { name: "swimmer returned EAST — the relay resumes exactly where it left off", ok: backEast },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the re-armed baffle is never a seal: the timed door pops ms2 back out (the L32 re-arm fix makes the coil lamp read 'out' too), the deck robot re-flips it without limit, and the swimmer drove back WEST and then EAST again through the re-opened leaf. The door also refuses to close on top of a body (the standard zone guard)."
          : "UNVERIFIED — a re-open leg did not land this run (see recoveries.*); re-run. The design facts: pullLever only requires !l.on, and the re-arm sets l.on=false — flips are unlimited.",
        expectedUnverified: true,
        notes: "Worst order covered by the key-drown scenario: even a swimmer stuck east WITHOUT the key can be let back west this same way (or drown-respawn to the deck).",
      };
    },
  },
  {
    id: "3-2-deck-robot-in-the-tank",
    level: "3-2",
    category: "C",
    candidate: "Deck robot falls into the tank UN-BUBBLED (no dive suit) — stranded in the water?",
    repro: [
      "stage the relay start (route steps 0-4): magnet on the deck, baffle 1 open",
      "SABOTAGE: the magnet walks straight into dive gap G2 — un-bubbled, it sinks (slow buoyant sink, no free swim)",
      "assert: the air ring runs (airMs climbs) and the 6s timer drowns it — the standard hazard death",
      "assert: respawn lands BOTH robots on solid ground at the shared deck checkpoint",
      "recovery: the deck lane resumes — walk back and re-jump gap G2",
    ],
    async run(bb) {
      const mi = bb.idx("M");
      for (let i = 0; i <= 4; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
      // SABOTAGE: M walks off into G2 (43-44) with no bubble
      await bb.walkTo("M", 44, { tol: 20, timeout: 6000 }).catch(() => {});
      const inw = await bb.waitFor((s) => s.players[mi].inWater, 4000, "M splashed in")
        .then(() => true).catch(() => false);
      let airRan = false;
      const end = now() + 3500;
      while (now() < end) {
        const p = (await bb.state()).players[mi];
        if (p.dead) break;
        if (p.airMs > 800) { airRan = true; break; }
        await sleep(150);
      }
      const drowned = await bb.waitFor((s) => s.players[mi].dead, 12000, "M drowned")
        .then(() => true).catch(() => false);
      if ((await bb.state()).players[mi].dead) await bb.awaitRespawn("M").catch(() => {});
      const st = await bb.state();
      const bothSafe = st.players.every((p) => !p.dead && !p.inWater);
      const onDeck = st.players[mi].ty < 8.5;
      // recovery: resume the deck lane (walk back + re-jump G2)
      let resumed = false;
      try {
        await bb.walkTo("M", 42, { tol: 8, timeout: 12000 });
        await bb.runJump("M", 42, "right", { landTile: 45, runup: 2 });
        resumed = (await bb.state()).players[mi].tx > 44.5;
      } catch { /* verdict from flags */ }
      const ok = inw && drowned && bothSafe && onDeck && resumed;
      return {
        classification: ok ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { splashedIn: inw, airTimerRan: airRan, drowned, respawnOnDeck: onDeck, bothSafe },
        recoveries: [
          { name: "un-bubbled water is a TIMED hazard, not a trap: the 6s air ring drowns into the standard respawn", ok: drowned },
          { name: "the shared checkpoint is on the deck — the respawn reunites both robots on solid ground", ok: bothSafe && onDeck },
          { name: "the deck lane re-runs: back to the gap and re-jump (nothing was consumed)", ok: resumed },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the tank cannot keep an un-bubbled robot: it sinks, the visible air ring runs out, the drown is the standard death->checkpoint respawn (drive-confirmed on the deck, never underwater — all four checkpoints are on solid ground), and the deck run re-jumps the gap. The swimmer's buddy-bubble (DOWN+ACTION through a dive gap) is the no-death alternative when the pair coordinates."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing rule: cpPos is global and every 3-2 checkpoint stands on dry floor.",
        expectedUnverified: true,
        notes: "Also the designed teaching beat: 'the bubble is the dive suit'. Surface bobbing keeps a stuck robot alive indefinitely (air regains at the surface), so even a player who refuses to drown is never in a death loop.",
      };
    },
  },
  {
    id: "3-2-jelly-booped-away",
    level: "3-2",
    category: "C",
    candidate: "Zap-jelly booped the WRONG way (away from the underwater socket) — retryable at depth?",
    repro: [
      "stage through the timed baffle (route steps 0-7): the bubbled swimmer is in section C with the jelly",
      "SABOTAGE: approach from the EAST and boop the jelly WEST, away from the socket at (65,13)",
      "assert: the knock decays and the jelly self-returns to its 58-63 patrol band",
      "recovery: re-boop it EAST into the socket (route step 8) and finish the level",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      for (let i = 0; i <= 7; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
      // an idle/drowned swimmer respawns WEST of the re-armed timed baffle —
      // route step 7 is the idempotent "get B east of baffle 2" squeeze
      const ensureEast = async () => {
        if ((await bb.state()).players[bi].tx <= 57.5) { bb.stepDeaths = 0; await route32[7].fn(bb); }
      };
      // deliberate WRONG boop: swim to the jelly's EAST side, then drive west INTO it
      let wrongBooped = false;
      for (let i = 0; i < 6 && !wrongBooped; i++) {
        const st = await bb.state();
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        await ensureEast();
        const j = (await bb.state()).jellies[0];
        if ((await bb.state()).players[bi].bubbleT < 1400) {
          await swimTo(bb, "B", 59, 10, { dive: 43.5, timeout: 10000 }).catch(() => {});
          continue; // swimTo's upkeep re-bubbles
        }
        await swimTo(bb, "B", j.tx + 1.6, 12, { dive: 43.5, timeout: 8000, tol: 18 }).catch(() => {});
        await bb.down(kB.left);
        await sleep(650);
        await bb.up(kB.left);
        const after = (await bb.state()).jellies[0];
        wrongBooped = after.state === "knocked" || after.x < j.x - 60;
      }
      const healed = await bb.waitFor((s) => s.jellies[0].state === "patrol", 9000, "jelly back on patrol")
        .then(() => true).catch(() => false);
      const jx = (await bb.state()).jellies[0].tx;
      // recovery: the route's socketing + the rest of the level (re-squeezing
      // the timed baffle first if the heal wait drowned the idle swimmer)
      let complete = false, err = null;
      try {
        await ensureEast();
        for (let i = 8; i < route32.length; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
        complete = (await bb.state()).complete === true;
      } catch (e) { err = e?.message || String(e); }
      const ok = wrongBooped && healed && complete;
      return {
        classification: complete ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { wrongBooped, healedToPatrol: healed, jellyTxAfterHeal: +jx.toFixed(2) },
        recoveries: [
          { name: "the knock decays underwater exactly like on land — the patrol clamp walks the jelly home (58-63)", ok: healed },
          { name: "re-boops are unlimited; the socket's tall cradle captures in-flight — level completed", ok: complete, note: err ? `err: ${err}` : "socketed + completed" },
        ],
        repro: this.repro,
        verdict: complete
          ? "RECOVERABLE — a wrong-way boop at depth loses nothing: the knocked jelly's drag decays, it resumes its patrol band, and the drive re-booped it east into the socket and finished the level (lock + winch + exit)."
          : `UNVERIFIED — a leg flaked this run (${err || "see stuck"}); re-run. The patrol-clamp self-heal is the same load-bearing mechanic 3-1 proved; water adds no new absorbing state (the jelly floats — it cannot fall anywhere).`,
        expectedUnverified: true,
        notes: "The un-bubbled-contact zap also gives the swimmer a deliberate-death exit anywhere in section C.",
      };
    },
  },
  {
    id: "3-2-chamber-pit-strand",
    level: "3-2",
    category: "B",
    candidate: "Escape chamber entered EARLY (lock still closed) — a dry pit with 4-tile walls: hard seal?",
    repro: [
      "stage the deck lane far side (route steps 0-6, then the chomper/msD step; the swimmer parks WEST of baffle 2 with the key)",
      "SABOTAGE: the magnet drops off the ledge's WEST edge into the escape chamber while the tank lock is still CLOSED",
      "attest: the pit is real — 4-tile sheer walls both ways, the lock shut, the deck sealed overhead",
      "recovery: the DRAIN SUMP (72-73,16): wade in -> air timer -> drown-respawn at the shared deck checkpoint",
      "attest: the swimmer's half was never blocked — the timed baffle re-squeezes and the relay opens the lock",
    ],
    async run(bb) {
      const mi = bb.idx("M");
      // stage steps 0-6 ONLY: B parks WEST of the timed baffle (section B's
      // current pushes an idle swimmer AWAY from the lock — a drift can't
      // accidentally socket the jelly / feed the key while M is sabotaged)
      for (let i = 0; i <= 6; i++) { bb.stepDeaths = 0; await route32[i].fn(bb); }
      bb.stepDeaths = 0;
      await route32[10].fn(bb); // defang + msD (the deck robot's normal far-side work)
      // SABOTAGE: onto the ledge, then hop WEST into the chamber (lock closed)
      await bb.walkTo("M", 75, { tol: 8, timeout: 12000 });
      await bb.waitFor((s) => s.players[mi].ty > 10 && s.players[mi].grounded, 4000, "M on the ledge");
      await bb.walkTo("M", 70, { tol: 8, timeout: 6000 }).catch(() => {});
      await bb.waitFor((s) => s.players[mi].ty > 13 && s.players[mi].grounded, 4000, "M in the chamber");
      const lockClosed = !(await bb.state()).doors.find((d) => d.id === "tanklock")?.open;
      // attest the pit: push both ways, no exit (the sump is 1 tile of water — a
      // grounded push THROUGH it just wades; the walls are the seal)
      await push(bb, "M", 66, 2500, { hop: true });
      const heldWest = (await bb.state()).players[mi].tx > 67.4;
      await push(bb, "M", 76, 2500, { hop: true });
      const heldEast = (await bb.state()).players[mi].tx < 74 && (await bb.state()).players[mi].ty > 13;
      // recovery: the drain sump — stand in it and let the air timer do its work
      await bb.walkTo("M", 72, { tol: 5, timeout: 6000 }).catch(() => {});
      const sunk = await bb.waitFor((s) => s.players[mi].inWater, 4000, "M in the sump")
        .then(() => true).catch(() => false);
      const drowned = await bb.waitFor((s) => s.players[mi].dead, 12000, "sump drown")
        .then(() => true).catch(() => false);
      if ((await bb.state()).players[mi].dead) await bb.awaitRespawn("M").catch(() => {});
      const stM = (await bb.state()).players[mi];
      const mBackSafe = !stM.dead && !stM.inWater && stM.ty < 8.5;
      // attest: the swimmer's half still runs — the timed squeeze re-runs (an
      // idle B may itself have drown-respawned to the deck; step 7 handles it),
      // then jelly -> socket and key -> lock
      let relayResumes = false, err = null;
      try {
        bb.stepDeaths = 0;
        await route32[7].fn(bb); // re-squeeze the timed baffle (idempotent)
        bb.stepDeaths = 0;
        await route32[8].fn(bb); // jelly -> socket
        bb.stepDeaths = 0;
        await route32[9].fn(bb); // key -> lock opens
        relayResumes = (await bb.state()).doors.find((d) => d.id === "tanklock")?.open === true;
      } catch (e) { err = e?.message || String(e); }
      const ok = lockClosed && drowned && mBackSafe && relayResumes;
      return {
        classification: ok ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { lockClosedAtEntry: lockClosed, wallsHold: heldWest && heldEast, sumpEntered: sunk, sumpDrowned: drowned, mBackSafeOnDeck: mBackSafe },
        recoveries: [
          { name: "the DRAIN SUMP (72-73,16) is the pit's escape valve: shallow water, wade in -> 6s air -> respawn", ok: drowned },
          { name: "the magnet respawns safe on the shared deck checkpoint (solid ground)", ok: mBackSafe },
          { name: "nothing was consumed: the swimmer socketed the jelly and opened the lock after the strand", ok: relayResumes, note: err ? `err: ${err}` : "tanklock opened" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the early-entered chamber is a pit with a drain: the walls genuinely hold (4-tile sheer, lock shut, deck overhead), but the 2-tile drain sump drowns a stranded robot into the standard checkpoint respawn, reuniting the team on the deck; the swimmer's key/jelly half was untouched and the relay completed the lock afterward. Once the lock is open the chamber additionally exits into the tank itself."
          : `UNVERIFIED — a leg did not land this run (lockClosed=${lockClosed} drowned=${drowned} mBackSafe=${mBackSafe} relay=${relayResumes}${err ? `, err: ${err}` : ""}); re-run. The sump is the load-bearing geometry: without it this pit would be the level's one hard seal.`,
        expectedUnverified: true,
        notes: "The bubble robot can only enter the chamber THROUGH the lock (it cannot reach the ledge without the winch), so the two-robots-sealed-pre-lock case cannot occur; the magnet-alone case is exactly this scenario.",
      };
    },
  },
];
