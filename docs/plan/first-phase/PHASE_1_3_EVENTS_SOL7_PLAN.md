# PHASE 1.3 — Event system, content catalog và golden scenario Sol 7

> **Mục tiêu:** xây hệ sự kiện data-driven đủ dùng cho campaign Mặt Trăng và khóa nhánh quyết định Sol 7 bằng golden test deterministic.

## 1. Điều kiện đầu vào

- PHASE 1.2 đã có crew task, rover lifecycle và ba expedition.
- Engine có seeded RNG, command result, history và save migration.
- Expedition 2 có thể chạy từ Sol 5 đến Sol 8.

## 2. Kết quả cần đạt

- Event được schedule/trigger/resolve bằng data, không hardcode trong UI.
- Hỗ trợ event thường, event có điều kiện, event bắt buộc và event chain.
- Có catalog nội dung đủ cho Moon Survival 32 Sol.
- Sol 7 tạo đúng xung đột crew–điện–WRS–rover.
- Hai nhánh Sol 7 tạo đúng kết quả nước, pin và mission.
- Event log liên kết đúng NASA Science Brief.

## 3. Event domain

```ts
interface EventDefinition {
  id: EventId;
  priority: number;
  repeatPolicy: 'once' | 'cooldown' | 'repeatable';
  trigger: EventTrigger;
  choices: readonly EventChoiceDefinition[];
  scienceBriefId: BriefId | null;
}

interface ActiveEvent {
  eventId: EventId;
  triggeredAtSol: number;
  deadlineSol: number | null;
  context: Readonly<Record<string, string | number | boolean>>;
  status: 'pending' | 'resolved' | 'expired';
}
```

Trigger tối thiểu:

- Sol chính xác/range/minimum.
- Planet/campaign.
- Resource threshold.
- System integrity/status.
- Crew condition/assignment.
- Rover mission/status/site.
- Event seen/not-seen và event-chain prerequisite.
- `max-sol`, `environment`, `flag-set` và `choice-made` để dựng nhánh nhiều Sol.

Effect tối thiểu:

- Resource delta, system damage/repair.
- Crew health/stress/fatigue/condition.
- Add/replace assignment.
- Rover signal/progress/result.
- Power reservation/plan override.
- Schedule follow-up event, log và science reward.
- `set-flag`, resource delta, crew health/fatigue, light repair và inventory/sample effect.

## 4. Pipeline event

```text
Collect eligible → sort priority → seeded weighted pick
→ create ActiveEvent → block phase nếu mandatory
→ validate choice → resolve outcome/effects atomically
→ append history → schedule follow-up → attach Science Brief
```

- Outcome phải atomic: không áp một nửa effect khi một effect invalid.
- Event bắt buộc phải được xử lý trước khi advance phase.
- Một event ID `once` không xuất hiện lại.
- Event deadline được xử lý trong End-Sol resolver.

## 5. Content catalog tối thiểu

| Nhóm | Số lượng mục tiêu | Ví dụ |
| --- | ---: | --- |
| Tutorial | 3 | telemetry, assignment, rationing |
| Môi trường | 3–4 | solar particles, regolith, thermal shadow |
| Hệ thống | 4–5 | airlock leak, recycler clog, solar degradation, scrubber fault |
| Crew | 2–3 | fatigue, stress, minor injury |
| Rover | 3 | wheel slip, instrument fault, signal loss |
| Logistics/comms | 2 | cargo delay, Houston advisory |
| Story/milestone | 3 | mission launch/return, Sol 7 crisis, final approach |

Mục tiêu release: **18–24 event Moon**, trong đó critical path không phụ thuộc hoàn toàn vào RNG. Bắt buộc phủ rover training, golden Sol 7, cargo/chuẩn bị đêm, Lunar Night Sol 15–28 và recovery Sol 29–32.

Mỗi outcome tạo `DebriefContext` gồm metric thay đổi, evidence type và `scienceBriefId`; PHASE 1.5 dùng context này để dựng Dynamic STEM Debrief thay vì xoay brief theo số Sol.

## 6. Golden scenario Sol 7

### Fixture đầu Sol

- Expedition 2 ở trạng thái `exploring`, deadline can thiệp trong Sol 7.
- Ba crew đã commit task: xử lý rò khí, kiểm tra nguồn và cô lập mạch.
- Elena chưa được giao việc.
- 35 L nước sạch, 10 L nước thải.
- 8 kWh nguồn trong Sol, 8 kWh pin.
- Essential load 12 kWh; WRS 4 kWh; recovery 93%; water demand 10 L.

