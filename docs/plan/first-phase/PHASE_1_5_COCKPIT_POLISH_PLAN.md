# PHASE 1.5 — Cockpit, art, audio, tutorial và educational polish

> **Mục tiêu:** chuyển campaign đã hoàn chỉnh về luật thành trải nghiệm cockpit 2.5D dễ hiểu, hấp dẫn và có giá trị giáo dục cho trẻ 7–12 tuổi.

## 1. Điều kiện đầu vào

- PHASE 1.4 đã freeze core loop, campaign rules và balance v1.
- Tất cả action/selector/outcome đã có contract ổn định.
- Full campaign chạy được với UI chức năng/placeholder.

## 2. Kết quả cần đạt

- Cockpit trở thành màn hình trung tâm, state gameplay nhìn thấy ngay.
- Toàn bộ critical flow dùng asset hợp pháp, nhất quán phong cách.
- Tutorial dạy bằng hành động trong Sol 1.
- Audio/animation tăng phản hồi nhưng không cản thao tác.
- Science Brief giải thích đúng metric vừa xảy ra.
- Critical path, tutorial, debrief và Science Brief có đủ VI/EN.
- Trẻ không cần đọc tài liệu bên ngoài để hoàn thành Sol đầu tiên.

## 3. Information architecture

### Cockpit luôn hiển thị

- Sol, phase, campaign objective.
- O₂, water, food, parts, battery và forecast delta.
- 4 crew: condition, assignment, warning.
- 4 system: level, integrity, powered/status.
- Rover mission, progress và deadline.
- Event đang chờ và lý do nút tiếp tục bị khóa.

### Các panel/modal

- Starlog/Briefing.
- Crew Assignment.
- Engineering.
- Rover Map/Planner.
- Comms & Logistics.
- Rationing/Power Plan.
- End-Sol Confirmation.
- Debrief + NASA Science Brief.
- Mission Progress, Victory, Defeat, Settings.

UI chỉ gọi command/selector đã có; không thêm luật gameplay trong component.

### Contract V12 Consolidated

- Stage chuẩn `1672×941`, tỷ lệ 16:9.
- 4 module kỹ thuật: Oxygen/Scrubber, Water Recycler, CAPCOM/Airlock và Power/Solar.
- Left Rack: ba MRE slot + First Aid Kit.
- Right Rack: ba Sample Canister slot + Core Drill.
- Gỡ hai tủ tường cũ; rack phản chiếu inventory state thật từ PHASE 1.2.
- Observation Window dùng vùng trung tâm và không che hotspot/telemetry.

| Vùng V12 | `left / top / width / height` |
| --- | --- |
| Oxygen/Scrubber | `3.05% / 14.98% / 15.91% / 31.46%` |
| Water Recycler | `2.87% / 53.56% / 16.21% / 31.14%` |
| CAPCOM/Airlock | `81.10% / 14.98% / 15.91% / 31.46%` |
| Power/Solar | `80.98% / 53.56% / 16.21% / 31.14%` |
| Left Rack | `22.31% / 27.42% / 27.87% / 44.74%` |
| Right Rack | `49.88% / 27.42% / 27.87% / 44.74%` |

## 4. Design system

- Token: color, type, spacing, radius, border, shadow, motion, z-index.
- Component: button, icon button, meter, resource chip, badge, tooltip, callout, tabs, modal, toast, timeline, checklist.
- State: default, hover, focus, selected, disabled-with-reason, warning, critical, success.
- Có visual regression story/page cho từng component state.
- Text body đủ lớn, tương phản cao, không phụ thuộc màu.

## 5. Asset production

### Environment

- Space background, lunar exterior, cockpit shell, map, crater, regolith, PSR.
- Observation Window Canvas 2D: Moon day, sunset, Lunar Night, radiation warning và sunrise recovery.

### Crew

- 4 portrait + 4 seated.
- Normal, tired/stressed và injured/critical bằng variant hoặc overlay.

### Equipment/rover/event

- 4 system có base/degraded/broken.
- Rover idle/active/signal-lost/broken.
- Event image cho toàn bộ critical event và nhóm event chính.
- Inventory/tool/reward icon cần cho expedition.

### Chuẩn

- WebP cho raster; SVG cho icon/frame.
- Asset manifest: path, dimensions, anchor, layer, state, source, license, version.
- Responsive crop/safe area và placeholder fallback.
- Lazy-load modal/event assets; preload critical cockpit assets.

## 6. Audio và motion

### Audio tối thiểu

- Cabin ambient.
- Click/confirm/cancel.
- Warning/critical alarm.
- Radio send/receive.
- Rover launch/return.
- Lunar sunset, sunrise và Moon Victory transition.
- End-Sol, victory và defeat.

Ưu tiên Web Audio procedural cho telemetry beep/radio squelch/alarm để giảm asset và tránh rủi ro bản quyền.

### Motion

- Modal transition, meter delta, warning pulse, exterior lighting, radio status.
- Cutscene/typewriter có skip.
- `prefers-reduced-motion` tắt parallax, pulse và typewriter.
- Audio chỉ bắt đầu sau tương tác; có mute/volume và lưu setting riêng.

## 7. Tutorial Sol 1

Tutorial theo context, không khóa người chơi vào chuỗi pop-up dài:

1. Chỉ Sol/phase/objective.
2. Chỉ ba resource sống còn và forecast.
3. Mở Crew Assignment, giao người trực Expedition 1.
4. Mở Engineering, giải thích integrity/power.
5. Xem Rover Planner và xác nhận mission.
6. Mở Rationing, thay đổi plan.
7. Preview hậu quả, xác nhận End-Sol.
8. Đọc delta và Science Brief.

Mỗi bước có `skip`, `back`, focus target và completion flag. Skip tutorial không thay state gameplay.

## 8. Educational polish

Mỗi Science Brief gồm:

- “Điều vừa xảy ra”: lấy metric từ resolver.
- “Khoa học thật”: nội dung ngắn cho trẻ.
- “Trong game”: giải thích tham số mô phỏng.
- “Thử nghĩ xem”: một câu gợi mở, không phải quiz bắt buộc.
- Nguồn NASA cụ thể và evidence label.

Brief được chọn từ `DebriefContext` của engine. End-Sol hiển thị predictor O₂/nước/pin và biểu đồ xu hướng 5 Sol từ selector; UI không tự viết lại công thức resolver.

### Song ngữ VI/EN

- UI copy dùng translation key, không hardcode text trong feature component.
- Content event/brief có bản VI và EN cùng schema/ID.
- Language preference thuộc settings/UI persistence, không làm thay đổi Mission Seed hay outcome.
- Thiếu translation critical path làm content validation/CI fail.

Rà soát các hiểu lầm cần tránh: Mặt Trăng không có bão cát, rover không phải xe có người lái, radio không tức thời, nước được tái chế nhưng không tự sinh ra.

Moon UI phải làm rõ Lunar Night kéo dài Sol 15–28, solar 0 kWh, fission 8 kWh và tải thiết yếu 12 kWh; cảnh báo phải xuất hiện từ giai đoạn chuẩn bị Sol 13–14.

## 9. Thứ tự build

1. Audit user flow và hierarchy bằng wireframe xám.
2. Khóa design token/component states.
3. Làm responsive cockpit shell và modal framework.
4. Tích hợp từng feature panel theo critical flow.
5. Sản xuất/tích hợp asset theo manifest.
6. Làm tutorial Sol 1.
7. Làm debrief/Science Brief metric-driven.
8. Thêm audio/motion/reduced-motion.
9. Hoàn thiện VI/EN và Resource Trend/Report Card presentation.
10. Visual/content/playtest và sửa clarity.
11. Freeze visual/audio/content v1.

## 10. Phân chia song song

| Luồng | Công việc |
| --- | --- |
| A — UX/UI | Wireframe, design system, responsive cockpit, modal flow |
| B — Art | Environment, crew, system, rover, event, manifest/export |
| C — Frontend integration | Feature panels, asset registry, animation/audio plumbing |
| D — Content/education | Tutorial copy, Science Brief, source review, child-friendly language |

Luồng D đồng thời sở hữu translation catalog VI/EN; luồng B/C dùng asset/translation key đã khóa.

Design token, asset naming và layout safe area phải khóa trước khi B/C chạy mạnh.

## 11. Integration gate

### Gate A — Functional cockpit

- Full campaign chơi được mà không mở debug panel.
- Mỗi state quan trọng có visual và text label.

### Gate B — Tutorial

- Người mới hoàn thành Sol 1; skip/restart/reload không làm kẹt flow.

### Gate C — Asset/audio

- Không placeholder ở critical path, 404 hoặc asset không rõ license.
- Mute/reduced-motion hoạt động; audio không chồng vô hạn.

### Gate D — Education

- Brief lấy đúng metric, nguồn và phân biệt science/game.
- Copy được review về độ tuổi, thuật ngữ và tính khoa học.
- Full critical path chạy được ở VI và EN mà không vỡ layout.

## 12. Test bắt buộc

- Component/visual states và responsive breakpoints.
- Full UI campaign smoke.
- Tutorial start/skip/resume/reset.
- Modal focus, keyboard, close/return focus.
- Asset manifest/path/fallback.
- Audio mute/volume/unmount cleanup.
- Reduced motion.
- Science Brief metric/source mapping.
- Translation completeness và layout expansion EN/VI.
- Snapshot/visual regression của cockpit critical states.

## 13. Definition of Done

- [ ] Cockpit thể hiện đủ state và forecast cần ra quyết định.
- [ ] Critical flow không dùng debug UI hoặc placeholder.
- [ ] Tutorial Sol 1 dạy được core loop và có thể skip.
- [ ] Asset có manifest, source/license và state variants.
- [ ] Audio/motion có setting và reduced-motion fallback.
- [ ] Science Brief dùng metric thật và nguồn NASA cụ thể.
- [ ] Predictor/biểu đồ 5 Sol dùng selector chung với engine.
- [ ] V12 6 module + 2 rack hiển thị inventory/mission state thật.
- [ ] Critical path VI/EN hoàn chỉnh và chuyển ngôn ngữ không đổi gameplay.
- [ ] Copy phù hợp trẻ 7–12 tuổi.
- [ ] Desktop/mobile critical flow đều dùng được.
- [ ] Visual/component/integration test và CI đạt.

## 14. Không thuộc phase này

- Certification accessibility/performance cuối cùng.
- Browser/device matrix toàn diện và production release.
- Mars campaign, advanced Moon→Mars mode hoặc live service.

**Mốc kết thúc:** Moon Survival 32 hoàn chỉnh về cảm nhận và giáo dục, sẵn sàng bước vào hardening/release.
