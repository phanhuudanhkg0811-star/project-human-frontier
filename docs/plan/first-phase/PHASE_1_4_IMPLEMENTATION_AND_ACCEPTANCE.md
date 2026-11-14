# Phase 1.4 — Luật đã chốt, cách kiểm tra và bằng chứng

Ngày triển khai: 14/11/2026. Nhánh: `feat/phase-1-4-campaign-balance`, bắt đầu từ `dev` tại `0c578bd`. Báo cáo ghi mốc nghiệm thu local trước khi commit/push/PR; người phụ trách đã yêu cầu xuất bản qua PR vào `dev` sau mốc này. Xem Git/PR để biết trạng thái xuất bản thực tế.

## Quyết định được xác nhận

- Thắng sau End-Sol 32 khi có ít nhất hai crew chưa evacuated, O₂ > 0 kg và nước > 0 L. Không thêm integrity gate.
- Defeat được xét trước victory: crew dưới hai người; O₂ bằng 0 một Sol; nước bằng 0 hai Sol liên tiếp. Nước bằng 0 lần đầu tại Sol cuối vẫn không đủ điều kiện victory.
- S: bốn crew Fit và ba expedition hoàn thành. A: ít nhất ba crew chưa evacuated và hai expedition. B: các victory còn lại. Defeat không có rank.
- Training Report chụp sau End-Sol 12; bốn crew và hai expedition là mục tiêu học tập, không phải terminal gate.
- Giữ `cadet/standard/hardcore` cùng `weatherRiskMultiplier` hiện có. `eventSeverityMultiplier` vẫn là trường chưa được áp dụng; không công bố nó là tính năng hoạt động.
- Hỗ trợ save hợp lệ v1–v3: giữ dữ liệu và tiếp tục theo luật 1.4, có thông báo nâng cấp. Không chạy lại engine cũ. Save terminal cũ giữ kết quả cũ và không áp ngược rank mới. Save hỏng hoặc phiên bản không được nhận diện không bị tự sửa.

Các threshold nằm trong `src/data/campaign-moon32.json`; evaluator chung nằm trong `src/domain/campaignEvaluator.ts`. UI không tự tính rank.

## P0–P2: Contract, baseline và save

Baseline trước thay đổi được lưu trong `reports/phase-1-4/baseline/`. Seed 205099/Cadet/default DONKI đi hết 32 Sol, không blackout, không hoàn thành expedition nào. Trace đã được replay thành công trước khi thay schema/model. Đây là artifact lịch sử của engine 1.3; CLI hiện tại phải từ chối vì content/schema khác, không đổi version để ép nó chạy.

Save mới dùng schema v4, app 1.4.0, content `1.4.0-moon32`, model `1.4.0-ts-donki`, ranking `1.4.0-moon32`. Catalog NASA vẫn `1.1.0-moon32`; số liệu nguồn không thay đổi. Không chỉnh các hằng số vật lý hoặc Golden Sol 7.

Migration kiểm checksum và metadata trước khi chuyển đổi. Đường v1/v2 đang có được nối lên v4; v3 được chuyển trực tiếp. Các content/model nguồn được nhận diện là bản 1.1.0 đang dùng trong repo hoặc bản hiện tại, catalog 1.1.0. Các version khác không có contract/fixture trong repo được giữ nguyên và báo lỗi, thay vì giả định tương thích.

Migration bảo toàn resource, crew, rover và event của v3. Với v1/v2, tiếp tục dùng cách chuyển rover/event đã có từ Phase 1.2–1.3. Summary cũ nhận `checkpoint: null`; không lấy crew/resource hiện tại để dựng báo cáo Sol 12. Khi storage cho phép, bản gốc được giữ dưới key có hậu tố `:pre-v4` trước khi ghi slot mới.

Checkpoint mới ghi resource, crew, system, expedition, science và ledger điện/WRS sau resolve. WRS efficiency = nước thu hồi / greywater thực sự đã xử lý. UI nêu số Sol có dữ liệu khi lịch sử chỉ đầy đủ một phần.

## P3: Chạy campaign và replay

```powershell
npm.cmd run simulate -- --suite references
npm.cmd run replay -- reports/phase-1-4/references/victory-a.json
npm.cmd run replay -- reports/phase-1-4/references/victory-b.json
npm.cmd run replay -- reports/phase-1-4/references/defeat-oxygen.json
npm.cmd run replay -- reports/phase-1-4/references/defeat-water.json
```

