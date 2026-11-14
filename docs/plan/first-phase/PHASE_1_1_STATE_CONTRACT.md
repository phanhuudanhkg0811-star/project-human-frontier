# PHASE 1.1 — GameState và JSON Contract

> [!IMPORTANT]
> **ĐỒNG BỘ SCHEMA GAMEPLAY & KIẾN TRÚC CHỐT (14/11/2026 — Option B + Pure TS / Static JSON):** **Bỏ hoàn toàn Pyodide** Web Worker và local Python sidecar khỏi runtime game. Toàn bộ End-Sol resolver, forecast preview và hàm xác suất thời tiết NASA DONKI chạy trực tiếp bằng **Pure TypeScript** (`src/domain/`) trên bộ dữ liệu NASA đã cào/hiệu chỉnh sẵn dưới dạng static JSON (`src/data/donki-space-weather.json`, `simulation-catalog.json`). Đồng bộ gameplay theo [`HUMAN_FRONTIER_2050_GAME_SETUP.md`](../../game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md) & [`PHASE_1_SYNC_HANDOFF_FOR_TEAM.md`](PHASE_1_SYNC_HANDOFF_FOR_TEAM.md):
> - Bắt buộc có từ **P0**: `fabricator` queue (`0` slot Crew, tối đa `1` lệnh/Sol, `1d/2d`), `inventory` (`2` Consumables `MRE/Medkit` + `6` Equipment), `crew[i].satiety` (`0–100`, `Hunger FSM`: `Ok / Hungry / Starving`).
> - Tài nguyên chuẩn **Option A**: `4` kho (`Battery 40/60`, `O2 70/120`, `Water 80/160`, `Parts 16/60`) + `wasteWaterL` nội bộ (không `Chemicals`); `WRS 90% -> 95%`; Golden Sol 7 (`25.0 L / 2.0 kWh` vs `34.0 L / 0.0 kWh`).

> **Trạng thái quyết định:** Đã chốt và cập nhật cho Phase 1.1 ngày 2026-11-14.
>
> **Runtime:** Pure TypeScript Domain Engine (`src/domain/`) là nguồn tính toán duy nhất cho phase transition, End-Sol, forecast preview và mô hình xác suất thời tiết DONKI theo seed (`SHA-256`). React/UI chỉ đọc snapshot qua `GamePort` và dispatch typed commands.
>
> **Mục tiêu tài liệu:** quy định state nào phải tồn tại, state đó dùng để làm gì, state nào được lưu, và contract dữ liệu NASA DONKI/Diviner + SaveEnvelope.
>
> **Thay thế quyết định cũ:** bỏ hoàn toàn phương án Pyodide Web Worker và local Python sidecar/API port `8765`. Dữ liệu NASA được cào trước bằng script offline (`scripts/`) vào static JSON; Phase 1 chạy 100% thuần client TS + JSON, zero runtime Python/WASM.

## 1. Quyết định kiến trúc

```text
NASA Diviner (POC calibration) + NASA DONKI API (3×32 ngày: FLR/CME/SEP/IPS)
      │
      ▼
Offline Node Scripts (scripts/fetch-donki.mjs & build-catalog.mjs)
      │
      ▼
src/data/simulation-catalog.json + donki-space-weather.json + balance/recipes/crew.json
      │
      ▼
React UI → GamePort → TypeScript Orchestrator (src/domain/orchestrator.ts)
                            │
                            │ ResolveSolRequest / Preview
                            ▼
                Pure TS Deterministic Resolver (endSolResolver.ts + spaceWeather.ts + prng.ts)
                            │
                            │ Validation + Seeded DONKI Probability Rolls
                            ▼
                Commit snapshot → Zustand Store → LocalStorage SaveEnvelope v1
```

Các quy tắc không được phá:

