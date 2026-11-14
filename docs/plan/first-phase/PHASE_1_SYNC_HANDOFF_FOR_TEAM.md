# PHASE 1 — Tài liệu Đồng bộ & Phổ biến Thay đổi cho Team (`Sync & Handoff`)

> **Mục đích:** Tóm tắt **nhanh, chính xác từng điểm khác biệt** giữa bộ tài liệu `PHASE_1_*.md` cũ và **chuẩn gameplay mới đã chốt (14/11/2026)** tại [`HUMAN_FRONTIER_2050_GAME_SETUP.md`](../../game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md).
>
> **Quy ước đọc (Option B):** Các file `PHASE_1_*.md` cũ được **giữ nguyên nội dung kiến trúc/code plan gốc** (chỉ gắn banner cảnh báo đầu file). Khi có bất kỳ khác biệt nào về luật chơi, thông số, UI cockpit hoặc tiêu chuẩn QA, **làm theo bảng dưới đây và tài liệu Game Setup hợp nhất**.

---

## 1. Bảng Đối chiếu Thay đổi (`Cũ -> Chốt mới`)

| Hạng mục | Thiết lập trong `PHASE_1` cũ | Quyết định Chốt mới (`14/11/2026`) | File liên quan |
| :--- | :--- | :--- | :--- |
| **`3D Fabricator` & Kho đồ** | P2 / *"loại bỏ chế tạo phức tạp"* | **Bắt buộc P0:** `2 Consumables` (`MRE`, `Medkit`) + `6 Equipment` (`Core Drill`, `Sealant Tape`, `Solar Lantern`, `Dust Shield`, `Radio Repeater`, `Cryo Thermal Rig`). | `RECONCILIATION`, `MOON_PLAN`, `1.1` |
| **Nhân sự vận hành Fabricator** | Tốn 1 lượt Crew / `Alex` giảm Parts trên Fabricator | **Tự chạy `0` slot Crew:** Máy in tự động, chỉ tốn `Parts + Battery (+ Water cho MRE)`, tối đa `1` lệnh/Sol (`1d` hoặc `2d`). `Alex` chỉ giảm `1 kg Parts` khi nâng cấp hệ thống trên **Console**. | `1.2`, `KISS_SPEC`, `GAME_SETUP` |
| **Bố cục Cockpit** | V12 cũ: `Oxygen`, `Water`, `Power` treo tường + 2 Rack ở giữa | **Wall-Rack Consolidation:** Gỡ `O2/Water/Power` khỏi tường → đưa vào **Center Telemetry Console**. 4 góc tường: `UL` Food Rack, `LL` `3D Fabricator`, `UR` CAPCOM, `LR` Inventory & Sample Rack. Giữa thoáng cho Window + 4 ghế. | `1.5`, `RECONCILIATION` |
| **Asset mới** | Cảnh báo thiếu asset V12 / chưa rõ ai làm | **Lead/User tự sinh mới bộ asset** (`UL/LL/LR/6 Equipment` đồng bộ AeroMatte 2050); team UI chỉ tích hợp vào cockpit khi bàn giao. | `1.5`, `TEAM_EXECUTION` |
| **Kho & `Chemicals`** | Có chỗ nhắc `Chemicals` / `wasteWaterL` hoặc số lẻ | **4 kho hiển thị + không `Chemicals`:** `Battery (40/60)`, `O₂ (70/120)`, `Water (80/160)`, `Parts (16/60)`; `wasteWaterL` xử lý ngầm trong engine. Bậc số event tròn `5 / 10 / 20 / 30`. | `1.1`, `1.3`, `GAME_SETUP` |
| **WRS & Golden Sol 7 (`Option A`)** | WRS `85% / 90% / 93%`; Sol 7 kết thúc `34.3 L` | **WRS `90%` (Lv1, `4 kWh`) / `95%` (Lv2 `4 kWh`, Lv3 `3 kWh`)**; Golden Sol 7 là **`25.0 L / 2.0 kWh`** (Cứu Rover) vs **`34.0 L / 0.0 kWh`** (Bật WRS). | `MOON_PLAN`, `1.3` |
| **Độ đói (`Hunger FSM`)** | Ăn uống tự động trừ theo ngày | **FSM `Satiety` (`0–100`, `-25/Sol`):** `Ok (100/75/50)` → `Hungry (25, -5 Morale/Sol)` → `Starving (0, -15 Health, -10 Morale/Sol, Cấm Rover)`. Phát thủ công `1 MRE = +75 Satiety` ở `UL Rack`. | `1.1`, `1.2`, `GAME_SETUP` |
| **Cargo tiếp tế** | Bảng gói cũ trong doc phase | **`80 kg` (`4 slots × 20 kg`), bay `4 Sol`, hồi bãi `1 Sol`:** `4` gói đồng giá (`+20 kg O₂`, `+25 L Water`, `+10 MRE + 1 Medkit`, `+25 kWh + 6 Parts`). | `MOON_PLAN`, `1.2` |
| **Tiêu chuẩn QA / Release** | 10.000 lượt bot, 13 E2E, `Initial JS <= 150 kB`, full Screen Reader | **Thực tế, nhẹ hơn:** Unit tests + Golden Sol 7 + `1` Victory / `2` Defeat trace + `~100` seed smoke + Save/Reload + **`4–5` E2E cốt lõi** (Desktop/Mobile, Tab/Esc/contrast cơ bản) + `< 2.5 MB` / `60 FPS`. | `1.4`, `1.6`, `TEAM_EXECUTION` |

