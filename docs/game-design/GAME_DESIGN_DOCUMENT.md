# 🎮 Game Design Document (GDD) — Project Hail

> Căn cứ theo `PHASE_1_DOCUMENT_RECONCILIATION.md`, `PHASE_1_MOON_IMPLEMENTATION_PLAN.md` và `PHASE_1_4_CAMPAIGN_BALANCE_PLAN.md`.

---

## 1. Tổng Quan & Bối Cảnh

* **Tên dự án**: Project Hail — Junior Astronaut Mission Trainer (sáng kiến *Project Human Frontier* cho NASA Space Apps Challenge).
* **Đối tượng**: Học sinh lứa tuổi 7–12 (STEM Education).
* **Thể loại**: 2D Turn-Based Survival Strategy / Space Base Management.
* **Chiến dịch chính (Phase 1)**: **Moon Survival — 32 Sol** tại Cực Nam Mặt Trăng (Lunar South Pole).

---

## 2. Hệ Thống 6 Kho Tài Nguyên (Resource Vaults)

| Tài nguyên | Đơn vị | Mức khởi đầu | Ngưỡng chứa | Tiêu thụ chuẩn / ngày | Ý nghĩa sống còn |
|---|---|---:|---:|---:|---|
| **Oxy (`oxygenKg`)** | kg | 80 kg | 100 kg | 0.84 kg / người | Dưỡng khí hô hấp. Thiếu hụt dẫn tới ngạt thở và nguy hiểm tính mạng ngay lập tức. |
| **Nước sạch (`waterL`)** | L | 100 L | 120 L | 2.5 L / người | Nước uống và duy trì thể lực cho phi hành đoàn. |
| **Nước thải (`wasteWaterL`)** | L | 10 L | 100 L | Sinh ra từ sinh hoạt | Được đưa vào máy tái chế WRS để thu hồi lại nước sạch (tỷ lệ 85% - 93%). |
| **Thực phẩm / MRE (`foodKg`)** | kg | 60 kg | 100 kg | 0.62 kg / người | Khẩu phần dinh dưỡng không gian. Có thể áp dụng chế độ ăn kiêng nếu thiếu thốn. |
| **Phụ tùng (`partsKg`)** | kg | 15 kg | 50 kg | 2 kg / lần sửa | Dùng để bảo trì, sửa chữa linh kiện hư hại hoặc nâng cấp hệ thống (4-8 kg). |
| **Pin lưu trữ (`batteryKWh`)** | kWh | 45 kWh | 60 kWh | - | Tích lũy năng lượng dự phòng cho ban đêm và các tình huống khẩn cấp. |

---

## 3. Hệ Thống 4 Mô-đun Sinh Mệnh (ECLSS Systems)

1. **CO2 Scrubber (Máy lọc CO2)**:
   - Loại bỏ thán khí độc hại khỏi khoang sinh hoạt. Hư hại sẽ làm tích tụ khí CO2 gây suy giảm sức khỏe phi hành đoàn.
2. **Water Recycler (WRS - Hệ thống tái chế nước)**:
   - Tái chế nước thải thành nước sạch uống được. Chi phí tiêu tốn: 4 kWh/chu kỳ.
   - Hiệu suất phục hồi: Cấp 1 (85%) -> Cấp 2 (90%) -> Cấp 3 (93%).
3. **Power Grid (Lưới điện hỗn hợp: Fission + Solar Array)**:
   - Máy phát hạt nhân mini (Fission Generator): Cung cấp nguồn nền liên tục **8 kWh/Sol** (bất kể ngày hay đêm).
   - Mảng pin Mặt Trời (Solar Arrays): Tạo ra **25 kWh/Sol** khi có ánh sáng; giảm về **0 kWh/Sol** trong 14 ngày Đêm Mặt Trăng (Lunar Night).
   - Tải điện cơ bản tối thiểu trạm: **12 kWh/Sol**.
4. **Airlock (Khoang đệm áp suất)**:
   - Giữ kín áp suất khoang sinh hoạt và hỗ trợ điều phối phóng xe tự hành Rover. Nếu gioăng bị rò rỉ sẽ gây thất thoát oxy nghiêm trọng.

