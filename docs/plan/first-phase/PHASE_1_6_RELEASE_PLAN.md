# PHASE 1.6 — Accessibility, performance, E2E toàn campaign và release

> **Mục tiêu:** harden bản Mặt Trăng, chứng minh chất lượng bằng test/audit và phát hành một build public có thể demo ổn định.

## 1. Điều kiện đầu vào

- PHASE 1.5 đã freeze gameplay, balance, critical UI, art, tutorial và content.
- Không còn feature lớn được thêm trong phase này; chỉ sửa lỗi, tối ưu và release blocker.
- Full campaign đã có replay fixtures ổn định.

## 2. Release criteria

- Chơi trọn campaign trên browser hỗ trợ mà không lỗi blocker.
- Keyboard-only và screen reader đi qua critical flow.
- Mobile không mất action quan trọng hoặc overflow cản thao tác.
- Performance đạt budget đã công bố trên thiết bị mục tiêu.
- Save hiện tại sống qua refresh/deploy migration.
- E2E bao phủ happy path, cả hai nhánh Sol 7 và các defeat chính.
- Critical path và Cadet Report Card đạt E2E ở cả VI và EN.
- Có production URL, rollback plan, credits/license và demo script.

## 3. Accessibility audit

### Keyboard/focus

- Thứ tự Tab theo luồng đọc; mọi action truy cập được.
- Focus visible; modal trap/restore đúng.
- Escape chỉ đóng modal khi an toàn; confirmation không bị bỏ qua vô ý.
- Không keyboard trap ở slider, map hoặc tab.

### Semantics/screen reader

- Landmark, heading, label, status/live region hợp lý.
- Resource delta và critical warning được đọc nhưng không spam.
- Icon trang trí `aria-hidden`; icon chức năng có accessible name.
- Table/checklist/timeline có cấu trúc đọc được.

### Visual/motion/input

- WCAG AA cho text/control quan trọng.
- Không dùng màu là tín hiệu duy nhất.
- Zoom 200% và text resize không mất chức năng.
- Target cảm ứng tối thiểu 44×44 px.
- Reduced motion tắt animation không thiết yếu.
- Audio warning có tín hiệu hình ảnh tương đương.

## 4. Performance budget

| Hạng mục | Budget mục tiêu |
| --- | --- |
| Initial JS gzip | ≤ 150 kB hoặc có report/waiver |
| Initial CSS gzip | ≤ 30 kB |
| Initial critical assets | ≤ 1.5 MB trên route đầu |
| Total lazy-loaded art | Theo manifest; không tải toàn bộ lúc boot |
| Tổng payload mục tiêu | < 2.5 MB cho critical route; phần vượt phải lazy-load và có report |
| LCP desktop | < 2.5 giây trên profile mục tiêu |
| INP | < 200 ms |
| CLS | < 0.1 |
| Animation | Gần 60 FPS ở thiết bị mục tiêu |

Budget được đo bằng cùng profile mạng/CPU và lưu report. Nếu kiến trúc hiện tại không đạt đúng số, phải có baseline, nguyên nhân và giới hạn release rõ ràng.

### Việc tối ưu

- Route/modal code splitting và dynamic import.
- Preload cockpit critical; lazy-load event/site/victory art.
- WebP dimension đúng chỗ hiển thị, responsive `srcset` khi hữu ích.
- Tránh subscription toàn store; dùng selector lát nhỏ.
- Memoize phép tính nặng, không memo hóa mù quáng.
- Virtualize/log truncate nếu Mission Log dài.
- Dọn interval/audio/listener khi unmount.
- Cache static assets bằng hashed filenames.

## 5. E2E matrix

### Critical journeys

1. New Mission → tutorial → End Sol 1.
2. Save/reload ở mỗi phase → tiếp tục đúng state.
3. Expedition 1 hoàn thành.
4. Sol 7 chọn cứu rover → sống qua Lunar Night → Moon Victory Sol 32.
5. Sol 7 ưu tiên trạm → sống qua Lunar Night → Moon Victory Sol 32.
6. Defeat do crew casualty.
7. Defeat do life-support collapse.
8. Chuẩn bị Sol 13–14 → Lunar Night Sol 15–28 → sunrise recovery.
9. Defeat trong Lunar Night do power/life-support collapse.
10. Restart campaign và save cũ không rò sang lượt mới.
11. Corrupt save recovery.
12. Chuyển VI↔EN giữa campaign không đổi state/outcome.
13. V12 rack cập nhật MRE/medkit/sample/drill đúng sau action.

### Browser/viewport

- Chromium desktop là release gate chính.
- Firefox và WebKit smoke critical flow.
- Mobile viewport nhỏ, tablet và desktop 16:9.
- Keyboard-only và reduced-motion profile.

E2E dùng seed/fixture cố định; không chờ random event không kiểm soát.

