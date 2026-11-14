# Release Notes — `v1.6.0-moon32` (Phase 1.6 Production Candidate)

## 1. Phạm vi & Thay đổi chính (`Phase 1.6`)
- **Code Splitting & Critical Asset Budget (`Option B < 2.5 MB`):**
  - Toàn bộ 11 modal và bảng hệ thống trong `HailGameViewport.tsx` được lazy-load bằng `React.lazy` + `Suspense`.
  - Trì hoãn nạp nhạc nền `PH_MUS_LUNAR_BASE_LOOP_V01.ogg` đến khi có tương tác đầu tiên và audio không tắt tiếng (`syncMusicMuted` tự kích hoạt nhạc nếu mở tiếng sau khi boot).
  - Tối ưu các ảnh WebP nặng trên cockpit/crew (`PH_ENV_COCKPIT_SHELL_BASE_V01.webp` và sprite `nv 1..4` cả 3 trạng thái), cập nhật đầy đủ `public/assets/hail/manifest.json` (`141` assets).
  - Bổ sung gate tự động `npm run budget:check` (`scripts/check-bundle-budget.mjs`) trong CI `.github/workflows/ci.yml`.
- **Reliability & Recovery:**
  - Bọc toàn ứng dụng bằng `ErrorBoundary` (`src/components/common/ErrorBoundary.tsx`) kèm nút **Export Save Snapshot**, **Reload**, và **Reset Save** khẩn cấp.
  - Bọc ảnh động trong cockpit bằng `SafeImage` (`src/components/common/SafeImage.tsx`) có `onError` fallback.
  - Giữ nguyên `APP_VERSION = '1.4.0'` trong `saveAdapter.ts` để đảm bảo **save Phase 1.4/1.5 sống mượt qua deploy**, tách nhãn hiển thị `RELEASE_VERSION = '1.6.0-moon32'` sang `src/config/releaseMeta.ts`.
- **About, Credits & Legal:**
  - Bổ sung nút **Thông tin / Credits** trên action bar mở `AboutCreditsModal` (`src/components/modals/AboutCreditsModal.tsx`).
  - Bổ sung `LICENSE` (MIT) và `CREDITS.md` (NASA DONKI, LRO Diviner/LOLA, OSDR RadLab, font & open-source stack).

## 2. Kịch bản Demo 3–5 Phút (NASA Space Apps Hackathon)
1. **Phút 0:00–0:45 (Mở màn & Cockpit VI/EN):** Chỉ vùng cửa sổ quan sát (2D ambient canvas + thời tiết DONKI), chuyển thử **VI ↔ EN**, mở nhanh **Hướng dẫn `?` (5 bước)**.
2. **Phút 0:45–1:45 (Vòng lặp 1 Sol & Đánh đổi):** Đọc sự cố **Giao ban** -> sang **3D Fabricator** in thiết bị (0 crew slot) -> chỉnh **Hệ thống / Crew** -> vào **End-Sol** bật/tắt **WRS 90%** xem *5-Sol Resource Predictor* thay đổi trực tiếp rồi gạt cần.
3. **Phút 1:45–3:00 (Golden Sol 7 & Rover):** Trình diễn sự kiện **Sol 7** (Cứu Rover vs giữ điện WRS), cho thấy bản đồ Rover `Shackleton / PSR` khắc chế hazard bằng thiết bị đã chế ở Sol trước.
4. **Phút 3:00–4:00 (Lunar Night & Cadet Report Card):** Chuyển nhanh qua đêm Mặt Trăng Sol 15–28 (nhiệt độ Diviner cực đoan, Fission 8 kWh + pin) -> chốt Sol 32 xem **NASA Cadet Report Card**, **Export Replay Trace**, và chứng minh replay khớp hash 100% trên CLI.
5. **Phút 4:00–4:30 (Credits & Privacy):** Mở modal **Thông tin / Credits** cho ban giám khảo xem nguồn NASA Open Data, `v1.6.0-moon32` và cam kết 0 tracking trẻ em.

## 3. Kế hoạch Rollback khi Deploy Production
1. Nếu phát hiện lỗi nghiêm trọng sau khi deploy URL production:
   - Rollback ngay về deployment trước đó trên nền tảng hosting (Vercel/Cloudflare Pages/GitHub Pages) **hoặc** checkout tag ổn định trước đó (`git revert` commit merge trên `main` và trigger redeploy).
2. Vì `SaveEnvelope v4` (`APP_VERSION = '1.4.0'`) và `UI_PREFS_STORAGE_KEY = 'phf_ui_prefs_v1'` không thay đổi định dạng lưu trữ, người chơi quay lại bản trước sẽ **không bị mất save**.
