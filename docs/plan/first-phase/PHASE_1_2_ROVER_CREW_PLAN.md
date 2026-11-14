# PHASE 1.2 — Rover lifecycle, ba expedition và crew task

> **Mục tiêu:** mở rộng lõi PHASE 1.1 thành hệ thống phân công nhân sự và thám hiểm rover hoàn chỉnh, deterministic, chạy được bằng test/headless UI.

## 1. Điều kiện đầu vào

- PHASE 1.1 đã đạt DoD: Sol 1 chạy được, save/load được, command contract ổn định.
- `GameState`, `GameCommand`, async `DispatchResult`, JSON worker contract, selector và content loader đã có version.
- Pyodide worker/Python resolver là nguồn simulation duy nhất; rover model mới phải mở rộng cùng contract, không tạo công thức TypeScript song song.
- Crew assignment cơ bản đã enforce quy tắc một người–một việc–một Sol.

## 2. Kết quả cần đạt

- Bốn crew có role, condition, availability và task lifecycle đầy đủ.
- Người chơi lập lịch được ba expedition Mặt Trăng trong Moon Training Track.
- Rover có trạng thái từ chuẩn bị đến hoàn thành/thất bại.
- Crew, rover, dụng cụ và điện được reserve đúng thời điểm.
- Mission tiến triển qua nhiều Sol và tạo science reward/log.
- First Aid Kit, MRE, Sample Canister và Core Drill có state/reservation thật để rack V12 phản chiếu.
- Save/load giữa expedition không làm mất hoặc nhân đôi tiến độ.

## 3. State cần bổ sung

```ts
type CrewTaskType =
  | 'repair-system'
  | 'operate-system'
  | 'rover-launch'
  | 'rover-recovery'
  | 'emergency-response'
  | 'medical-care'
  | 'rest';

interface Assignment {
  id: string;
  sol: number;
  crewId: CrewId;
  taskType: CrewTaskType;
  targetId: string;
  status: 'planned' | 'committed' | 'resolved' | 'cancelled';
}

type RoverMissionStatus =
  | 'available'
  | 'scheduled'
  | 'launching'
  | 'outbound'
  | 'exploring'
  | 'signal-lost'
  | 'returning'
  | 'completed'
  | 'failed';

interface RoverMission {
  id: ExpeditionId;
  siteId: SiteId;
  status: RoverMissionStatus;
  scheduledSol: number | null;
  startedSol: number | null;
  expectedReturnSol: number | null;
  progress: number;
  reservedEquipmentIds: readonly EquipmentId[];
  result: ExpeditionResult | null;
}
```

Inventory tối thiểu gồm `medkitCharges`, `coreDrillStatus`, ba `sampleCanisterSlots` và food/MRE presentation derived từ `foodKg`. Dùng medkit là command domain; MRE slot không tạo một nguồn food thứ hai.

Không lưu `canLaunch`, `remainingSols` hay `availableCrew`; các giá trị này là selector.

## 4. Ba expedition chuẩn

| Mission | Cửa sổ | Site | Yêu cầu chính | Kết quả khoa học |
| --- | --- | --- | --- | --- |
| `EXP-CRATER` | Sol 1–4 | Lunar Crater | Crew trực phóng, drill, điện | Mẫu bazan/lịch sử va chạm |
| `EXP-REGOLITH` | Sol 5–8 | Regolith Field | Crew trực phóng, spectrometer | Dữ liệu bụi và ilmenite |
| `EXP-PSR` | Sol 9–12 | Permanently Shadowed Region | Pin đủ, thermal kit | Dấu hiệu băng nước |

Content JSON phải chứa duration, launch/recovery cost, equipment, risk tags, reward và brief liên kết. Engine không hardcode tên địa điểm.

## 5. Command và selector

### Command

- `crew/assign`, `crew/unassign`, `crew/commit-day`.
- `crew/use-medkit` yêu cầu medical task/charge hợp lệ và tạo effect/log.
- `rover/select-site`, `rover/set-equipment` chỉ là draft UI.
- `rover/schedule`, `rover/cancel-schedule`.
- `rover/respond-to-incident` dành cho event ở PHASE 1.3.

### Selector

- `selectCrewTaskOptions(crewId)`.
- `selectAssignmentConflicts()`.
- `selectCanScheduleExpedition(expeditionId)`.
- `selectRoverTimeline()`.
- `selectReservedEquipment()`.
- `selectCompletedExpeditionCount()`.
- `selectRackInventory()` để V12 UI đọc medkit, MRE, drill và sample mà không chứa gameplay rule.

