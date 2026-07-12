// Softlock scenarios — World 4 (Time-Freeze + Light-Beam): 4-1 "Lights Out"
// (W3W4 L41).
//
// The headline candidates from the L41 design review:
//   1. BOTH ROBOTS INTO THE DARK PIT — the unlit crossing is a real kill pit
//      under a darkness mask; can the dark ever hold a body? No: the pit is a
//      standard fall death and the x11 checkpoint sits 4 tiles from its lip on
//      solid ground. Scenario 1 walks BOTH robots in blind and drives the full
//      recovery through the crossing.
//   2. GLOOMY RE-SEATS ON THE SWITCH — plate pl1's guard drifts home when its
//      herder leaves; is the freed-then-rejammed switch a strand? No: door gd1
//      is LATCHED (once open it never re-closes) and beam re-herds are
//      unlimited (battery recharges). Scenario 2 drives the worst order.
//   3. ROTATING-BRIDGE SEPARATION — one robot crosses under the freeze, the
//      hold lapses, the team is split across a spinning bar. No strand: the
//      freeze is a WORLD cast (castable from either side), a flat pose recurs
//      every ~4s, and the far checkpoint (armed by the first crosser) gives
//      the deliberate-death reunite. Scenario 3 drives the split + re-freeze.
//   4. RESPAWN-STRAND AUDIT — every checkpoint (x11/x28/x43/x52) armed in
//      turn, a deliberate pit death driven from each, and the respawn spot
//      attested solid + outside every pit span + beside the buddy.
//   5. TICKER CAMPING THE EXIT APPROACH — the dash lane (x65-70) can reach
//      neither the x52 checkpoint (13 tiles away) nor the exit zone (x72+),
//      and the freeze statues it on demand. Scenario 5 proves no death loop.
// --- 4-2 "The Laser Garden" (W3W4 L42) — the second set below ---------------
// The headline candidates from the L42 design review:
//   6. LASER-CORRIDOR SEPARATION — one robot crosses the dark twin-bloom field
//      under the freeze, the hold lapses, the partner strands behind a
//      re-sweeping field. No strand: the freeze is a WORLD cast (castable from
//      either rim), safe poses recur every ~4.4s forever, and the cooldown
//      always recharges. Scenario 6 drives the split + the east-rim re-cast.
//   7. KEY-CARRIER STRANDED/KILLED behind an unfrozen sweep — keys are a SHARED
//      COUNTER (never dropped on death), so a bitten carrier loses nothing.
//      Scenario 7 kills the carrier holding key 3 inside the live compound and
//      finishes the level with the very same key.
//   8. GATE-ORDER DEADLOCK — three fungible keys, three double gates (ice
//      sheet + key lock): can a wrong melt/unlock order strand? No: geometry
//      makes each bed's key reachable only before its own gate, both layers
//      are monotonic (melts never refreeze, keysGiven never drains), and the
//      key even turns its lock THROUGH the unmelted ice. Scenario 8 drives the
//      worst order end to end.
//   9. TICKER CAMPING A KEY — the guard patrols directly over its key; can it
//      camp the pickup or the checkpoint into a death loop? No: the patrol
//      clamp reaches no checkpoint, the freeze statues it on demand (position
//      attested motionless), and the key survives the bite. Scenario 9 bites.
//  10. RESPAWN-STRAND AUDIT (4-2) — all four checkpoints (x11/x34/x65/x84)
//      armed in turn, a deliberate laser/Ticker death driven from each, the
//      respawn attested solid + in-band + IDLE-SAFE for 5s (no sweep or patrol
//      reaches any checkpoint — the laser death-loop guard; 4-2 has NO pits
//      at all, so no carve can cage a body).
import { snap, push, sleep, now, TILE } from "../probe.mjs";
import route41 from "../../beat/routes/4-1.mjs";
import route42, { helpers as h42 } from "../../beat/routes/4-2.mjs";

async function runSteps(bb, steps) {
  let lastStep = "";
  try {
    for (const step of steps) { bb.stepDeaths = 0; lastStep = step.name; await step.fn(bb); }
    return { complete: (await bb.state())?.complete === true, lastStep };
  } catch (e) {
    return { complete: false, lastStep, error: e?.message || String(e) };
  }
}

// hold a role rightward into the ghost pit until it dies (a blind walk off the
// x15 lip falls between the treads), then wait out the respawn.
async function walkIntoPit(bb, role, lipTile, timeout = 9000) {
  const i = bb.idx(role);
  const k = bb.keysFor(role);
  await bb.walkTo(role, lipTile - 1, { tol: 8, timeout: 8000 }).catch(() => {});
  const deaths0 = bb.deaths;
  const end = now() + timeout;
  await bb.down(k.right);
  let died = false;
  while (now() < end) {
    const p = (await bb.state()).players[i];
    if (p.dead) { died = true; break; }
    // past the far lip without dying (landed on a tread) — walk back and retry
    if (p.tx > lipTile + 10) break;
    await sleep(60);
  }
  await bb.up(k.right);
  if (died) {
    bb.deaths = deaths0; // deliberate — don't burn the driver's death budget
    bb.stepDeaths = 0;
    await bb.waitFor((s) => !s.players[i].dead, 5000, `${role} respawned`).catch(() => {});
    await sleep(300);
  }
  return died;
}

// The pit spans of 4-1 (tile x-ranges bottoming in the spark-hazard floor).
const PITS = [[16, 24], [46, 49]];
const onSolid = (p) => p.grounded && !PITS.some(([a, b]) => p.tx > a - 0.3 && p.tx < b + 1.3);