---

## 4. Ba Chuyến Thám Hiểm Rover (Expeditions)

Tất cả hoạt động nghiên cứu bề mặt được thực hiện qua xe tự hành robot (không cho phi hành gia bước ra ngoài không gian ở Phase 1):

| Chuyến | Cửa sổ khả dụng | Địa điểm thám hiểm | Thách thức môi trường | Bài học STEM |
|---|---|---|---|---|
| **Expedition 1** | Sol 1–4 | **Lunar Crater** | Đá gồ ghề, nguy cơ mắc kẹt bánh xe | Địa chất va chạm thiên thạch, phân tích mẫu đất đá mặt trăng |
| **Expedition 2** | Sol 5–8 | **Regolith Field** | Bụi tĩnh điện bám dính cực mạnh, mài mòn cảm biến | Tác hại của bụi regolith lên cơ khí và liên lạc vô tuyến |
| **Expedition 3** | Sol 9–12 | **Permanently Shadowed Region (PSR)** | Nhiệt độ siêu hàn (-240°C), thiếu sáng tuyệt đối | Khảo sát trầm tích băng nước cổ đại phục vụ duy trì sự sống lâu dài |

---

## 5. Sự Kiện Đánh Đổi Trọng Tâm: Sol 7 Golden Crisis

Ở Sol 7, trạm đối mặt đồng thời với rò rỉ áp suất khoang, suy giảm nguồn điện và mất tín hiệu xe tự hành.
Chỉ còn **Elena Chen** là thành viên duy nhất chưa nhận nhiệm vụ:

* **Phương án A — Cứu xe Rover**:
  - Dành 2 kWh pin và nhân lực để cứu đường truyền rover.
  - Phải hoãn chu kỳ tái chế WRS.
  - *Hậu quả*: Hoàn thành Expedition 2; kết thúc Sol 7 trạm còn 25.0 L nước và 2 kWh pin (rất eo hẹp).
* **Phương án B — Bảo vệ sinh mệnh Trạm**:
  - Chạy máy tái chế WRS để bảo toàn nguồn nước sạch cho căn cứ.
  - Buộc phải hy sinh dữ liệu của chuyến rover 2.
  - *Hậu quả*: Expedition 2 thất bại (nhưng rover vẫn bảo toàn cho chuyến 3); kết thúc Sol 7 trạm có 34.3 L nước và 0 kWh pin.

---

## 6. Thử Thách Sống Còn: 14 Sol Lunar Night (Sol 15–28)

* Mặt Trăng quay quanh trục mất 28 ngày Trái Đất, dẫn đến **14 ngày đêm liên tục**.
* Trong suốt Sol 15–28, sản lượng điện từ mảng năng lượng Mặt Trời rơi thẳng về **0 kWh**.
* Toàn trạm chỉ còn dựa vào máy phát Fission (8 kWh/Sol) và lượng điện tích lũy trong pin từ đợt chuẩn bị Sol 13–14.
* Người chơi bắt buộc phải cắt giảm tải không thiết yếu, quản lý từng watt điện và thắt chặt khẩu phần để không bị sập nguồn sinh mệnh trước khi bình minh trở lại ở Sol 29.

---

## 7. Điều Kiện Thắng / Thua & Đánh Giá NASA Cadet Report Card

* **Chiến thắng (Victory)**: Sống sót qua hết Sol 32, toàn bộ 4 phi hành gia sống sót và trạm duy trì hệ thống sinh tồn ổn định.
* **Xếp hạng S-Rank**:
  - 4/4 phi hành gia sống sót khỏe mạnh.
  - Hoàn thành đủ 3/3 chuyến thám hiểm Rover.
  - Nguồn dự trữ vượt mức an toàn khi cán đích Sol 32.
* **Xếp hạng A-Rank**:
  - Tối thiểu 3/4 phi hành gia sống sót.
  - Hoàn thành tối thiểu 2/3 chuyến thám hiểm Rover.
* **Thất bại (Defeat)**:
  - Cạn kiệt Oxy hoặc Nước sạch trong nhiều ngày liên tiếp.
  - Toàn bộ phi hành gia bị suy kiệt/di tản khẩn cấp.