1. `GameState` là snapshot gameplay có thẩm quyền duy nhất ở phía ứng dụng.
2. Mọi thay đổi gameplay phải đi qua typed `GameCommand` → `orchestrator` → `assertGameState()`.
3. `endSolResolver.ts` là nơi duy nhất tính End-Sol, forecast (`preview` mode), resource/ECLSS, equipment và crew consequences (`spaceWeather.ts` tính xác suất rủi ro DONKI).
4. Resolver phải stateless & deterministic: cùng `state` (bao gồm committed plan), `missionSeed`, `donkiProfileId`, `modelVersion`, `catalogVersion` luôn cho cùng canonical output/hash.
5. Không dùng `Math.random()` hay wall clock (`Date.now()`) trong simulation; mọi roll dùng `SHA-256(missionSeed, sol, subsystem)` qua `prng.ts`.
6. Cùng request canonical phải cho cùng response canonical.
7. Nếu validation/invariant hoặc version check lỗi, `GameState` không đổi (fail closed).
8. UI và `uiStore` không tự trừ tài nguyên hay viết công thức simulation thứ hai; luôn dùng `selectors.ts`.
9. Tuyệt đối không đưa `NASA_API_KEY` hay raw NASA dumps vào bundle trình duyệt (`src/`).
10. Không tải runtime Pyodide/CDN động khi chơi; chạy hoàn toàn offline với static JSON.

## 2. Sáu loại state

| Loại | Ví dụ | Chủ sở hữu | Lưu save? | Lý do |
| --- | --- | --- | --- | --- |
| Domain state | Sol, resource, crew, system, rover, event | `GameState` | Có | Là tiến trình thực của campaign |
| Plan state | Assignment, ration, power priority, WRS request | `GameState.dailyPlan` sau khi commit | Có | Reload giữa Sol không làm mất quyết định đã xác nhận |
| Draft state | Slider đang kéo, form chưa xác nhận | React local/form state | Không | Chưa phải quyết định gameplay |
| UI state | Modal, tab, hover, animation, toast | `uiStore`/component | Không | Không ảnh hưởng simulation |
| Runtime state | Booted/ready/resolving, save status, domain error tạm | `gameStore.runtime` (không persist) | Không | Là tình trạng kỹ thuật của phiên hiện tại |
| Content/derived | DONKI 3×32d catalog, Diviner catalog, permission, forecast preview | JSON bundle/selectors/cache | Chỉ lưu version + `donkiProfileId` | Có thể load hoặc tính lại |

Không được copy catalog NASA/balance vào save. Save chỉ giữ `contentVersion`, `modelVersion` và `catalogVersion` để phát hiện mismatch.

## 3. `GameState` cấp cao nhất

```ts
interface GameState {
  readonly schemaVersion: 1
  readonly contentVersion: string
  readonly modelVersion: string
  readonly catalogVersion: string
  readonly revision: number

  readonly campaign: CampaignState
  readonly clock: MissionClock
  readonly resources: ResourceState
  readonly systems: Readonly<Record<SystemId, StationSystemState>>
  readonly crew: Readonly<Record<CrewId, CrewMemberState>>
  readonly dailyPlan: DailyPlan
  readonly rover: RoverState
  readonly events: EventState
  readonly logistics: LogisticsState
  readonly debrief: DebriefState
  readonly history: MissionHistory
}
```

### Trường metadata

| Field | Dùng để làm gì |
| --- | --- |
| `schemaVersion` | Migrate cấu trúc save |
| `contentVersion` | Khóa campaign, event, crew và balance content |
| `modelVersion` | Khóa phiên bản công thức Pure TS resolver + DONKI probability |
| `catalogVersion` | Khóa bộ hệ số đã calibrate từ NASA/assumption |
| `revision` | Chặn response cũ ghi đè state mới khi có request bất đồng bộ |

`revision` tăng sau mỗi domain command thành công. Mỗi request gửi `expectedRevision`; chỉ commit response nếu revision hiện tại vẫn khớp request.

## 4. Campaign và mission clock

```ts
type CampaignStatus = 'not-started' | 'active' | 'victory' | 'defeat'

interface CampaignState {
  readonly id: 'moon-32'
  readonly runId: string
  readonly difficultyId: DifficultyId
  readonly status: CampaignStatus
  readonly outcomeReason: OutcomeReason | null
}

type GamePhase =
  | 'title'
  | 'briefing'
  | 'engineering'
  | 'comms'
  | 'rationing'
  | 'resolving'
  | 'debrief'
  | 'victory'
  | 'defeat'

interface MissionClock {
  readonly sol: number
  readonly phase: GamePhase
  readonly missionElapsedHours: number
  readonly missionSeed: number
  readonly resolutionIndex: number
}
```

