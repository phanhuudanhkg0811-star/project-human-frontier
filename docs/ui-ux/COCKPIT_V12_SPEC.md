# 🎛️ Đặc tả Giao diện Cockpit V12 — Project Hail

> Căn cứ theo quyết định bố cục V12 tại `PHASE_1_DOCUMENT_RECONCILIATION.md` và `PHASE_1_5_COCKPIT_POLISH_PLAN.md`.

---

## 1. Triết Lý Thiết Kế

* **Bố cục chuẩn**: Tỷ lệ vàng **16:9** cho màn hình máy tính (Desktop Cockpit), tự động chuyển đổi thành Dashboard theo Tab trực quan trên thiết bị di động (Mobile Responsive).
* **Phong cách**: Retro Cartoon Sci-Fi kết hợp bảng điều khiển chuyên nghiệp của trạm nghiên cứu Mặt Trăng.
* **Đối tượng**: Học sinh 7–12 tuổi:
  - Phông chữ to rõ, độ tương phản cao đạt chuẩn WCAG AA.
  - Mỗi nút bấm là một động từ hành động cụ thể (ví dụ: *"Thay thế màng lọc"*, *"Chuyển điện cứu Rover"*).
  - Có cảnh báo trực quan đa giác quan (màu sắc, biểu tượng icon, âm thanh cảnh báo).

---

## 2. Kiến Trúc Bố Cục Cockpit V12

```text
+----------------------------------------------------------------------------------------+
| [TOP HUD]  Project Hail | Sol 15/32 | Phase: Engineering | [En/Vi] [Audio] [Help] [Save] |
+----------------------------------------------------------------------------------------+
| [RACK TRÁI]        |                   [TRUNG TÂM]                    | [RACK PHẢI]        |
|                    |                                                  |                    |
| 1. ECLSS Module    | +----------------------------------------------+ | 4. Comms Module    |
|   - Scrubber       | |     Observation Window (Canvas 2D)           | |   - Earth Radio    |
|   - WRS Recycler   | |  (Chu kỳ Mặt Trời, Đêm 14 Sol, Bụi Bề Mặt)   | |   - Cargo Telemetry|
|                    | +----------------------------------------------+ |                    |
| 2. Power Grid      |                                                  | 5. Rover Station   |
|   - Fission Unit   | +----------------------------------------------+ |   - 3 Expeditions  |
|   - Solar Array    | |      Active Workspace / Feature Panel        | |   - Telemetry HUD  |
|   - Battery Gauge  | |   (Briefing / Crew / Rationing / Systems)    | |                    |
|                    | +----------------------------------------------+ | 6. Science Rack    |
| 3. Storage Rack    |                                                  |   - Sample Canister|
|   - MRE Food Racks |                                                  |   - Core Drill Tool|
|   - Water Tanks    |                                                  |   - Medkit Station |
+----------------------------------------------------------------------------------------+
| [BOTTOM DECK]                                                                          |
| Phi hành đoàn (4 Slots): [Alex - 100%] [Elena - 95%] [Marcus - 88%] [Aoi - 100%]      |
| [Nút Hành Động]: ◄ Bước Trước | [DỰ ĐOÁN XU HƯỚNG 5 SOL] | TIẾN BƯỚC TIẾP THEO ►        |
+----------------------------------------------------------------------------------------+
```

---

## 3. Các Mô-đun Tương Tác Cốt Lõi

1. **Observation Window (Canvas 2D)**:
   - Cửa sổ quan sát chân trời Mặt Trăng theo thời gian thực mô phỏng:
     - Bình minh / Ban ngày (Sol 1–14).
     - Hoàng hôn và Đêm Mặt Trăng sâu thẳm 14 Sol (Sol 15–28) với bầu trời đầy sao và Trái Đất xanh lơ lơ lửng.
     - Bình minh phục hồi (Sol 29–32).
     - Hiệu ứng bão hạt Mặt Trời (SEP/CME) với cảnh báo ánh sáng vàng/đỏ.
2. **Interactive Equipment Racks (Giá đỡ công cụ V12)**:
   - Rack trái và Rack phải phản chiếu chính xác số lượng vật phẩm trong Domain State:
     - Số hộp khẩu phần thực phẩm MRE.
     - Túi cứu thương y tế (First Aid / Medkit charges).
     - Ống chứa mẫu địa chất Mặt Trăng (Sample Canisters).
     - Mũi khoan lõi đá sâu (Core Drill).
3. **Crew Status Roster**:
   - 4 phi hành gia với chân dung cảm xúc (bình thường, mệt mỏi/lo lắng, bị thương).
   - Thanh máu, trạng thái công việc và huy hiệu vai trò.
4. **5-Sol Resource Predictor**:
   - Biểu đồ dự báo thông minh giúp trẻ quan sát trước lượng oxy, nước, điện sẽ cạn kiệt ra sao nếu không có biện pháp can thiệp.
