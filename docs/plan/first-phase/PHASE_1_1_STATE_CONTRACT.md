# PHASE 1.1 — GameState và JSON Contract

> **Trạng thái quyết định:** Đã chốt cho Phase 1.1 ngày 2026-11-14.
>
> **Runtime:** React/TypeScript giữ snapshot, phase flow, store và persistence. Python chạy trong **Pyodide Web Worker** và là nguồn tính toán duy nhất cho End-Sol, forecast và các model khoa học. Hai phía chỉ giao tiếp bằng JSON đã validate.
>
> **Mục tiêu tài liệu:** quy định state nào phải tồn tại, state đó dùng để làm gì, state nào được lưu, và biên trách nhiệm giữa TypeScript với Python.
>
> **Thay thế quyết định cũ:** phương án local Python sidecar/API port `8765` trong tài liệu khảo sát dữ liệu được thay bằng worker message contract. Phase 1 không cần process Python, localhost API hay Python cài sẵn trên máy người chơi.

## 1. Quyết định kiến trúc

```text
NASA raw data
      │
      ▼
Python calibration pipeline (build-time, có thể dùng Pandas/SciPy)
      │
      ▼
simulation-catalog.json + provenance
      │
      ▼
React UI → TypeScript command orchestrator → Zustand GameState
                                                │
                                                │ ResolveSolRequest JSON
                                                ▼
                                    Persistent Web Worker
                                    Pyodide + Python resolver
                                                │
                                                │ ResolveSolResponse JSON
                                                ▼
                                    Validate → commit snapshot → save
```

Các quy tắc không được phá:

1. `GameState` là snapshot gameplay có thẩm quyền duy nhất ở phía ứng dụng.
2. TypeScript quản lý phase, command, draft/commit và persistence; không tự tính physics/resource balance.
3. Python là nơi duy nhất tính End-Sol, forecast, environment, resource/ECLSS, equipment và crew consequences.
4. Python resolver phải stateless: request chứa đủ `state` (bao gồm committed plan), `seed` và versions; response không phụ thuộc lịch sử process.
5. Không truyền object/proxy sống qua biên JS–Python. Chỉ truyền JSON UTF-8.
6. Cùng request canonical phải cho cùng response canonical.
7. Nếu worker/Pyodide lỗi, `GameState` không đổi. UI cho phép retry hoặc reload worker; không chạy công thức dự phòng bằng TypeScript.
8. Pyodide được load một lần trong worker và giữ sống suốt phiên chơi.
9. Pandas/SciPy chỉ dùng trong calibration/build-time nếu resolver runtime không thật sự cần; tránh tăng cold start và RAM.
10. Pin chính xác Pyodide và Python package version trong lock/build config; runtime được self-host, không tải CDN động khi chơi.

## 2. Sáu loại state

| Loại | Ví dụ | Chủ sở hữu | Lưu save? | Lý do |
| --- | --- | --- | --- | --- |
| Domain state | Sol, resource, crew, system, rover, event | `GameState` | Có | Là tiến trình thực của campaign |
| Plan state | Assignment, ration, power priority, WRS request | `GameState.dailyPlan` sau khi commit | Có | Reload giữa Sol không làm mất quyết định đã xác nhận |
| Draft state | Slider đang kéo, form chưa xác nhận | React local/form state | Không | Chưa phải quyết định gameplay |
| UI state | Modal, tab, hover, animation, toast | `uiStore`/component | Không | Không ảnh hưởng simulation |
| Runtime state | Worker booting/ready/error, request đang chạy | `gameStore.runtime` (không persist) | Không | Là tình trạng kỹ thuật của phiên hiện tại |
| Content/derived | Catalog, permission, forecast preview | JSON bundle/selectors/cache | Chỉ lưu version | Có thể load hoặc tính lại |

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
| `modelVersion` | Khóa công thức Python resolver |
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

## 5. Resource state

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

### Runtime/worker state