### Mục đích

- `runId`: phân biệt hai campaign có cùng seed và dùng trong replay/diagnostic.
- `difficultyId`: chọn một difficulty profile trong content; không nhúng profile vào state.
- `sol`: gameplay tick `1..32` khi campaign active.
- `phase`: guard command và khôi phục đúng màn hình sau reload.
- `missionElapsedHours`: thời gian mô phỏng, không dùng `Date.now()`.
- `missionSeed`: seed gốc bất biến của campaign.
- `resolutionIndex`: chống việc resolve cùng một Sol hai lần và tạo seed dẫn xuất ổn định.

`Sol` của game phải được định nghĩa trong catalog bằng `gameSolHours`. Phase 1 mặc định một gameplay Sol là một ngày nhiệm vụ 24 giờ; không được ngầm hiểu là một chu kỳ ngày–đêm thiên văn của Mặt Trăng.

Khi resolver hoàn tất, `clock.sol` vẫn là Sol vừa resolve và phase chuyển sang `debrief`. Command `debrief/dismiss` của TypeScript mới tăng sang Sol kế tiếp, reset `dailyPlan` về `planning`, rồi chuyển phase sang `briefing`. Nhờ vậy reload ở màn debrief không skip hoặc resolve lặp một Sol.

## 5. Resource state (Authoritative runtime schema: `src/types/index.ts`)

> **Đồng bộ code thực tế (Option A/B + Pure TS Engine):** Schema runtime chính thức được định nghĩa tại [`src/types/index.ts`](../../../src/types/index.ts) và kiểm tra runtime bởi [`src/schemas/contracts.ts`](../../../src/schemas/contracts.ts):
> - `ResourceState`: `batteryKWh`, `oxygenKg`, `waterL`, `partsKg`, `wasteWaterL`, `mrePacks` (thay `foodKg`), `medkits`, `medkitLevel`, `waterZeroStreak`, `oxygenZeroStreak`.
> - `StationSystemState`: 5 hệ thống (`solar`, `recycler`, `scrubber`, `airlock`, `fabricator`).
> - `CrewMemberState`: `health`, `morale`, `satiety`, `condition` (`fit` | `injured` | `evacuated`), `hungerState`, `radiationMgy`, `assignedTask` (kèm `partsSpent`).
> - Bổ sung `EquipmentItemState` (6 thiết bị Rover/Shelter) và `FabricatorState` (`usedThisSol`, `activeJob` kèm `startedSol`).

```ts
interface ResourceState {
  readonly oxygenKg: number
  readonly waterCleanL: number
  readonly waterGreyL: number
  readonly foodKg: number
  readonly partsKg: number
  readonly batteryKwh: number
}
```

| Field | Dùng để làm gì | Phase 1.1 |
| --- | --- | --- |
| `oxygenKg` | Hô hấp và hậu quả leak/ECLSS sau này | Tính tiêu thụ mỗi Sol |
| `waterCleanL` | Uống và nhu cầu sinh tồn | Tính ration/deficit |
| `waterGreyL` | Đầu vào WRS | Chứng minh vòng tái chế |
| `foodKg` | Kho MRE; nutrition chi tiết có thể quy đổi từ catalog | Tính ration/deficit |
| `partsKg` | Repair/upgrade | Repair một system ở Sol 1 |
| `batteryKwh` | Năng lượng tích trữ | Charge/discharge và power deficit |

Capacity, đơn giá tiêu thụ và hệ số chuyển đổi không nằm trong state; chúng thuộc `simulation-catalog.json`.

Invariant:

- Tất cả giá trị là finite number và `>= 0`.
- Không vượt capacity trong catalog.
- Resolver phải trả `unmet`/diagnostic khi thiếu; không âm thầm clamp rồi làm mất thông tin.
- Đơn vị là một phần của tên field; không dùng field chung chung như `water` hay `power`.

## 6. System state

```ts
type SystemId = 'scrubber' | 'recycler' | 'power-grid' | 'airlock'
type SystemStatus = 'nominal' | 'degraded' | 'failed' | 'repairing'
type OperatingState = 'off' | 'standby' | 'running' | 'unpowered'

interface StationSystemState {
  readonly id: SystemId
  readonly level: 1 | 2 | 3
  readonly integrity: number
  readonly status: SystemStatus
  readonly operatingState: OperatingState
  readonly ageSols: number
  readonly lastResolvedSol: number | null
}
```