| Trace, cùng seed 205099/Cadet | Kết quả | Expedition |
|---|---|---|
| A, chọn `save-rover-link` thật tại Sol 7 | Victory S, End-Sol 32 | Crater, Regolith, PSR: 3/3 |
| B, chọn `prioritize-wrs` thật tại Sol 7 | Victory A, End-Sol 32 | Crater + PSR: 2/3; Regolith failed |
| Không tiếp tế O₂ | Defeat `oxygen-depleted` | Không chỉnh resource thủ công |
| Không chạy WRS, không tiếp tế nước, vẫn cấp MRE | Defeat `water-depleted` | Không chỉnh resource thủ công |

Runner khởi tạo bằng API rồi chỉ dispatch command. Budget mỗi Sol phát hiện bot treo và báo `simulation-error`, không đổi thành defeat. Policy nhận snapshot riêng. Rejection, actual choice và hash từng command đều được ghi.

Replay giữ nguyên initial state/runId; kiểm content hash, version, expected result/error và state hash từng bước. UI ghi command tại store adapter, tách storage replay khỏi save snapshot. Nếu mất lịch sử recorder hoặc mở save cũ, export được ghi nhãn `from-snapshot`, không gọi là replay từ Sol 1.

## P4: Smoke và audit balance

```powershell
npm.cmd run simulate -- --matrix smoke --seed-start 1000
npm.cmd run simulate -- --policy conserve-power --difficulty standard --branch B --seed-start 205099 --runs 1
```

Matrix có sáu policy × ba difficulty × ba DONKI profile × hai lượt = 108 campaign, seed 1000–1107. Mỗi lượt đều replay kiểm chứng; JSON/CSV và thống kê nhóm nằm tại `reports/phase-1-4/smoke/`. Chỉ giữ full trace tham chiếu/lỗi theo mặc định.

Policy gồm balanced, conserve-power, science-first, repair-first, random-valid và stress-test. Random bot chọn trong tập ứng viên hợp lệ có giới hạn, không phải toàn bộ không gian action. Stress bot thử boundary và command không hợp lệ có chủ đích. Các policy chủ động dùng chung nền bảo vệ sống còn; khác nhau ở lịch rover, ngưỡng repair, WRS và phân bổ cargo/upgrade.

Batch đầu: 107 victory, một defeat do O₂, không simulation-error. Không dùng tỷ lệ này để suy ra xác suất thắng của trẻ em hoặc chứng minh không tồn tại soft-lock. Không so tỷ lệ giữa baseline một seed và matrix nhiều policy như bằng chứng cải thiện balance.

Hai họ chiến lược có đường thắng: WRS theo mẻ + cargo điện, và hạn chế WRS + cargo nước/nâng recycler. Battery vẫn có capacity 60 kWh; cargo không tạo kho pin 85 kWh. Solar bằng 0 suốt Sol 15–28; essential 12 kWh luôn được cấp trước tải tùy chọn. Không đổi thông số nhằm cứu một seed.

Audit bổ sung guard hủy upgrade theo thứ tự cấp cao trước, tránh trả giá Lv3 cho kết quả Lv2. UI tính cả các upgrade đang xếp khi hiển thị giá tiếp theo, gồm discount của Engineer. Invariant kiểm thêm capacity greywater/MRE/Medkit và số lượng consumable nguyên. Các regression kiểm refund/craft/cancel, reservation rover, duplicate reward/event và command terminal tiếp tục được giữ. Đây là coverage critical path hữu hạn, không phải chứng minh vét cạn mọi exploit.

## P5–P6: Giao diện và nghiệm thu

- Checklist Lunar Night nằm ở thiết lập campaign và màn phân phối/chốt Sol; forecast dùng resolver hiện hành và ghi giả định.
- Training Report xuất hiện sau Sol 12 và xem lại được trong thiết lập campaign.
- Terminal Report Card có rank/rubric, requirement, crew, expedition, resource, WRS, timeline từ history và export.
- “Chơi lại cùng seed” giữ seed/difficulty/profile; lựa chọn khác có thể cho kết quả khác. “Chọn cấu hình cho ván mới” cho xem cấu hình trước khi reset.
- Restart reset domain, recorder và các lựa chọn UI liên quan. Lỗi save có nút export raw trước khi tạo ván mới.