```ts
interface SimulationRuntimeState {
  readonly status: 'idle' | 'loading' | 'ready' | 'resolving' | 'error'
  readonly activeRequestId: string | null
  readonly loadedModelVersion: string | null
  readonly loadedCatalogVersion: string | null
  readonly progress: number | null
  readonly error: RuntimeError | null
}
```

Runtime state không save. Reload trang luôn boot worker lại rồi mới cho phép `sol/end` hoặc forecast.

### Derived state

Không lưu các field sau:

- `canAdvancePhase`, `canRepair`, `availableCrewCount`.
- `predictedOxygen`, `predictedBattery`, graph forecast.
- `isLunarNight` nếu có thể tính từ Sol + catalog.
- `resourcePercent`, warning color hoặc localized label.
- Tổng tải điện nếu có thể dựng từ plan + catalog.

## 12. JSON contract TypeScript ↔ Python

Tất cả message dùng envelope:

```ts
interface WorkerRequest<T> {
  readonly contractVersion: '1.0'
  readonly requestId: string
  readonly kind: 'boot' | 'resolve-sol' | 'forecast' | 'validate-state'
  readonly payload: T
}

interface WorkerResponse<T> {
  readonly contractVersion: '1.0'
  readonly requestId: string
  readonly ok: boolean
  readonly payload?: T
  readonly error?: ContractError
}
```

### Resolve request

```ts
interface ResolveSolRequest {
  readonly expectedRevision: number
  readonly modelVersion: string
  readonly catalogVersion: string
  readonly campaignId: string
  readonly runId: string
  readonly sol: number
  readonly seed: number
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

Command thay đổi plan/phase có thể được TypeScript xử lý đồng bộ. Command gọi Python phải async.

```ts
type DispatchResult =
  | { readonly ok: true; readonly state: GameState; readonly effects: readonly DomainEffect[] }
  | { readonly ok: false; readonly state: GameState; readonly error: DomainError }

interface GamePort {
  getSnapshot(): GameState
  dispatch(command: GameCommand): Promise<DispatchResult>
  subscribe(listener: () => void): () => void
  getRuntimeState(): SimulationRuntimeState
  retryWorker(): Promise<void>
  reset(): Promise<void>
}
```

Luồng `sol/end`:

```text
UI dispatch sol/end
  → TS guard phase + plan
  → set runtime=resolving, không mutate resource
  → worker resolve-sol
  → validate response + revision + versions
  → atomic commit state mới
  → persist
  → runtime=ready
```

Không cho gửi hai request resolve đồng thời. Forecast có thể hủy hoặc bỏ response cũ bằng `requestId`.

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
5. Boot worker.
6. So sánh `modelVersion`/`catalogVersion` với worker.
7. Gửi `validate-state`.
8. Chỉ sau đó mới commit vào store và cho chơi tiếp.

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

MEDA, MOXIE và MSL RAD là dữ liệu Mars; không được gắn nhãn là quan sát trực tiếp cho Moon. DONKI được chuẩn bị dưới dạng cache offline nhưng chỉ đưa vào event resolver từ Phase 1.3.

## 18. Worker lifecycle và performance budget

```text
App boot
  → spawn worker
  → load local Pyodide runtime
  → load Python package + catalog
  → worker sends ready(modelVersion, catalogVersion)
  → enable New Mission / Continue
