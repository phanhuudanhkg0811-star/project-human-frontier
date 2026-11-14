# Phase 1.3 Contract & 2-Person Zero-Conflict Split Plan (Đã hoàn tất PR Bước 0)

> **Trạng thái hiện tại trên Git (`dev`):**
> - **PR Bước 0 (`feat/p1-3-contract`) ĐÃ HOÀN TẤT & MERGE VÀO `dev`** (commit merge `a5a0553`, commit contract `af84127`).
> - Toàn bộ kiểm định trên `dev` đã pass 100%:
>   - `npm run typecheck` (`tsc --noEmit`): **Pass**
>   - `npm run lint` (`oxlint`): **Pass (0 warnings, 0 errors)**
>   - `npm test` (`node --test`): **Pass (12/12 tests)**
>   - `npm run build` (`tsc && vite build`): **Pass**
> - Cả 2 thành viên có thể tách nhánh làm việc song song ngay từ `dev`:
>   - **Nhánh 1 (Core + Content + Golden Sol 7):**
>     ```bash
>     git switch dev
>     git pull
>     git switch -c feat/p1-3-core-content
>     ```
>   - **Nhánh 2 (UI + Visual + Catalog/Selector QA):**
>     ```bash
>     git switch dev
>     git pull
>     git switch -c feat/p1-3-ui-qa-visual
>     ```

---

## Phần A — Chi tiết Contract đã có sẵn trên `dev` (từ PR Bước 0 `feat/p1-3-contract`)

### 1. `GameState` & `SaveEnvelope` `schemaVersion: 3`
- **`src/types/index.ts`:**
  - `GameState.schemaVersion: 3`
  - `SaveEnvelope.schemaVersion: 3`
- **`src/persistence/saveAdapter.ts`:**
  - `APP_VERSION = '1.3.0'`
  - `buildSaveEnvelope` luôn ghi `schemaVersion: 3`.
  - `readRawEnvelope` chấp nhận `schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3`.
  - Chuỗi migration tự động trong `loadGameState`:
    - `v1 → migrateSaveV1ToV2 → migrateSaveV2ToV3`
    - `v2 → migrateSaveV2ToV3`
    - `v3 → validateSaveEnvelopeStructure` trực tiếp

### 2. Đặc tả `EventState` & Lifecycle / Deadline Semantics

```ts
export interface ActiveEvent {
  readonly eventId: string;
  readonly triggeredAtSol: number;
  readonly deadlineSol: number;
  readonly context: Readonly<Record<string, string | number | boolean>>;
}

export interface EventOccurrenceRecord {
  readonly eventId: string;
  readonly triggeredSol: number;
  readonly settledSol: number;
  readonly outcome: 'resolved' | 'expired';
  readonly choiceId: string | null;
}

export interface PendingFollowUpEvent {
  readonly eventId: string;
  readonly triggerSol: number;
  readonly sourceEventId: string;
  readonly sourceChoiceId: string;
}

export interface EventState {
  readonly activeEventId: string | null; // Invariant: luôn === (activeEvent?.eventId ?? null)
  readonly activeEvent: ActiveEvent | null;
  readonly resolvedEventIds: readonly string[]; // Invariant: đồng bộ từ occurrenceHistory (outcome === 'resolved')
  readonly occurrenceHistory: readonly EventOccurrenceRecord[];
  readonly flags: Readonly<Record<string, boolean | string | number>>;
  readonly pendingFollowUps: readonly PendingFollowUpEvent[];
}
```

**5 quy tắc Lifecycle bắt buộc:**
1. **Một `activeEvent` tại một thời điểm:** Khi `activeEvent !== null`, không bốc thêm event mới cho đến khi event hiện tại được `resolved` hoặc `expired`.
2. **`mandatory` vs non-mandatory khi chuyển pha (`selectCanAdvancePhase` & `orchestrator.ts`):**
   - Nếu `activeEvent` có `mandatory === true`: bắt buộc giải quyết ở pha `briefing` trước khi sang `engineering`.
   - Nếu `activeEvent` có `mandatory === false`: người chơi được phép chuyển qua `engineering → comms → rationing` (defer) và gọi `event/resolve` ở bất kỳ pha nào trước khi chốt `sol/end`.
