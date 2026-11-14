# 🎨 Đặc tả Tài nguyên Đồ họa & Âm thanh — Project Hail

> Căn cứ theo `PHASE_1_MOON_IMPLEMENTATION_PLAN.md` và `PHASE_1_5_COCKPIT_POLISH_PLAN.md`.

---

## 1. Định Dạng & Tiêu Chuẩn Kỹ Thuật

* **Đồ họa Raster (Ảnh nhân vật, nền, sự kiện)**:
  - Định dạng chuẩn: **WebP** chất lượng cao, tối ưu hóa kích thước tải trang (< 150 KB cho mỗi hình lớn).
* **Đồ họa Vector (Biểu tượng tài nguyên, huy hiệu, khung viền)**:
  - Định dạng chuẩn: **SVG** nguyên bản để hiển thị sắc nét trên mọi mật độ điểm ảnh (Retina / High-DPI).
* **Âm thanh (Sound Effects & BGM)**:
  - Sử dụng **Web Audio API** tạo hiệu ứng âm thanh thủ tục (procedural synthesis) nhẹ nhàng, không tốn băng thông.
  - Hỗ trợ tệp MP3/OGG nén chất lượng cao cho các đoạn nhạc nền quan trọng.
  - **Chính sách**: Mặc định tắt tiếng (Muted by default) theo chính sách Autoplay của trình duyệt hiện đại; hỗ trợ nút bật/tắt âm lượng tức thì.

---

## 2. Danh Mục Asset Bắt Buộc cho Phase 1 (Moon Survival)

```text
public/assets/hail/
├── backgrounds/
│   ├── cockpit-v12-frame.webp           # Khung buồng lái Cockpit V12
│   ├── lunar-day.webp                   # Nền Mặt Trăng ban ngày
│   ├── lunar-night.webp                 # Nền Đêm Mặt Trăng 14 Sol
│   └── space-hazard.webp                # Bão Mặt Trời / cảnh báo bức xạ
├── crew/
│   ├── alex-[normal|tired|injured].webp
│   ├── elena-[normal|tired|injured].webp
│   ├── marcus-[normal|tired|injured].webp
│   └── aoi-[normal|tired|injured].webp
├── rover/
│   ├── rover-[idle|exploring|signal-lost].webp
│   ├── map-crater.webp
│   ├── map-regolith.webp
│   └── map-psr.webp
├── systems/
│   ├── scrubber-[ok|degraded|broken].svg
│   ├── recycler-[ok|degraded|broken].svg
│   ├── solar-[ok|degraded|broken].svg
│   └── airlock-[ok|degraded|broken].svg
└── icons/
    ├── res-oxygen.svg
    ├── res-water.svg
    ├── res-wastewater.svg
    ├── res-food.svg
    ├── res-parts.svg
    └── res-battery.svg
```

---

## 3. Bản Quyền & Nguồn Dữ Liệu (Attribution & Licensing)

* **NASA Open Data**:
  - Dữ liệu thời tiết không gian trích xuất từ cơ sở dữ liệu **NASA DONKI** (Database of Notifications, Knowledge, and Information).
  - Tuyên bố rõ nguồn dữ liệu công khai theo chính sách phân phối dữ liệu của NASA.
* **Quy tắc bản quyền**:
  - Toàn bộ hình ảnh, âm thanh tự sản xuất hoặc sử dụng từ nguồn mã nguồn mở được cấp phép thương mại tự do (MIT / CC-BY).
  - Nghiêm cấm sao chép nguyên mẫu asset, âm thanh hoặc nhãn hiệu thương mại từ các tựa game thương mại.
