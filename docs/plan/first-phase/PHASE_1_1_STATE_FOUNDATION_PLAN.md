# PHASE 1.1 — State Foundation và kế hoạch triển khai song song

> [!IMPORTANT]
> **CẬP NHẬT STATE & COMMAND (14/11/2026 — Option B):** Giữ nguyên kiến trúc 5 nhóm state + `GameCommand` / `EngineResult` bên dưới, bổ sung/chỉnh theo [`HUMAN_FRONTIER_2050_GAME_SETUP.md`](../../game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md) & [`PHASE_1_SYNC_HANDOFF_FOR_TEAM.md`](PHASE_1_SYNC_HANDOFF_FOR_TEAM.md):
> - Bắt buộc có từ P0: `fabricator` queue (`1` lệnh/Sol, **tự động `0` Crew slot**, `1d/2d`, chỉ tốn `Parts + Battery (+ Water)`), `inventory` (`2` Consumables + `6` Equipment), `crew[i].satiety` (`0–100`) + `HungerState` (`Ok / Hungry / Starving`).
> - Tài nguyên chuẩn: `4` kho hiển thị (`Battery 40/60`, `O2 70/120`, `Water 80/160`, `Parts 16/60`) + `wasteWaterL` ẩn nội bộ; **không** thêm `Chemicals`. `WRS` áp dụng **Option A (`90% -> 95%`)**.

> **Mục tiêu phase con:** từ project trắng tạo được lõi state theo `campaignId` ổn định, deterministic, lưu/khôi phục được và chạy trọn một Sol bằng test — trước khi xây Moon Survival 32 Sol và cockpit hoàn chỉnh.
>
> **Đầu ra quan trọng nhất:** không phải UI đẹp, mà là một `GameState` duy nhất có quy tắc rõ ràng, được thay đổi qua command và không thể rơi vào trạng thái bất hợp lệ.
>
> **Runtime đã chốt:** **Pure TypeScript Deterministic Engine** (`src/domain/`) + **Pre-scraped Static JSON** (`src/data/donki-space-weather.json`, `simulation-catalog.json`, v.v.); **không dùng Pyodide** Web Worker hay local Python sidecar. TypeScript quản lý trọn vẹn phase, command, End-Sol resolver, hàm xác suất DONKI, store và persistence. Chi tiết field và contract nằm tại [`PHASE_1_1_STATE_CONTRACT.md`](PHASE_1_1_STATE_CONTRACT.md).

## 1. Cách quản lý “một mớ state”

Không đặt mọi thứ vào một object Zustand rồi cho component sửa trực tiếp. Chia state thành năm nhóm với năm cách quản lý khác nhau:

| Nhóm | Ví dụ | Nơi quản lý | Có lưu save? |
| --- | --- | --- | --- |
| Domain state | Sol, phase, tài nguyên, crew, hệ thống, rover, event | TypeScript snapshot + Pure TS Resolver | Có |
| UI state | Modal đang mở, tab, hover, toast, animation | UI store/local component | Không |
| Draft state | Khẩu phần đang kéo, payload tiếp tế chưa xác nhận | Form/local state | Không; chỉ commit khi xác nhận |
| Content/config | Balance, event catalog, crew, DONKI 3×32d, brief | Static JSON đã validate | Lưu `contentVersion`, không copy cả catalog |
| Derived state | Có sửa được không, dự báo cuối Sol, rủi ro DONKI | Selector thuần | Không |
| Runtime state | Save status / loading / domain error tạm | Adapter/store | Không |

### Quy tắc nguồn sự thật

```text
Static JSON (balance/DONKI/Diviner) ──┐
                                      ▼
Player command → TS Orchestrator → Pure TS End-Sol / Preview Resolver → GameState → Store → UI
                         │                   │                            │
                         │                   └→ SHA-256 PRNG + DONKI prob └→ SaveEnvelope v1
                         └→ DomainError / Effects
```

