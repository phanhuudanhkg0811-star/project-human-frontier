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

## 3. Visual & Audio Assets (Human Artist & SI Transparency)
- **Human Artist Originals (Non-SI Artwork, No SI Watermark)**:
  - Opening 4-panel mission comic (`public/assets/hail/4 khung cho cảnh mở đầụ/4 khung cho cảnh mở đầu/`) and PNG/WebP panels drawn by our team's 2D artist.
  - Crew full-body illustrations & expression portraits (`public/assets/hail/nhân vật cho project hail/` and `public/assets/hail/characters/PH_CHAR_NV{1..4}_PORTRAIT_*`) drawn and cropped by our team's 2D artist.
- **SI-Generated Images (Visible Watermarks Embedded)**:
  - All other WebP raster artwork (`environments/`, `equipment/`, `events/`, `inventory/`, `robots/`, `ui/`, `effects/`) plus `public/logo.jpg` are SI-generated and include visible `SI-GENERATED`, `SI-GEN`, or `SI` watermarks with zero NASA logos, flags, or mission emblems.
- **Audio Assets (SI Disclosure in Metadata & Text)**:
  - Ten `.ogg` hardware/UI SFX files (`public/assets/hail/audio/*.ogg`) are SI-generated audio assets (disclosed in `public/assets/hail/manifest.json`), complemented by procedural Web Audio API synthesis in `src/audio/soundEngine.ts` and `src/audio/sfx.ts`.

## 4. Use of Super Intelligence (SI) — Code & Data Disclosure
- **Code**: TypeScript simulation engine modules, React cockpit views, build tooling, and tests were authored with Super Intelligence (SI) coding assistance under human review and verification.
- **Data**: Authentic planetary and life-support baselines (Diviner, LOLA, GRAIL, RadLab, ECLSS BVAD) originate from official NASA Open Data sources listed in Section 1; synthetic/simulated gameplay rules and outcomes are tagged `simulated` or `estimated` rather than observed NASA data.
- **Machine-Readable Inventory**: Full per-asset classification (`origin`, `siGenerated`, `watermarkApplied`, `source`, `sha256`) is tracked in `public/assets/hail/manifest.json`.

## 5. Privacy & Student Safety
- This application runs 100% client-side in the browser using `localStorage` (`human-frontier:moon32:save-v1` and `phf_ui_prefs_v1`).
- No telemetry, third-party analytics, advertisements, or personally identifiable student information (PII) are collected or transmitted.
