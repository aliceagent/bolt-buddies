// Build the self-contained SFX palette-audition page from public/sfx/samples/.
// Reads every <name>_<a|b|c>.wav, analyzes it (duration / peak / brightness),
// embeds it as a data URI, and splices metadata into sfx_audition_template.html.
//
//   node tools/gen_sfx_audition.mjs [outfile]
//
// Default outfile: sfx_audition.build.html (gitignored). Publish that via the
// Artifact tool. Locked picks (the director's earlier choices) are seeded so the
// page opens showing them; sounds without a seed render as "new / undecided".

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIR = path.join(ROOT, "public", "sfx", "samples");
const TEMPLATE = path.join(HERE, "sfx_audition_template.html");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "sfx_audition.build.html"));

// play order + human label + one-line intent + isNew (this round's probes)
const SOUNDS = [
  ["jump",         "Player hop",       "short bouncy robot hop blip", false],
  ["land",         "Player landing",   "small robot feet, soft thud", false],
  ["stomp",        "Ground stomp",     "heavy satisfying chunky impact", false],
  ["reel",         "Cable reel",       "small motor reeling a cable in", true],
  ["zip",          "Grapple zip",      "grappling-hook launch, taut cable whoosh", false],
  ["respawn",      "Rebuild / respawn","bright rebuild power-up sparkle, hopeful", true],
  ["squish",       "Bug squish",       "comic squish pop, cartoon, harmless", false],
  ["rollerAlert",  "Enemy alert",      "robot alert two-note, rising alarm", true],
  ["craneSlam",    "Crane slam",       "giant crane arm slam, heavy metal impact", true],
  ["magnetOn",     "Magnet engage",    "electromagnet hum engaging", true],
  ["core",         "Data-core pickup", "collect a glowing energy core, bright happy", false],
  ["coresFanfare", "All cores fanfare","all cores collected — triumphant flourish", true],
  ["door",         "Lab door opens",   "large door sliding open, mechanical rumble", false],
  ["checkpoint",   "Checkpoint",       "gentle rising three-note confirm", false],
  ["die",          "Power-down",       "comic deflate / power-down, not gory", false],
  ["menuSelect",   "Menu confirm",     "pleasant UI confirm blip", false],
];

const STYLES = [
  ["a", "Cute chunky",  "rounded, toy-like, friendly — soft synth + light foley"],
  ["b", "Sleek hi-tech","clean digital/robotic UI beeps + whirs, futuristic"],
  ["c", "Tactile foley","real-world material sounds — metal, springs, clicks"],
];

// the director's locked round-1 picks (soft=A / crisp=B / mechanical=C)
const PICKS = {
  jump:"b", land:"a", stomp:"b", zip:"c", squish:"b", core:"a",
  door:"c", checkpoint:"b", die:"c", menuSelect:"c",
};

function parseWav(buf){
  let off=12, fmt=null, dataOff=null, dataLen=0;
  while(off+8<=buf.length){
    const id=buf.toString("ascii",off,off+4), sz=buf.readUInt32LE(off+4);
    if(id==="fmt ") fmt={channels:buf.readUInt16LE(off+10),sampleRate:buf.readUInt32LE(off+12),bitsPerSample:buf.readUInt16LE(off+22)};
    else if(id==="data"){ dataOff=off+8; dataLen=sz; }
    off+=8+sz+(sz&1);
  }
  const bytesPer=fmt.bitsPerSample/8, frames=Math.floor(dataLen/(bytesPer*fmt.channels));
  const s=new Float64Array(frames);
  for(let i=0;i<frames;i++) s[i]=buf.readInt16LE(dataOff+i*fmt.channels*bytesPer)/32768;
  return { fmt, s };
}
function analyze(s,sr){
  let peak=0, zc=0;
  for(let i=0;i<s.length;i++){ const a=Math.abs(s[i]); if(a>peak)peak=a; if(i>0&&((s[i]>=0)!==(s[i-1]>=0)))zc++; }
  return { durMs:(s.length/sr)*1000, zcr:zc/(s.length/sr), peakDb:20*Math.log10(peak) };
}
const brightWord=(z)=> z<1200?"deep": z<2200?"warm": z<4000?"mid": z<6500?"bright":"crisp";