- `GameState` trong store là snapshot gameplay có thẩm quyền duy nhất.
- `src/domain/` là nguồn tính toán duy nhất cho phase transition, End-Sol, preview forecast và DONKI probability rolls.
- Component không được tự trừ tài nguyên hoặc đổi phase.
- Zustand không chứa công thức gameplay; chỉ giữ snapshot và gọi `dispatch`.
- UI không lưu lại giá trị có thể tính từ `GameState`.
- Save không lưu modal, toast, loading hay form đang nhập dở.
- Thời gian gameplay dùng game clock/command; simulation không đọc `Date.now()` hay `Math.random()` (dùng `prng.ts` SHA-256 theo `(missionSeed, sol, subsystem)`).
- Validation error hoặc save version mismatch thì giữ nguyên state (fail closed), không tự ý mutate `GameState`.

## 2. Hình dạng state đề xuất

Không cần tách thành hàng chục store. PHASE 1 dùng hai store:

1. `gameStore`: domain snapshot, async dispatch, save/load status và runtime status không persist.
2. `uiStore`: modal, selection và presentation state dùng chung.

Form chỉ dùng state cục bộ trong component nếu không cần chia sẻ.

### Domain `GameState`

```ts
interface GameState {
  readonly schemaVersion: 1;
  readonly contentVersion: string;
  readonly modelVersion: string;
  readonly catalogVersion: string;
  readonly revision: number;
  readonly campaign: {
    readonly id: 'moon-32';
    readonly status: 'not-started' | 'active' | 'victory' | 'defeat';
    readonly outcomeReason: string | null;
  };
  readonly clock: {
    readonly sol: number;
    readonly phase: GamePhase;
    readonly missionSeed: number;
    readonly missionElapsedHours: number;
    readonly resolutionIndex: number;
  };
  readonly resources: ResourceState;
  readonly systems: Readonly<Record<SystemId, StationSystem>>;
  readonly crew: Readonly<Record<CrewId, CrewMember>>;
  readonly dailyPlan: DailyPlan;
  readonly rover: RoverState;
  readonly eventQueue: readonly ScheduledEvent[];
  readonly activeEventId: string | null;
  readonly logistics: LogisticsState;
  readonly history: MissionHistory;
}
```

Đây là overview; type chuẩn, mục đích từng field, state không được lưu và invariant nằm trong [`PHASE_1_1_STATE_CONTRACT.md`](PHASE_1_1_STATE_CONTRACT.md). `revision` là bắt buộc để response bất đồng bộ cũ không ghi đè snapshot mới.

### Vì sao dùng record thay vì array cho entity chính

- `crewById['elena']` và `systemsById['recycler']` dễ cập nhật/tra cứu hơn tìm trong array.
- Thứ tự hiển thị nằm trong content/UI (`crewOrder`), không trộn với state.
- Rover mission/history vẫn có thể là array vì thứ tự thời gian có ý nghĩa.

### UI state

```ts
interface UiState {
  readonly activeModal: ModalId | null;
  readonly selectedCrewId: CrewId | null;
  readonly selectedSystemId: SystemId | null;
  readonly selectedRoverSiteId: SiteId | null;
  readonly reducedMotion: boolean;
  readonly locale: 'vi' | 'en';
  readonly queuedToasts: readonly ToastMessage[];
}
```

Không đưa các field sau vào `GameState`:

- `isModalOpen`, `activeTab`, `isHovered`, `isAnimating`.
- `predictedOxygen`, `canRepair`, `crewAvailableCount`.
- Payload/form chưa bấm xác nhận.
- `isSaving`, `loadError` — đây là trạng thái adapter/store.

## 3. Action flow duy nhất

Mọi thay đổi domain phải đi qua command:

```ts
type GameCommand =
  | { type: 'campaign/start' }
  | { type: 'phase/advance' }
  | { type: 'crew/assign'; crewId: CrewId; task: TaskRef }
  | { type: 'crew/unassign'; crewId: CrewId }
  | { type: 'system/repair'; systemId: SystemId }
  | { type: 'system/upgrade'; systemId: SystemId }
  | { type: 'event/choose'; eventId: EventId; choiceId: ChoiceId }
  | { type: 'rover/schedule'; plan: ExpeditionPlan }
  | { type: 'plan/commit'; plan: DailyPlan }
  | { type: 'sol/end' };
```

