# Phase 1.5 Contract & 2-Person Zero-Conflict Split Plan (Đã hoàn tất PR Bước 0)

> **Trạng thái hiện tại trên Git (`dev`):**
> - **PR Bước 0 (`feat/p1-5-contract`) ĐÃ COMMIT & MERGE VÀO `dev`** (commit contract `6b873ed`, commit merge `ee70b3b`).
> - Toàn bộ kiểm định trên `feat/p1-5-contract` trước khi merge đã pass 100%:
>   - `npm run typecheck` (`tsc --noEmit`): **Pass**
>   - `npm run lint` (`oxlint`): **Pass (0 warnings, 0 errors, 65 files)**
>   - `npm test` (`node --test`): **Pass (58/58 tests)**
>   - `npm run build` (`tsc && vite build`): **Pass** (`dist/assets/index-CGjG5Hkd.js` `502.96 kB` — Nhánh 2 sẽ tách chunk `< 500 kB`)
> - Cả 2 thành viên tách nhánh làm việc song song từ `dev`:
>   - **Nhánh 1 — i18n Dictionaries + Content VI/EN + Tutorial + Event/Report UI + QA:**
>     ```bash
>     git switch dev
>     git pull origin dev
>     git switch -c feat/p1-5-i18n-content-qa
>     ```
>   - **Nhánh 2 — V12 Canvas Ambient + Web Audio + HUD/Modals Polish + Responsive + Code Splitting:**
>     ```bash
>     git switch dev
>     git pull origin dev
>     git switch -c feat/p1-5-v12-audio-polish
>     ```

---

## Phần A — Chi tiết Contract đã có sẵn trên `dev` (từ PR Bước 0 `feat/p1-5-contract`)

### 1. `UiState` & `localStorage` UI Preferences (`src/types/index.ts`, `src/store/uiStore.ts`)
- **`ActiveModalType`** đã bổ sung `'tutorial'`.
- **`UiState`** đã bổ sung:
  - `audioMuted: boolean`
  - `tutorialCompleted: boolean`
  - `tutorialStep: number`
- **`UI_PREFS_STORAGE_KEY = 'phf_ui_prefs_v1'`** lưu bền vững 4 tùy chọn UI (`locale`, `reducedMotion`, `audioMuted`, `tutorialCompleted`) tách biệt hoàn toàn khỏi `GameState` / `SaveEnvelope v4`, đồng thời bọc guard `typeof window !== 'undefined'` để `node --test` chạy an toàn.
- **Default `locale` giữ `'vi'`** khi chưa có `phf_ui_prefs_v1`.
- **Actions mới trên `useUiStore`:**
  - `setReducedMotion(reducedMotion: boolean)`
  - `toggleAudioMute()` / `setAudioMuted(audioMuted: boolean)`
  - `setTutorialStep(step: number)`
  - `completeTutorial()` / `resetTutorial()`

### 2. `ScienceBrief` song ngữ (`src/types/index.ts`, `src/schemas/contracts.ts`)
- **`ScienceBrief`** đã có thêm `readonly titleEn?: string` và `readonly contentEn?: string`.
- **`validateScienceBriefs`** trong `src/schemas/contracts.ts` kiểm tra chuỗi hợp lệ khi `titleEn` / `contentEn` có mặt.

### 3. Contract i18n (`src/i18n/types.ts`, `src/i18n/dictionaries.ts`, `src/i18n/useI18n.ts`)
- `Locale = 'vi' | 'en'`.
- `translate(locale, key, vars?)`: nội suy `{token}` trong chuỗi, tự fallback về `dictionaries.vi` rồi `key` nếu thiếu bản dịch.
- `pickText(vi, en, locale)`: trả `en` khi `locale === 'en'` và `en` không rỗng, ngược lại trả `vi`.
- `useI18n()`: hook trả `{ locale, setLocale, t, pickText }` đọc từ `useUiStore`.
- `src/i18n/dictionaries.ts` đang có khung stub tối thiểu (`common.closeDialog`, `tutorial.*`) để cả 2 nhánh compile sạch ngay từ đầu.

