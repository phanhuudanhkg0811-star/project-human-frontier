# PHASE 1.4 — Full Moon 32, victory/defeat và balance simulation

> [!IMPORTANT]
> **CẬP NHẬT BALANCE & VERIFY (14/11/2026 — Option B):** Giữ nguyên cấu trúc 7 chặng & Victory/Defeat (Moon 32 Sol), áp dụng cân bằng mới & mức kiểm thử nhẹ hơn theo [`HUMAN_FRONTIER_2050_GAME_SETUP.md`](../../game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md) & [`PHASE_1_SYNC_HANDOFF_FOR_TEAM.md`](PHASE_1_SYNC_HANDOFF_FOR_TEAM.md):
> - **Balance mới:** `Hunger FSM` (`-25 Satiety/Sol`, `1 MRE = +75`), `WRS 90%/95%`, `3D Fabricator` tự chạy tốn `Parts + Battery (+ Water)`, Cargo `80 kg / 4 Sol`.
> - **Kiểm thử thực tế nhẹ hơn:** Thay 10.000 lượt chạy bot nặng nề bằng **trace kiểm chứng Victory/Defeat deterministic + ~100 seed smoke simulation** để kiểm tra tỷ lệ sống sót & tránh soft-lock.

> **Mục tiêu:** ghép toàn bộ system thành Moon Survival 32 Sol có Lunar Night, thắng/thua/rank rõ ràng và balance được kiểm chứng bằng mô phỏng hàng loạt.

## 1. Điều kiện đầu vào

- PHASE 1.3 đã hoàn tất crew, rover, event catalog và golden Sol 7.
- Engine deterministic, save/replay và content validation ổn định.
- Ba expedition có lifecycle và event critical có lịch cố định.

## 2. Kết quả cần đạt

- Chơi từ Moon Sol 1 đến Moon Victory Sol 32 không cần chỉnh state thủ công.
- Có tutorial ramp, midgame crisis và endgame pressure hợp lý.
- Victory/defeat là terminal state thật trong engine.
- Mỗi thất bại có nguyên nhân, timeline và gợi ý học tập.
- Balance không tạo chiến thuật duy nhất hoặc soft-lock không báo trước.
- Có simulation harness chạy hàng nghìn campaign/replay.
- Mission Seed có thể nhập/chia sẻ; Tutorial, Cadet và Commander là các difficulty profile data-driven dùng chung engine.

## 3. Campaign state và outcome

```ts
type CampaignStatus =
  | 'not-started'
  | 'active'
  | 'victory'
  | 'defeat';

type OutcomeReason =
  | 'moon-training-complete'
  | 'moon-victory'
  | 'crew-collapse'
  | 'life-support-collapse'
  | 'invalid-save-recovery';
```

### Moon Training milestone

- Moon Training Report Card ghi nhận 4/4 crew và ít nhất 2/3 expedition sau Sol 12.

### Victory cuối campaign

- End-Sol 32 hoàn tất.
- Crew active, system integrity và resource đạt `moon32.victoryRequirements`.
- Ranking S/A/B dựa trên crew, expedition, WRS efficiency, system/resource và decision quality.

UI lấy target/milestone từ campaign config, không hardcode `/12`, `/15`, `/28` hoặc `/32`.

### Defeat

- Toàn bộ crew evacuated hoặc life-support collapse theo terminal threshold.
- Không còn state hợp lệ để tiếp tục đến Sol 32.
- Defeat do event/resource được engine ghi reason cụ thể cho Report Card.

Sau terminal state, engine chỉ nhận `campaign/restart`, `save/export` và action presentation; command gameplay khác bị từ chối có lý do.

## 4. Nhịp campaign

| Sol | Vai trò | Nội dung bắt buộc |
| --- | --- | --- |
| 1–4 | Onboarding | Core loop + Expedition 1 |
| 5–8 | Tăng áp lực | Expedition 2 + crisis Sol 7 |
| 9–12 | Training finale | Expedition 3 + training Report Card |
| 13–14 | Chuẩn bị đêm | Cargo, repair, upgrade và tích pin |
| 15–28 | Lunar Night | Solar 0 kWh; fission/battery/rationing crisis |
| 29–31 | Recovery | Nắng trở lại, khôi phục crew/system/resource |
| 32 | Finale | Moon Victory/Defeat và NASA Cadet Report Card |

## 5. Balance model

### Các biến cần đo

- Resource cuối mỗi Sol: O₂, water, food, parts, battery.
- Min/max system integrity.
- Crew health/stress/fatigue và số assignment khả dụng.
- Expedition completed/failed và deadline miss.
- Số action bị chặn theo reason.
- Event distribution, choice distribution và failure reason.
- Số Sol người chơi còn “phương án hợp lệ”.

### Mục tiêu balance

- Người mới sau tutorial có thể thắng nếu đọc forecast và không chọn cực đoan.
- Nhánh Sol 7 nào cũng còn đường thắng 2/3 expedition.
- Không thể bỏ qua toàn bộ repair/rationing mà vẫn thắng dễ dàng.
- Một sai lầm nhỏ có thể hồi phục; chuỗi sai lầm mới dẫn đến thua.
- Không random outcome nào tự khiến campaign vô phương cứu.
- Expedition 3 là cơ hội phục hồi cho nhánh mất Expedition 2.
- Người chơi chuẩn bị tốt ở Sol 13–14 phải có đường sống qua Lunar Night nhưng vẫn chịu trade-off thật.
- Fission 8 kWh so với essential 12 kWh buộc dùng battery/load shedding mà không tạo soft-lock vô lý.