### Mục đích

- `level`: lookup hiệu suất/capacity trong catalog.
- `integrity`: condition chuẩn hóa `0..1` cho reliability/repair.
- `status`: trạng thái gameplay dễ hiển thị và dùng làm guard.
- `operatingState`: kết quả thực tế của lần resolve gần nhất; khác với `dailyPlan.systemModes` là yêu cầu của người chơi.
- `ageSols`: input cho degradation/reliability.
- `lastResolvedSol`: phát hiện system bị resolve hai lần.

Không lưu `assignedCrewId` trong system vì assignment đã có nguồn sự thật riêng.

## 7. Crew state

```ts
type CrewCondition = 'fit' | 'strained' | 'incapacitated' | 'deceased'
type IllnessState = 'healthy' | 'acute' | 'recovering'

interface CrewMemberState {
  readonly id: CrewId
  readonly health: number
  readonly fatigue: number
  readonly stress: number
  readonly hunger: number
  readonly thirst: number
  readonly radiationMgy: number
  readonly condition: CrewCondition
  readonly illness: IllnessState
  readonly lastResolvedSol: number | null
}
```

### Mục đích

- `health`: outcome tổng hợp, không phải dice roll độc lập.
- `fatigue`, `stress`: modifier nhiệm vụ và hậu quả workload.
- `hunger`, `thirst`: tích lũy thiếu khẩu phần thay vì chỉ trừ health ngay lập tức.
- `radiationMgy`: tích lũy dose; Phase 1.1 có thể giữ `0` nhưng schema phải sẵn sàng.
- `condition`, `illness`: guard assignment và terminal condition; availability được selector suy ra từ condition, illness và assignment hiện tại.
- `lastResolvedSol`: chống áp dụng consumption/consequence hai lần.

Tên, role, portrait, skill và text song ngữ thuộc `crew.json`, không copy vào `GameState`.

## 8. Assignment và DailyPlan

```ts
interface Assignment {
  readonly crewId: CrewId
  readonly taskId: TaskId
  readonly targetId: string | null
  readonly workload: 'light' | 'normal' | 'heavy'
  readonly committedAtRevision: number
}

interface DailyPlan {
  readonly status: 'planning' | 'committed' | 'resolved'
  readonly sol: number
  readonly assignments: Readonly<Partial<Record<CrewId, Assignment>>>
  readonly ration: {
    readonly oxygenKgPerCrew: number
    readonly waterLPerCrew: number
    readonly foodKgPerCrew: number
  }
  readonly systemModes: Readonly<Record<SystemId, 'off' | 'standby' | 'on'>>
  readonly powerPriority: readonly PowerLoadId[]
  readonly wrs: {
    readonly requested: boolean
    readonly maxGreyWaterL: number
  }
  readonly roverAction: RoverAction | null
}
```

Quy tắc:

- UI giữ form/slider chưa xác nhận ở local state. Command đã xác nhận như `crew/assign` được ghi vào `dailyPlan` với status `planning` để save/reload giữa phase không mất quyết định.
- `plan/commit` validate rồi đổi plan sang `committed`.
- `dailyPlan.assignments` là nguồn sự thật duy nhất của assignment; các view theo crew/system dùng selector, không copy assignment sang root hoặc entity khác.
- Một crew tối đa một assignment/Sol.
- Plan phải mang đúng `sol` hiện tại.
- Sau resolve, plan đổi sang `resolved`; không được gửi resolve lần hai.

## 9. Rover, event và logistics tối thiểu

Phase 1.1 chưa mô phỏng đầy đủ rover/event/logistics, nhưng root state phải ổn định để Phase 1.2–1.3 không phá save schema.

```ts
interface RoverState {
  readonly status: 'idle' | 'planned' | 'deployed' | 'returning' | 'disabled'
  readonly locationId: SiteId | 'base'
  readonly activeMissionId: RoverMissionId | null
  readonly batteryKwh: number
  readonly integrity: number
}

interface EventState {
  readonly queue: readonly ScheduledEvent[]
  readonly activeEventId: EventId | null
  readonly resolvedEventIds: readonly EventId[]
}

interface LogisticsState {
  readonly radioMessages: readonly RadioMessageState[]
  readonly cargoMissions: readonly CargoMissionState[]
}
```