Mọi permission phải trả lý do: thiếu người, sai cửa sổ Sol, thiếu điện, dụng cụ đang bận hoặc rover chưa về.

## 6. Resolver order

Trong `end-sol`, rover/crew chạy theo thứ tự:

1. Validate và commit assignment.
2. Chi phí công việc trạm và rover được đưa vào power plan.
3. Resolve task crew theo condition/requirement.
4. Nếu đủ điều kiện, mission chuyển `scheduled → launching/outbound`.
5. Mission đang chạy tăng progress.
6. Áp risk check bằng seeded RNG.
7. Resolve recovery/completion/failure.
8. Giải phóng crew slot, rover và equipment đúng hạn.
9. Ghi log, reward, crew fatigue/stress và science progress.

## 7. Thứ tự build

1. Khóa crew task catalog và expedition JSON schema.
2. Mở rộng domain state/commands/migration.
3. Implement assignment conflict validator.
4. Implement rover state machine.
5. Implement reservation cho crew/equipment/rover.
6. Implement medkit charge, core drill reservation và sample reward.
7. Tích hợp resolver và seeded risk.
8. Viết selector/forecast/timeline.
9. Mở rộng store/save migration.
10. Làm Crew Assignment UI.
11. Làm Rover Planner + progress UI.
12. Chạy ba mission bằng integration test.

## 8. Phân chia song song

| Luồng | Ownership | Công việc |
| --- | --- | --- |
| A — Engine | `types/`, `engine/crew`, `engine/rover` | State machine, resolver, conflict, reservation |
| B — Content | `data/expeditions`, schema, fixture | Ba mission, equipment, cost, reward, copy |
| C — UI | `features/crew`, `features/rover` | Assignment board, map, planner, timeline, status |
| D — Test/Save | migrations, integration/e2e | Migration state, replay, save giữa mission, test |

Tất cả luồng dùng contract `ExpeditionDefinition`, `Assignment` và `RoverMission` đã khóa. UI dùng mock mission port cho đến khi engine merge.

## 9. Integration gate

### Gate A — Crew scheduling

- Không thể giao hai task cho một người cùng Sol.
- Crew injured/incapacitated bị giới hạn đúng rule.
- Unassign/replace trước khi commit hoạt động.

### Gate B — Rover lifecycle

- Một mission đi hết lifecycle bằng command script.
- Không thể dùng rover/equipment đang bị reserve.
- Reload ở mọi trạng thái không đổi progress.

### Gate C — Ba expedition

- Ba fixture chạy đúng cửa sổ 1–4, 5–8, 9–12.
- Completed/failed mission tạo log và science reward đúng một lần.

### Gate D — UI vertical slice

- Chọn crew, site, equipment, xem chi phí, xác nhận và theo dõi mission được bằng UI.
- Trạng thái khóa luôn có lý do dễ hiểu.

## 10. Test bắt buộc

- Duplicate assignment, unavailable crew và task replacement.
- Launch thiếu crew/điện/equipment.
- Mission progress, return, complete, fail và cancellation.
- Reservation/release không bị rò.
- Same seed cho same risk/result.
- Save/reload giữa outbound, exploring, returning.
- Mission reward chỉ cấp một lần.
- Full headless timeline của cả ba expedition không có deadlock.

## 11. Definition of Done

- [ ] Crew task model hỗ trợ toàn bộ task cần cho campaign Mặt Trăng.
- [ ] Quy tắc một người–một việc được enforce trong engine và UI.
- [ ] Ba expedition nằm trong content, không hardcode ở component.
- [ ] Rover lifecycle có đủ success/failure/recovery.
- [ ] Crew, rover và equipment reservation chính xác.
- [ ] Mission state save/reload/replay deterministic.
- [ ] Crew board và rover planner dùng được bằng keyboard/mobile.
- [ ] Unit, integration, E2E smoke, typecheck, lint và build đạt CI.

## 12. Không thuộc phase này

- Event catalog hoàn chỉnh và nhánh mất tín hiệu Sol 7.
- Balance full Moon 32, victory/defeat cuối campaign.
- Artwork/audio/tutorial hoàn thiện.

**Mốc kết thúc:** ba Moon expedition chạy đúng lifecycle; crew task không xung đột; chưa cần content event hoàn chỉnh.