3. **`deadlineSol` là Inclusive:**
   - Khi trigger ở `sol`, `deadlineSol = sol + (event.deadlineOffsetSols ?? 0)`.
   - Event có `deadlineSol === state.clock.sol` vẫn được phép `event/resolve` trong suốt Sol đó trước khi bấm `sol/end`.
   - Khi chạy `sol/end` tại `state.clock.sol >= activeEvent.deadlineSol` mà chưa resolve → End-Sol resolver tự chuyển event đó vào `occurrenceHistory` với `outcome: 'expired'`, xóa `activeEvent = null`, áp dụng `onExpireEffects` (nếu event có khai báo, mặc định `[]`) và ghi log `EVENT_EXPIRED`.
4. **Ngữ nghĩa `repeatPolicy`:**
   - `'once'`: chỉ cần xuất hiện trong `occurrenceHistory` (`'resolved'` **hoặc** `'expired'`) là tính đã `seen`, không bao giờ trigger lại.
   - `'cooldown'`: chỉ được trigger lại khi `currentSol >= lastSettledSol + (event.cooldownSols ?? 1)`.
   - `'repeatable'`: có thể trigger lại ở các Sol sau (tối đa 1 lần mỗi Sol).
5. **Thứ tự ưu tiên Follow-up vs Catalog Event:**
   - Đầu mỗi Sol (khi `activeEvent === null`), kiểm tra `pendingFollowUps` có `triggerSol <= currentSol` và thỏa `when`: nếu có, chọn follow-up có `priority` cao nhất (tie-break theo `event.id` tăng dần ASCII) trước khi xét pool event ngẫu nhiên.

### 3. Ngữ nghĩa `when` (Trigger DSL) & Thứ tự bốc thăm Deterministic

```ts
export interface EventTriggerCondition {
  readonly sol?: number;
  readonly solMin?: number;
  readonly solMax?: number;
  readonly isLunarNight?: boolean;
  readonly flagSet?: string;
  readonly flagNotSet?: string;
  readonly flagEquals?: { readonly key: string; readonly value: boolean | string | number };
  readonly choiceMade?: { readonly eventId: string; readonly choiceId: string };
  readonly eventSeen?: string;
  readonly eventNotSeen?: string;
  readonly roverExpeditionId?: ExpeditionId;
  readonly roverStatus?: RoverTimelineStage;
  readonly systemIntegrityBelow?: { readonly id: SystemId; readonly maxIntegrity: number };
  readonly minResource?: Readonly<Partial<Record<'batteryKWh' | 'oxygenKg' | 'waterL' | 'partsKg' | 'mrePacks', number>>>;
  readonly maxResource?: Readonly<Partial<Record<'batteryKWh' | 'oxygenKg' | 'waterL' | 'partsKg' | 'mrePacks', number>>>;
  readonly crewCondition?: { readonly crewId?: CrewId; readonly condition: CrewCondition };
}
```
- **Luật kết hợp:**
  - Các trường bên trong **cùng một** `EventTriggerCondition` kết hợp theo **`AND`**.
  - Các phần tử trong mảng `when: readonly EventTriggerCondition[]` kết hợp theo **`OR`** (`when.length >= 1`).
  - Mỗi `EventTriggerCondition` phải có **ít nhất 1 trường** được khai báo.
  - `sol` **không được** xuất hiện cùng `solMin` hoặc `solMax` trong cùng một condition (nếu có cả `solMin` và `solMax` thì `solMin <= solMax`).
- **Luật chọn Event:**
  - Lọc danh sách eligible → tìm giá trị `maxPriority = Math.max(...eligible.map(e => e.priority))`.
  - Chỉ giữ nhóm có `e.priority === maxPriority`.
  - **Sort nhóm này theo `e.id` tăng dần** (`a.id.localeCompare(b.id)`) trước khi quay số bằng `deriveRoll(seed, sol, 'event-pick')` theo `weight` (`integer >= 1`) để kết quả không phụ thuộc thứ tự trong file JSON.

### 4. Discriminated Union `EventEffect[]`