---

## 2. Việc cần Làm ngay theo Từng Vai trò (`Lane Checklist`)

1. **Core / Simulation (`PHASE 1.1 – 1.4`):**
   - Khóa `balance.json`, `recipes.json`, `equipment.json` theo **Mục 3–6** trong [`HUMAN_FRONTIER_2050_GAME_SETUP.md`](../../game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md).
   - Triển khai `3D Fabricator` như **máy tự chạy (`0` Crew slot, tối đa `1` lệnh/Sol)** và `Hunger FSM` (`-25/Sol`, `MRE +75`, `Starving` cấm Rover).
   - Chỉnh fixture & test **Golden Sol 7** sang `25.0 L / 2.0 kWh` vs `34.0 L / 0.0 kWh`.
   - Đảm bảo `Resource Predictor` chạy đúng thứ tự `End-Sol Resolver` 5 tầng + Load Shedding.
2. **UI / Integration (`PHASE 1.5`):**
   - Không vẽ `Oxygen / Water / Power` lên tường; gom toàn bộ thông số & nút `Repair / Upgrade / WRS ON-OFF` vào **Telemetry Console** ở bàn trung tâm.
   - Gắn 4 vùng tương tác vách (`UL` Food Rack, `LL` Fabricator, `UR` CAPCOM, `LR` Inventory Rack) và chừa khung chờ bộ asset mới từ Lead.
3. **Content / STEM (`PHASE 1.3 & 1.5`):**
   - Viết 22 events dùng đúng **Bộ bậc số chuẩn (`5 / 10 / 20 / 30`)** và tag khắc chế `BlockThreat` của `6` Equipment P0.
   - Bổ sung card *NASA Science Brief* (`VI/EN`) cho WRS `90%/95%`, Fission `8 kWh`, In 3D vũ trụ và bụi regolith.
4. **QA / Release (`PHASE 1.4 & 1.6`):**
   - Áp bộ checklist gọn nhẹ mới ở **Mục 8** của `HUMAN_FRONTIER_2050_GAME_SETUP.md` (không cần dựng suite 10k-run hay ma trận 13 E2E).

---

## 3. Tin nhắn Mẫu để Gửi Team (Copy & Paste)

```text
[THÔNG BÁO CHỐT DESIGN PHASE 1 — MOON 32 SOL]
Chào mọi người, mình vừa tổng hợp & chốt xong thiết kế gameplay chính thức cho bản Phase 1 để cả team làm cùng một chuẩn (không dùng các số cũ bị lệch nữa):

1. Tài liệu chuẩn duy nhất mọi người cần đọc & bám theo là:
   -> docs/game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md
   (Xem nhanh bảng các điểm vừa đổi so với PHASE_1 cũ tại: docs/plan/first-phase/PHASE_1_SYNC_HANDOFF_FOR_TEAM.md)

2. 4 thay đổi quan trọng nhất:
   - [P0 Bắt buộc] Có sẵn 3D Fabricator + 6 Equipment + 2 Consumables (MRE/Medkit). Fabricator là MÁY TỰ CHẠY (0 slot Crew, chỉ tốn Parts + Battery (+ Water), max 1 lệnh/Sol).
   - [Cockpit mới] Bỏ 3 máy Oxygen/Water/Power khỏi tường -> gom vào Telemetry Console ở bàn giữa. 2 vách đặt 4 trạm: UL (Food Rack), LL (3D Fabricator), UR (CAPCOM), LR (Inventory Rack). Bộ asset mới mình đang tự sinh để bàn giao cho team UI ghép.
   - [Chốt số liệu Option A] 4 kho chính (không Chemicals), WRS 90% -> 95%, Golden Sol 7 = 25.0 L / 2.0 kWh vs 34.0 L / 0.0 kWh, Hunger FSM (Ok -> Hungry -> Starving; MRE +75), Cargo 80 kg (4x20kg, 4 Sol).
   - [QA nhẹ hơn] Bỏ 10k bot & 13 E2E; giữ unit test, Golden Sol 7, ~100 seed smoke, Save/Reload, 4–5 E2E cốt lõi, bundle < 2.5 MB / 60 FPS.

3. Các file PHASE_1_*.md cũ mình vẫn giữ nguyên nội dung gốc để tham chiếu code plan và đã gắn banner lưu ý ở đầu mỗi file rồi nhé!
```