Mục đích Phase 1.1:

- Khởi tạo giá trị rỗng hợp lệ.
- Save/load và schema validation được ngay từ đầu.
- Guard phase không cần special-case `undefined`.
- Không cần implement lifecycle chi tiết trước Phase 1.2–1.3.

## 10. Debrief và history

```ts
interface DebriefState {
  readonly pending: boolean
  readonly sol: number | null
  readonly summaryId: string | null
}

interface MissionHistory {
  readonly solSummaries: readonly SolSummary[]
  readonly journal: readonly JournalEntry[]
}

interface SolSummary {
  readonly sol: number
  readonly seed: number
  readonly planHash: string
  readonly inputStateHash: string
  readonly outputStateHash: string
  readonly resourceDeltas: readonly ResourceDelta[]
  readonly diagnostics: readonly Diagnostic[]
}
```

History dùng cho debrief, graph và debug replay. Không lưu hourly trace đầy đủ trong `GameState`; trace chi tiết chỉ trả khi debug hoặc được nén thành artifact riêng, tránh save tăng vô hạn.

Không lưu text đã dịch trong history. Lưu `messageKey`/`summaryId` và parameters để render theo locale hiện tại.

## 11. State không thuộc `GameState`

### UI state

```ts
interface UiState {
  readonly activeModal: ModalId | null
  readonly selectedCrewId: CrewId | null
  readonly selectedSystemId: SystemId | null
  readonly selectedRoverSiteId: SiteId | null
  readonly locale: 'vi' | 'en'
  readonly reducedMotion: boolean
  readonly queuedToasts: readonly ToastMessage[]
}
```

### Runtime state

```ts
interface SimulationRuntimeState {
  readonly status: 'idle' | 'loading' | 'ready' | 'resolving' | 'error'
  readonly activeRequestId: string | null
  readonly loadedModelVersion: string | null
  readonly loadedCatalogVersion: string | null
  readonly error: RuntimeError | null
}
```

Runtime state không save. Reload trang load static JSON catalogs và kiểm tra version với save trước khi mở gameplay.

### Derived state

Không lưu các field sau:

- `canAdvancePhase`, `canRepair`, `availableCrewCount`.
- `predictedOxygen`, `predictedBattery`, graph forecast, `predictedRepairSuccessProb`, `predictedRoverRiskProb`.
- `isLunarNight` nếu có thể tính từ Sol + catalog.
- `resourcePercent`, warning color hoặc localized label.
- Tổng tải điện nếu có thể dựng từ plan + catalog.

## 12. Resolver & DONKI Probability Contract (Pure TS)

Mọi lời gọi End-Sol và Forecast đều dùng chung envelope chuẩn hóa (phân tách rõ `commit` vs `preview`):

```ts
interface ResolveSolRequest {
  readonly contractVersion: '1.0'
  readonly requestId: string
  readonly mode: 'commit' | 'preview'
  readonly expectedRevision: number
  readonly modelVersion: string
  readonly catalogVersion: string
  readonly campaignId: string
  readonly runId: string
  readonly sol: number
  readonly seed: number
  readonly donkiProfileId: string
  readonly spaceWeatherOverride?: 'quiet'
  readonly state: GameState
}
```

### Resolve response

```ts
interface ResolveSolResponse {
  readonly expectedRevision: number
  readonly modelVersion: string
  readonly catalogVersion: string
  readonly seed: number
  readonly state: GameState
  readonly deltas: readonly StateDelta[]
  readonly effects: readonly DomainEffect[]
  readonly diagnostics: readonly Diagnostic[]
  readonly scienceBriefIds: readonly string[]
  readonly provenance: Readonly<Record<string, EvidenceType>>
  readonly hashes: {
    readonly request: string
    readonly stateBefore: string
    readonly stateAfter: string
  }
}
```

### Quy tắc serialization

- Chỉ dùng JSON primitive, array và object.
- Không dùng `undefined`, `NaN`, `Infinity`, `Date`, `Map`, `Set`, class instance hoặc function.
- Decimal gameplay phải có quy tắc rounding trong catalog/contract; không round tùy ý ở UI.
- Key được serialize theo canonical order trước khi hash.
- TypeScript validate request trước khi gửi; Python validate lại khi nhận.
- TypeScript validate response trước khi commit.
- Response sai `requestId`, version hoặc `expectedRevision` phải bị bỏ, không sửa state.