```ts
export type EventResourceKey = 'batteryKWh' | 'oxygenKg' | 'waterL' | 'partsKg' | 'mrePacks' | 'medkits';

export type EventEffect =
  | { readonly kind: 'resource'; readonly resource: EventResourceKey; readonly delta: number }
  | { readonly kind: 'science'; readonly delta: number }
  | {
      readonly kind: 'crew';
      readonly target: CrewId | 'all';
      readonly healthDelta?: number;
      readonly moraleDelta?: number;
      readonly satietyDelta?: number;
    }
  | { readonly kind: 'equipment-wear'; readonly equipmentId: EquipmentId; readonly wear: number }
  | { readonly kind: 'system-integrity'; readonly systemId: SystemId; readonly delta: number }
  | { readonly kind: 'plan-override'; readonly wrsEnabled?: boolean; readonly extraPowerCostKWh?: number }
  | { readonly kind: 'set-flag'; readonly key: string; readonly value: boolean | string | number }
  | { readonly kind: 'clear-flag'; readonly key: string }
  | {
      readonly kind: 'assign-task';
      readonly crewId: CrewId;
      readonly task: CrewTaskType;
      readonly targetSystemId?: SystemId;
      readonly targetCrewId?: CrewId;
    }
  | {
      readonly kind: 'rover-action';
      readonly action: 'continue-expedition' | 'fail-expedition' | 'recover-signal' | 'delay-1-sol';
      readonly expeditionId?: ExpeditionId;
    }
  | { readonly kind: 'schedule-follow-up'; readonly eventId: string; readonly delaySols: number };
```

### 5. `EventArtId` Manifest (`src/types/index.ts` & `src/components/cabin/hailAssets.ts`)
```ts
export type EventArtId =
  | 'tech-fault'
  | 'airlock-leak'
  | 'solar-particle'
  | 'robot-signal-loss';
```
- `HAIL_EVENT_ART: Readonly<Record<EventArtId, string>>` đã có trong `src/components/cabin/hailAssets.ts` và `getHailEventScene(artId)` ưu tiên tra theo `EventArtId` từ `event.art`.

### 6. Selector Contract đã sẵn sàng trong `src/domain/eventSelectors.ts`

```ts
export interface ActiveEventView {
  readonly event: EventNode;
  readonly activeEvent: ActiveEvent;
  readonly deadlineSol: number;
  readonly solsToDeadline: number;
  readonly priority: number;
  readonly mandatory: boolean;
  readonly scienceBrief: ScienceBrief | null;
}

export interface EventChoicePreview {
  readonly choice: EventChoice;
  readonly allowed: boolean;
  readonly blockedReasons: readonly string[];
  readonly resourceDeltas: Readonly<Partial<Record<EventResourceKey, number>>>;
  readonly scienceDelta: number;
  readonly effectsSummary: readonly string[];
}

export interface DynamicDebriefView {
  readonly summary: SolSummary | null;
  readonly context: DebriefContext | null;
  readonly scienceBrief: ScienceBrief | null;
}

export function selectActiveEventView(state: GameState, bundle: ContentBundle): ActiveEventView | null;
export function selectEventChoicePreviews(state: GameState, eventId: string, bundle: ContentBundle): readonly EventChoicePreview[];
export function selectDynamicDebrief(state: GameState, bundle: ContentBundle): DynamicDebriefView;
```

---

## Phần B — Phân chia 2 nhánh song song trên `dev`