## 6. Reliability và save migration

- Error boundary cho app và panel nặng.
- Asset fallback; lỗi một ảnh không làm hỏng campaign.
- Save envelope có checksum/validation nếu cần và backup previous save.
- Migration test từ mọi schema đã phát hành.
- Deploy mới không mất save hợp lệ.
- Crash report local/dev có state version + seed nhưng không chứa dữ liệu cá nhân.
- Có nút export save/replay để hỗ trợ debug.

## 7. Security/privacy/legal

- Không chèn HTML từ content mà không sanitize.
- Dependency audit và lockfile review.
- Không để secret/API key trong frontend.
- Không thu analytics/PII nếu chưa có privacy notice và consent phù hợp trẻ em.
- Credits, NASA attribution, font/audio/art license đầy đủ.
- Không có asset/code/trademark lấy từ game thương mại tham chiếu.

## 8. CI/CD pipeline

Mỗi PR chạy:

1. Install bằng lockfile.
2. Schema/content validation.
3. Format/lint/typecheck.
4. Unit + integration + golden scenario.
5. Production build và bundle budget.
6. E2E critical smoke.
7. Accessibility automated smoke.

Release candidate chạy thêm full E2E matrix, visual regression và performance audit. Deploy preview cho PR; production deploy từ tag/version đã duyệt.

## 9. Versioning và release artifacts

- App version, schema version, content version và balance version hiển thị trong About/debug.
- Release notes liệt kê feature, balance change, known issues và migration.
- Source map policy rõ ràng.
- Art manifest, credits/license, test report, simulation report và Lighthouse report được lưu.
- Có build artifact tái tạo được từ tag.

## 10. Thứ tự build

1. Feature/content freeze và triage blocker.
2. Lập accessibility/performance/browser baseline.
3. Hoàn thiện E2E fixtures/critical journeys.
4. Fix accessibility blockers.
5. Tối ưu loading/render/subscription/assets.
6. Hardening save/migration/error boundary.
7. Legal/license/security/dependency audit.
8. Release candidate, full regression và playtest.
9. Deploy staging, rehearsal demo và rollback test.
10. Tag/deploy production, smoke test và publish release notes.

## 11. Phân chia song song

| Luồng | Công việc |
| --- | --- |
| A — Accessibility | Manual/automated audit, keyboard, screen reader, contrast, motion |
| B — Performance | Bundle, asset, rendering, Web Vitals, budget CI |
| C — QA/E2E | Fixtures, browser matrix, visual regression, campaign regression |
| D — Release/Ops | Save migration, CI/CD, security/license, staging/production/docs |

Mọi fix gameplay trong phase này phải kèm regression seed/test; không thay balance mà không cập nhật version/report.

## 12. Release gates

### Gate A — No blockers

- Không crash, deadlock, corrupt save, mất action hoặc sai victory/defeat trong critical journeys.

### Gate B — Accessible critical path

- Keyboard, focus, screen reader smoke, contrast và reduced motion đạt checklist.

### Gate C — Performance

- Budget CI đạt hoặc waiver được ghi rõ; không tải toàn bộ art lúc boot.

### Gate D — Regression

- Unit/integration/golden/full E2E/visual regression đạt trên release candidate.

### Gate E — Operational readiness

- Production URL, rollback, version, credits, licenses, known issues và support/debug export sẵn sàng.

## 13. Definition of Done

- [ ] Critical campaign journeys đạt trên browser matrix đã khóa.
- [ ] Cả hai nhánh Sol 7 và mọi terminal outcome có E2E.
- [ ] Full critical path Moon 32 có E2E ở VI và EN.
- [ ] HUD dùng campaign config: target 32 và milestone 12/15/29; không hardcode trong component.
- [ ] Keyboard-only và screen-reader critical path dùng được.
- [ ] WCAG AA cho nội dung/control trọng yếu và reduced motion hoạt động.
- [ ] Performance/bundle/asset budget có report và CI gate.
- [ ] Save migration/recovery/backup được test.
- [ ] Dependency, privacy, security và license audit hoàn tất.
- [ ] Không release blocker hoặc console error ở happy path.
- [ ] Production build được deploy, smoke test và rollback thử thành công.
- [ ] README, architecture, credits, release notes và demo script khớp bản phát hành.
- [ ] Có public URL và gameplay demo 3–5 phút.

## 14. Sau release

- Theo dõi crash/feedback mà không thu dữ liệu trẻ em không cần thiết.
- Hotfix chỉ từ regression có seed/test.
- Tổng kết metric kỹ thuật, vấn đề UX và bài học balance.
- Chỉ mở Mars/advanced-mode sau khi backlog Moon 32 được triage.

**Mốc kết thúc:** bản Mặt Trăng public, có thể demo ổn định, truy cập được, tái tạo build được và có bằng chứng kiểm thử đầy đủ.
