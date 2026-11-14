# PHASE 2.3 — Guided Sol 1 bằng hành động thật

> **Mục tiêu:** người mới hoàn thành core loop đầu tiên bằng chính các control gameplay.

## Flow

1. Mở Morning Briefing.
2. Đọc DONKI/weather và mục tiêu Sol.
3. Xử lý event hướng dẫn.
4. Mở Crew và giao một nhiệm vụ hợp lệ.
5. Mở Systems, hiểu integrity/power và thực hiện hoặc bỏ qua action có chủ đích.
6. Mở Comms/Rover, kiểm tra expedition requirement.
7. Mở Rationing/Forecast và xem projected delta.
8. Xác nhận End Sol.
9. Đọc Debrief và NASA Science Brief.

## Interaction rules

- Action step chỉ hoàn tất sau khi domain/store xác nhận command thành công.
- Command bị từ chối phải giữ nguyên bước và hiển thị lý do thân thiện.
- Các bước mở modal dùng target ổn định và chờ modal mount.
- Cho phép Back ở bước giải thích; không undo gameplay command đã commit.
- Skip không dispatch command, không cấp resource và không sửa phase.
- Nếu run hiện tại không còn ở Sol 1, Replay chạy ở chế độ overview, không giả vờ thực thi lại command.

## Responsive/a11y

- Desktop target cockpit trực tiếp; mobile target tab/control tương ứng.
- Popover không che target, warning hoặc CTA chính.
- Tab/Enter/Space hoàn thành được action step.
- Focus chuyển vào popover hoặc target theo loại bước và restore sau destroy.
- Live region thông báo step hoàn tất hoặc action không hợp lệ.

## Tests/gate

- [ ] New Mission → Intro → Guided Sol 1 → Debrief.
- [ ] Skip ở mọi bước vẫn chơi tiếp được.
- [ ] Reload ở từng modal resume đúng step ID.
- [ ] Domain rejection không advance sai.
- [ ] Missing target có fallback, không deadlock.
- [ ] VI/EN, desktop/mobile, pointer/keyboard đều đạt.