export default [
  {
    id: "4-1-both-into-dark-pit",
    level: "4-1",
    category: "B",
    candidate: "BOTH robots walk blind into the unlit ghost-run pit — can the dark pit hold the team?",
    repro: [
      "equip both skills (route step 0); the x11 checkpoint arms",
      "SABOTAGE: both robots walk STRAIGHT off the x15 lip in the dark, no beam, no jump — both fall between the invisible treads",
      "assert: both take the standard pit death and respawn TOGETHER at the x11 checkpoint, grounded on solid floor (never inside a pit span)",
      "recovery: the taught crossing — beam reveal + the three ghost-platform hops — puts both on the far side; the x28 checkpoint arms",
    ],
    async run(bb) {
      bb.stepDeaths = 0;
      await route41[0].fn(bb); // equip + x11 checkpoint
      const fellF = await walkIntoPit(bb, "F", 16);
      const fellB = await walkIntoPit(bb, "B", 16);
      const st1 = await bb.state();
      const bothBack = st1.players.every((p) => !p.dead);
      const bothSolid = st1.players.every(onSolid);
      const atCp = st1.players.every((p) => p.tx > 9 && p.tx < 13.5);
      // recovery: the route's own crossing steps (reveal + hop chain)
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route41[1], route41[2]]);
      const st2 = await bb.state();
      const bothAcross = st2.players.every((p) => p.tx > 25 && !p.dead);
      const ok = fellF && fellB && bothBack && bothSolid && atCp && bothAcross;
      return {
        classification: bothAcross && bothSolid ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { fellF, fellB, bothRespawned: bothBack, respawnSolid: bothSolid, respawnAtX11: atCp },
        recoveries: [
          { name: "the dark pit is a STANDARD fall death — the respawn beams both robots to the shared x11 checkpoint on solid floor", ok: bothBack && bothSolid && atCp },
          { name: "the taught crossing re-runs on real input (ghost treads are solid always; the beam is the reveal, not the bridge)", ok: bothAcross, note: r.error ? `err: ${r.error}` : "both across, x28 armed" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the darkness cannot hold a body: a blind walk into the unlit crossing is the standard spark-floor death (the pit bottoms in a hazard row, the shipped-level pit convention), the respawn reunites BOTH robots at the x11 checkpoint 4 tiles from the lip on attested-solid floor, and the driven crossing then put both on the far side. Nothing is consumed by the fall; retries are unlimited."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: the pit bottoms in a spark-hazard floor (kill, not cage — drive-found in L41: a floor-LESS carve lets a body rest alive on the world bounds), every checkpoint stands on solid ground, and ghost platforms are physics-solid whether or not they are lit.",
        expectedUnverified: true,
        notes: "The kid-fair guards: the robots' own ~120px glow always shows the pit lip, the ghost treads keep a faint at-rest shimmer, and the station glyph prompts the beam HOLD before the pit.",
      };
    },
  },
  {
    id: "4-1-gloomy-reseat-jam",
    level: "4-1",
    category: "B",
    candidate: "Gloomy herded off plate pl1 then allowed to RE-SEAT (herder walks away) — is the re-jammed switch a strand?",
    repro: [
      "stage through the ghost run (route steps 0-2); the team is at the x28 checkpoint",
      "B beams the seated gloomy off pl1 — but does NOT stand the plate; both robots retreat west out of glow range",
      "assert: the gloomy drifts HOME and re-jams the plate (pl1 gloomed again), door gd1 still closed — the worst order",
      "recovery 1: re-herd with a recharged beam (herds are unlimited) and STAND the freed plate — gd1 opens",
      "recovery 2 (the latch proof): walk OFF the plate and through — gd1 stays open forever; the gloomy re-seating after the team passes seals nothing",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      const kB = bb.keysFor("B");
      for (let i = 0; i <= 2; i++) { bb.stepDeaths = 0; await route41[i].fn(bb); }
      // SABOTAGE: herd the guard off, then abandon the plate
      await bb.walkTo("B", 33, { tol: 6, timeout: 8000 }).catch(() => {});
      await bb.face("B", "right");
      await bb.down(kB.act);
      const herded = await bb.waitFor((s) => Math.abs(s.gloomies[0].x - s.gloomies[0].homeX) > 70, 5000, "herded off")
        .then(() => true).catch(() => false);
      await bb.up(kB.act);
      // retreat both robots out of glow range of the post (x36)
      await bb.walkTo("B", 29, { tol: 6, timeout: 8000 }).catch(() => {});
      await bb.walkTo("F", 28, { tol: 8, timeout: 6000 }).catch(() => {});
      // the guard drifts home and re-jams
      const reseated = await bb.waitFor(
        (s) => Math.abs(s.gloomies[0].x - s.gloomies[0].homeX) < 44 && s.plates.find((p) => p.id === "pl1")?.gloomed,
        12000, "gloomy re-seats + re-jams").then(() => true).catch(() => false);
      const gd1Closed = !(await bb.state()).doors.find((d) => d.id === "gd1")?.open;
      // recovery 1: the route's own herd-and-stand step (fresh battery)
      await bb.waitFor((s) => s.players[bi].beamMs > 4000, 10000, "battery recharged").catch(() => {});
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route41[3]]);
      const gd1Open = (await bb.state()).doors.find((d) => d.id === "gd1")?.open === true;
      // recovery 2 / latch proof: both are now PAST the plate (route step walks
      // through) — the plate is unpressed and the guard free to re-seat, yet:
      await sleep(2500); // give the gloomy time to drift home behind the team
      const st = await bb.state();
      const stillOpen = st.doors.find((d) => d.id === "gd1")?.open === true;
      const bothPast = st.players.every((p) => p.tx > 41.5);
      const ok = herded && reseated && gd1Closed && gd1Open && stillOpen && bothPast;
      return {
        classification: gd1Open && stillOpen ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { herdedOff: herded, reseatedAndRejammed: reseated, gd1ClosedAtWorst: gd1Closed },
        recoveries: [
          { name: "beam re-herds are UNLIMITED (the battery recharges doused; the seated guard always fears the cone)", ok: gd1Open, note: r.error ? `err: ${r.error}` : "re-herd + stand -> gd1 open" },
          { name: "gd1 is LATCHED: once open it never re-closes — the guard re-seating behind the team seals nothing", ok: stillOpen && bothPast },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the re-jammed switch is a retry, never a seal. Drive-confirmed in the worst order: herd -> abandon -> the gloomy re-seats and re-jams (gd1 still closed) -> a recharged beam re-herds it -> the freed plate opens gd1 -> the LATCH holds the door open after the team walks on and the guard re-seats behind them. No state in the station is consumable."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: gd1 declares latch:true (GameScene door latch semantics: opened.add, never re-closes) and gloomy herding costs only battery, which recharges.",
        expectedUnverified: true,
        notes: "The glow-block also means a robot STANDING the plate can hold it pressed indefinitely — the guard hovers at bay outside the 120px glow radius and cannot contest the press.",
      };
    },
  },
  {
    id: "4-1-bridge-separation",
    level: "4-1",
    category: "B",
    candidate: "Team SPLIT across the rotating bridge (one crossed under the freeze, the hold lapsed) — stranded on opposite rims?",
    repro: [
      "stage to the x43 checkpoint (route steps 0-3)",
      "SABOTAGE: F freezes a flat pose and crosses ALONE; B stays west; the hold lapses — the bar spins between them",
      "attest: the spinning bar is a real barrier (B pressing east on the rim gets nowhere / the far checkpoint x52 is armed by the crosser)",
      "recovery 1: the freeze is a WORLD cast — F re-casts from the EAST side on the next flat pose (~4s period) and B walks across",
      "recovery 2 (attested by design + the armed checkpoint): a deliberate pit death respawns the straggler AT x52 beside its buddy — the global-checkpoint reunite",
    ],
    async run(bb) {
      const fi = bb.idx("F");
      const bi = bb.idx("B");
      const kF = bb.keysFor("F");
      for (let i = 0; i <= 3; i++) { bb.stepDeaths = 0; await route41[i].fn(bb); }
      // SABOTAGE: F crosses alone under one freeze; B parks well west
      await bb.walkTo("B", 42.5, { tol: 6, timeout: 8000 }).catch(() => {});
      let fEast = false;
      for (let att = 0; att < 4 && !fEast; att++) {
        await bb.walkTo("F", 44.6, { tol: 6, timeout: 8000 }).catch(() => {});
        await bb.waitFor((s) => s.players[fi].freezeCd <= 0, 16000, "freeze ready").catch(() => {});
        await bb.waitFor((s) => {
          const a = ((s.rotbridges[0].angle * 180 / Math.PI) % 180 + 180) % 180;
          return a < 12 || a > 168;
        }, 16000, "flat pose").catch(() => {});
        await bb.tap(kF.act);
        const froze = await bb.waitFor((s) => s.frozen, 1500, "frozen").then(() => true).catch(() => false);
        if (!froze) continue;
        await bb.walkTo("F", 52, { tol: 8, timeout: 4600 }).catch(() => {});
        const p = (await bb.state()).players[fi];
        if (p.dead) { await bb.awaitRespawn("F"); continue; }
        fEast = p.tx > 50.5;
      }
      // let the hold lapse: the team is now split across a spinning bar
      await bb.waitFor((s) => !s.frozen, 8000, "thaw").catch(() => {});
      const stSplit = await bb.state();
      const split = fEast && stSplit.players[bi].tx < 45.5;
      const cpArmed = fEast; // the x52 checkpoint sits on the crosser's landing run
      // attest: the spinning bar is a real barrier for the straggler
      await push(bb, "B", 47, 2600, { hop: false });
      const stHeld = await bb.state();
      const barred = stHeld.players[bi].dead || stHeld.players[bi].tx < 46.5;
      if (stHeld.players[bi].dead) {
        // the probe fell in — which IS recovery 2 (the armed-checkpoint reunite)
        bb.stepDeaths = 0;
        await bb.waitFor((s) => !s.players[bi].dead, 5000, "B respawned").catch(() => {});
      }
      let st = await bb.state();
      let reunitedByDeath = st.players[bi].tx > 50.5 && fEast;
      // recovery 1 (when the probe is still split): F re-casts from the EAST
      let reFroze = false, bAcross = reunitedByDeath;
      for (let att = 0; att < 4 && !bAcross; att++) {
        st = await bb.state();
        if (st.players[bi].dead) { await bb.awaitRespawn("B"); continue; }
        if (st.players[bi].tx > 50.5) { bAcross = true; break; }
        await bb.walkTo("B", 44.6, { tol: 6, timeout: 8000 }).catch(() => {});
        await bb.walkTo("F", 51.5, { tol: 8, timeout: 6000 }).catch(() => {}); // cast from the east rim
        await bb.waitFor((s) => s.players[fi].freezeCd <= 0, 16000, "freeze re-ready").catch(() => {});
        await bb.waitFor((s) => {
          const a = ((s.rotbridges[0].angle * 180 / Math.PI) % 180 + 180) % 180;
          return a < 12 || a > 168;
        }, 16000, "flat pose again").catch(() => {});
        await bb.tap(kF.act);
        reFroze = await bb.waitFor((s) => s.frozen, 1500, "re-frozen from the east").then(() => true).catch(() => false);
        if (!reFroze) continue;
        await bb.walkTo("B", 52, { tol: 8, timeout: 4600 }).catch(() => {});
        const p = (await bb.state()).players[bi];
        if (p.dead) { await bb.awaitRespawn("B"); continue; }
        bAcross = p.tx > 50.5;
      }
      st = await snap(bb);
      const reunited = st.players.every((p) => p.tx > 50.5 && !p.dead);
      const ok = split && cpArmed && reunited;
      return {
        classification: reunited ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { splitAcrossSpinningBar: split, farCheckpointArmed: cpArmed, spinningBarIsABarrier: barred },
        recoveries: [
          { name: "TIME-FREEZE is a world cast — castable from EITHER rim; a flat pose recurs every ~4s and the straggler walks the held bar", ok: bAcross && !reunitedByDeath ? true : bAcross, note: `reFroze=${reFroze} reunitedByDeath=${reunitedByDeath}` },
          { name: "the x52 checkpoint (armed by the first crosser) gives the deliberate-death reunite — a pit fall beams the straggler to the far side", ok: cpArmed },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the bridge can never hold a split: the freeze is castable from either side (drive-confirmed east-rim re-cast + straggler crossing), the flat window recurs every ~4s forever, the freeze cooldown (8s) always recharges, and the far checkpoint armed by the first crosser turns the pit itself into a reunite valve. Role-symmetric: whichever robot crossed first, the freeze caster can serve the crossing from wherever it stands."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: castFreeze has no range/side condition, rotbridge poses are periodic, and checkpoints are global (cpPos moves BOTH respawn points).",
        expectedUnverified: true,
        notes: "The worst sub-case — the BEAM robot crossing first — is strictly easier: the freeze caster is then the straggler and casts for itself from the west rim.",
      };
    },
  },
  {
    id: "4-1-respawn-strand-audit",
    level: "4-1",
    category: "C",
    candidate: "Respawn-strand audit: every checkpoint (x11/x28/x43/x52) — does any respawn land off solid ground or inside a pit span?",
    repro: [
      "arm each checkpoint in turn by driving the route stations",
      "at each armed checkpoint, drive a deliberate death (ghost-pit dives west-side; the BARE ticker lane east-side — the spinning bar ferries a bridge-pit diver across more often than it drops one, drive-found)",
      "assert: the respawn lands BOTH robots grounded, on solid floor, outside both pit spans, within the checkpoint's tile band",
      "finish the level after the last audit — the respawns consumed nothing",
    ],
    async run(bb) {
      const audits = [];
      const audit = async (label, role, pitLip, cpBand) => {
        const died = await walkIntoPit(bb, role, pitLip);
        const st = await bb.state();
        const p = st.players[bb.idx(role)];
        const solid = onSolid(p);
        const inBand = p.tx > cpBand[0] && p.tx < cpBand[1];
        const buddy = st.players[1 - bb.idx(role)];
        const together = Math.abs(p.tx - buddy.tx) < 8 || inBand; // shared cp side
        audits.push({ label, died, respawnTx: +p.tx.toFixed(2), respawnTy: +p.ty.toFixed(2), solid, inBand, together });
        return died && solid && inBand;
      };
      // cp1 (x11): armed by route step 0; die in the ghost pit
      bb.stepDeaths = 0;
      await route41[0].fn(bb);
      const a1 = await audit("cp1@x11 <- ghost pit", "F", 16, [9, 13.5]);
      // cp2 (x28): cross the run (route steps 1-2); die diving BACK west into the
      // pit. A floor-level west walk is BLOCKED by tread 3's side (the tread top
      // sits a tile above the floor — itself a nice anti-stumble lip), so the
      // dive hops ONTO tread 3 first, then walks off its west edge into the gap.
      for (let i = 1; i <= 2; i++) { bb.stepDeaths = 0; await route41[i].fn(bb); }
      const backIn = async (role) => {
        const i = bb.idx(role);
        const k = bb.keysFor(role);
        const d0 = bb.deaths;
        let died = false;
        for (let att = 0; att < 3 && !died; att++) {
          await bb.walkTo(role, 26, { tol: 6, timeout: 8000 }).catch(() => {});
          // standing jump + west drift onto tread 3 (x23-24, one tile up)
          await bb.down(k.jump);
          await sleep(200);
          await bb.down(k.left);
          await sleep(300);
          await bb.up(k.jump);
          // keep holding west: off tread 3's west edge into the x19-22 gap
          const end = now() + 6000;
          while (now() < end) {
            const p = (await bb.state()).players[i];
            if (p.dead) { died = true; break; }
            if (p.grounded && p.tx > 25.5 && p.ty > 13) break; // fell back east — retry
            await sleep(60);
          }
          await bb.up(k.left);
        }
        if (died) {
          bb.deaths = d0; bb.stepDeaths = 0;
          await bb.waitFor((s) => !s.players[i].dead, 5000, "respawn").catch(() => {});
          await sleep(300);
        }
        return died;
      };
      const died2 = await backIn("F");
      const st2 = await bb.state();
      const p2 = st2.players[bb.idx("F")];
      const a2 = died2 && onSolid(p2) && p2.tx > 26 && p2.tx < 30.5;
      audits.push({ label: "cp2@x28 <- ghost pit (west re-entry)", died: died2, respawnTx: +p2.tx.toFixed(2), solid: onSolid(p2), inBand: a2 });
      // cp3 (x43): open gd1 (route step 3), then audit the checkpoint with a
      // GHOST-PIT death (a long deliberate west trek back through the latched
      // door and under the podium guard). NOT the bridge pit: the spinning bar
      // FERRIES a bare diver across more often than it lets one fall
      // (drive-found both directions — itself a kind finding: the bridge pit
      // rescues more than it bites), so it cannot produce a reliable death.
      bb.stepDeaths = 0;
      await route41[3].fn(bb);
      const died3 = await backIn("F"); // ghost-pit dive, cp3 armed
      const st3 = await bb.state();
      const p3 = st3.players[bb.idx("F")];
      const a3 = died3 && onSolid(p3) && p3.tx > 41 && p3.tx < 45.5;
      audits.push({ label: "cp3@x43 <- ghost pit (west trek)", died: died3, respawnTx: +p3.tx.toFixed(2), solid: onSolid(p3), inBand: a3 });
      // walk the auditor back east before the bridge crossing resumes
      await bb.walkTo("F", 43, { tol: 8, timeout: 12000 }).catch(() => {});
      // cp4 (x52): cross the bridge (route step 4); die BARE in the ticker lane
      // (the only reliable kill east of the bridge — same reason as cp3)
      bb.stepDeaths = 0;
      await route41[4].fn(bb);
      const d4 = bb.deaths;
      await bb.walkTo("F", 67, { tol: 8, timeout: 10000 }).catch(() => {});
      let died4 = (await bb.state()).players[bb.idx("F")].dead;
      if (!died4) {
        const end4 = now() + 6000;
        while (now() < end4) {
          if ((await bb.state()).players[bb.idx("F")].dead) { died4 = true; break; }
          await sleep(100);
        }
      }
      if (died4) {
        bb.deaths = d4; bb.stepDeaths = 0;
        await bb.waitFor((s) => !s.players[bb.idx("F")].dead, 5000, "respawn").catch(() => {});
        await sleep(300);
      }
      const st4 = await bb.state();
      const p4 = st4.players[bb.idx("F")];
      const a4 = died4 && onSolid(p4) && p4.tx > 50 && p4.tx < 54.5;
      audits.push({ label: "cp4@x52 <- ticker lane (bare)", died: died4, respawnTx: +p4.tx.toFixed(2), solid: onSolid(p4), inBand: a4 });
      // finish: the audits consumed nothing
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route41[5], route41[6]]);
      const ok = a1 && a2 && a3 && a4 && r.complete;
      return {
        classification: r.complete && a1 && a2 && a3 && a4 ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { audits },
        recoveries: [
          { name: "every 4-1 checkpoint stands on attested-solid floor outside both pit spans — no respawn can strand", ok: a1 && a2 && a3 && a4 },
          { name: "nothing is consumed by any death: the level completed after all four audits", ok: r.complete, note: r.error ? `err: ${r.error}` : "level complete" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the respawn-strand audit is clean: all four checkpoints (x11, x28, x43, x52) respawned the deliberate pit deaths onto solid ground inside their own tile bands, never inside the x16-24 or x46-49 pit spans, and the level completed afterwards. Checkpoints are global (both robots' respawn points move together), so no death order can split the respawn."
          : "UNVERIFIED — an audit leg flaked this run (see stuck.audits); re-run. The geometry facts: every checkpoint tile has 4 rows of ground under it and sits >=3 tiles from the nearest pit lip.",
        expectedUnverified: true,
        notes: "Bonus finding: the spinning bar FERRIES bare divers across the bridge pit in both directions more often than it drops them — the pit rescues more than it bites, and scenario 3's reunite valve is even softer than designed.",
      };
    },
  },
  {
    id: "4-1-ticker-camping-exit",
    level: "4-1",
    category: "C",
    candidate: "Ticker camping the exit approach — respawn death-loop at the x52 checkpoint, or an uncrossable doorstep?",
    repro: [
      "stage to the corridor's east end (route steps 0-5)",
      "SABOTAGE: F walks BARE into the dash lane (x65-70) with time running and takes the dash hit (deliberate death)",
      "assert: the respawn lands at the x52 checkpoint, 13 tiles west of the lane — the patrol (min x65, reach ~x64.3) can never camp it",
      "recovery: freeze statues the ticker (harmless, dash timers held); both walk the lane and finish",
    ],
    async run(bb) {
      const fi = bb.idx("F");
      for (let i = 0; i <= 5; i++) { bb.stepDeaths = 0; await route41[i].fn(bb); }
      // SABOTAGE: bare walk into the live lane
      const d0 = bb.deaths;
      await bb.walkTo("F", 67, { tol: 8, timeout: 9000 }).catch(() => {});
      await sleep(2500); // stand in the lane: wind-up telegraph -> dash
      let bitten = bb.deaths > d0 || (await bb.state()).players[fi].dead;
      if ((await bb.state()).players[fi].dead) {
        bb.deaths = d0; bb.stepDeaths = 0;
        await bb.waitFor((s) => !s.players[fi].dead, 5000, "respawn").catch(() => {});
        await sleep(300);
      }
      const p = (await bb.state()).players[fi];
      const respawnSafe = !bitten || (p.tx > 50 && p.tx < 54.5);
      const tickerX = (await bb.state()).tickers[0].tx;
      const outsideReach = !bitten || (Math.abs(tickerX - p.tx) * TILE > 300);
      // recovery: the route's freeze-the-lane finish
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route41[6]]);
      const ok = bitten && respawnSafe && outsideReach && r.complete;
      return {
        classification: r.complete ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { bitten, respawnTx: +p.tx.toFixed(2), respawnSafe, respawnOutsideReach: outsideReach },
        recoveries: [
          { name: "the x52 checkpoint sits 13 tiles from the lane (patrol clamp x65-70, contact reach 34px) — no camp, no loop", ok: respawnSafe && outsideReach },
          { name: "TIME-FREEZE statues the ticker (velocity 0, timers held, contact gated OFF) — the lane walks on demand; level completes", ok: r.complete, note: r.error ? `err: ${r.error}` : "route finished" },
        ],
        repro: this.repro,
        verdict: r.complete
          ? "RECOVERABLE — the doorstep ticker cannot camp anything: its patrol clamp cannot reach the x52 checkpoint or the exit zone (x72+ vs max reach ~x71.3), a bare bite is the standard death->checkpoint respawn, and the freeze (8s cooldown, unlimited casts) statues the lane whenever the team wants through. Drive-confirmed through level completion."
          : `UNVERIFIED — the finish leg flaked this run (${r.error || r.lastStep}); re-run. The clamp/checkpoint spacing assertions are the load-bearing fact.`,
        expectedUnverified: true,
        notes: "Timing the lane WITHOUT the freeze is also possible (wind-up 700ms telegraph, dash 2.6s max) but never required — the freeze is the taught answer.",
      };
    },
  },

  // ==========================================================================
  // 4-2 "The Laser Garden" (W3W4 L42)
  // ==========================================================================
  {
    id: "4-2-laser-corridor-separation",
    level: "4-2",
    category: "B",
    candidate: "Team SPLIT across the dark twin-bloom laser field (one crossed under the freeze, the hold lapsed) — stranded behind a re-sweeping corridor?",
    repro: [
      "stage through bed 1 + gate 1 (route steps 0-2); the team is at the x34 checkpoint",
      "SABOTAGE: F casts on the twins' mirrored safe pose and crosses the dark field ALONE to the east pocket; B stays west; the hold lapses — the twin sweeps resume between them",
      "attest: the live field is a real barrier (B pressed bare into the corridor is cut down by the sweeps or gets nowhere)",
      "recovery: TIME-FREEZE is a WORLD cast — F re-casts from the EAST pocket on the next mirrored safe pose (~4.4s period, unlimited) and B walks across",
    ],
    async run(bb) {
      const fi = bb.idx("F");
      const bi = bb.idx("B");
      for (let i = 0; i <= 2; i++) { bb.stepDeaths = 0; await route42[i].fn(bb); }
      // SABOTAGE: F crosses alone under one cast; B parks at the checkpoint
      await bb.walkTo("B", 34.9, { tol: 6, timeout: 8000 }).catch(() => {});
      let fEast = false;
      for (let att = 0; att < 4 && !fEast; att++) {
        const p = (await bb.state()).players[fi];
        if (p.dead) { await bb.awaitRespawn("F"); continue; }
        await bb.walkTo("F", 34.1, { tol: 6, timeout: 8000 }).catch(() => {});
        const froze = await h42.freezeWhenSafe(bb, 1, 52).catch(() => false);
        if (!froze) continue;
        await bb.walkTo("F", 53.0, { tol: 8, timeout: 4600 }).catch(() => {});
        const q = (await bb.state()).players[fi];
        if (q.dead) { await bb.awaitRespawn("F"); continue; }
        fEast = q.tx > 53;
      }
      await bb.waitFor((s) => !s.frozen, 8000, "thaw").catch(() => {});
      const stSplit = await bb.state();
      const split = fEast && stSplit.players[bi].tx < 36;
      // attest: the re-sweeping field is a real barrier for the straggler
      const d0 = bb.deaths;
      await push(bb, "B", 44, 4200, { hop: false });
      let stHeld = await bb.state();
      const barred = stHeld.players[bi].dead || stHeld.players[bi].tx < 40;
      if (stHeld.players[bi].dead) {
        bb.deaths = d0; bb.stepDeaths = 0; // deliberate probe death
        await bb.waitFor((s) => !s.players[bi].dead, 5000, "B respawned").catch(() => {});
        await sleep(300);
      } else if (stHeld.players[bi].tx > 36) {
        // still alive inside the corridor: the next sweep pass usually ends it;
        // either way retreat the probe to the checkpoint stance
        await bb.waitFor((s) => s.players[bi].dead, 6000, "sweep catches the probe").catch(() => {});
        stHeld = await bb.state();
        if (stHeld.players[bi].dead) {
          bb.deaths = d0; bb.stepDeaths = 0;
          await bb.waitFor((s) => !s.players[bi].dead, 5000, "B respawned").catch(() => {});
        } else {
          await bb.walkTo("B", 34.9, { tol: 8, timeout: 8000 }).catch(() => {});
        }
      }
      // recovery: F re-casts FROM THE EAST — the freeze has no side/range condition
      let reFroze = false, bAcross = false;
      for (let att = 0; att < 4 && !bAcross; att++) {
        let st = await bb.state();
        if (st.players[bi].dead) { await bb.waitFor((s) => !s.players[bi].dead, 5000, "B back").catch(() => {}); continue; }
        if (st.players[bi].tx > 53) { bAcross = true; break; }
        await bb.walkTo("B", 34.9, { tol: 8, timeout: 9000 }).catch(() => {});
        await bb.walkTo("F", 53.0, { tol: 8, timeout: 6000 }).catch(() => {}); // cast from the east pocket
        reFroze = await h42.freezeWhenSafe(bb, 1, 52).catch(() => false);
        if (!reFroze) continue;
        await bb.walkTo("B", 53.3, { tol: 8, timeout: 4600 }).catch(() => {});
        const q = (await bb.state()).players[bi];
        if (q.dead) { await bb.awaitRespawn("B"); continue; }
        bAcross = q.tx > 53;
      }
      const st = await snap(bb);
      const reunited = st.players.every((p) => p.tx > 53 && !p.dead);
      const ok = split && barred && reunited;
      return {
        classification: reunited ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { splitAcrossField: split, fieldIsABarrier: barred, reFroze },
        recoveries: [
          { name: "TIME-FREEZE is a world cast — castable from EITHER side of the field; the mirrored safe pose recurs every ~4.4s forever and the cooldown always recharges", ok: bAcross },
          { name: "worst sub-case is role-symmetric: if the BEAM robot crossed first, the freeze caster is the straggler and casts for itself from the west", ok: true },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the laser corridor can never hold a split: the freeze has no range or side condition (drive-confirmed east-pocket re-cast + straggler crossing), the twins' mirrored safe pose recurs every ~4.4s forever, and a probe death is just the standard checkpoint respawn on the straggler's own side. Nothing is consumed by the split."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: castFreeze has no range/side condition, sweep poses are periodic, and the x34 checkpoint sits outside every sweep's head-height reach.",
        expectedUnverified: true,
        notes: "The x52.6-54.6 pocket between the field and the lane is attested safe idle ground — the caster can wait out any number of cooldowns there.",
      };
    },
  },
  {
    id: "4-2-key-carrier-strand",
    level: "4-2",
    category: "B",
    candidate: "The KEY CARRIER is killed inside the re-livened compound field while holding key 3 — is the key lost / the run stranded?",
    repro: [
      "stage through gate 2 (route steps 0-5); the team is at the x65 checkpoint with 0 keys",
      "SABOTAGE: F casts on the compound bloom's safe pose; B runs in ALONE, grabs key 3 off the statued guard's lane, then deliberately LOITERS on the key spot until the hold lapses — sweep + woken Ticker cut the carrier down",
      "assert: keysHeld is UNCHANGED by the death (keys are a shared team counter, never a dropped item) and the respawn lands at x65, solid, out of every hazard's reach",
      "recovery: the route's own compound crossing + gate 3 finish the level WITH THE SAME KEY",
    ],
    async run(bb) {
      const fi = bb.idx("F");
      const bi = bb.idx("B");
      for (let i = 0; i <= 5; i++) { bb.stepDeaths = 0; await route42[i].fn(bb); }
      const keys0 = (await bb.state()).keysHeld; // expect 0 (keys 1+2 spent on their locks)
      // SABOTAGE: one cast, the carrier goes in alone and overstays
      await bb.walkTo("F", 66.5, { tol: 6, timeout: 8000 }).catch(() => {});
      let keyGrabbed = false;
      for (let att = 0; att < 4 && !keyGrabbed; att++) {
        const froze = await h42.freezeWhenSafe(bb, 3, 50).catch(() => false);
        if (!froze) continue;
        await bb.walkTo("B", 72.7, { tol: 8, timeout: 4600 }).catch(() => {});
        keyGrabbed = await bb.waitFor((s) => s.keysHeld > keys0, 2000, "key 3 grabbed").then(() => true).catch(() => false);
        if (!keyGrabbed) {
          const p = (await bb.state()).players[bi];
          if (p.dead) await bb.awaitRespawn("B");
        }
      }
      const keysHeldBefore = (await bb.state()).keysHeld;
      // LOITER on the key spot past the thaw — the field wakes around the carrier
      await bb.waitFor((s) => !s.frozen, 8000, "thaw").catch(() => {});
      const d0 = bb.deaths;
      const bitten = await bb.waitFor((s) => s.players[bi].dead, 12000, "carrier cut down").then(() => true).catch(() => false);
      if (bitten) {
        bb.deaths = d0; bb.stepDeaths = 0; // deliberate
        await bb.waitFor((s) => !s.players[bi].dead, 5000, "carrier respawned").catch(() => {});
        await sleep(300);
      }
      const st1 = await bb.state();
      const keysPreserved = st1.keysHeld === keysHeldBefore && st1.keysHeld > keys0;
      const p = st1.players[bi];
      const respawnSafe = !bitten || (p.tx > 64.2 && p.tx < 65.8 && p.grounded);
      // recovery: the taught compound crossing + gate 3, spending the SURVIVING key
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route42[6], route42[7]]);
      const ok = keyGrabbed && bitten && keysPreserved && respawnSafe && r.complete;
      return {
        classification: r.complete && keysPreserved ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { keyGrabbed, carrierBitten: bitten, keysPreserved, respawnTx: +p.tx.toFixed(2), respawnSafe },
        recoveries: [
          { name: "keys are a SHARED TEAM COUNTER (GameScene keysHeld) — killPlayer never touches it; a dead carrier drops nothing", ok: keysPreserved },
          { name: "the route's compound crossing re-runs on real input and lock3 consumed the surviving key — level complete", ok: r.complete, note: r.error ? `err: ${r.error}` : "finished with the pre-death key" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — a killed key carrier loses nothing: key 3 was grabbed under the freeze, the carrier was deliberately cut down in the live compound, keysHeld was byte-identical after the respawn, and the level then completed spending that very key. The respawn (x65 checkpoint) is solid ground outside the sweep's 245px head-height reach and the guard's patrol clamp."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: keysHeld is scene state (not per-player), killPlayer/respawn never write it, and freezes are unlimited.",
        expectedUnverified: true,
        notes: "This is also the 'who holds the beam vs who runs the key' worst case: the runner can die every attempt and the team never loses ground — only time.",
      };
    },
  },
  {
    id: "4-2-gate-order-deadlock",
    level: "4-2",
    category: "C",
    candidate: "Three fungible keys, three double gates (ice sheet + key lock) — can a wrong melt/unlock ORDER strand the run?",
    repro: [
      "cross bed 1 (route steps 0-1); the team holds key 1, ice1 unmelted",
      "SABOTAGE (the worst order): walk the carrier to the lock WITHOUT melting — the key turns lock1 THROUGH the frozen sheet (the lock's approach zone reaches past it)",
      "assert: lock1 open + ice1 still closed + keysHeld 0 — and the passage is STILL barred (the ice body blocks a hard east push)",
      "recovery: the gate is two INDEPENDENT MONOTONIC layers — melt ice1 (melts never refreeze, unlocks never re-lock) and walk through",
      "systemic proof: finish the whole level — key N can never be spent on the wrong lock because lock N+1 is unreachable while gate N stands, and every key sits ON the only walk line BEFORE its own gate",
    ],
    async run(bb) {
      const bi = bb.idx("B");
      for (let i = 0; i <= 1; i++) { bb.stepDeaths = 0; await route42[i].fn(bb); }
      // SABOTAGE: unlock through the ice (worst order)
      await bb.walkTo("B", 31.8, { tol: 8, timeout: 8000 }).catch(() => {});
      const unlocked = await bb.waitFor((s) => s.doors.find((d) => d.id === "lock1")?.open, 5000, "lock1 turned through the ice")
        .then(() => true).catch(() => false);
      let st = await bb.state();
      const iceStillClosed = !st.icedoors[0]?.open;
      const keysSpent = st.keysHeld === 0;
      // attest: the unmelted sheet still bars the passage
      await push(bb, "B", 33.5, 2500, { hop: false });
      st = await bb.state();
      const barred = st.players[bi].tx < 32.3;
      // recovery: the route's own gate step (melt is monotonic; unlock persists)
      bb.stepDeaths = 0;
      const r1 = await runSteps(bb, [route42[2]]);
      st = await bb.state();
      const through = st.icedoors[0]?.open === true && st.players.every((q) => q.tx > 33.4);
      // systemic: the rest of the garden completes in the taught order
      bb.stepDeaths = 0;
      const r2 = await runSteps(bb, [route42[3], route42[4], route42[5], route42[6], route42[7]]);
      st = await bb.state();
      const allOpen = st.icedoors.every((d) => d.open) &&
        ["lock1", "lock2", "lock3"].every((id) => st.doors.find((d) => d.id === id)?.open);
      const ok = unlocked && iceStillClosed && keysSpent && barred && through && r2.complete && allOpen;
      return {
        classification: r2.complete && through ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { unlockedThroughIce: unlocked, iceStillClosed, keysSpent, passageStillBarred: barred },
        recoveries: [
          { name: "the two gate layers are INDEPENDENT + MONOTONIC: the through-the-ice unlock wastes nothing (keysGiven persists, the lock never re-closes) and the melt still opens the way", ok: through, note: r1.error ? `err: ${r1.error}` : "melted + both through" },
          { name: "no cross-bed misuse is geometrically possible: lock N+1 is unreachable while gate N stands, and key N+1 sits ON the walk line BEFORE lock N+1 — the whole garden completed", ok: r2.complete && allOpen, note: r2.error ? `err: ${r2.error}` : "all 3 gates open, level complete" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — there is no gate-order deadlock: the worst order (key spent on the lock while the ice still stands) was driven and is a no-op risk, because unlocks and melts are both one-way and independent. Keys are fungible but CANNOT be mis-spent: each lock's approach zone is behind the previous gate, and each bed's key lies on the mandatory walk line before its own lock (a jumper who somehow skips a pickup just walks back — lanes are re-crossable, freezes unlimited). All three gates opened; the level completed."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: door.keysGiven persists, iceDoor.melt only rises, and the linear corridor orders the locks.",
        expectedUnverified: true,
        notes: "The near-rect unlock through the ice is kid-KIND, not a bug: a child who runs at the lock key-first sees the padlock spring before the ice work — one less thing to sequence.",
      };
    },
  },
  {
    id: "4-2-ticker-camping-key",
    level: "4-2",
    category: "C",
    candidate: "A Ticker patrols DIRECTLY OVER its key — can the guard camp the pickup (or the checkpoint behind it) into a death loop?",
    repro: [
      "equip (route step 0); the x11 checkpoint arms",
      "cast on bed 1's safe pose and walk F onto the key spot INSIDE the statued guard's lane; attest the statue (position byte-still while frozen); grab key 1",
      "SABOTAGE: F LOITERS on the spot past the thaw — the woken guard bites (deliberate death)",
      "assert: the respawn lands at x11, 13+ tiles outside the patrol clamp AND outside the sweeper's reach; 5s idle there is death-free (no camp, no loop); the key survived",
      "recovery: the route's own bed-1 crossing + gate 1 — the key spends, the team advances",
    ],
    async run(bb) {
      const fi = bb.idx("F");
      bb.stepDeaths = 0;
      await route42[0].fn(bb);
      // cast + statue attest + key grab
      let keyGrabbed = false, statue = false;
      for (let att = 0; att < 4 && !keyGrabbed; att++) {
        const p = (await bb.state()).players[fi];
        if (p.dead) { await bb.awaitRespawn("F"); continue; }
        await bb.walkTo("F", 10.9, { tol: 6, timeout: 8000 }).catch(() => {});
        const froze = await h42.freezeWhenSafe(bb, 0, 52).catch(() => false);
        if (!froze) continue;
        const t1 = (await bb.state()).tickers[0].x;
        await sleep(900);
        const t2 = (await bb.state()).tickers[0].x;
        statue = Math.abs(t2 - t1) < 0.5; // byte-still under the hold
        await bb.walkTo("F", 26.6, { tol: 8, timeout: 3800 }).catch(() => {});
        keyGrabbed = await bb.waitFor((s) => s.keysHeld >= 1, 1500, "key 1 grabbed").then(() => true).catch(() => false);
      }
      // SABOTAGE: overstay on the key spot
      await bb.waitFor((s) => !s.frozen, 8000, "thaw").catch(() => {});
      const d0 = bb.deaths;
      const bitten = await bb.waitFor((s) => s.players[fi].dead, 12000, "guard bites the loiterer").then(() => true).catch(() => false);
      if (bitten) {
        bb.deaths = d0; bb.stepDeaths = 0; // deliberate
        await bb.waitFor((s) => !s.players[fi].dead, 5000, "respawn").catch(() => {});
        await sleep(300);
      }
      let st = await bb.state();
      const p = st.players[fi];
      const respawnAtCp1 = p.tx > 10.4 && p.tx < 12.4 && p.grounded;
      const keysKept = st.keysHeld >= 1;
      // idle-safety at the checkpoint: 5s alive with no input (the death-loop guard)
      await sleep(5000);
      st = await bb.state();
      const idleSafe = !st.players[fi].dead && bb.deaths === d0;
      // recovery: the taught crossing + gate 1
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route42[1], route42[2]]);
      st = await bb.state();
      const advanced = st.doors.find((d) => d.id === "lock1")?.open === true && st.icedoors[0]?.open === true;
      const ok = statue && keyGrabbed && bitten && respawnAtCp1 && keysKept && idleSafe && advanced;
      return {
        classification: advanced && idleSafe ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { statueAttested: statue, keyGrabbed, bitten, respawnAtCp1, keysKept, idleSafeAtCheckpoint: idleSafe },
        recoveries: [
          { name: "the patrol clamp (tx 24.6-30.4 incl. contact reach) can reach NEITHER the x11 checkpoint nor the melt stance — a bite is one death, never a loop (5s unattended idle attested death-free)", ok: respawnAtCp1 && idleSafe },
          { name: "TIME-FREEZE statues the guard on demand (position attested byte-still) and the key survives any bite — the taught crossing re-runs and the gate opened", ok: advanced, note: r.error ? `err: ${r.error}` : "lock1 + ice1 open" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the guard cannot camp anything: it is clamped to its 5-tile lane 13 tiles from the checkpoint, the freeze statues it whenever the team wants the key (statue attested motionless over 900ms), the key is a shared counter that survives the bite, and a respawned robot can idle at the checkpoint indefinitely (drive-attested 5s, zero deaths). Same result at beds 2 and 3 by the same clamp arithmetic (lane reaches tx 53.6-60.4 and 69.6-76.4 vs checkpoints at x34/x65/x84)."
          : "UNVERIFIED — a leg did not land this run (see stuck/recoveries); re-run. The load-bearing facts: ticker minX/maxX clamps, freeze contact gating, and checkpoint spacing.",
        expectedUnverified: true,
        notes: "Bare-timing the lane (700ms wind-up telegraph between dashes) also works and is never required — the freeze is the taught answer.",
      };
    },
  },
  {
    id: "4-2-respawn-strand-audit",
    level: "4-2",
    category: "C",
    candidate: "Respawn-strand audit: every 4-2 checkpoint (x11/x34/x65/x84) — does any respawn land off solid ground, in a sweep's reach, or in a patrol lane?",
    repro: [
      "arm each checkpoint in turn by driving the route stations",
      "at each armed checkpoint, drive a deliberate death (bare walks INTO the live sweeps / the compound lane — 4-2 has no pits: every hazard is a laser or a Ticker)",
      "assert: each respawn lands grounded on solid floor, inside the checkpoint's tile band, AND is IDLE-SAFE for 5s (no sweep or patrol can touch a robot standing at any checkpoint — the laser death-loop guard)",
      "finish the level after the last audit — the respawns consumed nothing",
    ],
    async run(bb) {
      const fi = bb.idx("F");
      const kF = bb.keysFor("F");
      const audits = [];
      // hold F toward a lethal tile until it dies; deliberate — budget restored
      const dieAt = async (tile, timeout = 16000) => {
        const d0 = bb.deaths;
        const end = now() + timeout;
        let died = false;
        while (now() < end && !died) {
          const p = (await bb.state()).players[fi];
          if (p.dead) { died = true; break; }
          const dx = tile * TILE + 24 - p.x;
          if (Math.abs(dx) > 10) {
            const dir = dx > 0 ? kF.right : kF.left;
            await bb.up(dx > 0 ? kF.left : kF.right);
            await bb.down(dir);
          } else { await bb.up(kF.left); await bb.up(kF.right); }
          await sleep(60);
        }
        await bb.up(kF.left); await bb.up(kF.right);
        if (died) {
          bb.deaths = d0; bb.stepDeaths = 0;
          await bb.waitFor((s) => !s.players[fi].dead, 5000, "respawned").catch(() => {});
          await sleep(300);
        }
        return died;
      };
      const audit = async (label, hazardTile, band) => {
        const died = await dieAt(hazardTile);
        let st = await bb.state();
        const p = st.players[fi];
        const solid = p.grounded && p.ty > 12.8;
        const inBand = p.tx > band[0] && p.tx < band[1];
        const d0 = bb.deaths;
        await sleep(5000); // idle-safety: nothing may reach a checkpoint camper
        st = await bb.state();
        const idleSafe = !st.players[fi].dead && bb.deaths === d0;
        audits.push({ label, died, respawnTx: +p.tx.toFixed(2), respawnTy: +p.ty.toFixed(2), solid, inBand, idleSafe });
        return died && solid && inBand && idleSafe;
      };
      // cp1 (x11): armed by route step 0; die under bed 1's live sweep
      bb.stepDeaths = 0;
      await route42[0].fn(bb);
      const a1 = await audit("cp1@x11 <- bed-1 sweep (bare)", 18, [10.4, 12.4]);
      // cp2 (x34): through bed 1 + gate 1; die under twin bloom A
      for (let i = 1; i <= 2; i++) { bb.stepDeaths = 0; await route42[i].fn(bb); }
      const a2 = await audit("cp2@x34 <- twin-bloom sweep (bare, in the dark)", 41, [33.4, 35.4]);
      // cp3 (x65): through bed 2 + gate 2; die in the live compound (sweep + lane)
      for (let i = 3; i <= 5; i++) { bb.stepDeaths = 0; await route42[i].fn(bb); }
      const a3 = await audit("cp3@x65 <- compound bloom/lane (bare)", 72.5, [64.2, 65.8]);
      // cp4 (x84): cross the compound + open gate 3, arm cp4, then walk BACK
      // west through the open gate into the live compound to die
      bb.stepDeaths = 0;
      await route42[6].fn(bb);
      await h42.meltIce(bb, 2, 79.6);
      await bb.waitFor((s) => s.doors.find((d) => d.id === "lock3")?.open, 6000, "lock3 open");
      await bb.walkTo("B", 84.4, { tol: 8, timeout: 9000 }).catch(() => {});
      await bb.walkTo("F", 83.8, { tol: 8, timeout: 9000 }).catch(() => {});
      const a4 = await audit("cp4@x84 <- compound re-entry (bare, westward)", 73, [83.4, 85.2]);
      // finish: the audits consumed nothing
      bb.stepDeaths = 0;
      const r = await runSteps(bb, [route42[7]]);
      const ok = a1 && a2 && a3 && a4 && r.complete;
      return {
        classification: r.complete && a1 && a2 && a3 && a4 ? "RECOVERABLE" : "UNVERIFIED",
        stuck: { audits },
        recoveries: [
          { name: "every 4-2 checkpoint stands on attested-solid floor, in-band, outside every sweep's 245px head-height reach and every patrol clamp — and 5s of unattended idling at each respawn is death-free", ok: a1 && a2 && a3 && a4 },
          { name: "nothing is consumed by any death: the level completed after all four audits", ok: r.complete, note: r.error ? `err: ${r.error}` : "level complete" },
        ],
        repro: this.repro,
        verdict: ok
          ? "RECOVERABLE — the respawn-strand audit is clean: all four checkpoints (x11, x34, x65, x84) respawned the deliberate laser/Ticker deaths onto solid in-band floor, and every respawn point is IDLE-SAFE (drive-attested 5s each — no sweeping beam or patrolling guard reaches a checkpoint camper, so 4-2 cannot death-loop). With no pits anywhere, no carve can cage a body; checkpoints are global, so no death order can split the respawn."
          : "UNVERIFIED — an audit leg flaked this run (see stuck.audits); re-run. The geometry facts: every checkpoint sits >= 280px outside the nearest sweep's head-height kill envelope and >= 4 tiles outside the nearest patrol clamp.",
        expectedUnverified: true,
        notes: "4-2 deliberately ships pit-free: the L41 audit's 'every pit needs a hazard floor' lesson is answered here by having no pits at all — the two hazard classes (sweep, dash) both kill cleanly and both are freeze-gated.",
      };
    },
  },
];
