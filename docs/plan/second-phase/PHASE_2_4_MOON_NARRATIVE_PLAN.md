# PHASE 2.4 — Moon narrative milestones và ending

> **Mục tiêu:** biến các mốc state hiện có thành những chương cảm xúc rõ ràng mà không thay đổi deterministic rules.

## Milestones

| Mốc | Presentation | Điều phải hiểu |
| --- | --- | --- |
| Sol 1 | Mission arrival/first briefing | Vai trò commander và core loop |
| Sol 7 | Golden Crisis presentation riêng | Mỗi lựa chọn có trade-off và hậu quả trễ |
| Sol 12 | Training checkpoint | Tiến độ rover và readiness gap |
| Sol 14→15 | Lunar sunset transition | Solar về 0; pin/fission trở thành sống còn |
| Sol 28→29 | Sunrise/recovery | Năng lượng trở lại nhưng hậu quả vẫn còn |
| Sol 32 | Victory/Defeat finale | Vì sao đạt outcome và học được gì |

## Content rules

- Trigger lấy từ campaign config/state, không hardcode timer trong component.
- Mỗi milestone có presentation ID và shown flag để không lặp sau reload.
- Cutscene có Skip; skip presentation không skip event/gameplay decision.
- Science copy phân biệt `Observed`, `Inferred`, `Simulated` và có nguồn tương ứng.
- Không dùng fake urgency hoặc jump scare cho nhóm tuổi 7–12.

## Report Card

- Tóm tắt survival, crew, rover, resources và critical decisions.
- Giải thích 2–3 nguyên nhân chính dẫn tới rank/outcome.
- Đề xuất 2–3 hành động cụ thể cho lần chơi sau.
- Cho Replay same seed, New seed và quay lại Title.

## Gate

- [ ] Trigger đúng một lần qua save/reload.
- [ ] Skip không thay domain state.
- [ ] Sol 7 hai nhánh có presentation và debrief đúng outcome.
- [ ] Lunar Night/sunrise dùng đúng milestone từ campaign config.
- [ ] Victory/defeat copy khớp Report Card metric thật.
