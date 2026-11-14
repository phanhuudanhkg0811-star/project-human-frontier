# PHASE 2.0 — UX lock và onboarding contract

> **Mục tiêu:** khóa trải nghiệm trước khi cài thư viện hoặc sản xuất cinematic, tránh tutorial và gameplay điều khiển lẫn nhau.

## Deliverables

- Journey map cho first launch, continue, replay tutorial và corrupted save.
- Intro storyboard 5–7 scene, mỗi scene một ý, tổng 60–90 giây.
- Guided Sol 1 script gồm target, instruction, expected action, completion condition và fallback.
- Contextual hint inventory và rule chống spam.
- Bảng `data-tour` target cho desktop/mobile/modal.
- Copy VI/EN phù hợp trẻ 7–12 tuổi.
- Playtest script và success metrics.

## Quyết định phải khóa

- First launch mở Title Screen; không tự phát intro trước khi có user gesture.
- Intro không chứa thao tác gameplay.
- Tutorial không tự dispatch command hoặc chọn đáp án thay người chơi.
- Skip tutorial giữ nguyên game state hiện tại.
- Replay tutorial mặc định dùng practice guidance trên run hiện tại; không reset campaign.
- Mọi bước bắt buộc phải có đường thoát và fallback khi target không tồn tại.

## Guided Sol 1 target map tối thiểu

| Step | Target | Expected action | Hoàn thành khi |
| --- | --- | --- | --- |
| Briefing | `open-briefing` | Mở Starlog | Modal xuất hiện |
| Weather | `weather-status` | Đọc dự báo | Xác nhận tiếp tục |
| Event | `event-choice` | Chọn response | Domain command thành công |
| Crew | `crew-assignment` | Giao việc | Assignment tồn tại |
| Systems | `systems-panel` | Kiểm tra hệ thống | Panel đã được mở |
| Comms/Rover | `open-comms` | Mở logistics | Panel đã được mở |
| Forecast | `resource-forecast` | Xem hậu quả | Người chơi xác nhận |
| End Sol | `end-sol` | Chốt Sol | Phase sang debrief |

## Gate

- [ ] Storyboard và tutorial script review xong ở VI/EN.
- [ ] Mỗi bước có target, action, condition, fallback và analytics-free test event.
- [ ] Không có bước chỉ để giới thiệu decoration.
- [ ] Tổng copy trên một popover không quá 45 từ mỗi ngôn ngữ.
- [ ] Có test plan cho keyboard, mobile và reduced motion.