Engine trả về kết quả có cấu trúc thay vì im lặng:

```ts
type DispatchResult =
  | {
      ok: true;
      state: GameState;
      effects: readonly DomainEffect[];
    }
  | {
      ok: false;
      state: GameState;
      error: DomainError;
    };
```

`DomainEffect` chỉ mô tả điều đã xảy ra (`resource-changed`, `system-repaired`, `phase-changed`). UI quyết định biến effect thành toast, âm thanh hay animation; engine không biết UI.

`dispatch` trả `Promise<DispatchResult>` để giữ interface `GamePort` đồng nhất cho mọi command (sync hoặc bất đồng bộ nếu mở rộng sau này) và cho phép SHA-256 PRNG (`crypto.subtle` / Node `crypto`) chạy sạch qua một biên chung.

## 4. Derived state bằng selector

Không lưu những gì có thể tính lại:

```ts
selectAvailableCrew(state)
selectCanAdvancePhase(state)
selectCanRepair(state, systemId)
selectResourceForecast(state, config)
selectRoverDeadline(state)
selectMissionProgress(state)
selectBlockingReasons(state)
selectFiveSolResourceTrend(state)
```

Mỗi selector:

- Là pure function.
- Có unit test khi chứa logic quan trọng.
- Trả về lý do chi tiết, không chỉ boolean.
- Được Zustand subscribe theo lát nhỏ để giảm re-render.

Ví dụ:

```ts
type Permission =
  | { allowed: true }
  | { allowed: false; code: string; message: string };
```

## 5. Invariant phải khóa trước khi code gameplay

Đây là “luật hiến pháp” của state:

- `sol` là integer trong `1..32` khi Moon campaign active.
- Mọi resource hữu hạn và không âm; battery không vượt capacity.
- Mỗi crew có tối đa một assignment trong một Sol.
- Crew chết/incapacitated không nhận assignment.
- Một system chỉ có level `1..3`, integrity `0..1`.
- Chỉ một event có thể chờ người chơi xử lý.
- Không advance khỏi briefing khi event bắt buộc chưa giải quyết.
- Không end Sol ngoài pha rationing.
- Rover/equipment đang làm mission không được đặt cho mission khác.
- Mission terminal không nhận command gameplay mới ngoài restart.
- Mỗi cargo/radio/mission/event ID là duy nhất.
- Mọi transition đều tạo log và giữ state cũ immutable.

Viết `assertGameState()` cho development/test và chạy sau mỗi command trong test build.

## 6. Build cái gì trước

### Thứ tự critical path

```text
1. Product rules + invariants
        ↓
2. Domain types + command contract
        ↓
3. JSON schema + DONKI 3×32d / Diviner static catalog + fixtures
        ↓
4. SHA-256 PRNG + DONKI probabilistic functions
        ↓
5. TS state machine + Pure TS End-Sol resolver
        ↓
6. Selectors + forecast
        ↓
7. Zustand adapter
        ↓
8. Save/load + migration
        ↓
9. UI vertical slice tối thiểu
        ↓
10. Chạy trọn Sol 1 bằng UI và reload được
```

Không build cockpit hoàn chỉnh trước bước 8. UI sớm chỉ cần dev panel/form tối giản để bấm command và xem state.

## 7. Phạm vi chính xác của PHASE 1.1

### Có trong phase con này

- Project foundation và CI.
- Domain types, command, error, effect và invariant.
- Static JSON loader/schema cho balance, crew, recipes, campaign, initial state, `donki-space-weather.json` (3×32 ngày) và `simulation-catalog.json` (Diviner).
- Pure TS state machine đủ các phase + End-Sol / preview resolver + hàm xác suất thời tiết DONKI theo seed.
- Crew assignment cơ bản, 3D Fabricator queue và sửa chữa system.
- Selector permission + resource forecast.
- Predictor phải gọi cùng resolver ở chế độ preview; không viết công thức thứ hai trong UI.
- Zustand adapter và hai store.
- Save/load version 1.
- Campaign definition (`targetSol`, victory requirements), Mission Seed và difficulty profile được load từ content/config.
- Dev UI tối thiểu chạy hết Sol 1.
- Test engine, store và persistence.
- Benchmark cold boot, warm resolve và forecast theo budget trong state contract.

