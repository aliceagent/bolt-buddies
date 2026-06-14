import { useState, useEffect, useRef, useCallback } from "react";

/* ============ STAGWELL — AI Voice Assistant Demo ============ */

const INK = "#10173A";
const INK_SOFT = "#2A3358";
const PAPER = "#F7F8FC";
const CORAL = "#F96167";
const CORAL_DEEP = "#E04550";
const ICE = "#CADCFC";
const GREEN = "#2BB673";
const MUTED = "#7C84A3";
const BUBBLE = "#EDEFF6";

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/* ---------------- Scenario scripts ---------------- */
export const SCENARIOS = [
  {
    id: "scam",
    caller: "\u201CSocial Security Admin\u201D",
    number: "+1 (202) 555-0186",
    sub: "Spoofed number · High-risk pattern",
    badge: "Scam blocked",
    badgeColor: "#C0262E",
    badgeBg: "#FDECEC",
    icon: "⚠️",
    transcript: [
      { who: "ai", text: "Hello, you've reached Jonathan's assistant. Who's calling?" },
      { who: "caller", text: "This is Officer Daniels with the Social Security Administration. Jonathan's Social Security number has been suspended due to suspicious activity. He must verify his details immediately or face arrest." },
      { who: "sys", text: "🚨 Scam detected: SSA impersonation · spoofed government number" },
      { who: "ai", text: "The SSA doesn't suspend Social Security numbers, doesn't call to threaten arrest, and never asks for verification by phone. This is a documented scam." },
      { who: "caller", text: "Ma'am, this is a federal matter. He can resolve it today with payment via gift ca—" },
      { who: "ai", text: "This call has been recorded and will be reported to the FTC. Do not call this number again." },
      { who: "sys", text: "Stagwell ended the call · 0:36 · No information disclosed" },
    ],
    summary: {
      title: "SSA impersonation scam — shut down",
      text: "A spoofed \u201Cgovernment\u201D caller claimed your Social Security number was suspended and demanded gift-card payment. Stagwell identified the script instantly, disclosed nothing, and ended the call.",
      details: [
        ["Scam type", "Government impersonation"],
        ["Tactic", "Arrest threat + gift cards"],
        ["Your data shared", "None"],
      ],
      actions: [
        { icon: "⛔", label: "Block this number", confirm: "Number blocked" },
        { icon: "🚩", label: "Report to FTC", confirm: "Report filed" },
        { icon: "💬", label: "Warn family group", confirm: "Alert sent on WhatsApp" },
      ],
    },
  },
  {
    id: "doctor",
    caller: "Dr. Shapiro's Office",
    number: "+65 6225 8841",
    sub: "Singapore · In your contacts",
    badge: "Appointment",
    badgeColor: "#1A6FB5",
    badgeBg: "#E7F1FB",
    icon: "🩺",
    transcript: [
      { who: "ai", text: "Hi, this is Stagwell, Jonathan's assistant. He's unavailable right now — how can I help?" },
      { who: "caller", text: "Hi, this is Rivka from Dr. Shapiro's office. We need to move Jonathan's Thursday 9 AM appointment — the doctor is out that morning." },
      { who: "sys", text: "Checking Jonathan's calendar…" },
      { who: "ai", text: "Thanks for the heads-up. Thursday afternoon is fully booked for him. Could you do Tuesday morning instead?" },
      { who: "caller", text: "Let me see… yes, we have Tuesday at 10:30." },
      { who: "ai", text: "Tuesday 10:30 works — his calendar is clear until noon. I'll pencil it in, pending his confirmation." },
      { who: "caller", text: "Perfect, we'll mark it as tentative. Thank you!" },
      { who: "sys", text: "Call ended · 1:12 · Tentative event created" },
    ],
    summary: {
      title: "Appointment rescheduled",
      text: "Dr. Shapiro's office cancelled Thursday 9:00 AM. Stagwell checked your calendar and tentatively rebooked you for Tuesday 10:30 AM.",
      details: [
        ["Old time", "Thu · 9:00 AM"],
        ["New time", "Tue · 10:30 AM (tentative)"],
        ["Spoke with", "Rivka, front desk"],
      ],
      actions: [
        { icon: "📅", label: "Confirm on calendar", confirm: "Added to Google Calendar" },
        { icon: "📞", label: "Call office back", confirm: "Opening dialer…" },
      ],
    },
  },
  {
    id: "school",
    caller: "Maayan's School",
    number: "+65 6339 0233",
    sub: "Maayan (daughter) · VIP escalation",
    badge: "School · Escalated",
    badgeColor: "#B7791F",
    badgeBg: "#FBF3E0",
    icon: "🏫",
    transcript: [
      { who: "ai", text: "Hello, you've reached Jonathan's assistant. How can I help?" },
      { who: "caller", text: "Hi, this is the school office. Jonathan's daughter Maayan isn't feeling well — nothing serious, but she should be picked up early today, by 2 PM." },
      { who: "sys", text: "⚡ VIP rule matched: Kids' school → notify Jonathan immediately" },
      { who: "ai", text: "I'm flagging this to Jonathan right now as urgent. To confirm: pickup by 2:00 PM today from the main office?" },
      { who: "caller", text: "Yes, the main office. She's resting in the nurse's room until then." },
      { who: "ai", text: "Got it. Jonathan has been notified, and he or his wife Sarah will be there by 2:00. Please call back immediately if anything changes." },
      { who: "caller", text: "Will do, thank you so much." },
      { who: "sys", text: "Call ended · 0:58 · Urgent alert sent to Jonathan" },
    ],
    summary: {
      title: "Early pickup needed — 2:00 PM",
      text: "Maayan (your daughter) isn't feeling well — nothing serious. The school asks that she be picked up from the main office by 2:00 PM. She's resting with the nurse meanwhile.",
      details: [
        ["Pickup by", "Today · 2:00 PM"],
        ["Where", "Main office"],
        ["Status", "Resting · not urgent care"],
      ],
      actions: [
        { icon: "📞", label: "Call school now", confirm: "Opening dialer…" },
        { icon: "💬", label: "WhatsApp Sarah (wife)", confirm: "Message sent to Sarah (wife)" },
        { icon: "⏰", label: "Reminder at 1:15 PM", confirm: "Reminder set for 1:15 PM" },
      ],
    },
  },
  {
    id: "insurance",
    caller: "Unknown Number",
    number: "+1 (800) 555-0142",
    sub: "Not in contacts · Would you have answered?",
    badge: "Worth a look · ~$3,000/yr",
    badgeColor: "#1E7F4F",
    badgeBg: "#E6F6EE",
    icon: "💰",
    transcript: [
      { who: "ai", text: "Hi, this is Stagwell, Jonathan's assistant. What's this regarding?" },
      { who: "caller", text: "Good afternoon! This is Dana from ClearCover Insurance. We're reaching out because drivers in Jonathan's area are overpaying significantly on car insurance." },
      { who: "sys", text: "Unsolicited — but possibly relevant: Jonathan's auto policy renews next month" },
      { who: "ai", text: "He doesn't take sales calls, but his policy is up for renewal soon, so let's see if this is worth his time. What exactly are you offering?" },
      { who: "caller", text: "Full coverage on both vehicles for $186 a month — most families we move over are paying $400 or more for the same coverage." },
      { who: "sys", text: "Price check: well below the ~$310/mo market average for comparable two-car coverage" },
      { who: "ai", text: "That's a genuinely competitive rate. Is ClearCover licensed in his state, and is that locked in or a teaser rate?" },
      { who: "caller", text: "Fully licensed, and the rate is locked for 12 months — no fees. The quote reference is CC-4471, valid 30 days, details at clearcover.com/quote." },
      { who: "ai", text: "Wonderful. Thank you for your time, Dana — this looks like a strong offer, and I'll recommend Jonathan review it before his renewal. He has everything he needs to follow up. Have a great day." },
      { who: "caller", text: "Thank you! We hope to hear from him." },
      { who: "sys", text: "Call ended · 1:24 · Quote vetted and captured" },
    ],
    summary: {
      title: "A call you'd have ignored just saved you money",
      text: "Without Stagwell, this unknown number gets declined. Instead, Stagwell vetted the caller, confirmed a legitimate licensed insurer, and captured a locked quote — right as your policy comes up for renewal.",
      details: [
        ["Quoted rate", "$186 / mo · both cars, full coverage"],
        ["Market average", "≈ $310 / mo comparable"],
        ["Your current rate", "≈ $440 / mo"],
        ["Estimated savings", "≈ $3,050 / year"],
        ["Quote ref", "CC-4471 · valid 30 days"],
      ],
      actions: [
        { icon: "🔗", label: "Open clearcover.com/quote", confirm: "Opening website…" },
        { icon: "📞", label: "Call Dana back", confirm: "Opening dialer…" },
        { icon: "📝", label: "Save quote to notes", confirm: "Saved to notes" },
      ],
    },
  },
  {
    id: "wrongnumber",
    caller: "Unknown Number",
    number: "+1 (305) 555-0119",
    sub: "Not in contacts · Miami, FL",
    badge: "Wrong number · Spanish",
    badgeColor: "#0E7C86",
    badgeBg: "#E4F5F6",
    icon: "🌐",
    transcript: [
      { who: "ai", text: "Hi, you've reached Jonathan's assistant. Who's calling?" },
      { who: "caller", lang: "Spanish", original: "¿Aló? ¿Está Marisol? Soy su tío Ernesto — la estoy llamando desde el aeropuerto.", text: "Hello? Is Marisol there? It's her uncle Ernesto — I'm calling from the airport." },
      { who: "sys", text: "Language detected: Spanish — switching · transcript will auto-translate" },
      { who: "ai", lang: "Spanish", original: "Hola, creo que hubo una equivocación. Aquí no hay ninguna Marisol — este es el número de Jonathan. Es probable que haya marcado un número equivocado.", text: "Hi, I think there's been a mix-up. There's no Marisol here — this is Jonathan's number. You've probably dialed a wrong number." },
      { who: "caller", lang: "Spanish", original: "Ay, perdón, disculpe la molestia. Voy a revisar el número. ¡Que tenga buen día!", text: "Oh, I'm so sorry for the trouble. I'll double-check the number. Have a great day!" },
      { who: "ai", lang: "Spanish", original: "No hay problema, no se preocupe. ¡Suerte encontrando a Marisol, y buen viaje!", text: "No problem at all, don't worry. Good luck finding Marisol — and safe travels!" },
      { who: "sys", text: "Caller hung up · 0:22 · Handled entirely in Spanish" },
    ],
    summary: {
      title: "Wrong number — resolved in Spanish",
      text: "A caller looking for \u201CMarisol\u201D reached your line by mistake. NewVoice detected Spanish, switched languages instantly, politely explained the mix-up, and the caller apologized and hung up. Zero interruption to you.",
      details: [
        ["Language", "Spanish · auto-detected"],
        ["Looking for", "\u201CMarisol\u201D — not a contact"],
        ["Outcome", "Caller apologized · hung up"],
        ["Your time saved", "~1 minute + the confusion"],
      ],
      actions: [
        { icon: "✅", label: "No action needed — dismiss", confirm: "Dismissed" },
        { icon: "⛔", label: "Block if it calls again", confirm: "Will auto-block on repeat" },
      ],
    },
  },
  {
    id: "wife",
    caller: "Sarah (wife)",
    number: "+65 9555 0172",
    sub: "VIP · Rule: Always connect",
    badge: "VIP · Connected you live",
    badgeColor: "#C2415A",
    badgeBg: "#FBEAEE",
    icon: "❤️",
    transcript: [
      { who: "ai", text: "Hi Sarah! Jonathan's heads-down right now — can I take a message, or is it urgent?" },
      { who: "caller", text: "Hi! No, I need to talk to him right now — it's about dinner and it can't wait." },
      { who: "sys", text: "⚡ VIP rule matched: Sarah (wife) → Always connect" },
      { who: "ai", text: "Of course — I'm alerting him right now. Stay on the line with me, this will just take a moment." },
      { who: "sys", text: "🔔 Urgent alert sent to Jonathan's phone and watch" },
      { who: "sys", text: "Jonathan picked up · joined the call" },
      { who: "user", text: "Hey love, I'm here — what's going on with dinner?" },
      { who: "caller", text: "The Goldbergs can do tonight instead of Thursday. Should I tell them yes?" },
      { who: "user", text: "Yes, definitely — tell them 7:00. I'll pick up wine on the way home." },
      { who: "sys", text: "NewVoice stepped back · call continued privately · 2:41" },
    ],
    summary: {
      title: "Sarah needed you — connected in 9 seconds",
      text: "Sarah (your wife) said it couldn't wait, so NewVoice applied her \u201CAlways connect\u201D rule: it kept her on the line, alerted you on phone and watch, and bridged you in the moment you picked up. Dinner with the Goldbergs moved to tonight at 7:00.",
      details: [
        ["VIP rule", "Sarah (wife) · Always connect"],
        ["Alert → pickup", "9 seconds"],
        ["Decision made", "Goldbergs dinner · tonight 7:00 PM"],
      ],
      actions: [
        { icon: "📅", label: "Add dinner · tonight 7:00 PM", confirm: "Added to Google Calendar" },
        { icon: "⏰", label: "Remind me: buy wine at 6:15", confirm: "Reminder set for 6:15 PM" },
      ],
    },
  },
];


/* Value generated by each handled call (for the stats page) */
const VALUE_BY_ID = {
  scam: { minutesSaved: 4, moneySaved: 0, moneyProtected: 1400, talkSeconds: 36, blocked: 1, escalations: 0, langs: [] },
  doctor: { minutesSaved: 6, moneySaved: 0, moneyProtected: 0, talkSeconds: 72, blocked: 0, escalations: 0, langs: [] },
  school: { minutesSaved: 3, moneySaved: 0, moneyProtected: 0, talkSeconds: 58, blocked: 0, escalations: 1, langs: [] },
  insurance: { minutesSaved: 5, moneySaved: 3050, moneyProtected: 0, talkSeconds: 84, blocked: 0, escalations: 0, langs: [] },
  wrongnumber: { minutesSaved: 1, moneySaved: 0, moneyProtected: 0, talkSeconds: 22, blocked: 0, escalations: 0, langs: ["Spanish"] },
  wife: { minutesSaved: 2, moneySaved: 0, moneyProtected: 0, talkSeconds: 161, blocked: 0, escalations: 1, langs: [] },
};

/* VIP suggestions adapt to the persona chosen in onboarding */
const VIP_PRESETS = {
  "Founder & parent": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "🏫", name: "Kids' school", rule: "Notify me immediately", on: true },
    { emoji: "🤝", name: "Co-founder", rule: "Urgent only", on: false },
    { emoji: "🩺", name: "Dr. Shapiro", rule: "Take a message", on: true },
  ],
  "Executive": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "🗂️", name: "Executive assistant", rule: "Always connect", on: true },
    { emoji: "👔", name: "Board chair", rule: "Urgent only", on: true },
    { emoji: "🏫", name: "Kids' school", rule: "Notify me immediately", on: true },
  ],
  "Freelancer": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "⭐", name: "Top client", rule: "Urgent only", on: true },
    { emoji: "✨", name: "New leads", rule: "Notify me immediately", on: true },
    { emoji: "🧾", name: "Accountant", rule: "Take a message", on: false },
  ],
  "Healthcare": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "🏥", name: "On-call hospital line", rule: "Always connect", on: true },
    { emoji: "🧑‍⚕️", name: "Patients", rule: "Take a message", on: true },
    { emoji: "💊", name: "Pharmacy", rule: "Take a message", on: false },
  ],
  "Sales": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "🔥", name: "Hot leads", rule: "Notify me immediately", on: true },
    { emoji: "📈", name: "Sales manager", rule: "Urgent only", on: true },
    { emoji: "🤝", name: "Existing customers", rule: "Take a message", on: true },
  ],
  "Real estate": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "🔑", name: "Active buyers", rule: "Notify me immediately", on: true },
    { emoji: "🏠", name: "Sellers & listings", rule: "Take a message", on: true },
    { emoji: "📋", name: "Title & escrow", rule: "Urgent only", on: false },
  ],
  "Creator": [
    { emoji: "👩", name: "Sarah (wife)", rule: "Always connect", on: true },
    { emoji: "🎬", name: "Manager / agent", rule: "Urgent only", on: true },
    { emoji: "💼", name: "Brand sponsors", rule: "Take a message", on: true },
    { emoji: "🎨", name: "Collaborators", rule: "Take a message", on: false },
  ],
  "Just busy": [
    { emoji: "👨‍👩‍👧", name: "Family", rule: "Always connect", on: true },
    { emoji: "💛", name: "Close friends", rule: "Take a message", on: true },
    { emoji: "💼", name: "Boss", rule: "Urgent only", on: false },
    { emoji: "🩺", name: "Doctor's office", rule: "Take a message", on: true },
  ],
};