### 4. Contract Web Audio (`src/audio/soundEngine.ts`)
- Export sẵn kiểu và hàm stub an toàn (no-op ở Bước 0):
  ```ts
  export type AudioCue = 'click' | 'confirm' | 'alert' | 'phase-advance' | 'end-sol' | 'victory' | 'defeat';
  export interface AmbientAudioState {
    readonly isLunarNight: boolean;
    readonly weatherLevel: DonkiLevel;
    readonly muted: boolean;
  }
  export function playSfx(cue: AudioCue): void;
  export function syncAmbientAudio(state: AmbientAudioState): void;
  ```

### 5. Mount sẵn `TutorialModal` (`MissionDialog.tsx`, `TutorialModal.tsx`, `HailGameViewport.tsx`)
- `MissionDialogType` trong `src/components/modals/MissionDialog.tsx` đã có `'tutorial'`.
- `src/components/HailGameViewport.tsx` đã mount sẵn `{activeModal === 'tutorial' && <TutorialModal onClose={closeModal} />}` nên Nhánh 1 và Nhánh 2 không cần chạm vào file của nhau để nối Tutorial.

---

## Phần B — Phân chia 2 nhánh song song (0% xung đột file)

| Hạng mục | **Nhánh 1 (`feat/p1-5-i18n-content-qa`)** | **Nhánh 2 (`feat/p1-5-v12-audio-polish`)** |
| :--- | :--- | :--- |
| **Phụ trách** | **i18n Dictionaries + Content VI/EN + Tutorial + Event/Report UI + QA** | **V12 Canvas Ambient + Web Audio + HUD/Modals + Responsive + Vite Chunks** |
| **File sở hữu độc quyền** | • `src/i18n/dictionaries.ts` *(toàn bộ key UI VI/EN + nhãn Crew/System/Equipment/Cargo/Expedition/DONKI)*<br>• `src/data/nasa-briefs.json` *(thêm `titleEn`, `contentEn` cho 10/10 briefs)*<br>• `src/data/tutorialSteps.ts` *(file mới)*<br>• `src/components/modals/TutorialModal.tsx` *(hoàn thiện từ stub)*<br>• `src/components/EventPriorityBanner.tsx`<br>• `src/components/eventPresentation.ts`<br>• `src/components/DynamicSTEMBrief.tsx`<br>• `src/components/CampaignReportCard.tsx`<br>• `src/components/NightReadinessChecklist.tsx`<br>• `src/components/modals/StarlogModal.tsx`<br>• `src/components/modals/EndOfDayModal.tsx`<br>• `src/components/modals/NightCutsceneModal.tsx`<br>• `tests/phase-1-5-i18n-tutorial.test.mjs` *(file mới)* | • `src/audio/soundEngine.ts` *(Web Audio procedural SFX & ambient)*<br>• `src/components/cabin/AmbientCanvasLayer.tsx` *(file mới — Canvas ngày/đêm/bão DONKI)*<br>• `src/components/HailGameViewport.tsx` *(gắn nút VI/EN, Audio Mute, Tutorial `?`, `<AmbientCanvasLayer />`, gọi `playSfx` & `syncAmbientAudio`, i18n cockpit)*<br>• `src/components/hud/TelemetryTopBar.tsx`<br>• `src/components/SystemControls.tsx`<br>• `src/components/CommsLogisticsPanel.tsx`<br>• `src/components/MissionProgressionPanel.tsx`<br>• `src/components/HailSelect.tsx`<br>• `src/components/modals/CharacterSheetModal.tsx`<br>• `src/components/modals/CraftingModal.tsx`<br>• `src/components/modals/CommsLogisticsModal.tsx`<br>• `src/components/modals/ExpeditionModal.tsx`<br>• `src/components/modals/MissionDialog.tsx`<br>• `src/components/modals/MissionLaunchModal.tsx`<br>• `src/hail.css`<br>• `vite.config.ts` *(tách `manualChunks`)* |
| **Cấm sửa** | `src/audio/`, `AmbientCanvasLayer.tsx`, `HailGameViewport.tsx`, `TelemetryTopBar.tsx`, `SystemControls.tsx`, `CommsLogisticsPanel.tsx`, `MissionProgressionPanel.tsx`, `HailSelect.tsx`, `CharacterSheetModal.tsx`, `CraftingModal.tsx`, `CommsLogisticsModal.tsx`, `ExpeditionModal.tsx`, `MissionDialog.tsx`, `MissionLaunchModal.tsx`, `src/hail.css`, `vite.config.ts`, `src/domain/`, `src/persistence/` | `src/i18n/dictionaries.ts`, `src/data/*`, `tutorialSteps.ts`, `TutorialModal.tsx`, `EventPriorityBanner.tsx`, `eventPresentation.ts`, `DynamicSTEMBrief.tsx`, `CampaignReportCard.tsx`, `NightReadinessChecklist.tsx`, `StarlogModal.tsx`, `EndOfDayModal.tsx`, `NightCutsceneModal.tsx`, `src/domain/`, `src/persistence/` |