### Chưa làm trong phase con này

- Full rover lifecycle và nhánh Sol 7.
- Toàn bộ event catalog/content.
- Artwork cockpit hoàn chỉnh.
- 12-Sol balance, victory/defeat polish.
- Audio, animation, tutorial hoàn chỉnh và NASA live data.

## 8. Kế hoạch triển khai song song

### Điều kiện trước khi tách luồng

Cả team làm chung một nhịp ngắn để khóa:

- Tên domain entity và ID convention.
- `GameState`, `GameCommand`, `DispatchResult` và JSON worker contract bản v0.
- Invariant và phase diagram.
- Folder ownership.
- Fixture Sol 1 và expected output.

Sau khi contract v0 được merge, tách bốn workstream.

```mermaid
flowchart LR
    Lock[Contract freeze v0]
    A[A. Engine]
    B[B. Data/schema]
    C[C. UI shell]
    D[D. Tooling/tests/save]
    Join[Integration: playable Sol 1]

    Lock --> A
    Lock --> B
    Lock --> C
    Lock --> D
    A --> Join
    B --> Join
    C --> Join
    D --> Join
```

### Workstream A — Domain, resolver và DONKI simulation

**Sở hữu file:** `src/types/`, `src/domain/`.

- Implement TypeScript state machine, command dispatcher và invariant validation.
- Implement SHA-256 subsystem PRNG (`src/domain/prng.ts`) và DONKI probabilistic space weather functions (`src/domain/spaceWeather.ts`).
- Implement crew assignment, 3D Fabricator queue và repair system.
- Implement power/ECLSS End-Sol & preview resolver (`src/domain/endSolResolver.ts`) bằng Pure TypeScript.
- Phát `DomainEffect` và `DomainError`.
- Viết unit test domain, resolver, DONKI probability và determinism trong cùng PR/branch.

**Không làm:** Zustand, component, JSON copy, save adapter.

**Đầu ra:** từ fixture Sol 1 có thể chạy full phase đến End-Sol và nhận state Sol 2 đúng expected snapshot; replay nhiều lần với cùng seed luôn cho cùng output/hash.

### Workstream B — Data, schema và science contract

**Sở hữu file:** `src/data/`, `src/schemas/`, `scripts/`.

- Tạo `balance.json`, `crew.json`, `recipes.json`, `campaign-moon32.json`, `initial-state.json`.
- Tạo schema và validator cho content, save envelope và DONKI/Diviner catalog.
- Chạy script cào trước 3 mẫu × 32 ngày NASA DONKI (`donki-space-weather.json`) và tạo `simulation-catalog.json` từ Diviner LRO; không đưa raw NASA dump hay API key vào runtime bundle.
- Định nghĩa `contentVersion`, `modelVersion`, `catalogVersion` và provenance.
- Chuẩn hóa unit/description/source metadata.
- Tạo fixture valid/invalid cho validation.
- Chuẩn bị event/brief mẫu Sol 1 và Moon DONKI brief.

**Không làm:** sửa engine types sau contract freeze; thay đổi phải qua proposal.

**Đầu ra:** content bundle typed, validate được, dữ liệu lỗi làm test fail.

### Workstream C — UI foundation và dev vertical slice

**Sở hữu file:** `src/components/`, `src/features/`, `src/styles/`, `src/store/uiStore.ts`.

- Design token và component cơ bản: button, meter, badge, modal, alert.
- Cockpit shell dạng placeholder.
- Dev panel hiển thị phase/resources/crew/system.
- Form local cho assignment và ration plan.
- UI state store cho modal/selection/toast.
- Accessibility foundation: keyboard, focus, reduced motion.
- Dùng mock adapter có cùng interface với game store cho đến lúc tích hợp.

**Không làm:** trừ tài nguyên trong component; copy engine logic vào UI.

**Đầu ra:** UI bấm được full flow Sol 1 với mock result và sẵn sàng thay bằng adapter thật.

### Workstream D — Tooling, persistence và test harness