// mode: default renders only the sounds still needing an answer (no locked pick);
// --all renders the full 16 with locked picks pre-seeded.
const MODE = process.argv.includes("--all") ? "all" : "remaining";
const LABELS = Object.fromEntries(SOUNDS.map(([n,label]) => [n, label]));
const RENDER = MODE === "all" ? SOUNDS : SOUNDS.filter(([n]) => !PICKS[n]);
const SEED   = MODE === "all" ? PICKS : {};
const LOCKED = MODE === "all" ? {} : PICKS;
const LOCKMETA = Object.fromEntries(Object.keys(LOCKED).map(n => [n, LABELS[n]]));
const LEDE = MODE === "all"
  ? "This is the full set — your <b>10 locked picks</b> (coloured tag) plus the <b>6 new probes</b>. "
    + "Play a column to hear a whole style, change anything, then copy your decision. "
    + "Every clip is the real 44.1&nbsp;kHz WAV, normalized to −4.5&nbsp;dBFS."
  : "Just the <b>" + RENDER.length + " sounds still to decide</b> — one per sound-family the core set didn't cover. "
    + "Play the three columns to compare styles, then <b>lock a winner for each</b>. Your 10 earlier picks are "
    + "kept below and still count toward the final decision. Every clip is the real 44.1&nbsp;kHz WAV, −4.5&nbsp;dBFS.";

const DATA={}, AUDIO={}; const warn=[];
for(const [name] of RENDER){
  for(const [v] of STYLES){
    const key=`${name}_${v}`, file=path.join(DIR,`${key}.wav`);
    let buf; try{ buf=await fs.readFile(file); }catch{ warn.push(`MISSING ${key}.wav`); continue; }
    const { fmt, s }=parseWav(buf); const a=analyze(s,fmt.sampleRate);
    DATA[key]={ durMs:Math.round(a.durMs), zcr:Math.round(a.zcr), bright:brightWord(a.zcr) };
    AUDIO[key]="data:audio/wav;base64,"+buf.toString("base64");
    if(fmt.sampleRate!==44100) warn.push(`${key}: ${fmt.sampleRate}Hz (want 44100)`);
    if(a.peakDb>-2.5||a.peakDb<-7) warn.push(`${key}: peak ${a.peakDb.toFixed(1)}dB (want -3..-6)`);
  }
}

const tpl=await fs.readFile(TEMPLATE,"utf8");
const html=tpl
  .replace("/*__SOUNDS__*/",JSON.stringify(RENDER))
  .replace("/*__STYLES__*/",JSON.stringify(STYLES))
  .replace("/*__DATA__*/",JSON.stringify(DATA))
  .replace("/*__AUDIO__*/",JSON.stringify(AUDIO))
  .replace("/*__PICKS__*/",JSON.stringify(SEED))
  .replace("/*__LOCKED__*/",JSON.stringify(LOCKED))
  .replace("/*__LOCKMETA__*/",JSON.stringify(LOCKMETA))
  .replace("/*__LEDE__*/",LEDE);
await fs.writeFile(OUT,html);

const kb=Math.round((await fs.stat(OUT)).size/1024);
console.log(`  mode: ${MODE} · ${Object.keys(AUDIO).length} clips embedded · ${RENDER.length} sounds × ${STYLES.length} styles`);
console.log(`  wrote ${OUT} (${kb} KB)`);
if(warn.length){ console.log("  ⚠ warnings:"); warn.forEach(w=>console.log("     "+w)); }
else console.log("  ✓ all clips 44.1kHz, peaks in -3..-6 dBFS");