```

Mục tiêu benchmark trên máy cấu hình thấp của nhóm:

| Operation | Budget |
| --- | ---: |
| Cold boot worker + Pyodide | p95 < 5 s |
| Warm resolve một Sol | p95 < 200 ms |
| Forecast 5 Sol | p95 < 500 ms |
| Request hoặc response JSON | < 100 KB |
| UI trong lúc resolve | Không block main thread |

Nếu vượt budget, tối ưu theo thứ tự:

1. Bỏ import Pandas/SciPy khỏi runtime.
2. Giữ worker persistent và prewarm từ title screen.
3. Gọi một request lớn mỗi Sol thay vì nhiều request nhỏ.
4. Không serialize hourly trace/history không cần thiết.
5. Cache Pyodide và Python assets để chạy offline.
6. Profile Python model trước khi giảm độ chính xác gameplay.

## 19. Error model

| Code | Khi nào | State có đổi? |
| --- | --- | --- |
| `E_WORKER_NOT_READY` | Pyodide chưa boot xong | Không |
| `E_WORKER_CRASHED` | Worker/Python exception không phục hồi | Không |
| `E_CONTRACT_MISMATCH` | Contract version khác | Không |
| `E_MODEL_MISMATCH` | Save/request khác Python model | Không |
| `E_CATALOG_MISMATCH` | Catalog khác save/request | Không |
| `E_STALE_RESPONSE` | Revision/requestId không còn hiện hành | Không |
| `E_STATE_INVALID` | State không qua schema/invariant | Không |
| `E_PLAN_INVALID` | Plan sai Sol/chưa commit | Không |
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
- Fission 8 kWh/Sol, solar 25 kWh/Sol, base load 12 kWh/Sol theo GDD.
- Một repair assignment.
- Một WRS request.
- Ration chuẩn.
- Expected power ledger, resource delta, crew consequence và state Sol 2/debrief.

### Test matrix

- JSON schema round-trip TS → Python → TS.
- Cùng request chạy 100 lần cho cùng canonical response/hash.
- Worker restart rồi replay vẫn cùng output.
- Response stale không ghi đè state.
- Worker crash giữ nguyên state và retry được.
- Resolve thiếu điện ghi load unmet đúng thứ tự priority.
- WRS không chạy khi thiếu điện/greywater hoặc recycler failed.
- Resource không âm và deficit được giải thích.
- Save/reload ở mọi phase giữ đúng plan/assignment.
- Forecast không mutate state và dùng cùng resolver.
- Invalid save/model/catalog mismatch có recovery rõ ràng.
- UI vẫn responsive khi resolve/forecast.

## 22. State tối thiểu phải hoàn thành trong Phase 1.1

| State | Bắt buộc hoạt động | Có thể chỉ khởi tạo hợp lệ |
| --- | --- | --- |
| Campaign/clock/phase/version | Có | — |
| Resources | Có | — |
| Systems | Có: power, recycler, một repair | Airlock behavior sâu |
| Crew | Có: availability, assignment, basic consequence | Illness/radiation sâu |
| DailyPlan | Có: ration, power priority, WRS, assignment | Rover action sâu |
| Rover | — | Có |
| Events | Brief mẫu/guard active event | Full scheduler/catalog |
| Logistics | — | Có |
| Debrief/history | Có một SolSummary | Full STEM/report card |
| Runtime worker state | Có | — |
| UI state | Có tối thiểu cho vertical slice | Full cockpit polish |

## 23. Definition of Done cho state contract

- Có JSON Schema hoặc runtime validator tương ứng cho request, response, catalog và save.
- Pyodide chạy trong Web Worker, không chạy trên UI thread.
- Worker boot một lần và báo đúng version.
- `GamePort.dispatch()` là async và UI xử lý loading/error.
- `sol/end` gửi đúng một JSON request và atomic commit đúng một response.
- Không có công thức End-Sol/forecast thứ hai trong TypeScript.
- State/UI/draft/runtime/content/derived được tách đúng như tài liệu.
- Golden Sol 1 deterministic và reload được.
- Worker crash, stale response và version mismatch không làm hỏng save.
- Performance đạt budget đã chốt hoặc có benchmark ghi rõ ngoại lệ.

---

## Quyết định ngắn gọn

Phase 1.1 không “chạy Python bên cạnh website”. Python được đóng gói trong browser bằng Pyodide, chạy trong persistent Web Worker và nhận/trả một JSON contract versioned. TypeScript sở hữu flow và snapshot; Python sở hữu toàn bộ phép tính mô phỏng. `GameState` chỉ lưu tiến trình cần thiết, còn catalog NASA, UI state, worker state và forecast được tách khỏi save theo đúng trách nhiệm.