## 13. Seed và determinism

Không dùng `Math.random()`, `random` global hoặc thời gian hệ thống trong simulation.

```text
subsystemSeed = SHA-256(
  campaignId + ":" + sol + ":" + missionSeed + ":" + subsystem
)
```

Subsystem tối thiểu:

- `environment`
- `power`
- `equipment:<systemId>`
- `crew:<crewId>`
- `events`

Seed được dẫn xuất theo tên subsystem để thêm model mới không làm thay đổi chuỗi random của model cũ.

## 14. Trình tự resolver Phase 1.1

Python `resolve_sol()` đọc committed plan từ `state.dailyPlan` và chạy đúng thứ tự:

1. Validate contract, versions, state và committed plan.
2. Kiểm tra state/plan đúng Sol và chưa resolve.
3. Dẫn xuất seed cho từng subsystem.
4. Lấy environment snapshot từ catalog theo Sol.
5. Tính fission + solar production.
6. Phân phối điện theo `powerPriority`; ghi served/unmet load.
7. Chạy WRS nếu requested, đủ greywater, system usable và load được cấp điện.
8. Áp dụng repair task, parts cost và system degradation.
9. Tiêu thụ O2, water, food theo ration và crew sống.
10. Cập nhật fatigue, hunger, thirst và health consequence.
11. Cập nhật operating state, resource delta, diagnostics và brief trigger.
12. Kiểm tra terminal condition.
13. Tạo `SolSummary`, chuyển phase sang `debrief`, tăng `resolutionIndex` và `revision`.
14. Chạy invariant lần cuối rồi trả response.

Forecast phải gọi cùng resolver trên bản clone ở preview mode. Không được viết công thức forecast thứ hai.

## 15. Command flow và async port

Tất cả command thay đổi plan/phase và End-Sol được Pure TypeScript orchestrator xử lý đồng bộ phía domain và bọc qua `GamePort.dispatch` bất đồng bộ (chuẩn bị sẵn cho worker nếu sau này mở rộng). Không sử dụng Python/Pyodide.

```ts
type DispatchResult =
  | { readonly ok: true; readonly state: GameState; readonly effects: readonly DomainEffect[] }
  | { readonly ok: false; readonly state: GameState; readonly error: DomainError }

interface GamePort {
  getSnapshot(): GameState
  dispatch(command: GameCommand): Promise<DispatchResult>
  subscribe(listener: () => void): () => void
  getRuntimeState(): SimulationRuntimeState
  reset(): Promise<void>
}
```

Luồng `sol/end`:

```text
UI dispatch sol/end
  → TS guard phase + plan
  → set runtime=resolving, không mutate resource
  → Pure TS endSolResolver (mode: 'commit') + DONKI probability rolls
  → validate response + invariants + revision + versions
  → atomic commit state mới
  → persist SaveEnvelope v1
  → runtime=ready
```

Không cho gửi hai request resolve đồng thời. Forecast gọi cùng `endSolResolver` với `mode: 'preview'` (không mutate state).

## 16. Save envelope

```ts
interface SaveEnvelope {
  readonly schemaVersion: 1
  readonly savedAt: string
  readonly appVersion: string
  readonly contentVersion: string
  readonly modelVersion: string
  readonly catalogVersion: string
  readonly state: GameState
  readonly checksum: string
}
```

`savedAt` là metadata persistence và có thể dùng wall clock; simulation tuyệt đối không đọc nó để quyết định outcome.

Load flow:

1. Parse JSON.
2. Validate envelope/schema.
3. Verify checksum.
4. Migrate `schemaVersion` nếu có migration.
5. Kiểm tra `modelVersion`/`catalogVersion`/`contentVersion` khớp runtime bundle.
6. Validate domain invariants (`assertGameState`).
7. Chỉ sau đó mới commit vào store và cho chơi tiếp; nếu lỗi, bật recovery UI và không tự ghi đè save.

## 17. Simulation catalog và provenance

Catalog runtime là JSON nhỏ đã calibrate, không chứa raw NASA dataset:

```ts
interface SimulationCatalog {
  readonly catalogVersion: string
  readonly modelVersion: string
  readonly timebase: {
    readonly gameSolHours: number
    readonly lunarNightStartSol: number
    readonly lunarNightEndSol: number
  }
  readonly environment: EnvironmentParameters
  readonly resources: ResourceParameters
  readonly equipment: EquipmentParameters
  readonly crew: CrewParameters
  readonly provenance: Readonly<Record<string, ProvenanceEntry>>
}

interface ProvenanceEntry {
  readonly evidence: 'observed' | 'inferred' | 'assumption' | 'simulated'
  readonly sourceId: string
  readonly sourceUrl?: string
  readonly accessedAt?: string
  readonly unit: string
  readonly note: string
}
```

Phase 1.1 dùng trực tiếp:

- Diviner cho profile nhiệt độ Mặt Trăng.
- CSA/ISS public values làm prior cho WRS và nutrition, có nhãn phù hợp.
- Fission/solar/base load theo GDD có nhãn `assumption` cho tới khi có nguồn calibrate tương ứng.

MEDA, MOXIE và MSL RAD là dữ liệu Mars; không được gắn nhãn là quan sát trực tiếp cho Moon. NASA DONKI (3 mẫu × 32 ngày liên tiếp tại `src/data/donki-space-weather.json`) được đưa trực tiếp vào mô hình xác suất thời tiết vũ trụ của Pure TS End-Sol resolver ngay từ Phase 1.1.

## 18. Runtime Performance Budget & Static Data Footprint

```text
App boot
  → validate & index static JSON (balance, crew, recipes, simulation-catalog, donki-space-weather)
  → verify/restore SaveEnvelope v1 (nếu có)
  → runtime = ready(modelVersion, catalogVersion)
  → enable New Mission / Continue
```

Mục tiêu benchmark trên máy cấu hình thấp của nhóm:

| Operation | Budget |
| --- | ---: |
| Cold boot static JSON + UI | p95 < 500 ms |
| End-Sol resolve một Sol | p95 < 10 ms |
| Forecast 5 Sol (`preview` mode) | p95 < 25 ms |
| Total production gzip/bundle | < 2.5 MB |
| UI trong lúc resolve | Không block main thread |

## 19. Error model

| Code | Khi nào | State có đổi? |
| --- | --- | --- |
| `E_CONTRACT_MISMATCH` | Schema/contract version khác | Không |
| `E_MODEL_MISMATCH` | Save/request khác modelVersion | Không |
| `E_CATALOG_MISMATCH` | Catalog khác save/request | Không |
| `E_SAVE_CORRUPTED` | JSON hỏng hoặc checksum mismatch | Không |
| `E_STATE_INVALID` | State không qua schema/invariant | Không |
| `E_PLAN_INVALID` | Plan sai Sol/chưa commit | Không |
| `E_PHASE_INVALID` | Command gửi sai phase | Không |
| `E_INSUFFICIENT_RESOURCE` | Command cần resource mà không có | Không với command; resolver ghi unmet theo rule |
| `E_RESOLVE_FAILED` | Resolver không tạo được output hợp lệ | Không |

Thông báo kỹ thuật không hiển thị thẳng cho trẻ. UI map error code sang copy thân thiện và giữ detail trong debug panel.

## 20. Invariant bắt buộc

- `revision` và `resolutionIndex` chỉ tăng, không giảm.
- `sol` là integer `1..32` khi active.
- Mọi số gameplay finite và không âm.
- Battery/resource không vượt capacity.
- Mỗi crew tối đa một assignment/Sol.
- Crew incapacitated/deceased không được assign.
- System level `1..3`, integrity `0..1`.
- `dailyPlan.sol === clock.sol`.
- Chỉ `dailyPlan.status === 'committed'` mới được resolve.
- Không `sol/end` ngoài phase `rationing`.
- Chỉ một active event cần quyết định tại một thời điểm.
- State response phải cùng run/campaign/version với request.
- Một Sol không được resolve hai lần.
- Mọi resolve thành công tạo đúng một `SolSummary`.
- Không domain mutation nào phụ thuộc UI state hoặc wall clock.

## 21. Fixture và test bắt buộc của Phase 1.1

