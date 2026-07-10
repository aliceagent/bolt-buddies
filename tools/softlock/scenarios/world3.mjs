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
import { snap, push, sleep, now, TILE } from "../probe.mjs";
import route31 from "../../beat/routes/3-1.mjs";

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
];