**Sở hữu file:** config root, `.github/`, `src/store/gameStore.ts`, `src/persistence/`, `tests/` ngoài unit engine.

- Setup TypeScript strict, lint, format, unit/integration/E2E runner.
- Setup CI và coverage/report.
- Implement async `gameStore` facade theo interface đã khóa.
- Implement save envelope, LocalStorage adapter và migration v1.
- Tạo command replay harness và state snapshot viewer.
- Test schema mismatch, corrupted save recovery và version mismatch giữ nguyên state.
- Viết integration test store/save/reload.

**Không làm:** gameplay formula hoặc UI component.

**Đầu ra:** snapshot engine có thể dispatch, auto-save, reload và replay.

## 9. Ma trận phụ thuộc giữa các luồng

| Hạng mục | Phụ thuộc | Có thể làm song song? |
| --- | --- | --- |
| Types/commands v0 | Product lock | Không; làm đầu tiên |
| TS state machine + PRNG/DONKI model | Types/contract v0 | Có với schema/UI/tooling |
| JSON schema/content + scraped DONKI | Types v0 | Có |
| UI shell/design system | Store interface v0 | Có, dùng mock |
| Save envelope/adapter | GameState v0 | Có |
| Pure TS End-Sol & preview resolver | Balance + JSON contract | A và B phối hợp qua fixture |
| Store integration | Async dispatch + persistence | Chờ A/D hoàn thiện interface |
| Playable Sol 1 | A + B + C + D | Integration gate cuối |

### Những việc tuyệt đối không chia song song

- Hai người cùng thay đổi `GameState` type.
- Hai người cùng định nghĩa công thức balance.
- UI và engine tự tạo hai dạng command khác nhau.
- Data team đổi ID mà không qua contract update.
- Nhiều branch cùng sửa một store lớn.

## 10. Cách tránh conflict khi làm song song

- Mỗi workstream có ownership directory như trên.
- Shared contracts chỉ thay đổi qua PR nhỏ, review bởi đại diện A–D.
- Dùng `contracts-v0.md` hoặc TypeScript types làm giao diện chung.
- UI dùng mock `GamePort`; không import fixture trực tiếp.
- `src/domain/endSolResolver.ts` nhận state/plan/catalog/donkiProfile đã version hóa; không biết Zustand hay React.
- UI và store không chứa công thức End-Sol/forecast riêng.
- Data loader trả đúng `ContentBundle`; không biết Zustand.
- Persistence nhận/ghi `SaveEnvelope`; không biết component.
- Merge contract → schema/data → engine → persistence/store → UI integration.

### Port giúp tách việc

```ts
interface GamePort {
  getSnapshot(): GameState;
  dispatch(command: GameCommand): Promise<DispatchResult>;
  subscribe(listener: () => void): () => void;
  getRuntimeState(): SimulationRuntimeState;
  reset(): Promise<void>;
}
```

UI có thể dùng `MockGamePort`; integration thay bằng `ZustandGamePort` mà không viết lại component.

## 11. Nhịp tích hợp đề xuất

### Gate 1 — Contract freeze v0

- Phase diagram, state types, command contract, schema/DONKI contract, error và invariant đã review.
- Fixture Sol 1 và expected Sol 2 đã chốt.

### Gate 1.5 — Data & Resolver ready

- `donki-space-weather.json` (3×32 ngày) và `simulation-catalog.json` (Diviner) validate pass schema.
- End-Sol resolver báo `modelVersion`/`catalogVersion` và chạy deterministic `preview` / `commit`.
- Lỗi validation không làm đổi `GameState`.

### Gate 2 — Headless Sol 1

- Harness/test dispatch được: start → briefing → assignment/repair → comms → rationing → end Sol qua Pure TS resolver.
- Nhận state Sol 2, log và delta đúng.
- Không có resource âm hoặc duplicate assignment.

### Gate 3 — Persistence

- Save sau command.
- Reload ở từng phase giữ đúng state.
- Save invalid có lỗi thân thiện và reset recovery.

### Gate 4 — UI integration

- Thay mock bằng game store thật.
- UI không cần đổi command shape.
- Permission/forecast lấy từ selector engine.