```powershell
npm.cmd test
node scripts/validate-events-catalog.mjs --release
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
node scripts/verify-phase-1-4-browser.mjs
```

Browser script chạy Chrome headless với profile tạm, Vite localhost, thao tác qua các nút render thật và chỉ đọc state từ localStorage. Nó không gán state hoặc gọi store.dispatch từ DevTools. Chrome path mặc định dành cho Windows, có thể đổi bằng biến `CHROME_PATH`. Bằng chứng nằm tại `reports/phase-1-4/browser/`.

## Kết quả nghiệm thu

| Gate | Kết quả |
|---|---|
| Unit/integration/SSR | 58/58 pass, 0 todo; gồm Golden Sol 7, terminal/rank, training, save, replay, refund và quote upgrade |
| Event release validator | PASS, 22 event; Sol 30 không có event tiềm năng trong catalog, không phải lỗi gate |
| Typecheck/lint/build | PASS; không cảnh báo lint; Vite cảnh báo chunk JS vượt 500 kB |
| Reference suite | A thắng S 3/3; B thắng A 2/3; oxygen và water defeat; tất cả replay khớp |
| Browser qua nút UI thật | A/B hoàn thành 32 Sol; hai defeat; Training 12, reload Sol 15, snapshot + replay export, mobile, Tab/Escape và restart PASS |
| Browser exceptions | 0 |
| Smoke cuối | 108/108 chạy và replay xong: 107 victory, một defeat O₂; 0 simulation-error. Seed 1000–1107 trong `reports/phase-1-4/smoke/report.json` |

Browser evidence có bốn replay và bốn snapshot được export từ UI, cùng ảnh desktop/mobile. Script kiểm checksum snapshot và so state hash với UI; replay chạy lại mọi command và so cùng hash. Các case boundary dùng fixture riêng được ghi rõ trong test; không dùng chúng thay cho full campaign.

Không điều chỉnh số liệu resource, cargo, recipe hoặc crew để làm đẹp kết quả. So sánh JSON với baseline xác nhận `balance.json`, `crew.json` và `recipes.json` chỉ đổi metadata version. Cả nhánh A/B giữ đường sống qua Lunar Night bằng quyết định hợp lệ.

Artifact ghi base commit và `workingTreeDirty: true` vì chúng được sinh tại mốc nghiệm thu local trước commit. `verification-manifest.json` lưu hash source/data/script/test và bằng chứng; content hash của reference/smoke/browser phải trùng nhau. Khi các file được đưa vào commit/PR, metadata lịch sử đó không biến base commit thành commit hoàn thiện.

## Giới hạn và bàn giao Phase 1.5–1.6

- File JS production 508.6 kB trên đĩa (gzip 145.5 kB), CSS 57.3 kB (gzip 12.0 kB). Vite cảnh báo chunk vượt 500 kB; code splitting được bàn giao Phase 1.5–1.6. Đây là JS/CSS build, không phải tổng image/audio tải qua mạng. Chưa vượt ngưỡng 2.5 MB nếu xét riêng JS/CSS; chưa xác nhận ngân sách tổng tải ban đầu có art/audio.
- Chưa đo 60 FPS trên thiết bị thật, chi phí tải toàn bộ art/audio, screen reader đầy đủ hoặc tương phản tự động. Headless layout/focus checks không thay cho các gate phát hành đó.
- Không điều chỉnh ngưỡng rank ngoài rubric đã được xác nhận. WRS/system/resource/decision timeline được báo cáo để học tập, không tự thêm điểm thưởng ẩn.
- Support save chỉ áp dụng contract/schema nguồn được nhận diện trong repo; không đảm bảo phục hồi file hỏng hoặc đoán cấu trúc version chưa từng có. Terminal legacy giữ outcome cũ, không tự được cấp rank mới.
- P1 baseline artifact lịch sử có format/schema/model trước thay đổi. Đã verify trước khi sửa; không được coi là replay tương thích với engine mới. Bốn reference và bốn UI replay hiện tại là bằng chứng replay của Phase 1.4.
- Smoke 108 campaign và bốn đường UI kiểm chứng critical path; không chứng minh mọi seed/action hoặc balance trên người chơi thật.