## 6. Simulation harness

Tạo CLI/script không phụ thuộc UI:

```text
npm run simulate -- --runs 10000 --policy balanced --seed 1
npm run simulate -- --runs 1000 --policy conserve-power
npm run replay -- tests/fixtures/sol7-save-rover.json
```

Policy bot tối thiểu:

- `balanced`: ưu tiên sống còn và điều kiện mission.
- `conserve-power`: tiết kiệm pin.
- `science-first`: ưu tiên rover.
- `repair-first`: giữ system integrity cao.
- `random-valid`: chọn ngẫu nhiên trong action hợp lệ.
- `stress-test`: cố tình chọn boundary values.

Output CSV/JSON gồm win rate, resource percentiles, failure reason và trace seed để replay.

Mỗi policy chạy qua từng difficulty profile. Difficulty chỉ thay config/balance hợp lệ; không tạo nhánh công thức engine riêng.

## 7. Thứ tự build

1. Khóa terminal rules và outcome schema.
2. Implement campaign evaluator sau End-Sol.
3. Dựng Moon Training fixtures/traces Sol 1–12 và golden Sol 7.
4. Dựng Lunar Night Sol 15–28 và full trace Moon 32.
5. Dựng simulation harness và policy bots.
6. Chạy baseline, tìm soft-lock/exploit.
7. Điều chỉnh `balance.json`, không sửa công thức tùy tiện.
8. Thêm forecast/checklist Lunar Night/victory ở UI.
9. Làm victory/defeat summary state + data.
10. Làm NASA Cadet Report Card: outcome, crew, expedition, WRS/resource efficiency, STEM unlock và Mission Seed.
11. Test hai nhánh Sol 7 đi xuyên Lunar Night đến terminal state.
12. Freeze balance v1 và content version.

## 8. Phân chia song song

| Luồng | Công việc |
| --- | --- |
| A — Campaign engine | Terminal evaluator, outcome, command guards, summary |
| B — Balance/data | Balance table, mission pacing, event schedule, bot policies |
| C — UI | Mission progress, warning, forecast, victory/defeat screens |
| D — Simulation/QA | Harness, replay, metrics, exploit/soft-lock test |

Balance changes chỉ merge khi có report trước/sau và seed tái lập regression.

## 9. Integration gate

### Gate A — Full deterministic trace

- Có ít nhất một victory trace và ba defeat trace rõ nguyên nhân.
- Victory trace phải đi qua Sol 7, Lunar Night 14 Sol, sunrise recovery và Moon Victory.
- Replay trace cho state/log/outcome giống hệt.

### Gate B — Hai nhánh Sol 7

- Nhánh cứu rover có đường hoàn thành 3/3.
- Nhánh ưu tiên trạm có đường hoàn thành 2/3 qua Expedition 3.

### Gate C — Balance

- Không negative/NaN/overflow.
- Không action loop tạo tài nguyên vô hạn.
- Không soft-lock không có terminal message.
- Random-valid có distribution hợp lý; kết quả được review, không đặt win-rate tuyệt đối máy móc.

### Gate D — Terminal UX

- Victory/defeat hiển thị timeline, metric, expedition, crew và science takeaway.
- Report Card hiển thị seed/difficulty và cho phép replay/chia sẻ cùng kịch bản.
- Restart không giữ state cũ; export replay vẫn hoạt động.

## 10. Test bắt buộc

- Boundary Sol 12/15/28/29/32 và terminal command guards.
- Crew chết đúng lúc End-Sol.
- Expedition thứ hai hoàn thành/failed ở deadline.
- Cargo Moon 4 Sol và arrival boundary trước/trong Lunar Night theo resolver order.
- Resource đúng threshold sống còn.
- Full campaign save/reload mỗi phase.
- Property/fuzz test resource finite/non-negative.
- 10k simulation smoke không crash; seed lỗi replay được.

## 11. Definition of Done

- [ ] Full Moon 32 chơi được headless và bằng UI.
- [ ] Victory/defeat nằm trong engine và có reason ổn định.
- [ ] Hai nhánh Sol 7 đều có đường thắng hợp lệ.
- [ ] Full trace deterministic và replay được.
- [ ] Simulation report ghi rõ policy, seed và balance version.
- [ ] Không exploit tài nguyên hoặc soft-lock đã biết ở critical path.
- [ ] Forecast/checklist giúp người chơi hiểu họ đang thiếu gì.
- [ ] Balance v1 và content version đã freeze.
- [ ] Mission Seed, difficulty profile và NASA Cadet Report Card hoạt động deterministic.
- [ ] Unit, integration, campaign E2E và CI đều đạt.

## 12. Không thuộc phase này

- Art/audio/tutorial polish cuối cùng.
- Accessibility/performance/release audit toàn diện.
- Mars campaign, advanced Moon→Mars mode hoặc live NASA API.

**Mốc kết thúc:** Moon Survival 32 đã hoàn chỉnh về luật, Lunar Night và balance, dù presentation còn dùng asset/UI chưa polish.