### Golden Sol 1

Fixture phải khóa:

- Initial resources và capacity.
- Bốn crew fit và chưa có assignment.
- Bốn system nominal.
- Fission 8 kWh/Sol, solar 24 kWh/Sol (Option A, `balance.json`), base load Essential 12 kWh/Sol.
- Một repair assignment.
- Một WRS request.
- Ration chuẩn.
- Expected power ledger, resource delta, crew consequence và state Sol 2/debrief.

### Test matrix

- Schema validation trên tất cả static JSON (`balance`, `crew`, `recipes`, `simulation-catalog`, `donki-space-weather`).
- Cùng request chạy 100 lần cho cùng canonical response/hash (bao gồm DONKI probability rolls).
- Reload từ SaveEnvelope rồi replay phần còn lại vẫn cho cùng output.
- Corrupted save / version mismatch giữ nguyên state an toàn và cho phép recovery.
- Resolve thiếu điện ghi load unmet đúng thứ tự priority.
- WRS không chạy khi thiếu điện/greywater hoặc recycler failed.
- Resource không âm và deficit được giải thích.
- Save/reload ở mọi phase giữ đúng plan/assignment.
- Forecast không mutate state và dùng cùng `endSolResolver` ở `mode: 'preview'`.
- DONKI probability test: cùng seed lặp lại 100% và bão X-class/SEP làm tăng rủi ro hỏng/giảm tỷ lệ sửa thành công có ý nghĩa thống kê so với Sol yên tĩnh.
- Golden Sol 1 & Golden Sol 7 Option A (`25.0 L / 2.0 kWh` vs `34.0 L / 0.0 kWh`) khớp tuyệt đối.

## 22. State tối thiểu phải hoàn thành trong Phase 1.1

| State | Bắt buộc hoạt động | Có thể chỉ khởi tạo hợp lệ |
| --- | --- | --- |
| Campaign/clock/phase/version | Có | — |
| Resources | Có | — |
| Systems | Có: 5 hệ thống (`solar`, `recycler`, `scrubber`, `airlock`, `fabricator`), repair | Airlock behavior sâu |
| Crew | Có: availability, assignment, basic consequence + DONKI hazard | Illness/radiation sâu |
| DailyPlan | Có: ration, power priority, WRS, assignment, fabricator queue | Rover action sâu |
| Rover | — | Có |
| Events | Brief mẫu/guard active event + DONKI space weather | Full scheduler/catalog |
| Logistics | — | Có |
| Debrief/history | Có `SolSummary` + DONKI outcome | Full report card |
| Runtime state | Có | — |
| UI state | Có tối thiểu + cockpit bindings | Audio/VFX nâng cao |

## 23. Definition of Done cho state contract

- Có schema/runtime validator tương ứng cho static JSON catalogs, command/state và save.
- Không có Pyodide, Python runtime hay localhost sidecar trong repo runtime; chạy thuần TypeScript.
- `GamePort.dispatch()` là async-ready và UI xử lý error/save recovery an toàn.
- `sol/end` commit qua `endSolResolver.ts`; `forecast` dùng chung `endSolResolver` ở `mode: 'preview'`.
- Không có công thức End-Sol/forecast thứ hai trong UI hoặc Zustand store.
- State/UI/draft/runtime/content/derived được tách đúng như tài liệu.
- Golden Sol 1, Golden Sol 7 Option A và DONKI probability tests deterministic và pass 100%.
- Corrupted save và version mismatch không làm hỏng app.
- Production bundle `< 2.5 MB` và resolve `< 10 ms`.

---

## Quyết định ngắn gọn

Phase 1.1 dùng **Pure TypeScript Deterministic Engine** kết hợp **Pre-scraped Static JSON** (hiệu chỉnh từ NASA Diviner LRO và 3 mẫu × 32 ngày NASA DONKI: `FLR`, `CME`, `SEP`, `IPS`, `notifications`) và **SHA-256 Seeded Probability**. Không dùng Pyodide hay Python runtime ở trình duyệt. TypeScript sở hữu trọn vẹn flow, snapshot, End-Sol / forecast resolver và hàm xác suất DONKI; còn catalog NASA, UI state, runtime state và forecast được tách khỏi SaveEnvelope theo đúng trách nhiệm.