### Gate 5 — Playable Sol 1

- Người mới hoàn thành Sol 1 bằng UI.
- Reload giữa Sol và chơi tiếp.
- Test unit/integration/E2E, typecheck, lint và build đều đạt.

## 12. Backlog theo thứ tự merge

| Thứ tự | PR/Deliverable | Luồng |
| ---: | --- | --- |
| 1 | Project scaffold + CI tối thiểu | D |
| 2 | Domain contract v0 + invariants | A, review chung |
| 3 | Static JSON schemas + DONKI 3×32d & Diviner scripts/fixtures | B |
| 4 | SHA-256 PRNG + DONKI probabilistic functions | A |
| 5 | Design tokens + primitives + mock port | C |
| 6 | Save envelope + persistence adapter | D |
| 7 | TS state machine + Pure TS Resource/ECLSS resolver | A + fixture B |
| 8 | Async game store + selectors wiring | D + A review |
| 9 | Sol 1 feature panels trên mock | C |
| 10 | Store/UI integration | C + D |
| 11 | Full Sol 1 integration/E2E | D, cả team fix |
| 12 | Phase 1.1 hardening + docs | Cả team |

PR 3–6 có thể chạy đồng thời sau PR 2. PR 5 và 9 không cần chờ engine nếu mock port đã tuân thủ contract.

## 13. Definition of Done PHASE 1.1

- [ ] Chỉ có một authoritative `GameState`.
- [ ] Domain/UI/draft/runtime/content/derived state được phân tách đúng.
- [ ] Không component nào sửa domain state trực tiếp.
- [ ] Tất cả domain mutation đi qua typed command.
- [ ] Pure TS resolver stateless, deterministic; `preview` và `commit` dùng chung một hàm.
- [ ] UI và store không có công thức End-Sol/forecast thứ hai.
- [ ] Validation error hoặc version mismatch không mutate state.
- [ ] Invariant được kiểm tra bằng test.
- [ ] JSON (bao gồm 3×32 ngày DONKI và Diviner catalog) được schema validation và có version.
- [ ] Selector trả permission kèm lý do.
- [ ] Zustand chỉ làm adapter/snapshot, không chứa công thức gameplay.
- [ ] Save version 1 có validation và recovery.
- [ ] Reload được ở mọi phase trong Sol 1.
- [ ] Sol 1 chạy headless và chạy bằng UI đến Sol 2.
- [ ] Test cùng seed/commands cho cùng state/log/hash.
- [ ] Reload save rồi replay vẫn cho cùng canonical response/hash.
- [ ] Bundle không chứa Pyodide runtime; resolve và forecast chạy tức thì `< 10 ms`.
- [ ] Typecheck, lint, unit, integration, E2E smoke và build đều đạt CI.
- [ ] Có tài liệu contract và sơ đồ ownership để phase sau không phá kiến trúc.

## 14. Sau PHASE 1.1 build gì tiếp

1. [**PHASE 1.2:** rover lifecycle, ba expedition và crew task đầy đủ](PHASE_1_2_ROVER_CREW_PLAN.md).
2. [**PHASE 1.3:** event system, content catalog và golden scenario Sol 7](PHASE_1_3_EVENTS_SOL7_PLAN.md).
3. [**PHASE 1.4:** full Moon 32, victory/defeat và balance simulation](PHASE_1_4_CAMPAIGN_BALANCE_PLAN.md).
4. [**PHASE 1.5:** cockpit/art/audio/tutorial/educational polish](PHASE_1_5_COCKPIT_POLISH_PLAN.md).
5. [**PHASE 1.6:** accessibility, performance, E2E toàn campaign và release](PHASE_1_6_RELEASE_PLAN.md).

---

## Quyết định ngắn gọn

Build đầu tiên là **contract + engine cho một Sol**, không phải Zustand và không phải cockpit. Sau khi contract v0 khóa, bốn luồng Engine, Data, UI và Tooling/Save chạy song song qua interface chung. Mốc kết thúc PHASE 1.1 là **Sol 1 chơi được, reload được và sang Sol 2 với state đúng**.