/* ---------------- Small shared components ---------------- */
function Btn({ children, onClick, kind = "primary", style = {}, disabled }) {
  const base = {
    fontFamily: FONT,
    fontWeight: 600,
    fontSize: 17,
    borderRadius: 18,
    padding: "17px 20px",
    width: "100%",
    border: "none",
    cursor: "pointer",
    transition: "transform .12s ease, opacity .2s",
    opacity: disabled ? 0.5 : 1,
  };
  const kinds = {
    primary: { background: `linear-gradient(135deg, #FF8A7A 0%, ${CORAL} 45%, ${CORAL_DEEP} 100%)`, color: "#fff", boxShadow: "0 10px 26px rgba(249,97,103,.4), inset 0 1px 0 rgba(255,255,255,.25)" },
    dark: { background: INK, color: "#fff" },
    ghost: { background: "transparent", color: MUTED, fontWeight: 500 },
    soft: { background: "#fff", color: INK, border: "1.5px solid #E3E7F2" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...kinds[kind], ...style }}
      onTouchStart={(e) => (e.currentTarget.style.transform = "scale(.97)")}
      onTouchEnd={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function Logo({ size = 44, light = false }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: light ? "rgba(255,255,255,.12)" : `linear-gradient(135deg, ${CORAL}, ${CORAL_DEEP})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: light ? "none" : "0 8px 24px rgba(249,97,103,.35)",
      }}
    >
      <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none">
        <path d="M4 12c0-1.5.8-2.5 2-2.5s2 1 2 2.5-.8 2.5-2 2.5-2-1-2-2.5Z" fill="#fff" opacity=".55" />
        <path d="M10 12c0-3 1-5 2-5s2 2 2 5-1 5-2 5-2-2-2-5Z" fill="#fff" />
        <path d="M16 12c0-1.5.8-2.5 2-2.5s2 1 2 2.5-.8 2.5-2 2.5-2-1-2-2.5Z" fill="#fff" opacity=".55" />
      </svg>
    </div>
  );
}

function Dots({ step, total }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === step ? 22 : 7,
            height: 7,
            borderRadius: 4,
            background: i === step ? CORAL : "#DDE2F0",
            transition: "all .3s ease",
          }}
        />
      ))}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 96,
        left: "50%",
        transform: "translateX(-50%)",
        background: INK,
        color: "#fff",
        fontFamily: FONT,
        fontSize: 14.5,
        fontWeight: 600,
        padding: "12px 20px",
        borderRadius: 100,
        boxShadow: "0 10px 30px rgba(16,23,58,.35)",
        whiteSpace: "nowrap",
        zIndex: 60,
        animation: "stagToast .25s ease",
      }}
    >
      ✓ {msg}
    </div>
  );
}

/* ---------------- Main App ---------------- */
export default function StagwellDemo() {
  const [screen, setScreen] = useState("welcome"); // welcome | ob1..ob5 | home | incoming | call | summary
  const [googleSheet, setGoogleSheet] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [role, setRole] = useState("Executive");
  const [callMe, setCallMe] = useState("Randy");
  const [aiName, setAiName] = useState("NewVoice");
  const [vips, setVips] = useState(VIP_PRESETS["Executive"].map((v) => ({ ...v })));
  const chooseRole = (r) => {
    setRole(r);
    setVips((VIP_PRESETS[r] || VIP_PRESETS["Just busy"]).map((v) => ({ ...v })));
  };
  const [prefs, setPrefs] = useState(["Family first", "Health appointments", "No sales calls"]);
  const [profile, setProfile] = useState({ phone: "+65 8123 4567", address: HOME_ADDRESS, sharePhone: "ask", shareAddress: "ask" });
  const [connected, setConnected] = useState({ whatsapp: false, calendar: false });
  const [connecting, setConnecting] = useState(null);
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [history, setHistory] = useState([]);
  const [viewIdx, setViewIdx] = useState(0);
  const [toast, setToast] = useState(null);
  const [interviewDone, setInterviewDone] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [openTaskIdx, setOpenTaskIdx] = useState(null);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [openArchivedIdx, setOpenArchivedIdx] = useState(null);
  const archiveTaskAt = (i) => {
    const t = tasks[i];
    if (!t) return;
    setArchivedTasks((a) => [{ ...t, archived: true, archivedAt: Date.now() }, ...a]);
    setTasks((arr) => arr.filter((_, j) => j !== i));
    setOpenTaskIdx(null);
    showToast("Task archived");
  };
  const [bubbleDismissed, setBubbleDismissed] = useState(false);
  const [interviewFrom, setInterviewFrom] = useState("ob");

  const scenario = SCENARIOS[scenarioIdx % SCENARIOS.length];

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1900);
  }, []);

  /* fake Google sign-in */
  const pickAccount = () => {
    setSigningIn(true);
    setTimeout(() => {
      setSigningIn(false);
      setGoogleSheet(false);
      setScreen("ob1");
    }, 1400);
  };

  const connect = (key) => {
    setConnecting(key);
    setTimeout(() => {
      setConnected((c) => ({ ...c, [key]: true }));
      setConnecting(null);
    }, 1500);
  };

  const startIncoming = (idx) => {
    if (typeof idx === "number") setScenarioIdx(idx);
    setScreen("incoming");
    if (navigator.vibrate) navigator.vibrate([400, 250, 400, 250, 400]);
  };

  const finishCall = (meta) => {
    setHistory((h) => [{ ...scenario, time: "Just now", actionsDone: {}, joined: !!(meta && meta.joined) }, ...h]);
    setViewIdx(0);
    setScenarioIdx((i) => i + 1);
    setScreen("summary");
  };

  const backHome = () => setScreen("home");

  const openCall = (i) => {
    setViewIdx(i);
    setScreen("summary");
  };

  /* ---------- shell ---------- */
  return (
    <div
      className="stagShell"
      style={{
        fontFamily: FONT,
        width: "100%",
        display: "flex",
        justifyContent: "center",
        background: "#0B1129",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes stagPulse { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.35);opacity:0} }
        @keyframes stagBreath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes stagRing { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg)} }
        @keyframes stagIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes stagToast { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }
        @keyframes stagWave { 0%,100%{height:6px} 50%{height:22px} }
        @keyframes stagSpin { to{transform:rotate(360deg)} }
        @keyframes stagFade { from{opacity:.15} to{opacity:1} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; margin: 0; }
        .stagShell { height: 100dvh; }
        @supports (height: 100svh) { .stagShell { height: 100svh; } }
        .stagCarousel { scrollbar-width: none; }
        .stagCarousel::-webkit-scrollbar { display: none; }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: 430,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          background: PAPER,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {screen === "welcome" && (
          <Welcome onGoogle={() => setGoogleSheet(true)} />
        )}
        {screen === "ob1" && <Ob1 role={role} setRole={chooseRole} callMe={callMe} setCallMe={setCallMe} aiName={aiName} setAiName={setAiName} next={() => setScreen("ob2")} />}
        {screen === "ob2" && <Ob2 vips={vips} setVips={setVips} role={role} next={() => setScreen("ob3")} back={() => setScreen("ob1")} />}
        {screen === "ob3" && <Ob3 prefs={prefs} setPrefs={setPrefs} next={() => setScreen("ob4")} back={() => setScreen("ob2")} />}
        {screen === "ob4" && (
          <Ob4 connected={connected} connecting={connecting} connect={connect} next={() => { setInterviewFrom("ob"); setScreen("interview"); }} back={() => setScreen("ob3")} />
        )}
        {screen === "ob5" && <Ob5 aiName={aiName} next={() => setScreen("home")} />}
        {screen === "interview" && (
          <Interview
            aiName={aiName}
            callMe={callMe}
            onFinish={() => {
              setInterviewDone(true);
              showToast("Preferences saved");
              setScreen(interviewFrom === "ob" ? "ob5" : "home");
            }}
            onSkip={() => setScreen(interviewFrom === "ob" ? "ob5" : "home")}
          />
        )}
        {screen === "home" && (
          <Home
            history={history}
            onOpen={openCall}
            onSimulate={startIncoming}
            showInterviewBubble={!interviewDone && !bubbleDismissed}
            onStartInterview={() => { setInterviewFrom("home"); setScreen("interview"); }}
            onDismissBubble={() => setBubbleDismissed(true)}
            onOpenStats={() => setScreen("stats")}
            onOpenTasks={() => setScreen("tasks")}
            onOpenPrefs={() => setScreen("prefs")}
            taskActive={tasks.length > 0}
            aiName={aiName}
          />
        )}
        {screen === "stats" && <Stats history={history} aiName={aiName} callMe={callMe} onBack={() => setScreen("home")} />}
        {screen === "prefs" && <PrefsScreen profile={profile} setProfile={setProfile} role={role} notify={showToast} onBack={() => setScreen("home")} />}
        {screen === "tasks" && (
          <TasksScreen
            tasks={tasks}
            archivedTasks={archivedTasks}
            aiName={aiName}
            onCalls={() => setScreen("home")}
            onArchive={archiveTaskAt}
            onOpenArchived={(i) => { setOpenArchivedIdx(i); setScreen("taskthread"); }}
            onNew={() => {
              const done = tasks.filter((t) => t.phase === "done");
              const kept = tasks.filter((t) => t.phase !== "done");
              if (done.length) {
                setArchivedTasks((a) => [...done.map((t) => ({ ...t, archived: true, archivedAt: Date.now() })), ...a]);
                showToast(done.length === 1 ? "Completed task archived" : "Completed tasks archived");
              }
              setTasks([...kept, { phase: "label", thread: [], scheduledAt: null, actionsDone: {} }]);
              setOpenTaskIdx(kept.length);
              setOpenArchivedIdx(null);
              setScreen("taskthread");
            }}
            onOpen={(i) => { setOpenTaskIdx(i); setOpenArchivedIdx(null); setScreen("taskthread"); }}
            onTryNow={(i) => {
              setTasks((arr) => arr.map((t, j) => (j === i ? { ...t, phase: "call2" } : t)));
              setOpenTaskIdx(i);
              setOpenArchivedIdx(null);
              setScreen("taskthread");
            }}
          />
        )}
        {screen === "taskthread" && (
          <TaskThread
            task={openArchivedIdx == null ? (tasks[openTaskIdx] || { phase: "label", thread: [], scheduledAt: null, actionsDone: {} }) : archivedTasks[openArchivedIdx]}
            setTask={openArchivedIdx == null ? (fn) => setTasks((arr) => arr.map((t, i) => (i === openTaskIdx ? (typeof fn === "function" ? fn(t) : fn) : t))) : (fn) => setArchivedTasks((a) => a.map((t, i) => (i === openArchivedIdx ? (typeof fn === "function" ? fn(t) : fn) : t)))}
            aiName={aiName}
            callMe={callMe}
            notify={showToast}
            profile={profile}
            setProfile={setProfile}
            onExit={() => { setOpenArchivedIdx(null); setScreen("tasks"); }}
          />
        )}
        {screen === "incoming" && (
          <Incoming
            scenario={scenario}
            aiName={aiName}
            onSend={() => setScreen("call")}
            onDismiss={() => setScreen("home")}
          />
        )}
        {screen === "call" && <LiveCall scenario={scenario} aiName={aiName} callMe={callMe} onDone={finishCall} />}
        {screen === "summary" && history[viewIdx] && (
          <Summary
            scenario={history[viewIdx]}
            entryTime={history[viewIdx].time}
            aiName={aiName}
            callMe={callMe}
            doneActions={history[viewIdx].actionsDone}
            onAction={(i, confirm) => {
              setHistory((h) => h.map((e, j) => (j === viewIdx ? { ...e, actionsDone: { ...e.actionsDone, [i]: true } } : e)));
              showToast(confirm);
            }}
            onClose={backHome}
            notify={showToast}
          />
        )}

        {/* Google sheet overlay */}
        {googleSheet && (
          <GoogleSheet signingIn={signingIn} onPick={pickAccount} onClose={() => setGoogleSheet(false)} />
        )}
        <Toast msg={toast} />
      </div>
    </div>
  );
}

/* ---------------- Screens ---------------- */

function Welcome({ onGoogle }) {
  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        background: "linear-gradient(180deg, #FFFFFF 0%, #F7F8FC 100%)",
        display: "flex",
        flexDirection: "column",
        padding: "0 28px",
        paddingTop: "max(env(safe-area-inset-top), 24px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 36px)",
        overflow: "hidden",
      }}
    >
      {/* soft ambient color washes */}
      <div style={{ position: "absolute", top: -120, right: -100, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,97,103,.14), rgba(249,97,103,0) 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 60, left: -130, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(202,220,252,.5), rgba(202,220,252,0) 70%)", pointerEvents: "none" }} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", position: "relative" }}>
        <div style={{ animation: "stagBreath 4s ease-in-out infinite" }}>
          <Logo size={88} />
        </div>
        <div style={{ marginTop: 30, color: INK, fontSize: 42, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1.05 }}>
          NewVoice
        </div>
        <div style={{ marginTop: 8, color: CORAL_DEEP, fontSize: 12.5, fontWeight: 700, letterSpacing: 3.5, textTransform: "uppercase" }}>
          by Stagwell
        </div>
        <div style={{ marginTop: 22, color: INK_SOFT, fontSize: 17.5, lineHeight: 1.55, maxWidth: 310 }}>
          Your calls, answered. A real secretary for your cell phone — it screens, schedules, and only interrupts you when it matters.
        </div>
        <div style={{ marginTop: 26, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {["Screens spam", "Books for you", "Escalates VIPs", "Speaks 50+ languages"].map((t) => (
            <div key={t} style={{ background: "#fff", border: "1px solid #E9EDF7", color: INK_SOFT, fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 100, boxShadow: "0 3px 10px rgba(16,23,58,.05)" }}>{t}</div>
          ))}
        </div>
      </div>

      <button
        onClick={onGoogle}
        style={{
          fontFamily: FONT,
          position: "relative",
          background: "#fff",
          border: "1px solid #E3E7F2",
          borderRadius: 18,
          padding: "17px 20px",
          fontSize: 17,
          fontWeight: 700,
          color: INK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          cursor: "pointer",
          boxShadow: "0 10px 28px rgba(16,23,58,.12)",
        }}
      >
        <GoogleG /> Continue with Google
      </button>
      <div style={{ position: "relative", textAlign: "center", color: MUTED, fontSize: 12.5, marginTop: 14 }}>
        Demo build · no account is created
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
    </svg>
  );
}

function GoogleSheet({ signingIn, onPick, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(8,11,30,.55)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          width: "100%",
          borderRadius: "22px 22px 0 0",
          padding: "20px 22px",
          paddingBottom: "max(env(safe-area-inset-bottom), 36px)",
          animation: "stagIn .25s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <GoogleG />
          <span style={{ fontSize: 15.5, fontWeight: 600, color: "#3c4043" }}>Sign in with Google</span>
        </div>
        <div style={{ height: 1, background: "#E8EAED", margin: "14px -22px" }} />
        <div style={{ fontSize: 14, color: "#5f6368", marginBottom: 14 }}>Choose an account to continue to <b>NewVoice</b></div>
        {signingIn ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 4px" }}>
            <div style={{ width: 22, height: 22, border: "3px solid #E8EAED", borderTopColor: "#4285F4", borderRadius: "50%", animation: "stagSpin .8s linear infinite" }} />
            <span style={{ fontSize: 15, color: "#3c4043" }}>Signing you in…</span>
          </div>
        ) : (
          <>
            <button onClick={onPick} style={accountRow}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#7C5CFF,#4285F4)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>R</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#202124" }}>Randy Duax</div>
                <div style={{ fontSize: 13, color: "#5f6368" }}>randy.duax@stagwell.com</div>
              </div>
            </button>
            <button onClick={onPick} style={accountRow}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#E8EAED", color: "#5f6368", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>＋</div>
              <div style={{ fontSize: 15, color: "#3c4043" }}>Use another account</div>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
const accountRow = {
  fontFamily: FONT,
  display: "flex",
  alignItems: "center",
  gap: 14,
  width: "100%",
  background: "none",
  border: "none",
  padding: "12px 4px",
  cursor: "pointer",
  borderRadius: 12,
};

/* ---------- Onboarding shell ---------- */
function ObShell({ step, title, sub, children, next, back, nextLabel = "Continue", nextDisabled }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 24px", paddingTop: "max(env(safe-area-inset-top), 20px)", paddingBottom: "max(env(safe-area-inset-bottom), 36px)", animation: "stagIn .3s ease", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", height: 44 }}>
        {back ? (
          <button onClick={back} style={{ fontFamily: FONT, background: "none", border: "none", fontSize: 15, color: MUTED, cursor: "pointer", padding: 0, fontWeight: 500 }}>← Back</button>
        ) : <div />}
        <div style={{ flex: 1 }} />
        <Dots step={step} total={5} />
        <div style={{ flex: 1 }} />
        <div style={{ width: 44 }} />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: INK, letterSpacing: -0.6, lineHeight: 1.15 }}>{title}</div>
        <div style={{ marginTop: 8, fontSize: 15.5, color: MUTED, lineHeight: 1.45 }}>{sub}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", marginTop: 20, paddingBottom: 12 }}>{children}</div>
      <Btn onClick={next} disabled={nextDisabled}>{nextLabel}</Btn>
    </div>
  );
}

function Ob1({ role, setRole, callMe, setCallMe, aiName, setAiName, next }) {
  const roles = ["Founder & parent", "Executive", "Freelancer", "Healthcare", "Sales", "Real estate", "Creator", "Just busy"];
  const nameOpts = ["Randy", "Mr. Duax"];
  const aiOpts = ["NewVoice", "Aria", "Max", "Tali"];
  return (
    <ObShell step={0} title="Welcome, Randy 👋" sub="Your assistant speaks on your behalf — tell it how to represent you." next={next} nextDisabled={!callMe.trim() || !aiName.trim()}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 18, border: "1px solid #EDF0F8", boxShadow: "0 6px 20px rgba(16,23,58,.05)" }}>
        <div style={fieldLabel}>Your name</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: INK, paddingBottom: 14, borderBottom: "1px solid #EEF0F8" }}>Randy Duax <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>· from Google</span></div>
        <div style={{ ...fieldLabel, marginTop: 16 }}>Which sounds most like you?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {roles.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(r)}>{r}</Chip>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 20, padding: 18, border: "1px solid #EDF0F8", boxShadow: "0 6px 20px rgba(16,23,58,.05)", marginTop: 12 }}>
        <div style={fieldLabel}>How should callers hear your name?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {nameOpts.map((n) => (
            <Chip key={n} active={callMe === n} onClick={() => setCallMe(n)}>{n}</Chip>
          ))}
        </div>
        <TextInput value={callMe} onChange={setCallMe} placeholder="e.g. Randy, Mr. Duax" />

        <div style={{ ...fieldLabel, marginTop: 18 }}>Name your assistant</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {aiOpts.map((n) => (
            <Chip key={n} active={aiName === n} onClick={() => setAiName(n)}>{n}</Chip>
          ))}
        </div>
        <TextInput value={aiName} onChange={setAiName} placeholder="e.g. Stagwell, Aria" />
      </div>

      <div style={hintCard}>
        📞 On calls, it answers: <i>“Hi, you've reached {callMe || "…"}'s line — this is {aiName || "…"}, {callMe || "…"}'s assistant.”</i>
      </div>
    </ObShell>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: FONT,
        width: "100%",
        fontSize: 16,
        fontWeight: 600,
        color: INK,
        background: PAPER,
        border: "1.5px solid #E3E7F2",
        borderRadius: 14,
        padding: "13px 15px",
        outline: "none",
      }}
      onFocus={(e) => (e.target.style.borderColor = CORAL)}
      onBlur={(e) => (e.target.style.borderColor = "#E3E7F2")}
    />
  );
}

function Ob2({ vips, setVips, role, next, back }) {
  const toggle = (i) => setVips(vips.map((v, j) => (j === i ? { ...v, on: !v.on } : v)));
  return (
    <ObShell step={1} title="Who always gets through?" sub={`Suggested for a ${role.toLowerCase()} — these callers are never treated like strangers.`} next={next} back={back}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {vips.map((v, i) => (
          <button key={v.name} onClick={() => toggle(i)} style={{ fontFamily: FONT, display: "flex", alignItems: "center", gap: 14, background: "#fff", border: `1.5px solid ${v.on ? CORAL : "#EDF0F8"}`, borderRadius: 18, boxShadow: v.on ? "0 6px 18px rgba(249,97,103,.12)" : "0 3px 12px rgba(16,23,58,.04)", padding: "14px 16px", cursor: "pointer", textAlign: "left", transition: "border-color .2s" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: v.on ? "#FDECEC" : "#F1F3FA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {v.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>{v.name}</div>
              <div style={{ fontSize: 13, color: v.on ? CORAL_DEEP : MUTED, fontWeight: 500 }}>{v.rule}</div>
            </div>
            <div style={{ width: 46, height: 28, borderRadius: 100, background: v.on ? CORAL : "#DDE2F0", position: "relative", transition: "background .2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 3, left: v.on ? 21 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
            </div>
          </button>
        ))}
        <button style={{ fontFamily: FONT, background: "none", border: "1.5px dashed #C9D0E4", borderRadius: 16, padding: 14, color: MUTED, fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>＋ Add someone</button>
      </div>
    </ObShell>
  );
}

function Ob3({ prefs, setPrefs, next, back }) {
  const all = ["Family first", "Health appointments", "School matters", "Work calls", "No sales calls", "Block all spam", "Investors get through", "Top candidates get through", "Quiet on weekends", "Quiet after work hours"];
  const toggle = (p) => setPrefs(prefs.includes(p) ? prefs.filter((x) => x !== p) : [...prefs, p]);
  return (
    <ObShell step={2} title="What matters to you?" sub="These priorities shape how NewVoice handles, escalates, or ends a call." next={next} back={back}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {all.map((p) => (
          <Chip key={p} big active={prefs.includes(p)} onClick={() => toggle(p)}>{p}</Chip>
        ))}
      </div>
      <div style={hintCard}>Selected rules become live policies — e.g. “No sales calls” means NewVoice declines pitches but still captures the offer for you.</div>
    </ObShell>
  );
}

function Ob4({ connected, connecting, connect, next, back }) {
  const Card = ({ id, icon, name, desc, meta }) => {
    const isOn = connected[id];
    const isLoading = connecting === id;
    return (
      <div style={{ background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, padding: 18, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 6px 20px rgba(16,23,58,.05)" }}>
        <div style={{ fontSize: 30 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{name}</div>
          <div style={{ fontSize: 13, color: isOn ? GREEN : MUTED, fontWeight: isOn ? 600 : 400, marginTop: 2 }}>
            {isOn ? meta : desc}
          </div>
        </div>
        {isOn ? (
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#E6F6EE", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</div>
        ) : (
          <button onClick={() => connect(id)} style={{ fontFamily: FONT, background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", minWidth: 86 }}>
            {isLoading ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2.5px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "stagSpin .7s linear infinite", verticalAlign: -2 }} /> : "Connect"}
          </button>
        )}
      </div>
    );
  };
  return (
    <ObShell step={3} title="Connect your world" sub="NewVoice uses these to check availability, send messages, and book for you." next={next} back={back} nextLabel={connected.whatsapp && connected.calendar ? "Continue" : "Skip for now"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card id="calendar" icon="📅" name="Google Calendar" desc="Check availability · create events" meta="Connected · 3 events this week" />
        <Card id="whatsapp" icon="💬" name="WhatsApp" desc="Send updates to family & contacts" meta="Connected · jonathan" />
      </div>
      <div style={hintCard}>🔒 Demo only — nothing is actually connected. In production these use official OAuth.</div>
    </ObShell>
  );
}

function Ob5({ aiName, next }) {
  return (
    <div style={{ flex: 1, background: `radial-gradient(120% 90% at 50% -10%, ${INK_SOFT} 0%, ${INK} 60%)`, display: "flex", flexDirection: "column", padding: "0 28px", paddingBottom: "max(env(safe-area-inset-bottom), 36px)", animation: "stagIn .3s ease" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <Orb size={110} idle />
        <div style={{ marginTop: 30, color: "#fff", fontSize: 30, fontWeight: 800, letterSpacing: -0.6 }}>{aiName} is live.</div>
        <div style={{ marginTop: 12, color: "rgba(255,255,255,.75)", fontSize: 16.5, lineHeight: 1.55, maxWidth: 300 }}>
          From now on, every call you can't take has a third option: <b style={{ color: ICE }}>send it to your assistant.</b>
        </div>
        <div style={{ marginTop: 26, display: "flex", gap: 8 }}>
          {["Screens spam", "Books for you", "Escalates VIPs"].map((t) => (
            <div key={t} style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.15)", color: ICE, fontSize: 12.5, fontWeight: 600, padding: "7px 12px", borderRadius: 100 }}>{t}</div>
          ))}
        </div>
      </div>
      <Btn onClick={next}>Go to my dashboard</Btn>
    </div>
  );
}

/* ---------- Home ---------- */
function Home({ history, onOpen, onSimulate, showInterviewBubble, onStartInterview, onDismissBubble, onOpenStats, onOpenTasks, onOpenPrefs, taskActive, aiName }) {
  const totals = history.reduce(
    (t, h) => {
      const v = VALUE_BY_ID[h.id] || {};
      return { min: t.min + (v.minutesSaved || 0), money: t.money + (v.moneySaved || 0) + (v.moneyProtected || 0) };
    },
    { min: 0, money: 0 }
  );
  const [page, setPage] = useState(0);
  const onCarouselScroll = (e) => {
    const el = e.currentTarget;
    const card = el.firstChild;
    if (!card) return;
    const step = card.offsetWidth + 12;
    setPage(Math.max(0, Math.min(SCENARIOS.length - 1, Math.round(el.scrollLeft / step))));
  };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "stagIn .3s ease" }}>
      <div style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #F7F8FC 100%)", padding: "0 22px 20px", paddingTop: "max(env(safe-area-inset-top), 20px)", borderBottom: "1px solid #EDF0F8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Logo size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ color: INK, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>NewVoice <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>by Stagwell</span></div>
            <div style={{ color: MUTED, fontSize: 12.5, fontWeight: 500 }}>Good afternoon, Randy</div>
          </div>
          <div onClick={onOpenPrefs} style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#7C5CFF,#4285F4)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px rgba(66,133,244,.35)" }}>R</div>
        </div>
        <div style={{ marginTop: 16, background: "#fff", border: "1px solid #EDF0F8", borderRadius: 18, padding: 16, display: "flex", alignItems: "center", gap: 14, boxShadow: "0 6px 20px rgba(16,23,58,.06)" }}>
          <div style={{ position: "relative", width: 12, height: 12, flexShrink: 0 }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: GREEN }} />
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: GREEN, animation: "stagPulse 2s ease-out infinite" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: INK, fontSize: 14.5, fontWeight: 700 }}>Assistant active</div>
            <div style={{ color: MUTED, fontSize: 12.5 }}>Screening unknown callers · 4 VIP rules on</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 250px" }}>
        <SegTabs active="calls" onTasks={onOpenTasks} taskDot={taskActive} />
        {history.length > 0 && (
          <button onClick={onOpenStats} style={{ fontFamily: FONT, width: "100%", marginBottom: 18, background: `linear-gradient(135deg, #202B5E, ${INK})`, border: "none", borderRadius: 20, padding: "15px 17px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer", boxShadow: "0 10px 26px rgba(16,23,58,.28)", textAlign: "left", animation: "stagIn .3s ease" }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>📊</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontSize: 14.5, fontWeight: 800, letterSpacing: -0.2 }}>Value delivered so far</div>
              <div style={{ color: ICE, fontSize: 12.5, fontWeight: 600, marginTop: 2 }}>
                {totals.min} min saved{totals.money > 0 ? ` · $${totals.money.toLocaleString()}` : ""} · {history.length} call{history.length > 1 ? "s" : ""} handled
              </div>
            </div>
            <span style={{ color: ICE, fontSize: 16, fontWeight: 800 }}>›</span>
          </button>
        )}
        {showInterviewBubble && (
          <div style={{ marginBottom: 18, background: `linear-gradient(135deg, #FFF1F0, #FDE5E6)`, border: "1px solid #F8D2D4", borderRadius: 20, padding: "16px 16px", display: "flex", alignItems: "center", gap: 13, boxShadow: "0 6px 18px rgba(249,97,103,.12)", animation: "stagIn .3s ease" }}>
            <Orb size={42} idle />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: INK, letterSpacing: -0.2 }}>{`Help ${aiName} know you better`}</div>
              <div style={{ fontSize: 12.5, color: INK_SOFT, marginTop: 2, lineHeight: 1.4 }}>A 2-minute interview about your life and goals makes every call smarter.</div>
              <button onClick={onStartInterview} style={{ fontFamily: FONT, marginTop: 9, background: CORAL, color: "#fff", border: "none", borderRadius: 100, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(249,97,103,.3)" }}>Start interview</button>
            </div>
            <button onClick={onDismissBubble} aria-label="Dismiss" style={{ fontFamily: FONT, alignSelf: "flex-start", background: "rgba(255,255,255,.7)", border: "none", width: 26, height: 26, borderRadius: "50%", color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>✕</button>
          </div>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>Recent calls</div>
        {history.length === 0 ? (
          <div style={{ background: "#fff", border: "1.5px dashed #DDE2F0", borderRadius: 18, padding: "30px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>📞</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: INK, marginTop: 10 }}>No calls handled yet</div>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>When a call comes in, you'll see Stagwell's summaries and actions here.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((h, i) => {
              const done = Object.keys(h.actionsDone || {}).length;
              return (
                <button key={i} onClick={() => onOpen(i)} style={{ fontFamily: FONT, textAlign: "left", cursor: "pointer", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 18, padding: "14px 16px", display: "flex", alignItems: "center", gap: 13, boxShadow: "0 3px 12px rgba(16,23,58,.05)" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: h.badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{h.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.caller}</div>
                    <div style={{ fontSize: 12.5, color: h.badgeColor, fontWeight: 600 }}>{h.badge}{h.joined ? " · 🎙 you joined" : ""}{done > 0 ? ` · ${done} action${done > 1 ? "s" : ""} taken` : ""}</div>
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{h.time}</div>
                  <span style={{ fontSize: 16, color: "#C3C9DC", fontWeight: 800 }}>›</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* demo carousel — swipe between scenarios, tap to ring */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: "max(env(safe-area-inset-bottom), 36px)", paddingTop: 34, background: "linear-gradient(180deg, rgba(247,248,252,0) 0%, #F7F8FC 30%, #F7F8FC 100%)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.3, textTransform: "uppercase", background: "#fff", border: "1px solid #E9EDF7", borderRadius: 100, padding: "7px 14px", boxShadow: "0 3px 10px rgba(16,23,58,.06)" }}>
            Demo · swipe to choose a caller
          </div>
        </div>
        <div className="stagCarousel" onScroll={onCarouselScroll} style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", padding: "4px 11%", WebkitOverflowScrolling: "touch" }}>
          {SCENARIOS.map((sc, i) => {
            const played = history.some((h) => h.id === sc.id);
            return (
              <button
                key={sc.id}
                onClick={() => onSimulate(i)}
                style={{ fontFamily: FONT, flex: "0 0 78%", scrollSnapAlign: "center", background: `linear-gradient(160deg, #232E63 0%, ${INK} 70%)`, border: "none", borderRadius: 20, padding: "14px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 13, boxShadow: "0 12px 28px rgba(16,23,58,.3)" }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, flexShrink: 0 }}>{sc.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sc.caller}</div>
                  <div style={{ color: ICE, fontSize: 12, fontWeight: 500, marginTop: 2 }}>{played ? "Played · tap to ring again" : "Tap to simulate this call"}</div>
                </div>
                {played && <span style={{ color: "#7EE2B0", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
          {SCENARIOS.map((_, i) => (
            <div key={i} style={{ width: i === page ? 20 : 6, height: 6, borderRadius: 4, background: i === page ? CORAL : "#D5DBEA", transition: "all .25s ease" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Incoming call ---------- */
function Incoming({ scenario, aiName, onSend, onDismiss }) {
  return (
    <div style={{ flex: 1, background: `linear-gradient(180deg, #131B45 0%, ${INK} 60%, #0B1129 100%)`, display: "flex", flexDirection: "column", padding: "0 26px", paddingTop: "max(env(safe-area-inset-top), 40px)", paddingBottom: "max(env(safe-area-inset-bottom), 36px)", animation: "stagIn .25s ease" }}>
      <div style={{ textAlign: "center", color: ICE, fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginTop: 14 }}>Incoming call</div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -18, borderRadius: "50%", border: "2px solid rgba(249,97,103,.35)", animation: "stagPulse 1.6s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: -34, borderRadius: "50%", border: "2px solid rgba(249,97,103,.18)", animation: "stagPulse 1.6s ease-out infinite .4s" }} />
          <div style={{ width: 104, height: 104, borderRadius: "50%", background: "linear-gradient(135deg,#3A4474,#222B55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, animation: "stagRing .5s ease-in-out infinite" }}>
            {scenario.icon}
          </div>
        </div>
        <div style={{ marginTop: 28, color: "#fff", fontSize: 27, fontWeight: 800, letterSpacing: -0.5, textAlign: "center" }}>{scenario.caller}</div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,.65)", fontSize: 15.5 }}>{scenario.number}</div>
        <div style={{ marginTop: 10, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: ICE, fontSize: 12.5, fontWeight: 600, padding: "6px 14px", borderRadius: 100 }}>{scenario.sub}</div>
      </div>

      {/* hero: send to assistant */}
      <button onClick={onSend} style={{ fontFamily: FONT, background: `linear-gradient(135deg, ${CORAL}, ${CORAL_DEEP})`, border: "1px solid rgba(255,255,255,.25)", borderRadius: 22, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", boxShadow: "0 14px 36px rgba(249,97,103,.45)", marginBottom: 18 }}>
        <Logo size={30} light />
        <div style={{ textAlign: "left" }}>
          <div style={{ color: "#fff", fontSize: 17.5, fontWeight: 800, letterSpacing: -0.2 }}>{`Send to ${aiName}`}</div>
          <div style={{ color: "rgba(255,255,255,.8)", fontSize: 12.5, fontWeight: 500 }}>Your assistant takes the call</div>
        </div>
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 18px" }}>
        <CallRound color="#E0414C" label="Decline" onClick={onDismiss} rotate />
        <CallRound color={GREEN} label="Accept" onClick={onDismiss} />
      </div>
    </div>
  );
}

function CallRound({ color, label, onClick, rotate }) {
  return (
    <button onClick={onClick} style={{ fontFamily: FONT, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ width: 66, height: 66, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 22px ${color}55` }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" style={{ transform: rotate ? "rotate(135deg)" : "none" }}>
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/>
        </svg>
      </div>
      <span style={{ color: "rgba(255,255,255,.75)", fontSize: 13, fontWeight: 500 }}>{label}</span>
    </button>
  );
}

/* ---------- Orb (assistant avatar) ---------- */
function Orb({ size = 64, idle }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {!idle && <div style={{ position: "absolute", inset: -10, borderRadius: "50%", border: "2px solid rgba(249,97,103,.3)", animation: "stagPulse 2s ease-out infinite" }} />}
      <div style={{ width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle at 32% 28%, #FF9A9E, ${CORAL} 45%, ${CORAL_DEEP})`, boxShadow: "0 10px 30px rgba(249,97,103,.45)", animation: "stagBreath 3.2s ease-in-out infinite", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 4, borderRadius: 3, background: "rgba(255,255,255,.9)", height: 12, animation: `stagWave 1s ease-in-out ${i * 0.15}s infinite` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Live call ---------- */
export function LiveCall({ scenario, aiName, callMe, onDone }) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [ended, setEnded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [confirmJoin, setConfirmJoin] = useState(false);
  const [script, setScript] = useState(() => [...scenario.transcript]);
  const shownRef = useRef(0);
  useEffect(() => { shownRef.current = shown; }, [shown]);
  const inject = (msg) => {
    const cut = shownRef.current;
    setScript((sc) => [...sc.slice(0, cut), msg, ...sc.slice(cut)]);
    shownRef.current = cut + 1;
    setShown((v) => v + 1);
  };
  const scrollRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (paused) return;
    if (shown >= script.length) {
      setEnded(true);
      return;
    }
    const prev = shown > 0 ? script[shown - 1] : null;
    // pause so the previous bubble can actually be read
    const readMs = prev ? Math.min(3800, 800 + prev.text.length * 32) : 700;
    const line = script[shown];
    const isSys = line.who === "sys";
    const typeMs = isSys ? 1100 : Math.min(3000, 1000 + line.text.length * 20);
    setTyping(false);
    const t1 = setTimeout(() => {
      if (!isSys) setTyping(true);
    }, readMs);
    const t2 = setTimeout(() => {
      setTyping(false);
      setShown((s) => s + 1);
    }, readMs + typeMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shown, script, paused]);

  const jumpIn = () => {
    if (ended || paused) return;
    setPaused(true);
    setTyping(false);
    inject({ who: "ai", text: `Actually — good news: ${callMe} has just become available and can join this call right now. One moment, please.` });
    setTimeout(() => setConfirmJoin(true), 1600);
  };
  const acceptJoin = () => {
    setConfirmJoin(false);
    inject({ who: "sys", text: `${callMe} joined the call · ${aiName} stepped off` });
    setEnded(true);
    setTimeout(() => onDone({ joined: true }), 1700);
  };
  const declineJoin = () => {
    setConfirmJoin(false);
    inject({ who: "ai", text: `My apologies — ${callMe} got pulled away again. I'll keep handling this for him.` });
    setTimeout(() => setPaused(false), 1200);
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [shown, typing]);

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const nextWho = shown < script.length ? script[shown].who : null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: PAPER, overflow: "hidden", animation: "stagIn .25s ease" }}>
      <div style={{ background: `linear-gradient(160deg, #202B5E 0%, ${INK} 60%)`, padding: "0 20px 18px", paddingTop: "max(env(safe-area-inset-top), 16px)", borderRadius: "0 0 28px 28px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 8px 24px rgba(16,23,58,.2)" }}>
        <Orb size={52} />
        <div style={{ flex: 1, marginTop: 6 }}>
          <div style={{ color: "#fff", fontSize: 16.5, fontWeight: 800, letterSpacing: -0.2 }}>{`${aiName} is on the call`}</div>
          <div style={{ color: ICE, fontSize: 12.5, fontWeight: 500, marginTop: 1 }}>{scenario.caller} · {mm}:{ss}</div>
        </div>
        <div style={{ marginTop: 6, background: ended ? "rgba(255,255,255,.1)" : "rgba(43,182,115,.18)", border: `1px solid ${ended ? "rgba(255,255,255,.15)" : "rgba(43,182,115,.4)"}`, color: ended ? "rgba(255,255,255,.7)" : "#7EE2B0", fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 100, letterSpacing: 0.5 }}>
        {ended ? "ENDED" : "LIVE"}
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 18px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ textAlign: "center", fontSize: 12, color: MUTED, marginBottom: 4 }}>{`Live transcript · ${aiName} answers as your assistant`}</div>
        {script.slice(0, shown).map((l, i) =>
          l.who === "sys" ? (
            <div key={i} style={{ alignSelf: "center", background: "#EBEFFA", color: INK_SOFT, fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 100, animation: "stagIn .3s ease", textAlign: "center", maxWidth: "90%" }}>
              {personalize(l.text, callMe, aiName)}
            </div>
          ) : l.original ? (
            <TranslatedBubble key={i} line={l} callMe={callMe} aiName={aiName} />
          ) : (
            <div key={i} style={{ alignSelf: l.who !== "caller" ? "flex-end" : "flex-start", maxWidth: "82%", animation: "stagIn .3s ease" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: l.who === "user" ? CORAL_DEEP : MUTED, margin: l.who !== "caller" ? "0 12px 4px 0" : "0 0 4px 12px", textAlign: l.who !== "caller" ? "right" : "left", letterSpacing: 0.3 }}>
                {l.who === "ai" ? aiName.toUpperCase() : l.who === "user" ? `${callMe.toUpperCase()} (YOU)` : "CALLER"}
              </div>
              <div style={{ background: l.who === "ai" ? `linear-gradient(150deg, ${INK_SOFT}, ${INK})` : l.who === "user" ? `linear-gradient(150deg, #FF8A7A, ${CORAL_DEEP})` : "#fff", color: l.who !== "caller" ? "#fff" : INK, fontSize: 15, lineHeight: 1.5, padding: "12px 16px", borderRadius: l.who !== "caller" ? "20px 20px 6px 20px" : "20px 20px 20px 6px", border: l.who !== "caller" ? "none" : "1.5px solid #EAEDF6", boxShadow: l.who === "ai" ? "0 4px 14px rgba(16,23,58,.22)" : l.who === "user" ? "0 4px 14px rgba(224,69,80,.3)" : "0 2px 10px rgba(16,23,58,.05)" }}>
                {personalize(l.text, callMe, aiName)}
              </div>
            </div>
          )
        )}
        {typing && !paused && nextWho && nextWho !== "sys" && (
          <div style={{ alignSelf: nextWho !== "caller" ? "flex-end" : "flex-start", background: nextWho === "ai" ? INK : nextWho === "user" ? CORAL_DEEP : BUBBLE, padding: "13px 16px", borderRadius: 18, display: "flex", gap: 5 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: nextWho !== "caller" ? "rgba(255,255,255,.6)" : "#A9B1CC", animation: `stagWave 1s ease-in-out ${i * 0.18}s infinite` }} />
            ))}
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "10px 18px", paddingBottom: "max(env(safe-area-inset-bottom), 36px)", display: "flex", gap: 10 }}>
        {ended ? (
          <Btn onClick={() => onDone({ joined: false })}>View call summary →</Btn>
        ) : (
          <>
            <button onClick={jumpIn} style={{ fontFamily: FONT, flex: 1, background: "#fff", border: "1.5px solid #E3E7F2", borderRadius: 14, padding: "13px", fontSize: 14.5, fontWeight: 700, color: INK, cursor: "pointer", opacity: paused ? 0.5 : 1 }}>🎙 Jump into the call</button>
            <button style={{ fontFamily: FONT, width: 54, background: "#FDECEC", border: "1.5px solid #F8C9CB", borderRadius: 14, fontSize: 17, cursor: "pointer" }}>✕</button>
          </>
        )}
      </div>

      {confirmJoin && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(8,11,30,.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, backdropFilter: "blur(2px)" }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: "24px 22px", width: "100%", maxWidth: 340, textAlign: "center", boxShadow: "0 24px 60px rgba(16,23,58,.35)", animation: "stagIn .25s ease" }}>
            <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#FDECEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto" }}>🎙</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: INK, letterSpacing: -0.3, marginTop: 14 }}>Take over this call?</div>
            <div style={{ fontSize: 14, color: INK_SOFT, lineHeight: 1.5, marginTop: 8 }}>
              {`${aiName} has told the caller you're joining. Accept to connect — ${aiName} will step off the call.`}
            </div>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
              <Btn onClick={acceptJoin}>Take the call</Btn>
              <button onClick={declineJoin} style={{ fontFamily: FONT, background: "none", border: "none", color: MUTED, fontSize: 14.5, fontWeight: 700, cursor: "pointer", padding: "10px" }}>{`Not now — let ${aiName} handle it`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Auto-translating bubble (shows original, fades to English) ---------- */
function TranslatedBubble({ line, callMe, aiName }) {
  const isAi = line.who === "ai";
  const [translated, setTranslated] = useState(false);
  const [showOrig, setShowOrig] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTranslated(true), 2000);
    return () => clearTimeout(t);
  }, []);
  const showingOriginal = !translated || showOrig;
  const txt = showingOriginal ? line.original : line.text;
  const subtle = isAi ? "rgba(255,255,255,.55)" : "#9AA2BE";
  return (
    <div style={{ alignSelf: isAi ? "flex-end" : "flex-start", maxWidth: "82%", animation: "stagIn .3s ease" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, margin: isAi ? "0 12px 4px 0" : "0 0 4px 12px", textAlign: isAi ? "right" : "left", letterSpacing: 0.3 }}>
        {isAi ? aiName.toUpperCase() : "CALLER"}
      </div>
      <div style={{ background: isAi ? `linear-gradient(150deg, ${INK_SOFT}, ${INK})` : "#fff", color: isAi ? "#fff" : INK, fontSize: 15, lineHeight: 1.5, padding: "12px 16px", borderRadius: isAi ? "20px 20px 6px 20px" : "20px 20px 20px 6px", border: isAi ? "none" : "1.5px solid #EAEDF6", boxShadow: isAi ? "0 4px 14px rgba(16,23,58,.22)" : "0 2px 10px rgba(16,23,58,.05)" }}>
        <span key={showingOriginal ? "o" : "t"} style={{ display: "block", animation: "stagFade .6s ease" }}>
          {personalize(txt, callMe, aiName)}
        </span>
        {translated && (
          <div style={{ marginTop: 9, paddingTop: 7, borderTop: `1px solid ${isAi ? "rgba(255,255,255,.15)" : "#EEF0F8"}`, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: subtle, fontWeight: 600 }}>
            <span>🌐</span>
            <span style={{ flex: 1 }}>{showOrig ? `Original ${line.lang}` : `Auto-translated from ${line.lang}`}</span>
            <button onClick={() => setShowOrig((v) => !v)} style={{ fontFamily: FONT, background: "none", border: "none", color: subtle, fontSize: 11, fontWeight: 800, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              {showOrig ? "Show translation" : "Show original"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Summary ---------- */
function Summary({ scenario, entryTime, aiName, callMe, doneActions, onAction, onClose, notify }) {
  const s = scenario.summary;
  const [shareOpen, setShareOpen] = useState(false);
  const shareTargets = [
    { icon: "🔗", label: "Copy link", bg: "#EFF3FC", confirm: "Link copied to clipboard" },
    { icon: "💬", label: "WhatsApp", bg: "#E3F6E9", confirm: "Opening WhatsApp…" },
    { icon: "💭", label: "Messages", bg: "#E7F1FB", confirm: "Opening Messages…" },
    { icon: "✉️", label: "Email", bg: "#FBF3E0", confirm: "Opening Mail…" },
  ];
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "stagIn .3s ease" }}>
      <div style={{ padding: "0 22px 16px", paddingTop: "max(env(safe-area-inset-top), 18px)", display: "flex", alignItems: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: INK, letterSpacing: -0.6 }}>Call summary</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12.5, color: MUTED, marginRight: 12 }}>{entryTime || "Just now"}</div>
        <button onClick={() => setShareOpen(true)} aria-label="Share summary" style={{ fontFamily: FONT, width: 38, height: 38, borderRadius: "50%", background: "#fff", border: "1px solid #EDF0F8", boxShadow: "0 3px 10px rgba(16,23,58,.07)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 120px" }}>
        <div style={{ background: "#fff", borderRadius: 26, border: "1px solid #EDF0F8", padding: 22, boxShadow: "0 14px 40px rgba(16,23,58,.09)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 52, height: 52, borderRadius: 17, background: `linear-gradient(145deg, #fff, ${scenario.badgeBg})`, border: "1px solid #EDF0F8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: "0 4px 12px rgba(16,23,58,.06)" }}>{scenario.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: INK, letterSpacing: -0.2 }}>{scenario.caller}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                <div style={{ display: "inline-block", background: scenario.badgeBg, color: scenario.badgeColor, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 100, letterSpacing: 0.3 }}>{scenario.badge}</div>
                {scenario.joined && (
                  <div style={{ display: "inline-block", background: "#FDECEC", color: CORAL_DEEP, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 100, letterSpacing: 0.3 }}>🎙 You joined live</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, fontSize: 17.5, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>{personalize(s.title, callMe, aiName)}</div>
          <div style={{ marginTop: 8, fontSize: 15, color: INK_SOFT, lineHeight: 1.55 }}>{personalize(s.text, callMe, aiName)}</div>

          <div style={{ marginTop: 18, borderTop: "1px solid #EEF0F8", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {(scenario.joined ? [["Handled by", `${aiName} — until you took over live`], ...s.details] : s.details).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13.5, color: MUTED, fontWeight: 500 }}>{k}</span>
                <span style={{ fontSize: 13.5, color: INK, fontWeight: 700, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, letterSpacing: 1.2, textTransform: "uppercase", margin: "22px 0 12px" }}>Suggested actions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {s.actions.map((a, i) => {
            const done = doneActions[i];
            return (
              <button
                key={a.label}
                onClick={() => !done && onAction(i, a.confirm)}
                style={{ fontFamily: FONT, display: "flex", alignItems: "center", gap: 14, background: done ? "#F0FAF5" : "#fff", border: `1px solid ${done ? "#BBE6D1" : "#EDF0F8"}`, borderRadius: 18, padding: "13px 15px", cursor: done ? "default" : "pointer", textAlign: "left", transition: "all .2s", boxShadow: done ? "none" : "0 3px 12px rgba(16,23,58,.05)" }}
              >
                <span style={{ width: 42, height: 42, borderRadius: 14, background: done ? "#E2F4EA" : scenario.badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{a.icon}</span>
                <span style={{ flex: 1, fontSize: 15.5, fontWeight: 700, color: done ? GREEN : INK }}>{done ? a.confirm : a.label}</span>
                <span style={{ fontSize: 16, color: done ? GREEN : "#C3C9DC", fontWeight: 800 }}>{done ? "✓" : "›"}</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button style={{ fontFamily: FONT, background: "none", border: "none", color: MUTED, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>View full transcript →</button>
        </div>
      </div>

      <div style={{ position: "absolute", left: 22, right: 22, bottom: "max(env(safe-area-inset-bottom), 36px)" }}>
        <Btn onClick={onClose} kind="dark" style={{ boxShadow: "0 12px 30px rgba(16,23,58,.3)" }}>Done</Btn>
      </div>

      {shareOpen && (
        <div onClick={() => setShareOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(8,11,30,.5)", zIndex: 50, display: "flex", alignItems: "flex-end", backdropFilter: "blur(2px)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "24px 24px 0 0", padding: "12px 22px", paddingBottom: "max(env(safe-area-inset-bottom), 30px)", animation: "stagIn .25s ease" }}>
            <div style={{ width: 38, height: 5, borderRadius: 3, background: "#E3E7F2", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>Share call summary</div>

            <div style={{ marginTop: 14, background: scenario.badgeBg, borderRadius: 18, padding: 15, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{scenario.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personalize(s.title, callMe, aiName)}</div>
                <div style={{ fontSize: 12, color: scenario.badgeColor, fontWeight: 600, marginTop: 2 }}>{scenario.caller} · summarized by {aiName}</div>
              </div>
            </div>

            <div style={{ marginTop: 12, background: PAPER, border: "1.5px dashed #D5DBEA", borderRadius: 14, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13.5, color: INK_SOFT, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>newvoice.app/c/{scenario.id}-8k3x</span>
              <button onClick={() => { notify("Link copied to clipboard"); }} style={{ fontFamily: FONT, background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Copy</button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, padding: "0 6px" }}>
              {shareTargets.map((t) => (
                <button key={t.label} onClick={() => { notify(t.confirm); setShareOpen(false); }} style={{ fontFamily: FONT, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{t.icon}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: INK_SOFT }}>{t.label}</span>
                </button>
              ))}
            </div>

            <button onClick={() => setShareOpen(false)} style={{ fontFamily: FONT, width: "100%", marginTop: 18, background: PAPER, border: "1px solid #EDF0F8", borderRadius: 14, padding: "13px", fontSize: 15, fontWeight: 700, color: INK_SOFT, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Interview (assistant gets to know you) ---------- */
const INTERVIEW_QS = [
  {
    q: "When you're unreachable, what's usually the reason? Pick all that apply.",
    chips: ["In meetings", "Deep work", "With family", "Driving"],
    multi: true,
    ack: (a) => `Noted — when you're ${a.toLowerCase()}, I'll protect that time and handle callers gracefully.`,
  },
  {
    q: "If something is truly urgent and you don't pick up, what should I do? Choose as many as you like.",
    chips: ["Text me a summary", "Try Sarah (wife)", "Keep them on hold", "Take a detailed message"],
    multi: true,
    ack: (a) => `Got it: ${a}. That's my urgent-call playbook from now on.`,
  },
  {
    q: "What are the big goals this season? It helps me know which calls actually matter.",
    chips: ["Raising capital", "Growing sales", "More family time", "Shipping the product"],
    multi: true,
    ack: (a) => `${a} — understood. Calls that move those forward get priority treatment.`,
  },
  {
    q: "How should I sound with your callers?",
    chips: ["Warm & friendly", "Brief & professional", "Match the caller's tone"],
    multi: false,
    ack: (a) => `Perfect. ${a} it is — I'll keep that voice consistent on every call.`,
  },
  {
    q: "Last one: anything I should never do on a call? Select all that apply.",
    chips: ["Never share my schedule", "Never give out my email", "Never commit to meetings", "Use your judgment"],
    multi: true,
    ack: (a) => `Locked in: \u201C${a}.\u201D That overrides everything else.`,
  },
];

function joinNice(arr) {
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

function Interview({ aiName, callMe, onFinish, onSkip }) {
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const [qIdx, setQIdx] = useState(-1);
  const [awaiting, setAwaiting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [finished, setFinished] = useState(false);
  const scrollRef = useRef(null);
  const queueRef = useRef([]);
  const busyRef = useRef(false);

  const pump = () => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { who: "ai", text: next.text }]);
      if (next.after) next.after();
      busyRef.current = false;
      setTimeout(pump, 350);
    }, Math.min(2200, 650 + next.text.length * 14));
  };
  const pushAi = (text, after) => {
    queueRef.current.push({ text, after });
    pump();
  };

  useEffect(() => {
    pushAi(`Hi ${callMe}! I'm ${aiName}. The more I know about your life, the better I represent you. Five quick questions?`);
    pushAi(INTERVIEW_QS[0].q, () => { setQIdx(0); setAwaiting(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typing, awaiting, finished]);

  const answer = (choices) => {
    if (!awaiting || choices.length === 0) return;
    setAwaiting(false);
    setSelected([]);
    const joined = joinNice(choices);
    setMsgs((m) => [...m, { who: "user", text: joined }]);
    const cur = INTERVIEW_QS[qIdx];
    const nextIdx = qIdx + 1;
    pushAi(cur.ack(joined), () => {
      if (nextIdx < INTERVIEW_QS.length) {
        pushAi(INTERVIEW_QS[nextIdx].q, () => { setQIdx(nextIdx); setAwaiting(true); });
      } else {
        pushAi(`That's everything for now, ${callMe}. I'll keep learning from every call — and you can re-run this interview anytime.`, () => setFinished(true));
      }
    });
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: PAPER, overflow: "hidden", animation: "stagIn .25s ease" }}>
      <div style={{ background: `linear-gradient(160deg, #202B5E 0%, ${INK} 60%)`, padding: "0 20px 16px", paddingTop: "max(env(safe-area-inset-top), 16px)", borderRadius: "0 0 28px 28px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 8px 24px rgba(16,23,58,.2)" }}>
        <Orb size={48} />
        <div style={{ flex: 1, marginTop: 6 }}>
          <div style={{ color: "#fff", fontSize: 16.5, fontWeight: 800, letterSpacing: -0.2 }}>{`${aiName} is interviewing you`}</div>
          <div style={{ color: ICE, fontSize: 12.5, fontWeight: 500, marginTop: 1 }}>{qIdx >= 0 && !finished ? `Question ${Math.min(qIdx + 1, INTERVIEW_QS.length)} of ${INTERVIEW_QS.length}` : finished ? "All done" : "Getting started"}</div>
        </div>
        {!finished && (
          <button onClick={onSkip} style={{ fontFamily: FONT, marginTop: 6, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", color: ICE, fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 100, cursor: "pointer" }}>Skip</button>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 18px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) =>
          m.who === "ai" ? (
            <div key={i} style={{ alignSelf: "flex-start", maxWidth: "84%", animation: "stagIn .3s ease" }}>
              <div style={{ background: `linear-gradient(150deg, ${INK_SOFT}, ${INK})`, color: "#fff", fontSize: 15, lineHeight: 1.5, padding: "12px 16px", borderRadius: "20px 20px 20px 6px", boxShadow: "0 4px 14px rgba(16,23,58,.22)" }}>{m.text}</div>
            </div>
          ) : (
            <div key={i} style={{ alignSelf: "flex-end", maxWidth: "84%", animation: "stagIn .3s ease" }}>
              <div style={{ background: `linear-gradient(150deg, #FF8A7A, ${CORAL_DEEP})`, color: "#fff", fontSize: 15, lineHeight: 1.5, padding: "12px 16px", borderRadius: "20px 20px 6px 20px", boxShadow: "0 4px 14px rgba(224,69,80,.3)" }}>{m.text}</div>
            </div>
          )
        )}
        {typing && (
          <div style={{ alignSelf: "flex-start", background: INK, padding: "13px 16px", borderRadius: 18, display: "flex", gap: 5 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.6)", animation: `stagWave 1s ease-in-out ${i * 0.18}s infinite` }} />
            ))}
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      <div style={{ padding: "10px 18px", paddingBottom: "max(env(safe-area-inset-bottom), 36px)" }}>
        {finished ? (
          <Btn onClick={onFinish}>Save my answers</Btn>
        ) : awaiting && qIdx >= 0 ? (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "flex-end" }}>
              {INTERVIEW_QS[qIdx].chips.map((c) => {
                const isOn = selected.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => {
                      if (!INTERVIEW_QS[qIdx].multi) return answer([c]);
                      setSelected((sel) => (sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c]));
                    }}
                    style={{ fontFamily: FONT, background: isOn ? CORAL : "#fff", border: `1.5px solid ${CORAL}`, color: isOn ? "#fff" : CORAL_DEEP, borderRadius: 100, padding: "11px 17px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: isOn ? "0 4px 14px rgba(249,97,103,.3)" : "0 3px 10px rgba(249,97,103,.12)", transition: "all .15s" }}
                  >
                    {isOn ? "✓ " : ""}{c}
                  </button>
                );
              })}
            </div>
            {INTERVIEW_QS[qIdx].multi && (
              <div style={{ marginTop: 12 }}>
                <Btn onClick={() => answer(selected)} disabled={selected.length === 0}>
                  {selected.length === 0 ? "Select all that apply" : `Confirm ${selected.length} answer${selected.length > 1 ? "s" : ""}`}
                </Btn>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12.5, color: MUTED, padding: "12px 0" }}>{`${aiName} is typing…`}</div>
        )}
      </div>
    </div>
  );
}


/* ---------- Stats: running total of value delivered ---------- */
function Stats({ history, aiName, callMe, onBack }) {
  const t = history.reduce(
    (acc, h) => {
      const v = VALUE_BY_ID[h.id] || {};
      acc.min += v.minutesSaved || 0;
      acc.saved += v.moneySaved || 0;
      acc.protected += v.moneyProtected || 0;
      acc.talk += v.talkSeconds || 0;
      acc.blocked += v.blocked || 0;
      acc.escalations += v.escalations || 0;
      (v.langs || []).forEach((l) => acc.langs.add(l));
      acc.actions += Object.keys(h.actionsDone || {}).length;
      return acc;
    },
    { min: 0, saved: 0, protected: 0, talk: 0, blocked: 0, escalations: 0, langs: new Set(["English"]), actions: 0 }
  );
  const totalMoney = t.saved + t.protected;
  const talkMin = Math.floor(t.talk / 60), talkSec = t.talk % 60;
  const yearlyHours = Math.round((t.min * 52) / 60);
  const yearlyValue = yearlyHours * 150;

  const tiles = [
    { icon: "⏱️", num: `${t.min} min`, label: "Of your time saved" },
    { icon: "🎙️", num: `${talkMin}:${String(talkSec).padStart(2, "0")}`, label: `${aiName} talk time` },
    { icon: "📞", num: `${history.length}`, label: "Calls handled" },
    { icon: "🛡️", num: `${t.blocked}`, label: "Scams & spam blocked" },
    { icon: "⚡", num: `${t.escalations}`, label: "VIP escalations" },
    { icon: "🌐", num: `${t.langs.size}`, label: "Languages spoken" },
    { icon: "✅", num: `${t.actions}`, label: "Follow-ups completed" },
    { icon: "🔕", num: "0", label: "Interruptions to you" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "stagIn .3s ease" }}>
      <div style={{ padding: "0 22px 14px", paddingTop: "max(env(safe-area-inset-top), 18px)", display: "flex", alignItems: "center" }}>
        <button onClick={onBack} style={{ fontFamily: FONT, background: "none", border: "none", fontSize: 15, color: MUTED, cursor: "pointer", padding: 0, fontWeight: 600 }}>← Home</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12.5, color: MUTED }}>Since you joined</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 40px" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: INK, letterSpacing: -0.6 }}>{`Your ${aiName} dividend`}</div>
        <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>A running total of what your assistant has earned you.</div>

        <div style={{ marginTop: 16, background: `linear-gradient(150deg, #232E63 0%, ${INK} 70%)`, borderRadius: 24, padding: "22px 20px", boxShadow: "0 14px 36px rgba(16,23,58,.3)" }}>
          <div style={{ color: ICE, fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Financial impact</div>
          <div style={{ color: "#fff", fontSize: 44, fontWeight: 800, letterSpacing: -1.5, marginTop: 6 }}>${totalMoney.toLocaleString()}</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,.85)", fontSize: 13.5 }}>
              <span>💰 Savings captured (insurance quote)</span><b>${t.saved.toLocaleString()}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,.85)", fontSize: 13.5 }}>
              <span>🛡️ Fraud exposure avoided</span><b>${t.protected.toLocaleString()}</b>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginTop: 16 }}>
          {tiles.map((tile) => (
            <div key={tile.label} style={{ background: "#fff", border: "1px solid #EDF0F8", borderRadius: 18, padding: "15px 15px", boxShadow: "0 4px 14px rgba(16,23,58,.05)" }}>
              <div style={{ fontSize: 19 }}>{tile.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: -0.5, marginTop: 6 }}>{tile.num}</div>
              <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginTop: 2, lineHeight: 1.35 }}>{tile.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, background: "#FFF4F0", border: "1px solid #FBDDD3", borderRadius: 20, padding: "17px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: CORAL_DEEP, letterSpacing: 0.5, textTransform: "uppercase" }}>At this pace, over a year</div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: INK, marginTop: 7, lineHeight: 1.4 }}>
            ~{yearlyHours} hours reclaimed ≈ ${yearlyValue.toLocaleString()} of your time
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 5 }}>Assuming a $150/hr value of {callMe}'s time. Demo figures — illustrative.</div>
        </div>
      </div>
    </div>
  );
}


/* ================= TASKS (outbound calls) ================= */

const DEMO_TASKS = [
  { icon: "🍝", label: "Book a fully-booked restaurant", desc: "Calls, retries, negotiates the time", live: true, kind: "restaurant" },
  { icon: "🏋️", label: "Cancel a gym membership", desc: "Outlasts the retention specialist", live: true, kind: "gym" },
  { icon: "🔧", label: "Find a plumber today", desc: "Calls around, compares quotes & timing", live: true, kind: "plumber" },
  { icon: "🩺", label: "Hunt an earlier doctor appointment", desc: "Calls every morning for cancellations", live: false },
  { icon: "✈️", label: "Airline hold + rebooking", desc: "Waits on hold, pipes you in", live: false },
  { icon: "🧸", label: "Toy hunt — find a sold-out toy", desc: "Checks store stock across the city", live: false },
  { icon: "📶", label: "Negotiate the internet bill", desc: "Cites competitor pricing, gets the promo", live: false },
];

const HOME_ADDRESS = "23 Nassim Road, #04-02, Singapore 258373";

const PLUMBERS = [
  { id: "pipeworks", icon: "🔧", name: "PipeWorks SG", rep: "Dave", sub: "Plumber · Tanglin", rating: "4.8 ★", dist: "1.2 km", phone: "+65 6244 1717", site: "pipeworks.sg", maps: "https://maps.google.com/?q=PipeWorks+SG+Tanglin" },
  { id: "cityflow", icon: "🚿", name: "CityFlow Plumbing", rep: "Eddie", sub: "Plumber · River Valley", rating: "4.7 ★", dist: "2.0 km", phone: "+65 6532 8001", site: "cityflow.sg", maps: "https://maps.google.com/?q=CityFlow+Plumbing+River+Valley+Singapore" },
  { id: "mrtap", icon: "🛁", name: "Mr Tap Services", rep: "Marcus", sub: "Plumber · Bukit Timah", rating: "4.6 ★", dist: "3.1 km", phone: "+65 6468 2299", site: "mrtap.sg", maps: "https://maps.google.com/?q=Mr+Tap+Services+Bukit+Timah+Singapore" },
  { id: "aquafix", icon: "💧", name: "AquaFix 24/7", rep: "Leila", sub: "Plumber · Orchard", rating: "4.5 ★", dist: "1.6 km", phone: "+65 6262 4040", site: "aquafix247.sg", maps: "https://maps.google.com/?q=AquaFix+247+Orchard+Singapore" },
];

const PLUMB_SCRIPT = {
  header: "Plumber search",
  callName: "plumbers",
  contact: { number: "" },
  voice1: "We've got a leak under the kitchen sink — water's pooling in the cabinet. I've called my regular plumber three times and he's not picking up. Find me a few other well-rated plumbers nearby who can come fix it.",
  // call line builders — pA: no answer, pB: answers & quotes, pC: faster but pricier
  vmIntro: (pA) => [
    { who: "sys", text: `📞 Calling ${pA.name} · ${pA.phone}` },
    { who: "sys", text: "Ringing… 6 rings" },
    { who: "host", hostName: pA.name + " · voicemail", text: `You've reached ${pA.name}. We're out on jobs right now — leave a message after the tone and we'll get back to you.` },
    { who: "sys", text: "🔔 Permission request sent to Randy: leave your callback number on the voicemail?" },
  ],
  vmShare: (pA) => [
    { who: "agent", text: "Hi, this is the assistant for Randy Duax — calling about an urgent kitchen-sink leak near Nassim Road. Please call Randy back directly at +65 8123 4567. We're also trying other plumbers, so the sooner the better. Thank you!" },
    { who: "sys", text: `Voicemail left with callback number · ⏲ Auto-retry: ${pA.name} in 30 min` },
  ],
  vmNoShare: (pA) => [
    { who: "agent", text: "Hi, this is the assistant for Randy — calling about an urgent kitchen-sink leak near Nassim Road. We'll try you again within the half hour. Thank you!" },
    { who: "sys", text: `Voicemail left (no personal details) · ⏲ Auto-retry: ${pA.name} in 30 min` },
  ],
  callB1: (pB) => [
    { who: "sys", text: `📞 Calling ${pB.name} · ${pB.phone}` },
    { who: "host", hostName: pB.name, text: `${pB.name}, ${pB.rep} speaking.` },
    { who: "agent", text: `Hi ${pB.rep}! Calling for Randy Duax — there's a leak under his kitchen sink with water pooling in the cabinet. His usual plumber's unreachable. Could you take a look?` },
    { who: "host", hostName: pB.name, text: "We can help with that. What's the address?" },
    { who: "agent", text: "One second — pulling that from Randy now." },
    { who: "sys", text: "📍 Address request sent to Randy" },
  ],
  callB2: (pB, soonest) => [
    { who: "agent", text: "It's 23 Nassim Road, unit #04-02 — Nassim, just off Orchard." },
    { who: "host", hostName: pB.name, text: "Nice and close. I could come tomorrow afternoon, between 2 and 4." },
    ...(soonest
      ? [
          { who: "agent", text: "Randy's flagged this as really time-sensitive — there's water actively pooling. Is there any way you could squeeze him in earlier, even this evening?" },
          { who: "host", hostName: pB.name, text: "I'm sorry — I'm completely booked solid today. Tomorrow afternoon is genuinely the earliest I can do." },
          { who: "agent", text: "Understood — had to ask. Let me get confirmation from Randy on that timing then — meanwhile, could you give me a rough idea of what these problems usually cost?" },
        ]
      : [{ who: "agent", text: "Let me get confirmation from Randy on that timing — meanwhile, could you give me a rough idea of what these problems usually cost?" }]),
    { who: "host", hostName: pB.name, text: "Hard to say without seeing it — depends what's leaking. My call-out fee is S$89, and on average these jobs land in the S$200–300 range all-in." },
    { who: "agent", text: "Very helpful. Hold one moment while I put this in front of Randy for confirmation." },
    { who: "sys", text: "🔔 Quote sent to Randy: tomorrow 2–4 PM · est. S$200–300 total (incl. S$89 call-out)" },
  ],
  bookB: (pB, pA) => [
    { who: "agent", text: `Good news, ${pB.rep} — Randy confirms tomorrow between 2 and 4. Book it under Randy Duax at 23 Nassim Road, #04-02.` },
    { who: "host", hostName: pB.name, text: "Locked in. I'll text when I'm en route. See you tomorrow!" },
    { who: "sys", text: "Call ended · 2:03 · ✅ Booked" },
    { who: "sys", text: `🧹 Cleanup: ${pA.name} 30-min retry cancelled` },
  ],
  holdB: (pB) => [
    { who: "agent", text: "He may want to compare one more option — can I call you back within the half hour to confirm either way?" },
    { who: "host", hostName: pB.name, text: "No problem — I'll pencil it in till then." },
    { who: "sys", text: "Call ended · 2:21 · Quote on hold for 30 min" },
  ],
  callC: (pC) => [
    { who: "sys", text: `📞 Calling ${pC.name} · ${pC.phone}` },
    { who: "host", hostName: pC.name, text: `${pC.name}, ${pC.rep} here.` },
    { who: "agent", text: "Hi " + pC.rep + " — leak under a kitchen sink at Nassim Road, water pooling in the cabinet. How soon could you come, and what would it run?" },
    { who: "host", hostName: pC.name, text: "You're in luck — I've got a cancellation, so I can be there today, about an hour from now. Call-out is S$120, and honestly these run S$300–400 with parts." },
    { who: "agent", text: "Speed versus price — that's Randy's call. One moment while I put both options in front of him." },
    { who: "sys", text: "🔔 Decision sent to Randy: today ~1 hr · est. S$300–400 total — vs — tomorrow 2–4 PM · est. S$200–300 total" },
  ],
  pickTomorrow: (pB, pC, pA) => [
    { who: "agent", text: `Thanks ${pC.rep} — Randy will go with the earlier option this time. Really appreciate the quick answer!` },
    { who: "host", hostName: pC.name, text: "No worries — keep us in mind next time." },
    { who: "sys", text: `Call ended · 0:48 · 📞 Calling ${pB.name} back…` },
    { who: "host", hostName: pB.name, text: `${pB.rep} here — are we on?` },
    { who: "agent", text: "We're on — tomorrow between 2 and 4, Randy Duax, 23 Nassim Road, #04-02." },
    { who: "host", hostName: pB.name, text: "Booked. See you tomorrow!" },
    { who: "sys", text: "Call ended · 0:39 · ✅ Booked" },
    { who: "sys", text: `🧹 Cleanup: ${pA.name} retry cancelled` },
  ],
  pickToday1: (pC) => [
    { who: "agent", text: `Done deal, ${pC.rep} — Randy wants it fixed today. Book him in: Randy Duax, 23 Nassim Road, #04-02.` },
    { who: "host", hostName: pC.name, text: "On it. What number should I call when I'm downstairs?" },
  ],
  shareGive: (pC) => [
    { who: "agent", text: "You can reach Randy directly at +65 8123 4567." },
    { who: "host", hostName: pC.name, text: "Got it — see you within the hour." },
  ],
  shareDecline: (pC) => [
    { who: "agent", text: "He'd prefer not to share his number — he'll be home, so just ring the bell at #04-02. And you can reach me on this line any time if plans change." },
    { who: "host", hostName: pC.name, text: "No problem, that works. See you soon." },
  ],
  todayWrap: (pB, pC, pA) => [
    { who: "sys", text: "Call ended · 1:12 · ✅ Booked for today" },
    { who: "sys", text: `🧹 Cleanup: ${pB.name} informed · ${pA.name} retry cancelled` },
  ],
};

const plumbOutcome = (outcome, pB, pC) => {
  const b = pB || {}, c = pC || {};
  if (outcome === "today")
    return {
      badge: "TASK COMPLETE", title: "⚡ Plumber booked — today, ~1 hour",
      rows: [["Plumber", `${c.name || "—"} · ${c.rep || ""}`], ["When", "Today · arriving ~1 hour"], ["Est. total", "S$300–400 with parts"], ["Call-out fee", "S$120 (included)"], ["Address", "23 Nassim Rd · #04-02"], ["Backups", `${b.name || "Others"} informed · retries cancelled`]],
      cal: "📅 Add to calendar — today", calToast: "Added to Google Calendar · today", calDone: "✓ On your calendar",
    };
  return {
    badge: "TASK COMPLETE", title: "🔧 Plumber booked — tomorrow 2–4 PM",
    rows: [["Plumber", `${b.name || "—"} · ${b.rep || ""}`], ["When", "Tomorrow · 2:00–4:00 PM"], ["Est. total", "S$200–300 all-in"], ["Call-out fee", "S$89 (included)"], ["Address", "23 Nassim Rd · #04-02"], ["Backups", "Retries cancelled · others informed"]],
    cal: "📅 Add to calendar — tomorrow 2–4 PM", calToast: "Added to Google Calendar · tomorrow 2 PM", calDone: "✓ On your calendar",
  };
};

const GYM_SCRIPT = {
  header: "Fitness First",
  hostLabel: "FITNESS FIRST",
  callName: "Fitness First",
  contact: {
    icon: "🏋️", name: "Fitness First · Paragon", sub: "Gym · 290 Orchard Rd, Level 6",
    number: "+65 6733 0556", source: "From your June billing statement",
    maps: "https://maps.google.com/?q=Fitness+First+Paragon+Singapore",
  },
  altNumbers: {
    contacts: [
      { icon: "🏋️", label: "Fitness First · Member Hotline", num: "+65 6533 3066" },
      { icon: "🏢", label: "Paragon Mall · Concierge", num: "+65 6738 5535" },
    ],
    recents: [
      { icon: "📞", label: "Recent call · last Tuesday", num: "+65 6733 0556" },
      { icon: "📞", label: "Recent call · Monday", num: "+65 6735 5800" },
    ],
  },
  voice1: "I want to cancel my gym membership at Fitness First. I've barely gone the last few months — work has been crazy — and the family's going abroad for the summer. It renews soon, so let's just cancel it.",
  interviewQ: "Got it. Quick strategy check before I dial: is the real goal to stop paying while you're not using it, or a hard cancel no matter what? Gyms almost always counter with a sweetener to keep you — how do you want me to handle those?",
  voice2: "My year ends in a couple of weeks and it auto-renews for a whole year — that's really why I'm cancelling. If they weren't going to bill me, I'd be open to hearing something. I'd still much prefer to cancel — but make the call and see what you come up with.",
  afterVoice2: "Smart brief: hard lean toward cancelling before the renewal hits, but you'll listen if the offer genuinely stops the billing. I found the club's number — confirm it's the right one?",
  call1a: [
    { who: "host", text: "Good evening, Fitness First Paragon — this is Priya." },
    { who: "agent", text: "Hi Priya! I'm calling on behalf of Randy Duax. His membership renews in about two weeks, and he'd like to cancel before that happens." },
    { who: "host", text: "I can certainly help. For verification, could you give me the last four digits of the card on file?" },
    { who: "agent", text: "Of course — one moment while I get that from Randy securely." },
    { who: "sys", text: "🔔 Secure request sent to Randy: last 4 digits of payment card" },
  ],
  call1b: (digits) => [
    { who: "agent", text: `Thanks for waiting — the last four digits are ${digits}.` },
    { who: "host", text: "Verified, thank you. I do see Randy hasn't checked in at all this past month." },
    { who: "agent", text: "That's right — work has been hectic and the family's heading abroad for the summer. That's exactly why cancelling before the renewal makes sense." },
    { who: "host", text: "Completely understand. One thing he should know: our rates went up this year, so if he cancels and rejoins later he'd lose his current price. Instead, I could freeze his account for two months at his current rate. Would he take that?" },
    { who: "agent", text: "That's a fair option — let me check with Randy right now. One moment, please." },
    { who: "sys", text: "🔔 Urgent ping sent to Randy: \u201CFreeze 2 months at your current rate — or cancel?\u201D" },
  ],
  acceptFreeze: [
    { who: "agent", text: "Good news — Randy will take the two-month freeze at his current rate. Please confirm there are no charges during the freeze and the annual renewal won't auto-process." },
    { who: "host", text: "Done — frozen through August 11 at his current $89 rate, renewal paused, zero charges in the meantime. Confirmation FF-2291, email on its way." },
    { who: "agent", text: "Perfect — thank you, Priya. Have a great evening!" },
    { who: "sys", text: "Call ended · 2:14 · ✅ Frozen at old rate" },
  ],
  pushBetter: [
    { who: "agent", text: "He appreciates the offer, but he was fairly set on cancelling. Is there anything stronger you can do?" },
    { who: "host", text: "Let me check… I can see he hasn't used the club at all this billing cycle. Final offer: the two-month freeze at his current rate, plus one free month added on to make up for the unused cycle. That's the best I've got." },
    { who: "agent", text: "That's generous — one moment, checking with Randy again." },
    { who: "sys", text: "🔔 Urgent ping sent to Randy: \u201CImproved: freeze + 1 free month — accept, or cancel anyway?\u201D" },
  ],
  acceptSweetened: [
    { who: "agent", text: "Randy's in — the freeze plus the free month. Please lock that at his current rate with the renewal paused." },
    { who: "host", text: "All set: two-month freeze, one free month credited, $89 rate locked, auto-renewal off. Confirmation FF-2291 — email confirmation sent." },
    { who: "agent", text: "Wonderful. Thanks for going the extra mile, Priya!" },
    { who: "sys", text: "Call ended · 2:41 · ✅ Freeze + free month secured" },
  ],
  justCancel: [
    { who: "agent", text: "Thank you, Priya, but Randy's made up his mind — please process the full cancellation before the renewal." },
    { who: "host", text: "Understood. Cancelled effective June 24, the end of his term — no renewal charge. Cancellation number FF-CXL-8841, confirmation email sent." },
    { who: "agent", text: "That's exactly what he needed. Thanks for making it painless!" },
    { who: "sys", text: "Call ended · 1:58 · ✅ Cancelled · $0 renewal" },
  ],
};

const GYM_OUTCOMES = {
  frozen: {
    badge: "TASK COMPLETE", title: "🧊 Account frozen — renewal dodged",
    rows: [["Outcome", "2-month freeze · zero charges"], ["Rate locked", "$89/mo (new rate is $109)"], ["Auto-renewal", "Paused"], ["Confirmation", "FF-2291"]],
    cal: "📅 Remind me before the freeze ends", calToast: "Reminder set · Aug 9", calDone: "✓ Reminder set for Aug 9",
  },
  sweetened: {
    badge: "TASK COMPLETE", title: "🎉 Better offer secured",
    rows: [["Outcome", "2-month freeze + 1 free month"], ["Rate locked", "$89/mo (new rate is $109)"], ["Free month value", "$89 credited"], ["Auto-renewal", "Paused"], ["Confirmation", "FF-2291"]],
    cal: "📅 Remind me before the freeze ends", calToast: "Reminder set · Aug 9", calDone: "✓ Reminder set for Aug 9",
  },
  cancelled: {
    badge: "TASK COMPLETE", title: "✂️ Membership cancelled",
    rows: [["Effective", "June 24 — end of term"], ["Renewal charge", "$0 (was $1,068/yr)"], ["Confirmation", "FF-CXL-8841"], ["Email", "Confirmation on its way"]],
    cal: "📅 Remind me to reconsider in September", calToast: "Reminder set · Sep 1", calDone: "✓ Reminder set for Sep 1",
  },
};

function taskCardCopy(t) {
  if (t.kind === "plumber") {
    const o = t.outcome;
    const sel = (t.plumbSelected || []).map((id) => PLUMBERS.find((x) => x.id === id)).filter(Boolean);
    const bN = sel[1] ? sel[1].name : "Plumber", cN = sel[2] ? sel[2].name : "Plumber";
    return {
      icon: "🔧",
      inprog: "Find a plumber — kitchen sink leak",
      sched: "Call plumbers — kitchen sink leak",
      schedSub: "makes the calls",
      done: o === "today" ? "Plumber booked — today ⚡" : "Plumber booked — tomorrow 🔧",
      doneSub: o === "today" ? `${cN} · ~1 hr · est. S$300–400` : `${bN} · 2–4 PM · est. S$200–300`,
    };
  }
  if (t.kind === "gym") {
    const o = t.outcome;
    return {
      icon: "🏋️",
      inprog: "Cancel gym membership",
      sched: "Call Fitness First — cancel before renewal",
      schedSub: "makes the call",
      done: o === "cancelled" ? "Fitness First — cancelled ✂️" : o === "sweetened" ? "Fitness First — freeze + free month 🎉" : "Fitness First — frozen 🧊",
      doneSub: o === "cancelled" ? "Effective Jun 24 · $0 renewal" : o === "sweetened" ? "2-mo freeze + 1 free month · $89 locked" : "2-mo freeze · $89 locked · renewal paused",
    };
  }
  return {
    icon: "🍝",
    inprog: "Table at Osteria Mozza",
    sched: t.firstCallPending ? "Call Osteria Mozza — table for 4 tonight" : "Call Osteria Mozza — retry for table",
    schedSub: t.firstCallPending ? "makes the call" : "calls again",
    done: "Osteria Mozza — booked ✅",
    doneSub: "Tonight · 7:15 PM · party of 4",
  };
}

const TASK_SCRIPT = {
  header: "Osteria Mozza",
  hostLabel: "OSTERIA MOZZA",
  callName: "Osteria Mozza",
  voice1: "Book me a table at Osteria Mozza tonight at 7 for four people. I tried booking online and it says they're completely full.",
  contact: { icon: "🍝", name: "Osteria Mozza", sub: "Italian · Hilton Singapore Orchard", number: "+65 6509 5878", source: "Matched from your recent searches", maps: "https://maps.google.com/?q=Osteria+Mozza+Hilton+Singapore+Orchard" },
  voice2: "I tried online and there's nothing available. Call them and ask if there are any cancellations or anything open tonight around 7. If they have something, book it under Randy for four.",
  call1: [
    { who: "host", text: "Good afternoon, Osteria Mozza." },
    { who: "agent", text: "Hi! I'm calling on behalf of Randy — he's hoping for a table for four tonight around 7. Any cancellations or openings?" },
    { who: "host", text: "I'm sorry, we're fully committed tonight. Tables do free up sometimes — you're welcome to try again in about half an hour." },
    { who: "agent", text: "Understood — thank you so much, I'll check back shortly. Have a great evening!" },
    { who: "sys", text: "Call ended · 0:24 · No table yet" },
  ],
  call2a: [
    { who: "host", text: "Osteria Mozza, good evening." },
    { who: "agent", text: "Hi, it's Randy's assistant calling back — any luck with a table for four tonight?" },
    { who: "host", text: "You're in luck — a four-top just opened, but it's at 7:15 rather than 7:00. Shall I hold it?" },
    { who: "agent", text: "He asked for 7:00, so please hold it for one moment — I'm checking with Randy right now." },
    { who: "sys", text: "🔔 Urgent ping sent to Randy: \u201C7:15 instead of 7:00 — OK to book?\u201D" },
  ],
  call2ok: [
    { who: "agent", text: "Good news — Randy confirms 7:15 works. Please book it under Randy, party of four." },
    { who: "host", text: "Wonderful — all set. We'll see Randy and party at 7:15 tonight. Thank you!" },
    { who: "sys", text: "Call ended · 0:48 · ✅ Table booked" },
  ],
  call2no: [
    { who: "agent", text: "Randy would rather hold out for 7:00 sharp. If a 7:00 table frees up, we'd really appreciate a call back at this number." },
    { who: "host", text: "Understood — I've made a note. We'll reach out if 7:00 opens up." },
    { who: "sys", text: "Call ended · 0:44 · Holding out for 7:00" },
  ],
  altNumbers: {
    contacts: [
      { icon: "🏨", label: "Hilton Singapore Orchard · Concierge", num: "+65 6737 4411" },
      { icon: "🍸", label: "Osteria Mozza · Bar & Lounge", num: "+65 6509 5871" },
    ],
    recents: [
      { icon: "📞", label: "Recent call · yesterday, 6:12 PM", num: "+65 6261 6364" },
      { icon: "📞", label: "Recent call · Monday", num: "+65 6735 5800" },
    ],
  },
  restaurants: [
    { name: "Da Paolo Dempsey", sub: "Italian · Dempsey Hill", rating: "4.5 ★", dist: "2.1 km", phone: "+65 6261 6364", maps: "https://maps.google.com/?q=Da+Paolo+Dempsey+Hill+Singapore", x: 28, y: 36 },
    { name: "iO Italian Osteria", sub: "Italian · HillV2", rating: "4.6 ★", dist: "4.8 km", phone: "+65 6710 7150", maps: "https://maps.google.com/?q=iO+Italian+Osteria+HillV2+Singapore", x: 18, y: 62 },
    { name: "Zafferano", sub: "Italian · Ocean Financial Centre", rating: "4.4 ★", dist: "3.4 km", phone: "+65 6509 1700", maps: "https://maps.google.com/?q=Zafferano+Ocean+Financial+Centre+Singapore", x: 72, y: 58 },
  ],
};

function SegTabs({ active, onCalls, onTasks, taskDot }) {
  const pill = (isActive) => ({
    fontFamily: FONT, flex: 1, padding: "10px 0", borderRadius: 100, fontSize: 14, fontWeight: 700,
    border: "none", cursor: "pointer", position: "relative",
    background: isActive ? INK : "transparent", color: isActive ? "#fff" : INK_SOFT,
  });
  return (
    <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid #EDF0F8", borderRadius: 100, padding: 4, marginBottom: 18, boxShadow: "0 3px 12px rgba(16,23,58,.05)" }}>
      <button style={pill(active === "calls")} onClick={onCalls}>📞 Calls</button>
      <button style={pill(active === "tasks")} onClick={onTasks}>
        ✨ Tasks
        {taskDot && <span style={{ position: "absolute", top: 7, right: 16, width: 8, height: 8, borderRadius: "50%", background: CORAL }} />}
      </button>
    </div>
  );
}

/* ---------- Preferences ---------- */
function PrefRow({ icon, title, sub, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {value && <div style={{ fontSize: 13, fontWeight: 700, color: INK_SOFT, textAlign: "right", flexShrink: 0, maxWidth: 150 }}>{value}</div>}
    </div>
  );
}

function PrefToggle({ icon, title, sub, value, onChange }) {
  return (
    <div style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{title}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 11, marginLeft: 30 }}>
        {[["ask", "Ask me first"], ["always", "Share automatically"]].map(([v, lab]) => (
          <button key={v} onClick={() => onChange(v)} style={{ fontFamily: FONT, flex: 1, background: value === v ? INK : "#fff", color: value === v ? "#fff" : INK_SOFT, border: value === v ? `1.5px solid ${INK}` : "1.5px solid #E3E7F2", borderRadius: 100, padding: "9px 10px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", transition: "all .15s" }}>{lab}</button>
        ))}
      </div>
    </div>
  );
}

function SectionCard({ label, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: MUTED, letterSpacing: 1, textTransform: "uppercase", padding: "0 6px 8px" }}>{label}</div>
      <div style={{ background: "#fff", border: "1px solid #EDF0F8", borderRadius: 18, boxShadow: "0 6px 20px rgba(16,23,58,.05)", overflow: "hidden" }}>
        {Array.isArray(children)
          ? children.filter(Boolean).map((c, i) => (
              <div key={i} style={{ borderTop: i > 0 ? "1px solid #F2F4FA" : "none" }}>{c}</div>
            ))
          : children}
      </div>
    </div>
  );
}

export function PrefsScreen({ profile, setProfile, role, notify, onBack }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "stagIn .3s ease" }}>
      <div style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #F7F8FC 100%)", padding: "0 18px 14px", paddingTop: "max(env(safe-area-inset-top), 16px)", borderBottom: "1px solid #EDF0F8", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ fontFamily: FONT, width: 38, height: 38, borderRadius: "50%", background: "#fff", border: "1px solid #EDF0F8", color: INK, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 6 }}>←</button>
        <div style={{ color: INK, fontSize: 19, fontWeight: 800, letterSpacing: -0.3, marginTop: 6 }}>Preferences</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 60px" }}>
        <div style={{ background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, padding: 18, display: "flex", alignItems: "center", gap: 15, boxShadow: "0 6px 20px rgba(16,23,58,.05)" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#7C5CFF,#4285F4)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0 }}>R</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Randy Duax</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>randy.duax@stagwell.com</div>
            <div style={{ display: "inline-block", marginTop: 7, background: "#EFF3FC", border: "1px solid #DCE6F8", borderRadius: 100, padding: "4px 11px", fontSize: 11.5, fontWeight: 800, color: "#1A6FB5" }}>{role} persona</div>
          </div>
        </div>

        <SectionCard label="Contact details">
          {[
            <PrefRow key="p" icon="📞" title="Phone number" sub="Used for callbacks when you allow it" value={profile.phone} />,
            <PrefRow key="a" icon="🏠" title="Home address" sub="Used for service visits when you allow it" value={profile.address.replace(", Singapore", " · Singapore")} />,
          ]}
        </SectionCard>

        <SectionCard label="Privacy & sharing">
          {[
            <PrefToggle key="ph" icon="📱" title="Share my phone number" sub="When a service provider asks for a callback number" value={profile.sharePhone} onChange={(v) => { setProfile((pp) => ({ ...pp, sharePhone: v })); notify(v === "always" ? "Phone number — shared automatically" : "Phone number — I'll ask you first"); }} />,
            <PrefToggle key="ad" icon="📍" title="Share my home address" sub="When a visit needs to be booked at your home" value={profile.shareAddress} onChange={(v) => { setProfile((pp) => ({ ...pp, shareAddress: v })); notify(v === "always" ? "Home address — shared automatically" : "Home address — I'll ask you first"); }} />,
          ]}
        </SectionCard>

        <SectionCard label="Assistant">
          {[
            <PrefRow key="v" icon="🎙️" title="Voice" sub="How your assistant sounds on calls" value="Calm · British" />,
            <PrefRow key="e" icon="⚡" title="Escalation" sub="When to ping you mid-call" value="Decisions & VIPs" />,
            <PrefRow key="c" icon="📅" title="Calendar access" sub="For booking confirmed appointments" value="Connected ✓" />,
          ]}
        </SectionCard>

        <div style={{ marginTop: 16, display: "flex", gap: 9, alignItems: "flex-start", background: "#F4F6FD", border: "1px solid #E3E8F6", borderRadius: 14, padding: "12px 14px" }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <div style={{ fontSize: 12, color: INK_SOFT, lineHeight: 1.55 }}>These update automatically as you make choices during tasks — like when a plumber asks for your number and you tap "always OK in cases like this".</div>
        </div>
        <div style={{ textAlign: "center", fontSize: 10.5, color: "#B8BEd5", fontWeight: 600, marginTop: 22, letterSpacing: 0.3 }}>Demo build 29 · 11 Jun</div>
      </div>
    </div>
  );
}

function ActiveTaskCard({ task, aiName, onOpen, onTryNow, onArchive }) {
  const [swipeX, setSwipeX] = useState(0);
  const dragRef = useRef({ startX: null, base: 0 });
  const dragStart = (x) => { dragRef.current = { startX: x, base: swipeX }; };
  const dragMove = (x) => {
    if (dragRef.current.startX == null) return;
    const dx = dragRef.current.base + (x - dragRef.current.startX);
    setSwipeX(Math.max(-110, Math.min(0, dx)));
  };
  const dragEnd = () => {
    if (dragRef.current.startX == null) return;
    dragRef.current.startX = null;
    setSwipeX((v) => (v < -55 ? -100 : 0));
  };
  const copy = taskCardCopy(task);
  const remaining = task.scheduledAt ? Math.max(0, task.scheduledAt - Date.now()) : 0;
  const mm = Math.floor(remaining / 60000), ss = Math.floor((remaining % 60000) / 1000);
  const execAt = task.scheduledAt ? new Date(task.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  if (task.phase === "scheduled")
    return (
      <button onClick={onOpen} style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, padding: 18, cursor: "pointer", boxShadow: "0 6px 20px rgba(16,23,58,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: "#FBF3E0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>{copy.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>{copy.sched}</div>
            <div style={{ fontSize: 12.5, color: "#B7791F", fontWeight: 700, marginTop: 2 }}>Scheduled · executes at {execAt}</div>
          </div>
        </div>
        <div style={{ marginTop: 14, background: PAPER, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, color: INK, letterSpacing: 0.5, fontVariantNumeric: "tabular-nums" }}>
            {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </div>
          <div style={{ flex: 1, fontSize: 12, color: MUTED, fontWeight: 600, lineHeight: 1.35 }}>until {aiName} {copy.schedSub} automatically</div>
          <span
            onClick={(e) => { e.stopPropagation(); onTryNow(); }}
            style={{ fontFamily: FONT, background: CORAL, color: "#fff", borderRadius: 100, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 12px rgba(249,97,103,.3)" }}
          >▶ Try now</span>
        </div>
      </button>
    );

  if (task.phase === "done")
    return (
      <div>
        <div style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
          <button
            onClick={() => { setSwipeX(0); onArchive(); }}
            style={{ fontFamily: FONT, position: "absolute", top: 0, bottom: 0, right: 0, width: 96, background: "#5A6478", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
          >
            🗂{"\n"}Archive
          </button>
          <button
            onClick={() => { if (swipeX === 0) onOpen(); }}
            onTouchStart={(e) => dragStart(e.touches[0].clientX)}
            onTouchMove={(e) => dragMove(e.touches[0].clientX)}
            onTouchEnd={dragEnd}
            onMouseDown={(e) => dragStart(e.clientX)}
            onMouseMove={(e) => e.buttons === 1 && dragMove(e.clientX)}
            onMouseUp={dragEnd}
            style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "#F0FAF5", border: "1px solid #BBE6D1", borderRadius: 20, padding: 18, cursor: "pointer", display: "flex", alignItems: "center", gap: 13, transform: `translateX(${swipeX}px)`, transition: dragRef.current.startX == null ? "transform .2s ease" : "none", position: "relative" }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>{copy.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>{copy.done}</div>
              <div style={{ fontSize: 12.5, color: GREEN, fontWeight: 700, marginTop: 2 }}>{copy.doneSub}</div>
            </div>
            <span style={{ color: "#9CCBB2", fontWeight: 800 }}>›</span>
          </button>
        </div>
        <div style={{ textAlign: "center", fontSize: 11.5, color: MUTED, fontWeight: 600, marginTop: 8 }}>← Swipe left to archive · tap to view history</div>
      </div>
    );

  return (
    <button onClick={onOpen} style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, padding: 18, cursor: "pointer", boxShadow: "0 6px 20px rgba(16,23,58,.06)", display: "flex", alignItems: "center", gap: 13 }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: "#FBF3E0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>{task.phase === "label" ? "✨" : copy.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>{task.phase === "label" ? "New task — not named yet" : copy.inprog}</div>
        <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600, marginTop: 2 }}>In progress — tap to continue</div>
      </div>
      <span style={{ color: "#C3C9DC", fontWeight: 800 }}>›</span>
    </button>
  );
}

export function TasksScreen({ tasks = [], archivedTasks = [], aiName, onCalls, onNew, onOpen, onTryNow, onArchive, onOpenArchived }) {
  const [showArchived, setShowArchived] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const anyDone = tasks.some((t) => t.phase === "done");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", animation: "stagIn .3s ease" }}>
      <div style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #F7F8FC 100%)", padding: "0 22px 14px", paddingTop: "max(env(safe-area-inset-top), 20px)", borderBottom: "1px solid #EDF0F8" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Logo size={40} />
          <div style={{ flex: 1 }}>
            <div style={{ color: INK, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Tasks</div>
            <div style={{ color: MUTED, fontSize: 12.5, fontWeight: 500 }}>{`${aiName} makes the calls you'd rather not`}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 40px" }}>
        <SegTabs active="tasks" onCalls={onCalls} />

        {tasks.length === 0 && (
          <div style={{ background: "#fff", border: "1.5px dashed #DDE2F0", borderRadius: 20, padding: "34px 22px", textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>✨</div>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: INK, marginTop: 10 }}>No tasks yet</div>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
              Give {aiName} a goal — book a table, chase a refund, hunt down a sold-out toy — and it makes the calls for you.
            </div>
          </div>
        )}

        {tasks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tasks.map((t, i) => (
              <ActiveTaskCard key={i} task={t} aiName={aiName} onOpen={() => onOpen(i)} onTryNow={() => onTryNow(i)} onArchive={() => onArchive(i)} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Btn onClick={onNew}>＋ New task</Btn>
          {anyDone && (
            <div style={{ textAlign: "center", fontSize: 11.5, color: MUTED, fontWeight: 600, marginTop: 8 }}>Starting a new task files completed ones under Archived</div>
          )}
        </div>

        {archivedTasks.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <button onClick={() => setShowArchived((v) => !v)} style={{ fontFamily: FONT, width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 2px" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: MUTED, letterSpacing: 1, textTransform: "uppercase" }}>🗂 Archived ({archivedTasks.length})</span>
              <div style={{ flex: 1, height: 1, background: "#E3E7F2" }} />
              <span style={{ color: MUTED, fontWeight: 800, fontSize: 13, transform: showArchived ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
            </button>
            {showArchived && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10 }}>
                {archivedTasks.map((t, i) => (
                  <button key={i} onClick={() => onOpenArchived(i)} style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 16, padding: "13px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, opacity: 0.85, animation: "stagIn .25s ease" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{taskCardCopy(t).icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: INK_SOFT }}>{taskCardCopy(t).done}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>Archived · {new Date(t.archivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · tap for full history</div>
                    </div>
                    <span style={{ color: "#C3C9DC", fontWeight: 800 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskMapCard() {
  return (
    <div style={{ alignSelf: "stretch", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, overflow: "hidden", boxShadow: "0 6px 20px rgba(16,23,58,.07)", animation: "stagIn .3s ease" }}>
      <div style={{ padding: "13px 16px 10px", fontSize: 13.5, fontWeight: 800, color: INK }}>📍 Italian restaurants near you · Singapore</div>
      <div style={{ position: "relative", height: 150, background: "linear-gradient(180deg, #EAF1E6 0%, #E4EDE0 70%, #CFE3F2 100%)" }}>
        <div style={{ position: "absolute", top: "30%", left: 0, right: 0, height: 5, background: "#fff", transform: "rotate(-4deg)" }} />
        <div style={{ position: "absolute", top: "62%", left: 0, right: 0, height: 4, background: "#fff", transform: "rotate(3deg)" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "44%", width: 4, background: "#fff", transform: "rotate(8deg)" }} />
        <div style={{ position: "absolute", bottom: 6, right: 10, fontSize: 9.5, fontWeight: 700, color: "#7FA8C9" }}>Marina Bay</div>
        {TASK_SCRIPT.restaurants.map((r) => (
          <div key={r.name} style={{ position: "absolute", left: `${r.x}%`, top: `${r.y}%`, transform: "translate(-50%, -100%)", textAlign: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50% 50% 50% 0", background: CORAL, transform: "rotate(-45deg)", margin: "0 auto", boxShadow: "0 4px 10px rgba(224,69,80,.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ transform: "rotate(45deg)", fontSize: 12 }}>🍝</span>
            </div>
          </div>
        ))}
        <div style={{ position: "absolute", left: "52%", top: "44%", transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: "#4285F4", border: "3px solid #fff", boxShadow: "0 2px 8px rgba(0,0,0,.25)" }} />
      </div>
      <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 9 }}>
        {TASK_SCRIPT.restaurants.map((r) => (
          <div key={r.name} style={{ background: PAPER, border: "1px solid #EDF0F8", borderRadius: 16, padding: "13px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "#FDECEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🍝</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{r.sub}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: INK_SOFT }}>{r.rating}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, marginTop: 1 }}>📍 {r.dist}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <a href={`tel:${r.phone.replace(/\s/g, "")}`} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", border: "1px solid #E3E7F2", borderRadius: 10, padding: "9px 8px", fontSize: 12, fontWeight: 800, color: INK, textDecoration: "none", whiteSpace: "nowrap" }}>📞 {r.phone}</a>
              <a href={r.maps} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "#EFF3FC", border: "1px solid #DCE6F8", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 800, color: "#1A6FB5", textDecoration: "none", whiteSpace: "nowrap" }}>Maps ↗</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskThread({ task, setTask, aiName, callMe, notify, onExit, profile, setProfile }) {
  const [localProfile, setLocalProfile] = useState({ phone: "+65 8123 4567", address: HOME_ADDRESS, sharePhone: "ask", shareAddress: "ask" });
  const prof = profile || localProfile;
  const setProf = setProfile || setLocalProfile;
  const [typing, setTyping] = useState(null); // null | "ai" | "host" | "agent"
  const [awaiting, setAwaiting] = useState(null); // voice1 | contact | voice2 | when | post1 | success
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [voiceHint, setVoiceHint] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customNum, setCustomNum] = useState("");
  const SCRIPT = task.kind === "gym" ? GYM_SCRIPT : task.kind === "plumber" ? PLUMB_SCRIPT : TASK_SCRIPT;
  const selPlumbers = (task.plumbSelected || []).map((id) => PLUMBERS.find((x) => x.id === id)).filter(Boolean);
  const [pA, pB, pC] = selPlumbers;
  const [addr, setAddr] = useState("");
  const [addrSug, setAddrSug] = useState(false);
  const contactNumber = task.contactNumber || SCRIPT.contact.number;
  const [cardDigits, setCardDigits] = useState("");
  const [cardSave, setCardSave] = useState("forget");
  const pickNumber = (num) => {
    setTask((t) => ({ ...t, contactNumber: num }));
    setEditOpen(false);
    setCustomNum("");
    notify("Contact number updated");
  };
  useEffect(() => {
    if (!voiceHint) return;
    const t = setTimeout(() => setVoiceHint(false), 6000);
    return () => clearTimeout(t);
  }, [voiceHint]);
  const scrollRef = useRef(null);
  const queueRef = useRef([]);
  const busyRef = useRef(false);
  const startedRef = useRef({});

  const lastMsgRef = useRef(null);
  const push = (msg) => {
    lastMsgRef.current = msg;
    setTask((t) => ({ ...t, thread: [...t.thread, msg] }));
  };
  const pump = () => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    busyRef.current = true;
    const isSys = next.msg.who === "sys" || next.msg.type;
    setTyping(isSys ? null : next.msg.who || "ai");
    const len = (next.msg.text || "").length;
    let waitMs = isSys ? 900 : Math.min(2600, 700 + len * 16);
    // Reading pause: give the viewer time to read what just landed before the next bubble
    const prev = lastMsgRef.current;
    if (prev) {
      if (prev.who === "user") {
        waitMs += Math.min(6500, Math.max(3500, (prev.text || "").length * 32));
      } else if (prev.type) {
        waitMs += 1600; // cards take a moment to scan
      }
    }
    setTimeout(() => {
      setTyping(null);
      push(next.msg);
      if (next.after) next.after();
      busyRef.current = false;
      setTimeout(pump, next.gap != null ? next.gap : 600);
    }, waitMs);
  };
  const q = (msg, after, gap) => { queueRef.current.push({ msg, after, gap }); pump(); };

  // phase runners (guarded so they fire once)
  useEffect(() => {
    if (task.phase === "label" && !startedRef.current.label) {
      startedRef.current.label = true;
      if (task.thread.length === 0) {
        q({ who: "ai", text: `New task! What should I get done, ${callMe}? Give it a name below — type it or just talk.` }, () => setAwaiting("label"));
      } else {
        setAwaiting("label");
      }
    }
    if (task.phase === "compose" && !startedRef.current.compose) {
      startedRef.current.compose = true;
      if (task.thread.length === 0) {
        q({ who: "ai", text: `Hi ${callMe}! What would you like me to get done? Type it out — or just tell me with a voice note.` }, () => setAwaiting("voice1"));
      } else {
        setAwaiting("voice1");
      }
    }
    if (task.phase === "post1" && !startedRef.current.post1rejoin) {
      startedRef.current.post1rejoin = true;
      setAwaiting("post1");
    }
    if (task.phase === "scheduled" && !startedRef.current.schedrejoin) {
      startedRef.current.schedrejoin = true;
      setAwaiting("scheduled");
    }
    if (task.phase === "call2" && task.firstCallPending && !startedRef.current.call1sched) {
      startedRef.current.call1sched = true;
      setAwaiting(null);
      runCall1(true);
      return;
    }
    if (task.phase === "call2" && !task.firstCallPending && !startedRef.current.call2) {
      startedRef.current.call2 = true;
      const alreadyPinged = task.thread.some((m) => m.text && m.text.includes("Urgent ping sent"));
      if (alreadyPinged) {
        setAwaiting("confirm715");
      } else {
        setAwaiting(null);
        q({ who: "sys", text: "⚡ Running scheduled task now — ahead of schedule" }, null, 300);
        TASK_SCRIPT.call2a.forEach((line) => q(line));
        q({ who: "ai", text: `${callMe}, quick decision needed: they can seat you at 7:15 instead of 7:00. The host is holding the table while you decide.` }, () => setAwaiting("confirm715"));
      }
    }
    if (task.phase === "call1" && task.kind === "gym" && task.thread.length > 0 && !startedRef.current.gymrejoin) {
      startedRef.current.gymrejoin = true;
      const txts = task.thread.map((m) => m.text || "");
      const has = (frag) => txts.some((t) => t.includes(frag));
      if (has("Improved: freeze + 1 free month") && !has("Randy's in")) setAwaiting("gymOffer2");
      else if (has("Freeze 2 months at your current rate") && !has("Take the freeze") && !has("better offer") && !has("Just cancel")) setAwaiting("gymOffer1");
      else if (has("Secure request sent") && !has("the last four digits are")) setAwaiting("card");
    }
    if (task.phase === "done" && !startedRef.current.donerejoin) {
      startedRef.current.donerejoin = true;
      setAwaiting("success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.phase]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [task.thread, typing, recording, transcribing]);

  useEffect(() => {
    if (!recording) return;
    setRecSec(0);
    const t = setInterval(() => setRecSec((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const stopRecording = () => {
    setRecording(false);
    setTranscribing(true);
    setTimeout(() => {
      setTranscribing(false);
      if (awaiting === "voice1") {
        setAwaiting(null);
        push({ who: "user", voice: true, text: SCRIPT.voice1 });
        if (task.kind === "plumber") {
          q({ who: "ai", text: "On that right away — searching for well-rated plumbers near you…" });
          q({ who: "sys", text: "🔎 Searching Google Maps · plumbers near your home" }, null, 300);
          q({ who: "ai", text: "Found four solid options nearby. Select the ones you want me to contact — I'd cast a wide net:" }, null, 200);
          q({ type: "plumbers" }, () => setAwaiting("plumbpick"));
        } else if (task.kind === "gym") {
          q({ who: "ai", text: SCRIPT.interviewQ }, () => setAwaiting("voice2"));
        } else {
          q({ who: "ai", text: "On it. I think I found who you mean — can you confirm this is the right place to call?" });
          q({ type: "contact" }, () => setAwaiting("contact"));
        }
      } else if (awaiting === "voice2") {
        setAwaiting(null);
        push({ who: "user", voice: true, text: SCRIPT.voice2 });
        if (task.kind === "gym") {
          q({ who: "ai", text: SCRIPT.afterVoice2 });
          q({ type: "contact" }, () => setAwaiting("contact"));
        } else {
          q({ who: "ai", text: "Crystal clear: cancellations or any opening tonight ~7:00, book under " + callMe + " for four. When should I make the call?" }, () => setAwaiting("when"));
        }
      }
    }, 1500);
  };

  const pickDemoTask = (t) => {
    if (!t.live) {
      notify(`${t.icon} ${t.label} — coming soon`);
      return;
    }
    setPickerOpen(false);
    setAwaiting(null);
    startedRef.current.compose = true;
    setTask((tk) => ({ ...tk, phase: "compose", kind: t.kind }));
    push({ who: "user", text: `${t.icon} ${t.label}` });
    const greeting = t.kind === "gym"
      ? "Tell me what's going on with the gym — tap the mic and give me the story."
      : t.kind === "plumber"
      ? "Tell me what's going on with the plumbing — tap the mic and give me the story."
      : "Tell me the details: which restaurant, when, and for how many? Tap the mic and talk it out.";
    q({ who: "ai", text: greeting }, () => setAwaiting("voice1"));
  };

  const confirmContact = () => {
    setAwaiting(null);
    push({ who: "user", text: "Yes — that's the one ✓" });
    if (task.kind === "gym") {
      q({ who: "ai", text: "Locked in. When should I make the call?" }, () => setAwaiting("when"));
    } else {
      q({ who: "ai", text: "Perfect. Now tell me exactly what you'd like me to accomplish on this call." }, () => setAwaiting("voice2"));
    }
  };

  const runCall1 = (viaSchedule) => {
    setTask((t) => ({ ...t, phase: "call1", firstCallPending: false, scheduledAt: null }));
    if (viaSchedule) {
      q({ who: "sys", text: "⚡ Running scheduled task now — ahead of schedule" }, null, 300);
    } else {
      q({ who: "ai", text: "Dialing now — you can watch the call live right here." }, null, 300);
    }
    q({ who: "sys", text: `📞 Calling ${SCRIPT.callName} · ${contactNumber}` });
    if (task.kind === "gym") {
      GYM_SCRIPT.call1a.forEach((line) => q(line));
      q({ who: "ai", text: `${callMe}, Priya needs the last four digits of your card on file to verify the account. I'll pass along exactly what you type — nothing more.` }, () => setAwaiting("card"));
      return;
    }
    TASK_SCRIPT.call1.forEach((line) => q(line));
    q({ type: "summary1" }, () => {
      setAwaiting("post1");
      setTask((t) => ({ ...t, phase: "post1" }));
    });
  };

  const chooseWhen = (label) => {
    setAwaiting(null);
    push({ who: "user", text: label });
    if (label === "📞 Right now") {
      runCall1(false);
    } else {
      const at = Date.now() + 30 * 60 * 1000;
      const atLabel = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      q({ who: "ai", text: `Okay — I'll call ${SCRIPT.callName} at ${atLabel} and send you the result the moment I hang up. You can also run it early anytime with “Try now” on the task card.` }, () => {
        setTask((t) => ({ ...t, phase: "scheduled", scheduledAt: at, firstCallPending: true }));
        setAwaiting("scheduled");
      });
    }
  };

  const post1Action = (key) => {
    if (key === "map") {
      setAwaiting(null);
      push({ who: "user", text: "Show me other Italian spots nearby" });
      q({ who: "ai", text: "Here are three well-rated Italian restaurants near you with tables tonight:" }, null, 200);
      q({ type: "map" });
      q({ who: "ai", text: "All three are solid backups — tap a Maps link to take a look. Or if you'd rather hold out for Osteria Mozza, I can keep trying:" }, () => setAwaiting("mapsdone"));
    } else if (key === "retry") {
      setAwaiting(null);
      push({ who: "user", text: "Try again in 30 minutes 🔁" });
      const at = Date.now() + 30 * 60 * 1000;
      const atLabel = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      q({ who: "ai", text: `Scheduled. I'll call Osteria Mozza again at ${atLabel} and ping you with the result — or hit “Try now” on the task card anytime.` }, () => {
        setTask((t) => ({ ...t, phase: "scheduled", scheduledAt: at }));
        setAwaiting("scheduled");
      });
    } else if (key === "done") {
      setAwaiting(null);
      push({ who: "user", text: "That's all for now" });
      q({ who: "ai", text: "No problem — the task will stay here if you change your mind." });
    }
  };

  const togglePlumber = (id) => {
    if (awaiting !== "plumbpick") return;
    setTask((t) => {
      const cur = t.plumbSelected || [];
      return { ...t, plumbSelected: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  };

  const confirmPlumbers = () => {
    const sel = (task.plumbSelected || []).map((id) => PLUMBERS.find((x) => x.id === id)).filter(Boolean);
    if (sel.length < 3) return;
    setAwaiting(null);
    push({ who: "user", text: `Contact: ${sel.slice(0, 3).map((x) => x.name).join(", ")}${sel.length > 3 ? ` +${sel.length - 3} more` : ""} ✓` });
    q({ who: "ai", text: "Got it. One more thing — what matters most here?" }, () => setAwaiting("plumbprio"));
  };

  const choosePrio = (label) => {
    setAwaiting(null);
    push({ who: "user", text: label });
    const sel = (task.plumbSelected || []).map((id) => PLUMBERS.find((x) => x.id === id)).filter(Boolean);
    const prio = label.includes("Soonest") ? "the soonest possible visit" : "the lowest price";
    setTask((t) => ({ ...t, plumbPrio: prio }));
    q({ who: "ai", text: `Final check: I'll call ${sel.slice(0, 3).map((x) => x.name).join(", ")} about the kitchen-sink leak, prioritizing ${prio}. Ready?` }, () => setAwaiting("plumbconfirm"));
  };

  const startPlumbCalls = () => {
    setAwaiting(null);
    push({ who: "user", text: "✓ Start calling" });
    setTask((t) => ({ ...t, phase: "call1" }));
    PLUMB_SCRIPT.vmIntro(pA).forEach((line) => q(line));
    q({ who: "ai", text: `Hit ${pA.name}'s voicemail. Want me to leave your callback number — +65 8123 4567 — so they can reach you directly?` }, () => setAwaiting("sharenum"));
  };

  const vmDecide = (choice) => {
    setAwaiting(null);
    if (choice === "always") setProf((pp) => ({ ...pp, sharePhone: "always" }));
    if (choice === "no") {
      push({ who: "user", text: "🚫 Don't share my number" });
      PLUMB_SCRIPT.vmNoShare(pA).forEach((line) => q(line));
    } else {
      push({ who: "user", text: choice === "always" ? "✓ Share it — always OK in cases like this" : "✓ Share it — just this time" });
      if (choice === "always") q({ who: "sys", text: "Preference saved: OK to share your number with service providers" }, null, 200);
      PLUMB_SCRIPT.vmShare(pA).forEach((line) => q(line));
    }
    PLUMB_SCRIPT.callB1(pB).forEach((line) => q(line));
    q({ who: "ai", text: `${pB.rep} needs the service address. Tap the field below — I've got your home address ready to drop in.` }, () => setAwaiting("address"));
  };

  useEffect(() => {
    if (awaiting === "address" && prof.shareAddress === "always" && !addr) setAddr(prof.address);
  }, [awaiting]);

  const sendAddress = (mode) => {
    if (!addr) return;
    setAwaiting(null);
    setAddrSug(false);
    push({ who: "user", text: `🏠 ${addr}` });
    if (mode === "always") {
      setProf((pp) => ({ ...pp, shareAddress: "always" }));
      q({ who: "sys", text: "Preference saved: share your home address with service providers when needed" }, null, 200);
    }
    setAddr("");
    PLUMB_SCRIPT.callB2(pB, (task.plumbPrio || "").includes("soonest")).forEach((line) => q(line));
    q({ who: "ai", text: `${callMe}, ${pB.name} can come tomorrow 2–4 PM, estimated S$200–300 all-in (that includes the S$89 call-out). Book it — or keep looking?` }, () => setAwaiting("plumbq1"));
  };

  const plumbDecide1 = (book) => {
    setAwaiting(null);
    if (book) {
      push({ who: "user", text: "✓ Book it — tomorrow works" });
      PLUMB_SCRIPT.bookB(pB, pA).forEach((line) => q(line));
      q({ type: "plumbsuccess", outcome: "tomorrow" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", outcome: "tomorrow", scheduledAt: null }));
      });
    } else {
      push({ who: "user", text: "🔍 Keep looking for a better option" });
      PLUMB_SCRIPT.holdB(pB).forEach((line) => q(line));
      PLUMB_SCRIPT.callC(pC).forEach((line) => q(line));
      q({ who: "ai", text: `Two live options, ${callMe}: ${pC.name} today (~1 hr, est. S$300–400 total) or ${pB.name} tomorrow 2–4 (est. S$200–300 total). Which way?` }, () => setAwaiting("plumbq2"));
    }
  };

  const finishToday = () => {
    PLUMB_SCRIPT.todayWrap(pB, pC, pA).forEach((line) => q(line));
    q({ type: "plumbsuccess", outcome: "today" }, () => {
      setAwaiting("success");
      setTask((t) => ({ ...t, phase: "done", outcome: "today", scheduledAt: null }));
    });
  };

  const vm2Decide = (choice) => {
    setAwaiting(null);
    if (choice === "no") {
      push({ who: "user", text: "🚫 Don't share my number" });
      PLUMB_SCRIPT.shareDecline(pC).forEach((line) => q(line));
    } else {
      push({ who: "user", text: choice === "always" ? "✓ Share it — always OK in cases like this" : "✓ Share it — just this time" });
      if (choice === "always") {
        setProf((pp) => ({ ...pp, sharePhone: "always" }));
        q({ who: "sys", text: "Preference saved: OK to share your number with service providers" }, null, 200);
      }
      PLUMB_SCRIPT.shareGive(pC).forEach((line) => q(line));
    }
    finishToday();
  };

  const plumbDecide2 = (today) => {
    setAwaiting(null);
    if (today) {
      push({ who: "user", text: `⚡ Today ~1 hr — book ${pC.name}` });
      PLUMB_SCRIPT.pickToday1(pC).forEach((line) => q(line));
      if (prof.sharePhone === "always") {
        PLUMB_SCRIPT.shareGive(pC).forEach((line) => q(line));
        q({ type: "prefnote" });
        finishToday();
      } else {
        q({ who: "sys", text: `🔔 ${pC.name} is asking for your callback number` }, () => setAwaiting("sharenum2"));
      }
    } else {
      push({ who: "user", text: `📅 Tomorrow 2–4 — cheaper, book ${pB.name}` });
      PLUMB_SCRIPT.pickTomorrow(pB, pC, pA).forEach((line) => q(line));
      q({ type: "plumbsuccess", outcome: "tomorrow" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", outcome: "tomorrow", scheduledAt: null }));
      });
    }
  };

  const sendCard = () => {
    if (cardDigits.length !== 4) return;
    setAwaiting(null);
    push({ who: "user", text: `🔒 ${cardDigits} · ${cardSave === "save" ? "saved for future calls" : "will be forgotten after this call"}` });
    GYM_SCRIPT.call1b(cardDigits).forEach((line) => q(line));
    q({ who: "ai", text: `${callMe}, decision time: freeze the account for two months at your current $89 rate (renewal paused), or stick with cancelling? Priya is holding.` }, () => setAwaiting("gymOffer1"));
    setCardDigits("");
  };

  const gymDecide1 = (choice) => {
    setAwaiting(null);
    if (choice === "accept") {
      push({ who: "user", text: "✓ Take the freeze — works for me" });
      GYM_SCRIPT.acceptFreeze.forEach((line) => q(line));
      q({ type: "gymsuccess", outcome: "frozen" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", outcome: "frozen", scheduledAt: null }));
      });
    } else if (choice === "better") {
      push({ who: "user", text: "Push for a better offer 💪" });
      GYM_SCRIPT.pushBetter.forEach((line) => q(line));
      q({ who: "ai", text: `Improved offer on the table: the freeze plus one free month credited. Take it — or cancel anyway?` }, () => setAwaiting("gymOffer2"));
    } else {
      push({ who: "user", text: "Just cancel it ✂️" });
      GYM_SCRIPT.justCancel.forEach((line) => q(line));
      q({ type: "gymsuccess", outcome: "cancelled" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", outcome: "cancelled", scheduledAt: null }));
      });
    }
  };

  const gymDecide2 = (choice) => {
    setAwaiting(null);
    if (choice === "accept") {
      push({ who: "user", text: "✓ Take freeze + free month" });
      GYM_SCRIPT.acceptSweetened.forEach((line) => q(line));
      q({ type: "gymsuccess", outcome: "sweetened" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", outcome: "sweetened", scheduledAt: null }));
      });
    } else {
      push({ who: "user", text: "No — just cancel it ✂️" });
      GYM_SCRIPT.justCancel.forEach((line) => q(line));
      q({ type: "gymsuccess", outcome: "cancelled" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", outcome: "cancelled", scheduledAt: null }));
      });
    }
  };

  const decide715 = (ok) => {
    setAwaiting(null);
    if (ok) {
      push({ who: "user", text: "7:15 works — book it 👍" });
      TASK_SCRIPT.call2ok.forEach((line) => q(line));
      q({ type: "success" }, () => {
        setAwaiting("success");
        setTask((t) => ({ ...t, phase: "done", scheduledAt: null }));
      });
    } else {
      push({ who: "user", text: "No — hold out for 7:00" });
      TASK_SCRIPT.call2no.forEach((line) => q(line));
      q({ type: "summary2" }, () => setAwaiting("post2"));
    }
  };

  const scheduleRetry = (label) => {
    const at = Date.now() + 30 * 60 * 1000;
    const atLabel = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    q({ who: "ai", text: `Scheduled. I'll call Osteria Mozza again at ${atLabel} and ping you with the result — or hit “Try now” on the task card anytime.` }, () => {
      setTask((t) => ({ ...t, phase: "scheduled", scheduledAt: at }));
      setAwaiting("scheduled");
    });
  };

  const runCall2 = () => {
    startedRef.current.call2 = true;
    setTask((t) => ({ ...t, phase: "call2", scheduledAt: null }));
    q({ who: "sys", text: `📞 Calling Osteria Mozza again · ${contactNumber}` });
    TASK_SCRIPT.call2a.forEach((line) => q(line));
    q({ who: "ai", text: `${callMe}, quick decision needed: they can seat you at 7:15 instead of 7:00. The host is holding the table while you decide.` }, () => setAwaiting("confirm715"));
  };

  const mapRetryChoose = (label) => {
    setAwaiting(null);
    push({ who: "user", text: label });
    if (label === "🔁 Retry now") runCall2();
    else scheduleRetry(label);
  };

  const post2Action = (key) => {
    if (key === "retry") {
      setAwaiting(null);
      push({ who: "user", text: "Keep trying every 30 minutes 🔁" });
      const at = Date.now() + 30 * 60 * 1000;
      const atLabel = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      q({ who: "ai", text: `On it — next attempt at ${atLabel}, and I'll keep at it until we land 7:00 or you call it off.` }, () => {
        setTask((t) => ({ ...t, phase: "scheduled", scheduledAt: at }));
        setAwaiting("scheduled");
      });
    } else {
      setAwaiting(null);
      push({ who: "user", text: "That's all for now" });
      q({ who: "ai", text: "Understood — the task stays here if you change your mind." });
    }
  };

  const successAction = (key) => {
    if (key === "cal") {
      setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, cal: true } }));
      notify("Added to Google Calendar · 7:15 PM");
    } else if (key === "wa") {
      setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, wa: true } }));
      notify("WhatsApp sent to Sarah (wife)");
    } else if (key === "exit") {
      onExit();
    }
  };

  const bubble = (l, i) => {
    if (l.type === "contact") {
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, padding: 16, boxShadow: "0 6px 20px rgba(16,23,58,.07)", animation: "stagIn .3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: "#FBF3E0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>{SCRIPT.contact.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>{SCRIPT.contact.name}</div>
              <div style={{ fontSize: 12.5, color: MUTED }}>{SCRIPT.contact.sub}</div>
              <a href={`tel:${contactNumber.replace(/\s/g, "")}`} style={{ display: "inline-block", fontSize: 15, color: INK, fontWeight: 800, marginTop: 4, textDecoration: "none", letterSpacing: 0.2 }}>📞 {contactNumber}</a>
            </div>
          </div>
          <a href={SCRIPT.contact.maps} target="_blank" rel="noreferrer" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, background: "#EFF3FC", borderRadius: 12, padding: "11px 14px", textDecoration: "none" }}>
            <span style={{ fontSize: 15 }}>📍</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#1A6FB5" }}>Open in Google Maps</span>
            <span style={{ fontSize: 13, color: "#1A6FB5", fontWeight: 800 }}>↗</span>
          </a>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, flex: 1 }}>🔎 {SCRIPT.contact.source} · <span style={{ color: "#B7791F" }}>not in your contacts</span></div>
            <button
              onClick={() => {
                if (task.actionsDone.contactAdded) return;
                setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, contactAdded: true } }));
                notify(`${SCRIPT.contact.name.split(" ·")[0]} saved to contacts`);
              }}
              style={{ fontFamily: FONT, background: task.actionsDone.contactAdded ? "#E6F6EE" : "#fff", color: task.actionsDone.contactAdded ? GREEN : INK_SOFT, border: `1.5px solid ${task.actionsDone.contactAdded ? "#BBE6D1" : "#E3E7F2"}`, borderRadius: 100, padding: "8px 13px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {task.actionsDone.contactAdded ? "✓ Added" : "＋ Add to contacts"}
            </button>
          </div>
          {awaiting === "contact" && (
            <div style={{ marginTop: 12, display: "flex", gap: 9 }}>
              <button onClick={confirmContact} style={{ fontFamily: FONT, flex: 1, background: CORAL, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>✓ Yes, call this number</button>
              <button onClick={() => setEditOpen(true)} style={{ fontFamily: FONT, background: "#fff", color: INK_SOFT, border: "1.5px solid #E3E7F2", borderRadius: 12, padding: "12px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Edit</button>
            </div>
          )}
        </div>
      );
    }
    if (l.type === "summary1") {
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#FBF3E0", border: "1px solid #F2E2BC", borderRadius: 20, padding: 17, animation: "stagIn .3s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#B7791F", letterSpacing: 1, textTransform: "uppercase" }}>Call result</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginTop: 6 }}>No table yet — but the door's open</div>
          <div style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.5, marginTop: 6 }}>
            Fully committed tonight, but the host said tables sometimes free up and suggested trying again in ~30 minutes.
          </div>
          {awaiting === "post1" && (
            <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => post1Action("retry")} style={taskActionBtn(true)}>🔁 Try again in 30 minutes</button>
              <button onClick={() => post1Action("map")} style={taskActionBtn(false)}>🍝 Suggest other Italian nearby</button>
              <button onClick={() => post1Action("done")} style={taskActionBtn(false)}>✅ Done for now</button>
            </div>
          )}
        </div>
      );
    }
    if (l.type === "map") {
      return (
        <div key={i} style={{ alignSelf: "stretch" }}>
          <TaskMapCard />
        </div>
      );
    }
    if (l.type === "plumbers") {
      const sel = task.plumbSelected || [];
      const n = sel.length;
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 20, padding: "14px 13px", boxShadow: "0 6px 20px rgba(16,23,58,.07)", animation: "stagIn .3s ease" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, padding: "0 3px 4px" }}>🔧 Plumbers near you · sorted by rating</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 6 }}>
            {PLUMBERS.map((r) => {
              const on = sel.includes(r.id);
              return (
                <div key={r.id} onClick={() => togglePlumber(r.id)} style={{ background: on ? "#FFF7F5" : PAPER, border: on ? `1.5px solid ${CORAL}` : "1px solid #EDF0F8", borderRadius: 16, padding: "12px 13px", cursor: awaiting === "plumbpick" ? "pointer" : "default", transition: "all .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", border: on ? "none" : "2px solid #D5DAE8", background: on ? CORAL : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{on ? "✓" : ""}</div>
                    <span style={{ fontSize: 19 }}>{r.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{r.name}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{r.sub}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: INK_SOFT }}>{r.rating}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, marginTop: 1 }}>📍 {r.dist}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
                    <a href={`tel:${r.phone.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: "#fff", border: "1px solid #E3E7F2", borderRadius: 9, padding: "8px 6px", fontSize: 11.5, fontWeight: 800, color: INK, textDecoration: "none", whiteSpace: "nowrap" }}>📞 {r.phone}</a>
                    <a href={r.maps} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#EFF3FC", border: "1px solid #DCE6F8", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 800, color: "#1A6FB5", textDecoration: "none", whiteSpace: "nowrap" }}>Maps ↗</a>
                    <a href={`https://${r.site}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "1px solid #E3E7F2", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 800, color: INK_SOFT, textDecoration: "none", whiteSpace: "nowrap" }}>🌐 Site</a>
                  </div>
                </div>
              );
            })}
          </div>
          {awaiting === "plumbpick" && (
            <button onClick={confirmPlumbers} style={{ ...taskActionBtn(n >= 3), marginTop: 11, opacity: n >= 3 ? 1 : 0.55, cursor: n >= 3 ? "pointer" : "default" }}>
              {n >= 3 ? `Contact selected (${n}) →` : `Select at least 3 — wide net works best (${n}/3)`}
            </button>
          )}
        </div>
      );
    }
    if (l.type === "prefnote") {
      const edited = task.prefEdited;
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#F4F6FD", border: "1px solid #E3E8F6", borderRadius: 16, padding: "12px 14px", animation: "stagIn .3s ease" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <span style={{ fontSize: 15 }}>📱</span>
            <div style={{ flex: 1, fontSize: 12.5, color: INK_SOFT, lineHeight: 1.5 }}>
              <b>Number shared automatically.</b> Your preference allows sharing your phone number with service providers when they ask.
            </div>
          </div>
          <button
            onClick={() => { if (!edited) { setTask((t) => ({ ...t, prefEdited: true })); setProf((pp) => ({ ...pp, sharePhone: "ask" })); notify("Preference updated — I'll ask you each time"); } }}
            style={{ fontFamily: FONT, marginTop: 9, width: "100%", background: edited ? "#EDF1FA" : "#fff", border: "1px solid #D8DEEE", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 800, color: edited ? MUTED : INK, cursor: edited ? "default" : "pointer" }}
          >{edited ? "✓ Updated — I'll ask each time from now on" : "⚙️ Edit preference"}</button>
        </div>
      );
    }
    if (l.type === "plumbsuccess") {
      const o = plumbOutcome(l.outcome, pB, pC);
      const d = task.actionsDone || {};
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#F0FAF5", border: "1px solid #BBE6D1", borderRadius: 20, padding: 17, animation: "stagIn .3s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, letterSpacing: 1, textTransform: "uppercase" }}>{o.badge}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 6 }}>{o.title}</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            {o.rows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 12 }}>
                <span style={{ color: MUTED, fontWeight: 600, flexShrink: 0 }}>{k}</span><b style={{ color: INK, textAlign: "right" }}>{v}</b>
              </div>
            ))}
          </div>
          {awaiting === "success" && (
            <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { if (!d.cal) { setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, cal: true } })); notify(o.calToast); } }} style={taskActionBtn(!d.cal)}>{d.cal ? o.calDone : o.cal}</button>
              <button onClick={() => { if (!d.wa) { setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, wa: true } })); notify("WhatsApp sent to Sarah (wife)"); } }} style={taskActionBtn(!d.wa && !!d.cal)}>{d.wa ? "✓ Sarah's been told" : "💬 WhatsApp Sarah (wife) — plumber sorted"}</button>
              <button onClick={() => onExit()} style={taskActionBtn(false)}>Done</button>
            </div>
          )}
        </div>
      );
    }
    if (l.type === "gymsuccess") {
      const o = GYM_OUTCOMES[l.outcome] || GYM_OUTCOMES.frozen;
      const d = task.actionsDone || {};
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#F0FAF5", border: "1px solid #BBE6D1", borderRadius: 20, padding: 17, animation: "stagIn .3s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, letterSpacing: 1, textTransform: "uppercase" }}>{o.badge}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 6 }}>{o.title}</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            {o.rows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 12 }}>
                <span style={{ color: MUTED, fontWeight: 600, flexShrink: 0 }}>{k}</span><b style={{ color: INK, textAlign: "right" }}>{v}</b>
              </div>
            ))}
          </div>
          {awaiting === "success" && (
            <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => { if (!d.cal) { setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, cal: true } })); notify(o.calToast); } }} style={taskActionBtn(!d.cal)}>{d.cal ? o.calDone : o.cal}</button>
              <button onClick={() => { if (!d.wa) { setTask((t) => ({ ...t, actionsDone: { ...t.actionsDone, wa: true } })); notify("WhatsApp sent to Sarah (wife)"); } }} style={taskActionBtn(!d.wa && !!d.cal)}>{d.wa ? "✓ Sarah's been told" : "💬 WhatsApp Sarah (wife) — gym handled"}</button>
              <button onClick={() => onExit()} style={taskActionBtn(false)}>Done</button>
            </div>
          )}
        </div>
      );
    }
    if (l.type === "summary2") {
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#FBF3E0", border: "1px solid #F2E2BC", borderRadius: 20, padding: 17, animation: "stagIn .3s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#B7791F", letterSpacing: 1, textTransform: "uppercase" }}>Call result</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginTop: 6 }}>7:15 declined — still hunting for 7:00</div>
          <div style={{ fontSize: 13.5, color: INK_SOFT, lineHeight: 1.5, marginTop: 6 }}>
            The host noted your preference and will call back if 7:00 opens. Want me to keep checking too?
          </div>
          {awaiting === "post2" && (
            <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => post2Action("retry")} style={taskActionBtn(true)}>🔁 Keep trying every 30 minutes</button>
              <button onClick={() => post2Action("done")} style={taskActionBtn(false)}>✅ Done for now</button>
            </div>
          )}
        </div>
      );
    }
    if (l.type === "success") {
      const d = task.actionsDone || {};
      return (
        <div key={i} style={{ alignSelf: "stretch", background: "#F0FAF5", border: "1px solid #BBE6D1", borderRadius: 20, padding: 17, animation: "stagIn .3s ease" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: GREEN, letterSpacing: 1, textTransform: "uppercase" }}>Task complete</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 6 }}>🎉 Table booked at Osteria Mozza</div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
            {[["When", "Tonight · 7:15 PM"], ["Party", "4 people"], ["Under", callMe], ["Attempts", "2 calls · 55s total"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: MUTED, fontWeight: 600 }}>{k}</span><b style={{ color: INK }}>{v}</b>
              </div>
            ))}
          </div>
          {awaiting === "success" && (
            <div style={{ marginTop: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => successAction("cal")} style={taskActionBtn(!d.cal)}>{d.cal ? "✓ Added to calendar" : "📅 Add to my calendar"}</button>
              <button onClick={() => successAction("wa")} style={taskActionBtn(!d.wa && !!d.cal)}>{d.wa ? "✓ Sarah's been told" : "💬 WhatsApp Sarah (wife) — reservation updated"}</button>
              <button onClick={() => successAction("exit")} style={taskActionBtn(false)}>Done</button>
            </div>
          )}
        </div>
      );
    }
    if (l.who === "sys") {
      return (
        <div key={i} style={{ alignSelf: "center", background: "#EBEFFA", color: INK_SOFT, fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 100, animation: "stagIn .3s ease", textAlign: "center", maxWidth: "90%" }}>
          {l.text}
        </div>
      );
    }
    if (l.type) {
      // unknown structured message — never render as an invisible gap
      return (
        <div key={i} style={{ alignSelf: "center", background: "#FFF4F0", border: "1px solid #FBDDD3", color: CORAL_DEEP, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 100 }}>
          ⚠ couldn't display: {String(l.type)}
        </div>
      );
    }
    const right = l.who === "user" || l.who === "agent";
    const isUser = l.who === "user";
    const label = l.who === "user" ? null : l.who === "host" ? (l.hostName || SCRIPT.hostLabel || "").toUpperCase() : aiName.toUpperCase();
    return (
      <div key={i} style={{ alignSelf: right ? "flex-end" : "flex-start", maxWidth: "84%", animation: "stagIn .3s ease" }}>
        {label && (
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, margin: right ? "0 12px 4px 0" : "0 0 4px 12px", textAlign: right ? "right" : "left", letterSpacing: 0.3 }}>{label}</div>
        )}
        <div style={{ background: isUser ? `linear-gradient(150deg, #FF8A7A, ${CORAL_DEEP})` : right ? `linear-gradient(150deg, ${INK_SOFT}, ${INK})` : "#fff", color: right ? "#fff" : INK, fontSize: 15, lineHeight: 1.5, padding: "12px 16px", borderRadius: right ? "20px 20px 6px 20px" : "20px 20px 20px 6px", border: right ? "none" : "1.5px solid #EAEDF6", boxShadow: right ? "0 4px 14px rgba(16,23,58,.22)" : "0 2px 10px rgba(16,23,58,.05)" }}>
          {l.voice && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, color: "rgba(255,255,255,.85)", marginBottom: 6 }}>
              🎙 VOICE NOTE · AUTO-TRANSCRIBED
            </div>
          )}
          {l.text}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: PAPER, overflow: "hidden", animation: "stagIn .25s ease" }}>
      <div style={{ background: `linear-gradient(160deg, #202B5E 0%, ${INK} 60%)`, padding: "0 20px 16px", paddingTop: "max(env(safe-area-inset-top), 16px)", borderRadius: "0 0 28px 28px", display: "flex", alignItems: "center", gap: 13, boxShadow: "0 8px 24px rgba(16,23,58,.2)" }}>
        <button onClick={onExit} style={{ fontFamily: FONT, marginTop: 6, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", color: "#fff", width: 34, height: 34, borderRadius: "50%", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>←</button>
        <Orb size={44} />
        <div style={{ flex: 1, marginTop: 6, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{task.phase === "label" ? "New task" : `Task · ${SCRIPT.header}`}</div>
          <div style={{ color: ICE, fontSize: 12, fontWeight: 500, marginTop: 1 }}>
            {task.archived ? "Completed ✅ · Archived" : task.phase === "done" ? "Completed ✅" : task.phase === "scheduled" ? "Scheduled" : task.phase === "call1" || task.phase === "call2" ? "On the call…" : "Setting up"}
          </div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 18px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        {task.thread.map(bubble)}
        {typing && (
          <div style={{ alignSelf: typing === "agent" ? "flex-end" : "flex-start", background: typing === "host" ? BUBBLE : INK, padding: "13px 16px", borderRadius: 18, display: "flex", gap: 5 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: typing === "host" ? "#A9B1CC" : "rgba(255,255,255,.6)", animation: `stagWave 1s ease-in-out ${i * 0.18}s infinite` }} />
            ))}
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      {/* input area */}
      <div style={{ padding: "10px 18px", paddingBottom: "max(env(safe-area-inset-bottom), 36px)" }}>
        {recording ? (
          <div style={{ background: "#fff", border: "1.5px solid #F8C9CB", borderRadius: 18, padding: "14px 16px", boxShadow: "0 8px 24px rgba(224,69,80,.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ position: "relative", width: 11, height: 11 }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#E0414C" }} />
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#E0414C", animation: "stagPulse 1.4s ease-out infinite" }} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>Recording voice note · 0:{String(recSec).padStart(2, "0")}</div>
              <div style={{ flex: 1 }} />
              <button onClick={stopRecording} style={{ fontFamily: FONT, background: INK, color: "#fff", border: "none", borderRadius: 100, padding: "9px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>⏹ Stop</button>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, height: 36, marginTop: 12 }}>
              {Array.from({ length: 26 }).map((_, i) => (
                <div key={i} style={{ width: 4, borderRadius: 3, background: CORAL, height: 8, animation: `stagWave ${0.7 + (i % 5) * 0.13}s ease-in-out ${(i % 7) * 0.09}s infinite` }} />
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 8 }}>Demo mode — your microphone is off</div>
          </div>
        ) : transcribing ? (
          <div style={{ background: "#fff", border: "1.5px solid #E3E7F2", borderRadius: 18, padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 18, height: 18, border: "3px solid #E8EAED", borderTopColor: CORAL, borderRadius: "50%", animation: "stagSpin .8s linear infinite" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: INK_SOFT }}>Transcribing voice note…</span>
          </div>
        ) : awaiting === "label" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div onClick={() => setPickerOpen(true)} style={{ flex: 1, background: "#fff", border: "1.5px solid #E3E7F2", borderRadius: 100, padding: "14px 18px", fontSize: 14.5, color: "#A9B1CC", fontWeight: 500, cursor: "pointer" }}>Name your task…</div>
            <button onClick={() => setPickerOpen(true)} aria-label="Record task name" style={{ fontFamily: FONT, width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, #FF8A7A, ${CORAL_DEEP})`, border: "none", fontSize: 21, cursor: "pointer", boxShadow: "0 8px 20px rgba(249,97,103,.4)", flexShrink: 0 }}>🎙</button>
          </div>
        ) : awaiting === "voice1" || awaiting === "voice2" ? (
          <div style={{ position: "relative" }}>
            {voiceHint && (
              <div style={{ position: "absolute", bottom: 64, left: 0, right: 0, animation: "stagIn .25s ease", zIndex: 5 }}>
                <div style={{ background: INK, color: "#fff", borderRadius: 16, padding: "13px 16px", fontSize: 13.5, lineHeight: 1.5, boxShadow: "0 12px 30px rgba(16,23,58,.35)" }}>
                  <b>For this demo, we're simulating voice notes.</b> Tap the mic button and just pretend to talk — don't worry, the demo continues smoothly no matter what you say. 👉
                </div>
                <div style={{ width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: `10px solid ${INK}`, marginLeft: "auto", marginRight: 24 }} />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div onClick={() => setVoiceHint(true)} style={{ flex: 1, background: "#fff", border: "1.5px solid #E3E7F2", borderRadius: 100, padding: "14px 18px", fontSize: 14.5, color: "#A9B1CC", fontWeight: 500, cursor: "pointer" }}>Type your task…</div>
              <button onClick={() => { setVoiceHint(false); setRecording(true); }} aria-label="Record voice note" style={{ fontFamily: FONT, width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, #FF8A7A, ${CORAL_DEEP})`, border: "none", fontSize: 21, cursor: "pointer", boxShadow: voiceHint ? "0 0 0 4px rgba(249,97,103,.25), 0 8px 20px rgba(249,97,103,.5)" : "0 8px 20px rgba(249,97,103,.4)", flexShrink: 0, animation: voiceHint ? "stagBreath 1.2s ease-in-out infinite" : "none" }}>🎙</button>
            </div>
          </div>
        ) : awaiting === "plumbprio" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "flex-end" }}>
            {["⚡ Soonest possible", "💰 Lowest price"].map((c) => (
              <button key={c} onClick={() => choosePrio(c)} style={{ fontFamily: FONT, background: c.includes("Soonest") ? CORAL : "#fff", border: `1.5px solid ${CORAL}`, color: c.includes("Soonest") ? "#fff" : CORAL_DEEP, borderRadius: 100, padding: "12px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{c}</button>
            ))}
          </div>
        ) : awaiting === "plumbconfirm" ? (
          <Btn onClick={startPlumbCalls}>✓ Start calling</Btn>
        ) : awaiting === "address" ? (
          <div style={{ position: "relative", background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            {addrSug && (
              <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 10, right: 10, background: "#fff", borderRadius: 16, boxShadow: "0 14px 40px rgba(16,23,58,.25)", border: "1px solid #EDF0F8", overflow: "hidden", animation: "stagIn .2s ease", zIndex: 5 }}>
                <button
                  onClick={() => { setAddr(HOME_ADDRESS); setAddrSug(false); }}
                  style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "none", border: "none", padding: "13px 15px", cursor: "pointer", display: "flex", alignItems: "center", gap: 11 }}
                >
                  <span style={{ fontSize: 18 }}>🏠</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: INK }}>Home</span>
                    <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{HOME_ADDRESS}</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>From your profile</span>
                </button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📍</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>{`${pB ? pB.rep : "The plumber"} needs the service address`}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                onFocus={() => prof.shareAddress !== "always" && setAddrSug(true)}
                onClick={() => prof.shareAddress !== "always" && setAddrSug(true)}
                placeholder="Tap to enter address…"
                style={{ fontFamily: FONT, width: "100%", boxSizing: "border-box", background: "#fff", border: "1.5px solid #E3E7F2", borderRadius: 13, padding: "12px 15px", fontSize: 16, color: INK, outline: "none" }}
              />
            </div>
            {prof.shareAddress === "always" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <button onClick={() => sendAddress("auto")} style={taskActionBtn(!!addr)}>✓ Send address</button>
                <div style={{ textAlign: "center", fontSize: 11, color: MUTED, fontWeight: 600 }}>Auto-filled — your preference allows sharing your address with service providers.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <button onClick={() => sendAddress("once")} style={taskActionBtn(!!addr)}>✓ Send — just this time</button>
                <button onClick={() => sendAddress("always")} style={{ ...taskActionBtn(false), opacity: addr ? 1 : 0.55, cursor: addr ? "pointer" : "default" }}>✓ Send — always in cases like this</button>
                <div style={{ textAlign: "center", fontSize: 11, color: MUTED, fontWeight: 600 }}>Demo — tap the field and pick the saved suggestion.</div>
              </div>
            )}
          </div>
        ) : awaiting === "sharenum" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>Leave your number on the voicemail?</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => vmDecide("once")} style={taskActionBtn(true)}>✓ Yes — just this time</button>
              <button onClick={() => vmDecide("always")} style={taskActionBtn(false)}>✓ Yes — always in cases like this</button>
              <button onClick={() => vmDecide("no")} style={taskActionBtn(false)}>🚫 No — don't share my number</button>
            </div>
          </div>
        ) : awaiting === "sharenum2" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>{`${pC ? pC.rep : "The plumber"} is asking for your number`}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => vm2Decide("once")} style={taskActionBtn(true)}>✓ Yes — just this time</button>
              <button onClick={() => vm2Decide("always")} style={taskActionBtn(false)}>✓ Yes — always in cases like this</button>
              <button onClick={() => vm2Decide("no")} style={taskActionBtn(false)}>🚫 No — don't share my number</button>
            </div>
          </div>
        ) : awaiting === "plumbq1" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>Quote in — tomorrow 2–4 PM · est. S$200–300 total</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => plumbDecide1(true)} style={taskActionBtn(true)}>✓ Book it — tomorrow works</button>
              <button onClick={() => plumbDecide1(false)} style={taskActionBtn(false)}>🔍 Keep looking for a better option</button>
            </div>
          </div>
        ) : awaiting === "plumbq2" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>Two live options — speed or price?</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => plumbDecide2(true)} style={taskActionBtn(true)}>{`⚡ Today ~1 hr · est. S$300–400 (${pC ? pC.name : ""})`}</button>
              <button onClick={() => plumbDecide2(false)} style={taskActionBtn(false)}>{`📅 Tomorrow 2–4 · est. S$200–300 (${pB ? pB.name : ""})`}</button>
            </div>
          </div>
        ) : awaiting === "card" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "15px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>Fitness First asks: last 4 digits of your card</span>
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
              <input
                value={cardDigits}
                onChange={(e) => setCardDigits(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                maxLength={4}
                style={{ fontFamily: FONT, flex: 1, background: "#fff", border: "1.5px solid #E3E7F2", borderRadius: 13, padding: "12px 15px", fontSize: 22, fontWeight: 800, letterSpacing: 10, textAlign: "center", color: INK, outline: "none", minWidth: 0 }}
              />
              <button onClick={sendCard} style={{ fontFamily: FONT, background: cardDigits.length === 4 ? CORAL : "#F0F2F8", color: cardDigits.length === 4 ? "#fff" : "#A9B1CC", border: "none", borderRadius: 13, padding: "0 20px", fontSize: 14, fontWeight: 800, cursor: cardDigits.length === 4 ? "pointer" : "default", flexShrink: 0 }}>Send</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              {[["forget", "🔒 Forget after this call"], ["save", "💾 Save for future calls"]].map(([k, lbl]) => (
                <button key={k} onClick={() => setCardSave(k)} style={{ fontFamily: FONT, flex: 1, background: cardSave === k ? INK : "#fff", color: cardSave === k ? "#fff" : INK_SOFT, border: "1.5px solid " + (cardSave === k ? INK : "#E3E7F2"), borderRadius: 100, padding: "9px 6px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{lbl}</button>
              ))}
            </div>
            <div style={{ textAlign: "center", fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 9 }}>Demo mode — type any 4 digits; nothing is stored or sent.</div>
          </div>
        ) : awaiting === "gymOffer1" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>{`${aiName} needs a decision — Priya is holding`}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => gymDecide1("accept")} style={taskActionBtn(true)}>✓ Take the freeze offer</button>
              <button onClick={() => gymDecide1("better")} style={taskActionBtn(false)}>💪 Push for a better offer</button>
              <button onClick={() => gymDecide1("cancel")} style={taskActionBtn(false)}>✂️ Just cancel it</button>
            </div>
          </div>
        ) : awaiting === "gymOffer2" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>Final offer on the table</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => gymDecide2("accept")} style={taskActionBtn(true)}>✓ Take freeze + free month</button>
              <button onClick={() => gymDecide2("cancel")} style={taskActionBtn(false)}>✂️ No — just cancel it</button>
            </div>
          </div>
        ) : awaiting === "confirm715" ? (
          <div style={{ background: "#FFF4F0", border: "1.5px solid #FBDDD3", borderRadius: 18, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: CORAL_DEEP }}>{`${aiName} needs a decision — host is holding the table`}</span>
            </div>
            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={() => decide715(true)} style={{ ...taskActionBtn(true), flex: 1 }}>✓ 7:15 works — book it</button>
              <button onClick={() => decide715(false)} style={{ ...taskActionBtn(false), flex: 1 }}>Hold out for 7:00</button>
            </div>
          </div>
        ) : awaiting === "scheduled" ? (
          <Btn onClick={onExit} kind="dark">View scheduled task →</Btn>
        ) : awaiting === "mapsdone" ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", textAlign: "center", marginBottom: 9 }}>Or keep after Osteria Mozza:</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center" }}>
              {["🔁 Retry now", "In 30 minutes"].map((c) => (
                <button key={c} onClick={() => mapRetryChoose(c)} style={{ fontFamily: FONT, background: c === "🔁 Retry now" ? CORAL : "#fff", border: `1.5px solid ${CORAL}`, color: c === "🔁 Retry now" ? "#fff" : CORAL_DEEP, borderRadius: 100, padding: "12px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: c === "🔁 Retry now" ? "0 5px 14px rgba(249,97,103,.3)" : "none" }}>{c}</button>
              ))}
            </div>
          </div>
        ) : awaiting === "when" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "flex-end" }}>
            {["📞 Right now", "In 30 minutes"].map((c) => (
              <button key={c} onClick={() => chooseWhen(c)} style={{ fontFamily: FONT, background: c === "📞 Right now" ? CORAL : "#fff", border: `1.5px solid ${CORAL}`, color: c === "📞 Right now" ? "#fff" : CORAL_DEEP, borderRadius: 100, padding: "12px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{c}</button>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12.5, color: MUTED, padding: "10px 0" }}>
            {task.phase === "call1" || task.phase === "call2" ? `${aiName} is on the call…` : task.phase === "done" ? "Task completed" : " "}
          </div>
        )}
      </div>

      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(8,11,30,.5)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "24px 24px 0 0", padding: "20px 20px", paddingBottom: "max(env(safe-area-inset-bottom), 24px)", animation: "stagIn .25s ease", maxHeight: "82%", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#E3E7F2", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>Pick a demo task</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginTop: 5 }}>
              This demo ships with seven ready-made scenarios. One is fully playable today — the rest are coming soon.
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {DEMO_TASKS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => pickDemoTask(t)}
                  style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: t.live ? "#fff" : PAPER, border: t.live ? `1.5px solid ${CORAL}` : "1px solid #EDF0F8", borderRadius: 16, padding: "13px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, opacity: t.live ? 1 : 0.65, boxShadow: t.live ? "0 6px 16px rgba(249,97,103,.15)" : "none" }}
                >
                  <span style={{ fontSize: 21 }}>{t.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: INK }}>{t.label}</span>
                    <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 1 }}>{t.desc}</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", padding: "5px 9px", borderRadius: 100, background: t.live ? "#E6F6EE" : "#EFF1F7", color: t.live ? GREEN : MUTED }}>
                    {t.live ? "▶ Live demo" : "Coming soon"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {editOpen && (
        <div onClick={() => setEditOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(8,11,30,.5)", zIndex: 60, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", borderRadius: "24px 24px 0 0", padding: "20px 20px", paddingBottom: "max(env(safe-area-inset-bottom), 28px)", animation: "stagIn .25s ease", maxHeight: "78%", overflowY: "auto" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#E3E7F2", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 800, color: INK, letterSpacing: -0.3 }}>Use a different number</div>

            <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
              <input
                value={customNum}
                onChange={(e) => setCustomNum(e.target.value)}
                placeholder="Type a phone number…"
                inputMode="tel"
                style={{ fontFamily: FONT, flex: 1, background: PAPER, border: "1.5px solid #E3E7F2", borderRadius: 13, padding: "12px 15px", fontSize: 16, color: INK, outline: "none", minWidth: 0 }}
              />
              <button
                onClick={() => customNum.trim() && pickNumber(customNum.trim())}
                style={{ fontFamily: FONT, background: customNum.trim() ? CORAL : "#F0F2F8", color: customNum.trim() ? "#fff" : "#A9B1CC", border: "none", borderRadius: 13, padding: "0 18px", fontSize: 14, fontWeight: 800, cursor: customNum.trim() ? "pointer" : "default", flexShrink: 0 }}
              >Use</button>
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 1, textTransform: "uppercase", margin: "18px 0 8px" }}>📇 From your contacts</div>
            {SCRIPT.altNumbers.contacts.map((c) => (
              <button key={c.num} onClick={() => pickNumber(c.num)} style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
                <span style={{ fontSize: 17 }}>{c.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: INK }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{c.num}</span>
                </span>
                <span style={{ color: "#C3C9DC", fontWeight: 800 }}>›</span>
              </button>
            ))}

            <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 1, textTransform: "uppercase", margin: "14px 0 8px" }}>🕘 Recently called</div>
            {SCRIPT.altNumbers.recents.map((c) => (
              <button key={c.num} onClick={() => pickNumber(c.num)} style={{ fontFamily: FONT, width: "100%", textAlign: "left", background: "#fff", border: "1px solid #EDF0F8", borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
                <span style={{ fontSize: 17 }}>{c.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: INK }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: MUTED, marginTop: 1 }}>{c.num}</span>
                </span>
                <span style={{ color: "#C3C9DC", fontWeight: 800 }}>›</span>
              </button>
            ))}

            <button onClick={() => setEditOpen(false)} style={{ fontFamily: FONT, width: "100%", background: "none", border: "none", color: MUTED, fontSize: 14.5, fontWeight: 700, cursor: "pointer", padding: "12px", marginTop: 4 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const taskActionBtn = (primary) => ({
  fontFamily: FONT,
  width: "100%",
  background: primary ? CORAL : "#fff",
  color: primary ? "#fff" : INK,
  border: primary ? "none" : "1.5px solid #E3E7F2",
  borderRadius: 13,
  padding: "13px",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "center",
  boxShadow: primary ? "0 6px 16px rgba(249,97,103,.3)" : "none",
});

/* ---------- bits ---------- */
function Chip({ children, active, onClick, big }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: FONT,
        background: active ? INK : "#fff",
        color: active ? "#fff" : INK_SOFT,
        border: `1.5px solid ${active ? INK : "#E3E7F2"}`,
        borderRadius: 100,
        padding: big ? "11px 18px" : "9px 15px",
        fontSize: big ? 14.5 : 13.5,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      {children}
    </button>
  );
}

function personalize(text, callMe, aiName) {
  return text.split("Jonathan").join(callMe).split("NewVoice").join(aiName).split("Stagwell").join(aiName);
}

const fieldLabel = { fontSize: 12.5, fontWeight: 700, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 };
const hintCard = { marginTop: 14, background: "#EFF3FC", borderRadius: 14, padding: "13px 16px", fontSize: 13.5, color: INK_SOFT, lineHeight: 1.5 };