| Hạng mục | **Nhánh 1 — Bạn (`feat/p1-3-core-content`)** | **Nhánh 2 — Bạn kia (`feat/p1-3-ui-qa-visual`)** |
| :--- | :--- | :--- |
| **Vai trò** | **Product + Core Engine + Content + Golden Sol 7** | **UI + Visual + Catalog/Selector QA** |
| **File sở hữu độc quyền** | • `src/domain/eventEngine.ts` *(file mới)*<br>• `src/domain/eventSelectors.ts` *(hoàn thiện tính toán)*<br>• `src/domain/orchestrator.ts`<br>• `src/domain/endSolResolver.ts`<br>• `src/domain/selectors.ts` *(sửa `selectCanAdvancePhase` & `selectBlockingReasons` chỉ chặn khi `mandatory`)*<br>• `src/domain/invariants.ts`<br>• `src/data/events.json` & `src/data/nasa-briefs.json`<br>• `tests/fixtures/sol7-save-rover.json` *(file mới)*<br>• `tests/phase-1-3-events-and-sol7.test.mjs` *(file mới)* | • `src/components/modals/StarlogModal.tsx`<br>• `src/components/modals/EndOfDayModal.tsx`<br>• `src/components/EventPriorityBanner.tsx` *(file mới)*<br>• `src/components/HailGameViewport.tsx`<br>• `src/components/cabin/hailAssets.ts` *(nếu thêm art mới)* & `public/assets/*`<br>• `src/hail.css`<br>• `scripts/validate-events-catalog.mjs` *(file mới)*<br>• `tests/phase-1-3-catalog-and-ui-selectors.test.mjs` *(file mới)* |
| **Cấm sửa** | Không chạm `src/components/`, `src/hail.css`, `public/assets/`, `scripts/validate-events-catalog.mjs` | Không chạm `src/domain/`, `src/persistence/`, `src/data/events.json`, `tests/phase-1-3-events-and-sol7.test.mjs` |
| **Đầu việc cụ thể** | 1. Cài đặt `eventEngine.ts`: `AND`/`OR` trigger, follow-up queue, `priority` + sort `id` + weighted RNG, `repeatPolicy` (`once`/`cooldown`/`repeatable`), atomic `EventEffect[]` rollback, inclusive `deadlineSol` expire ở End-Sol.<br>2. Sửa `selectors.ts` & `orchestrator.ts` để non-mandatory event có thể defer qua các pha trong ngày.<br>3. Soạn đủ **18–24 events** (Deck 1–4 Sol 1–32 + Golden Sol 7 + Lunar Night + Sunrise) & NASA Science Briefs.<br>4. Viết bộ test Engine + Migration v1→v2→v3 + **Golden Sol 7** (Choice A `25.0 L / 2.0 kWh` & `EXP-REGOLITH` hoàn tất Sol 8 vs Choice B `34.0 L / 0.0 kWh` & `EXP-REGOLITH` fail + save/reload). | 1. Nâng cấp `StarlogModal.tsx`: hiện badge `mandatory`/`deadlineSol`, bảng **Cost & Effect Preview** từ `selectEventChoicePreviews`, lý do khóa choice, dùng `getHailEventScene(event.art)`.<br>2. Nâng cấp `EndOfDayModal.tsx`: hiển thị **Dynamic STEM Brief** từ `selectDynamicDebrief`.<br>3. Tạo `EventPriorityBanner.tsx` + gắn vào `HailGameViewport.tsx` + CSS theo `category`/`priority`.<br>4. Viết `scripts/validate-events-catalog.mjs` & `tests/phase-1-3-catalog-and-ui-selectors.test.mjs` kiểm tra: JSON Schema (`ajv` đã cài sẵn trong `devDependencies`), trùng ID, `scienceBriefId` hợp lệ, `EventArtId` & file ảnh tồn tại trên đĩa, follow-up `eventId` tồn tại, thống kê độ phủ Sol 1–32, và test view-model output của `eventSelectors`. |

---

## Phần C — Thứ tự Thực thi & Merge

1. **Bước 0 (Đã xong):** PR `feat/p1-3-contract` đã merge vào `dev` (`a5a0553`), pass 100% `typecheck`, `lint`, `test`, `build`.
2. **Bước 1 (Hiện tại):** Tách 2 nhánh `feat/p1-3-core-content` và `feat/p1-3-ui-qa-visual` từ `dev`; cả 2 nhánh tự chạy `npm test` xanh độc lập trên phần việc của mình.
3. **Bước 2:** Merge `feat/p1-3-core-content` vào `dev` trước.
4. **Bước 3:** Rebase `feat/p1-3-ui-qa-visual` lên `dev`, chạy `node scripts/validate-events-catalog.mjs` + `npm test` + `npm run build` để kiểm định chéo toàn bộ 22 events với validator của nhánh UI/QA rồi merge vào `dev`.
