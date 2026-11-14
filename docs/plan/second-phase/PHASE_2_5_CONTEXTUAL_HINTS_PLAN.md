# PHASE 2.5 — Contextual hints và progressive disclosure

> **Mục tiêu:** hỗ trợ đúng lúc sau Sol 1 mà không biến toàn campaign thành tour bắt buộc.

## Hint catalog P1

- Battery/oxygen/water forecast sẽ chạm critical threshold.
- Crew chưa có assignment trước khi rời Engineering.
- Mandatory event hoặc deadline chưa xử lý.
- Cargo đặt quá muộn để tới trước Lunar Night.
- Rover thiếu operator/equipment hoặc đang signal-lost.
- End Sol plan có predicted defeat/critical delta.
- Sol 13–14 chưa đạt readiness threshold.
- Sol 15 lần đầu cần giải thích load shedding.

## Rule engine

Mỗi hint có `id`, `condition selector`, `priority`, `cooldown`, `maxShows`, `ctaTarget`, `copyKey` và `dismissPolicy`. Selector chỉ đọc state; hint không được tự dispatch gameplay command.

## Anti-spam

- Tối đa một blocking hint tại một thời điểm.
- Không hiện lại cùng hint trong một Sol sau khi dismiss.
- Critical safety hint có thể xuất hiện lại khi state xấu hơn; phải ghi rõ lý do.
- “Đừng nhắc lại” áp dụng cho educational hint, không áp dụng cho domain error.
- Hint không cạnh tranh với event modal, cutscene hoặc terminal screen.

## UX

- Nêu vấn đề → tại sao → CTA đến đúng panel.
- Dưới 35 từ/popover nếu có thể.
- Không chỉ dùng màu; có icon, label và value.
- CTA mở panel, không tự thực hiện quyết định.

## Gate

- [ ] Rule deterministic theo UI state và test fixture.
- [ ] Cooldown/maxShows/dismiss persistence hoạt động.
- [ ] Không spam hoặc che event/cutscene.
- [ ] CTA target có desktop/mobile fallback.
- [ ] Disable toàn bộ contextual hints không ảnh hưởng gameplay.