### Chi tiết đầu việc từng nhánh

#### Nhánh 1 (`feat/p1-5-i18n-content-qa`)
1. Điền đầy đủ từ điển `vi` và `en` trong `src/i18n/dictionaries.ts` (đảm bảo **100% key parity** giữa `vi` và `en`, không thừa/thiếu key, đủ key cho cả cockpit + 8 modals mà Nhánh 2 sẽ gọi qua `t(...)`).
2. Thêm `titleEn` và `contentEn` cho toàn bộ 10 entries trong `src/data/nasa-briefs.json`.
3. Tạo `src/data/tutorialSteps.ts` & hoàn thiện `src/components/modals/TutorialModal.tsx` (hướng dẫn 5 bước chơi cốt lõi: Morning Briefing, Engineering/Fabricator, Comms/Rover/Cargo, Rationing/WRS, Lunar Night; dùng `tutorialStep`, `setTutorialStep`, `completeTutorial` trong `useUiStore`).
4. Gắn `useI18n()` / `pickText()` cho `EventPriorityBanner.tsx`, `eventPresentation.ts`, `DynamicSTEMBrief.tsx`, `CampaignReportCard.tsx`, `NightReadinessChecklist.tsx`, `StarlogModal.tsx`, `EndOfDayModal.tsx`, `NightCutsceneModal.tsx`.
   - **Lưu ý Freeze `src/domain/`:** Các chuỗi tiếng Việt từ `src/domain/campaignSelectors.ts` (`selectTrainingReport`, `selectCampaignReport.lesson`, `selectNightReadiness`) dịch ở lớp UI trong `CampaignReportCard.tsx` và `NightReadinessChecklist.tsx` (dùng `outcome?.reasonCode`, `requirement.id`, `readiness.forecast`, `state`, `bundle`), **không sửa `src/domain/`**.
5. Viết `tests/phase-1-5-i18n-tutorial.test.mjs` kiểm tra:
   - 100% key parity giữa `dictionaries.vi` và `dictionaries.en`.
   - 10/10 briefs trong `nasa-briefs.json` có `titleEn` & `contentEn` khác rỗng.
   - Actions `useUiStore` (`setLocale`, `toggleAudioMute`, `setTutorialStep`, `completeTutorial`, `resetTutorial`) hoạt động an toàn trên Node (không cần `window`).

#### Nhánh 2 (`feat/p1-5-v12-audio-polish`)
1. Cài đặt Web Audio procedural SFX & ambient trong `src/audio/soundEngine.ts`:
   - Phát SFX cho `'click' | 'confirm' | 'alert' | 'phase-advance' | 'end-sol' | 'victory' | 'defeat'`.
   - Ambient nhẹ thay đổi theo `isLunarNight` và `weatherLevel` (`quiet | moderate | storm | extreme`).
   - Khởi tạo `AudioContext` lazy khi có user gesture, bọc `typeof window !== 'undefined'` + `try/catch`, và tôn trọng tuyệt đối `muted === true`.
2. Tạo `src/components/cabin/AmbientCanvasLayer.tsx`:
   - Canvas nhẹ 60fps overlay vùng cửa sổ V12 (sao/bụi tĩnh điện/hiệu ứng bão DONKI theo `weatherLevel` & `isLunarNight`).
   - Tự dừng/tắt animation loop khi `reducedMotion` trong `useUiStore` hoặc `prefers-reduced-motion: reduce` bật.
