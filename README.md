# NewVoice by Stagwell — Interactive Demo

An AI voice agent that answers, screens, schedules, and makes the calls you'd rather not make. This is the fully interactive prototype: inbound call screening plus outbound task workflows (restaurant booking, gym cancellation, multi-vendor plumber search), with a preferences page, voice-note simulation, and per-task threads.

Built with **React 18 + Vite**. No backend, no accounts, no API keys — everything runs in the browser.

---

## Run locally

Requires Node.js 18+ (20 recommended).

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The app is designed for a phone-sized viewport — use your browser's device toolbar or open it on your phone.

To preview a production build:

```bash
npm run build
npm run preview
```

---

## Deploy to Vercel (recommended)

### Option A — through the Vercel dashboard (no CLI)

1. Push this repo to GitHub (see below).
2. Go to **vercel.com → Add New → Project**.
3. **Import** your GitHub repo. Vercel auto-detects Vite — leave the defaults:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Click **Deploy**. You'll get a `*.vercel.app` URL in ~30 seconds.
5. **Rename for a human-readable URL:** Project → **Settings → Domains** (or **Settings → General → Project Name**). Set the project name to e.g. `newvoice-demo` and your URL becomes `https://newvoice-demo.vercel.app`. You can also add a custom domain here.

Every `git push` to the main branch auto-deploys. This is the permanent, always-latest link to share.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel          # first run: links/creates the project
vercel --prod   # deploys to production
```

---

## Push to GitHub

```bash
git init
git add .
git commit -m "NewVoice demo: initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/newvoice-demo.git
git push -u origin main
```

(Create the empty `newvoice-demo` repo on github.com first, without a README so the push isn't rejected.)

---

## Project structure

```
newvoice-demo/
├── index.html          # entry HTML, viewport + meta tags
├── package.json        # deps: react, react-dom, vite
├── vite.config.js      # Vite + React plugin
├── vercel.json         # Vercel build config + SPA rewrite
├── .nvmrc              # Node version pin (20)
└── src/
    ├── main.jsx        # React entry — mounts <StagwellDemo />
    └── App.jsx         # the entire demo (single file)
```

## Notes

- The app is a single self-contained component tree in `src/App.jsx` with inline styles (no CSS framework). Edit there to change copy, scenarios, or pricing.
- All "calls", voice notes, and integrations are simulated for demo purposes — clearly labeled in-app.
