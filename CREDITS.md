# Credits & Attributions — Project Hail (Artemis Moon 32)

## 1. NASA Open Data & Scientific Baselines
- **NASA DONKI (Space Weather Database Of Notifications, Knowledge, and Information)** (`https://api.nasa.gov/DONKI/`): Curated solar flare, CME, SEP, and geomagnetic/radiation storm timelines mapped into deterministic 32-day storm windows in `src/data/donki-space-weather.json`.
- **NASA Lunar Reconnaissance Orbiter (LRO) — Diviner & LOLA (PDS)** (`https://pds.nasa.gov/`): Lunar South Pole surface temperature extremes and terrain reference data for Shackleton Rim, Regolith Field, and Permanently Shadowed Regions (PSR) in `src/data/lunar-sites.json`.
- **NASA Open Science Data Repository (OSDR RadLab)** (`https://visualization.osdr.nasa.gov/radlab/`): Radiation dose reference scaling (`mGy`) in `src/data/crew-physiology.json`.
- **Artemis ECLSS & In-Space Manufacturing Concepts**: Educational abstraction of Water Recovery System (WRS 90%/95%), O₂/CO₂ scrubbing, and on-demand 3D fabrication trade-offs for students aged 7–12.

## 2. Software, Fonts & Iconography
- **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **Zustand**, **Ajv**, and **oxlint** — used under their respective permissive open-source licenses.
- **Lucide Icons** (`lucide-react`) — ISC License.
- **Chakra Petch** & **JetBrains Mono** — served via Google Fonts (SIL Open Font License 1.1).

## 3. Custom Visual & Audio Assets
- **Project Hail AeroMatte 2050 Artwork & Audio (`public/assets/hail/`)**: Tracked and checksum-verified in `public/assets/hail/manifest.json` (`141` assets, custom project originals) alongside Web Audio procedural synthesis in `src/audio/soundEngine.ts`.

## 4. Privacy & Student Safety
- This application runs 100% client-side in the browser using `localStorage` (`human-frontier:moon32:save-v1` and `phf_ui_prefs_v1`).
- No telemetry, third-party analytics, advertisements, or personally identifiable student information (PII) are collected or transmitted.