3. Nâng cấp HUD & Audio/i18n trong `HailGameViewport.tsx` & `TelemetryTopBar.tsx`:
   - Gắn 3 nút HUD: chuyển ngôn ngữ **VI / EN** (`setLocale`), **Mute / Unmute Audio** (`toggleAudioMute`), và nút **Tutorial `?`** (`openModal('tutorial')`).
   - Mount `<AmbientCanvasLayer />` vào vùng cửa sổ V12 (không che click các rack/crew/console).
   - Đồng bộ `syncAmbientAudio({ isLunarNight, weatherLevel, muted })` và gọi `playSfx(...)` tại các thao tác chuyển pha, xác nhận hành động, cảnh báo, End-Sol, Victory/Defeat.
   - Áp `useI18n()` cho toàn bộ cockpit, `TelemetryTopBar.tsx`, `SystemControls.tsx`, `CommsLogisticsPanel.tsx`, `MissionProgressionPanel.tsx`, `HailSelect.tsx` và các modal thuộc Nhánh 2 (`CharacterSheetModal.tsx`, `CraftingModal.tsx`, `CommsLogisticsModal.tsx`, `ExpeditionModal.tsx`, `MissionDialog.tsx`, `MissionLaunchModal.tsx`).
   - *Mẹo phối hợp key `useI18n()`*: dùng `t('...')` với key ngắn gọn rõ nghĩa, hoặc tạm giữ fallback tiếng Việt trong lúc chờ merge — sau khi 2 nhánh merge vào `dev`, cùng rà đồng bộ key vào `dictionaries.ts`.
4. Tinh chỉnh responsive Desktop / Tablet / Mobile + styling `TutorialModal` / Canvas overlay trong `src/hail.css`.
5. Cấu hình `build.rollupOptions.output.manualChunks` trong `vite.config.ts` (tách `react`/`react-dom`, `lucide-react`, `zustand`) để `npm run build` không còn JS chunk `> 500 kB`.

---

## Phần C — Hợp đồng Bắt buộc (Tránh gãy khi Merge & Tránh vỡ E2E)

1. **Freeze Balance & Engine:** Không sửa `src/domain/`, `src/persistence/`, `src/data/balance.json`, `src/data/campaign-moon32.json` hay logic gameplay trong `events.json`, `recipes.json`, `crew.json`, `donki-space-weather.json`.
2. **Giữ nguyên Interface các Component dùng chéo giữa 2 nhánh:**
   - Nhánh 1 giữ nguyên export & props của `ArtifactExportButtons`, `TrainingReport` (`src/components/CampaignReportCard.tsx`), `EventPriorityBanner` (`{ view, currentSol, onOpen }`), `DynamicSTEMBrief`, `NightReadinessChecklist`.
   - Nhánh 2 giữ nguyên props bắt buộc của `MissionDialog` (`title, eyebrow, art, panelType, dockSide, onClose, children`).
3. **Bảo vệ E2E gate `scripts/verify-phase-1-4-browser.mjs`:**
   - Default `locale` là `'vi'`.
   - Ở locale `'vi'`, **PHẢI giữ nguyên** các chuỗi chữ & `aria-label` mà `verify-phase-1-4-browser.mjs` đang click/assert:
     - `'Giao ban'`, `'Hệ thống'`, `'Crew'`, `'3D Fab'`, `'CAPCOM'`, `'Rover'`, `'Chiến dịch'`, `'End-Sol'`, `'Độ khó'`, `'Bắt đầu Chiến dịch Mới'`, `'Gạt cần Chốt Sol'`, `'Thức dậy vào Sol'`, `'Chơi lại cùng seed'`, `'Export Replay Trace'`, `'Export Save Snapshot'`
     - `button[aria-label="Đóng cửa sổ"]` (trong `MissionDialog.tsx` khi `locale === 'vi'`), `[aria-label="Training Report"]`, `[aria-label="NASA Cadet Report Card"]`.
   - `TutorialModal` **không tự bật** chặn màn hình lúc mới vào game (chỉ mở qua nút `?`, hoặc tắt auto-open khi `reducedMotion` đang bật).

---

## Phần D — Checklist Verify trước khi Merge vào `dev`

Sau khi lần lượt merge 2 nhánh vào `dev`, chạy đủ 5 bước:
1. `npm run typecheck` — Pass (0 lỗi TypeScript)
2. `npm run lint` — Pass (0 errors, 0 warnings)
3. `npm test` — Pass (58/58 tests cũ + tests mới của Phase 1.5)
4. `npm run build` — Pass, toàn bộ JS chunks `< 500 kB`
5. `node scripts/verify-phase-1-4-browser.mjs` — Pass toàn bộ luồng chơi E2E + kiểm tra thủ công VI/EN, Tutorial `?`, Web Audio Mute, Canvas ambient & responsive Mobile/Desktop.
