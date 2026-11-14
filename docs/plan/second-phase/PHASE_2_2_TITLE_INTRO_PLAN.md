# PHASE 2.2 — Title screen, intro và mission handoff

> **Mục tiêu:** tạo first impression rõ ràng và đưa người chơi vào campaign bằng một lựa chọn có chủ đích.

## Title Screen

- `New Mission`: mở Mission Setup, cảnh báo nếu sẽ thay save hiện tại.
- `Continue Mission`: chỉ bật khi save hợp lệ; hiển thị Sol/phase/timestamp.
- `How to Play`: mở tutorial overview/replay.
- `Settings`: VI/EN, audio, reduced motion.
- `Credits`: NASA data/source và asset attribution.
- Save lỗi đi qua recovery flow hiện có, không white-screen.

## Intro storyboard

1. Năm 2050 — tiền đồn tại Nam Cực Mặt Trăng.
2. Bốn phi hành gia phụ thuộc vào hệ thống khép kín.
3. O₂, nước, thực phẩm và điện đều hữu hạn.
4. Rover phải khảo sát crater, regolith field và PSR.
5. Đêm Mặt Trăng bắt đầu ở Sol 15.
6. Người chơi nhận quyền chỉ huy nhiệm vụ.

## Presentation contract

- 60–90 giây; 5–7 scene; một scene một ý.
- Next, Back, Pause, Skip và Replay.
- Text luôn đọc được khi tắt audio.
- Không autoplay audio trước user gesture.
- Reduced motion dùng cut/fade ngắn, không parallax/typewriter bắt buộc.
- Asset intro lazy-load sau title shell; first interaction không chờ asset nặng.
- Handoff cuối intro mở Mission Setup, không tự tạo save mới.

## Gate

- [ ] New/Continue/Recovery đều có đường đi rõ ràng.
- [ ] Skip và complete dẫn đến cùng Mission Setup contract.
- [ ] Intro VI/EN không overflow ở desktop/mobile.
- [ ] Reload giữa intro resume hoặc restart có chủ đích, không vào cockpit sai trạng thái.
- [ ] Screen reader có thể đọc nội dung theo thứ tự và bỏ qua decoration.