### Choice A — Cứu rover

- Elena nhận `emergency-response` cho rover.
- Tốn 2 kWh; WRS không chạy.
- Cuối Sol: 25.0 L nước sạch, 10 L nước thải giữ lại, 2 kWh pin.
- Expedition 2 tiếp tục và hoàn thành ở Sol 8.

### Choice B — Ưu tiên trạm

- Elena kiểm tra/bảo trì filter; WRS chạy đủ chu kỳ.
- Cuối Sol: 34.3 L nước sạch, 0 kWh pin.
- Expedition 2 hết deadline và thất bại mục tiêu.
- Rover vẫn khả dụng cho Expedition 3.

Mọi số phải so sánh bằng tolerance rõ ràng và cùng fixture phải replay giống hệt.

## 7. Thứ tự build

1. Khóa event schema, trigger/effect DSL và atomic result.
2. Implement eligibility, priority, repeat policy và queue.
3. Implement choice validation/effect transaction.
4. Implement deadline và event chain.
5. Mở rộng content validator: unique ID, reference integrity, unreachable choice.
6. Viết catalog mẫu và event browser/dev tool.
7. Implement chuỗi Sol 7.
8. Viết golden test hai nhánh đến Sol 12.
9. Viết reachability/replay test cho Lunar Night Sol 15–28 và recovery Sol 29–32.
10. Làm Starlog/Event UI và Science Brief linking.
11. Review nội dung khoa học, copy VI/EN cho trẻ và balance.

## 8. Phân chia song song

| Luồng | Công việc |
| --- | --- |
| A — Engine | Trigger/effect DSL, queue, transaction, deadline, chain |
| B — Content | Catalog event, choice/outcome copy, brief mapping, NASA sources |
| C — UI | Starlog, event choice, cost preview, result/deadline presentation |
| D — Validation/Test | Schema/reference checks, event explorer, golden fixtures/replay |

Khóa DSL trước. Content/UI dùng fixture và generated types; không tự diễn giải effect bằng chuỗi text.

## 9. Integration gate

### Gate A — Event engine

- Event eligible đúng trigger; priority/repeat/deadline hoạt động.
- Choice invalid không thay state.
- Effects được áp atomic và có history.

### Gate B — Catalog

- Mọi ID/reference/source hợp lệ.
- Không event critical nào unreachable.
- Không có lựa chọn không hiển thị chi phí/hệ quả dự đoán.

### Gate C — Sol 7

- Hai nhánh khớp toàn bộ state expected.
- Expedition 2/3 có kết quả đúng.
- Save/reload ngay trước và sau choice không đổi outcome.

### Gate D — UI

- Event bắt buộc không thể bỏ qua.
- Deadline, crew conflict, chi phí điện/nước và kết quả được giải thích rõ.

## 10. Test bắt buộc

- AND/OR trigger, threshold boundary và priority tie.
- Weighted pick deterministic và zero/invalid weight validation.
- Repeat policy/cooldown/event chain.
- Deadline expire và late command.
- Atomic multi-effect rollback.
- Missing event/choice/reference/source.
- Sol 7 choice A/B từ cùng fixture.
- Replay full trace và save migration.
- Accessibility cho modal/choice/result.

## 11. Definition of Done

- [ ] Event system hoàn toàn data-driven và deterministic.
- [ ] Schema/validator bắt lỗi ID, reference, weight, trigger và effect.
- [ ] Catalog 18–24 event đủ nội dung cho Moon 32 campaign.
- [ ] Critical event có lịch cố định; RNG không làm campaign bế tắc.
- [ ] Golden scenario Sol 7 đạt cả hai nhánh.
- [ ] Starlog hiển thị cost, deadline, outcome và Science Brief.
- [ ] Event outcome phát đủ `DebriefContext` để UI hiển thị brief theo metric thật.
- [ ] Save/reload/replay không thay kết quả event.
- [ ] Unit, integration, golden, E2E smoke và CI đều đạt.

## 12. Không thuộc phase này

- Chốt balance toàn campaign và terminal UX cuối game.
- Artwork/audio/tutorial hoàn chỉnh.
- Live NASA API.

**Mốc kết thúc:** event catalog chạy ổn định và hai nhánh Sol 7 trở thành golden contract không được phép regression.
