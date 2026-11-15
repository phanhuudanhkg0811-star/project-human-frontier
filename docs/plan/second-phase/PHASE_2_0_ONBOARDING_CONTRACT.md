# PHASE 2.0 — UX Lock & Onboarding Contract (Frozen Spec)

> **Trạng thái:** ĐÃ CHỐT (Frozen v1.0 · 2026-11-14) — Tiền điều kiện cho Phase 2.1–2.6.
>
> **Mục tiêu:** Khóa toàn bộ hành trình người chơi, intro storyboard 60–90s, Guided Sol 1 script, bảng `data-tour` desktop/mobile/modal, contextual hints chống spam, copy VI/EN (7–12 tuổi), playtest script và test plan **trước khi** cài `driver.js` hoặc sửa component/cinematic.

---

## 1. Các quyết định bất biến (Locked Architectural & UX Decisions)

1. **Title Screen trước cockpit:** First launch mở **Title Screen**; tuyệt đối không vào thẳng cockpit và không tự phát intro/audio trước khi có **user gesture** hợp lệ.
2. **Tách biệt Intro và Gameplay:** Intro là trình chiếu bối cảnh 60–90 giây, **không** chứa thao tác gameplay thật và **không** tự tạo `GameState` save cho đến khi người chơi bấm xác nhận tại Mission Setup (`game/start`).
3. **Tutorial là người hướng dẫn, không chơi thay người chơi:** Tutorial/Driver.js **không** được tự dispatch `GameCommand` (`event/resolve`, `crew/assign`, `sol/end`, v.v.) hay chọn đáp án thay người chơi.
4. **Skip an toàn (Non-destructive Skip):** Bấm **Skip** ở Intro đi thẳng tới Mission Setup; bấm **Skip** ở Guided Sol 1 đóng tour và **giữ nguyên `GameState` hiện tại** (không cấp tài nguyên, không sửa phase).
5. **Replay không phá campaign:**
   - **Replay Intro:** phát lại Intro độc lập từ Title / How to Play và trả về màn trước đó; không chạm save.
   - **Replay Tutorial:** mặc định chạy ở chế độ **Practice Guidance / Overview** trên run hiện tại; **không** reset campaign về Sol 1. Nếu run hiện tại vẫn đang ở Sol 1 `briefing` và người chơi chọn chạy lại Guided Sol 1, các bước đã hoàn tất trên state thật sẽ được đánh dấu xong hoặc cho xác nhận đọc lại.
6. **Không bao giờ treo (Fallback & Exit Guarantee):** Mọi bước bắt buộc đều có nút thoát (**Skip / Đóng**), cơ chế `waitForElement` cho modal lazy-render, và fallback rõ ràng khi target không tồn tại, đang ẩn trên mobile, hoặc button bị khóa theo luật domain.
7. **Tách khỏi Domain & Replay Hash:** Toàn bộ `OnboardingState` (`introStatus`, `tourVersion`, `activeTour`, `activeStepId`, `sol1GuideStatus`, `contextualHintsEnabled`, `dismissedHintIds`) thuộc UI persistence (`phf_ui_prefs_v1` hoặc key onboarding riêng); **cấm** đưa vào `GameState`, `SaveEnvelope v4` (`human-frontier:moon32:save-v1`), `endSolResolver.ts` hay replay hash.
8. **Zero Analytics / Zero PII:** Các `testEvent` được định nghĩa trong tài liệu này chỉ phát sự kiện nội bộ phục vụ unit/E2E test (`window.dispatchEvent` / store test hook trong dev/test); **không** gửi telemetry cá nhân ra mạng.

---

## 2. Player Journey Map (4 Luồng Chuẩn + Nhánh Phụ)

```text
[App Boot]
   │
   ├─► loadGameState(bundle) ──► status === 'error' (Corrupted / Tampered / Unknown Save)
   │        │
   │        ▼
   │   [Save Recovery Gate trên Title Shell] (Fail-closed, KHÔNG white-screen, KHÔNG xóa raw save)
   │        ├──► "Export save gốc" ──► tải moon32-original-save.json
   │        └──► "Tạo Chiến dịch Mới" ──► resetCampaign() ──► Mission Setup / Cockpit Sol 1
   │
   ├─► status === 'empty' (First Launch)
   │        │
   │        ▼
   │   [Title Screen] (Continue bị khóa; có New Mission / How to Play / Settings / Credits)
   │        ├──► New Mission (user gesture) ──► [Intro 6 scenes · 75s] (Back/Pause/Next/Skip)
   │        │                                        │
   │        │                                        ▼ (Complete hoặc Skip)
   │        │                                 [Mission Setup] ──► Start (`game/start`) ──► [Cockpit + Guided Sol 1]
   │        ├──► How to Play ──► [Tutorial Overview / Practice Guidance]
   │        ├──► Settings ──► VI/EN · Audio Mute · Reduced Motion
   │        └──► Credits ──► [AboutCreditsModal]
   │
   └─► status === 'ok' (Valid Save — gồm cả Save Phase 1 v1→v4 đã migrate)
            │
            ▼
       [Title Screen] (Continue Mission BẬT: hiển thị Sol, Phase, Difficulty, SavedAt)
            ├──► Continue Mission ──► [Cockpit đúng Sol/Phase] (+ migrationNotice nếu vừa migrate)
            │                          └─► KHÔNG ép xem lại Intro hoặc Guided Sol 1
            ├──► New Mission ──► [Hộp thoại xác nhận ghi đè save hiện tại]
            │                      └─► Xác nhận ──► (Intro nếu unseen, hoặc Mission Setup) ──► `game/start`
            └──► How to Play / Nút (?) trong Cockpit
                   ├─► Nếu sol === 1 && phase === 'briefing' (hoặc user chọn Replay Sol 1): Guided Sol 1 (resume theo `activeStepId`)
                   └─► Nếu sol > 1 hoặc đã xong Sol 1: Practice Guidance / Overview (không reset campaign)
```

### Quy tắc chuyển trạng thái sau Reload
| Tình huống khi Reload | Hành vi bắt buộc |
| --- | --- |
| Reload tại Title Screen | Ở lại Title Screen; không tự nhảy vào Intro hay Cockpit. |
| Reload giữa Intro (chưa tạo save) | Quay lại Title Screen hoặc resume Intro từ scene đang xem theo gesture mở lại; không tạo save rác. |
| Reload giữa Guided Sol 1 (`sol1GuideStatus === 'active'`) | Khôi phục `GameState` từ `SaveEnvelope v4`, khôi phục `activeStepId` (không dùng array index); tự mở lại/chỉ tới trigger của bước đang dở. |
| Reload khi `activeTour` có `tourVersion` cũ hơn bản app | Giữ nguyên campaign save; reset riêng `OnboardingState` về mặc định an toàn và báo nhẹ 1 dòng không chặn thao tác. |
| Reload với save Phase 1 (`schemaVersion 1..4`) hợp lệ | `Continue Mission` khả dụng ngay; `introStatus` mặc định giữ tương thích không ép người chơi cũ xem lại tutorial bắt buộc. |

---

## 3. Intro Storyboard (6 Scenes · Tổng 75 giây · Budget 60–90 giây)

### Presentation & Accessibility Contract
- **Tổng thời lượng:** **75 giây** (`12 + 12 + 12 + 12 + 14 + 13 = 75s`), nằm gọn trong khung `60–90s`.
- **Điều khiển bắt buộc:** `Back` (vô hiệu ở Scene 1), `Pause / Resume`, `Next`, `Skip` (luôn hiển thị từ giây 0, dẫn thẳng tới Mission Setup), `Replay` (từ Title / How to Play).
- **Audio gate:** Chỉ khởi động `startMusic` / SFX sau user gesture bấm `New Mission` hoặc `Replay Intro`. Mọi nội dung phải đọc hiểu 100% khi tắt âm thanh (`audioMuted === true`).
- **Reduced Motion:** Khi `uiStore.reducedMotion === true` hoặc `prefers-reduced-motion: reduce`, thay toàn bộ parallax/typewriter bằng cut/fade ngắn `<= 150ms`, hiện đầy đủ text ngay lập tức.
- **Asset Lazy-Load:** Title Screen chỉ tải shell nhẹ; ảnh nền Intro (`HAIL_ENV.*`, `HAIL_ROVER.*`, `HAIL_EQUIPMENT.*`) preload sau khi Title render xong hoặc khi bắt đầu scene 1, không chặn First Contentful Paint.
- **Screen Reader Order:** Container dùng `role="region"` + heading `h2` theo thứ tự: `Step X/6` → `Title` → `Body` → Controls (`Back`, `Pause`, `Next`, `Skip`). Mọi ảnh minh họa thuần trang trí gắn `aria-hidden="true"`.

### Chi tiết 6 Scene

| Scene | ID | Thời lượng | Visual / Asset tái dùng | Ý chính duy nhất | Copy VI (7–12 tuổi) | Copy EN (7–12 tuổi) |
| --- | --- | ---: | --- | --- | --- | --- |
| 1 | `intro-outpost-2050` | 12s | `HAIL_ENV.spaceDeep` + `HAIL_ENV.lunarDay` | Bối cảnh năm 2050 tại Nam Cực Mặt Trăng | **Năm 2050: Trạm Artemis.** Chào mừng tới căn cứ Nam Cực Mặt Trăng. Nắng chỉ chạm nhẹ vành miệng hố, xung quanh là bóng tối lạnh giá. | **Year 2050: Artemis Base.** Welcome to our outpost at the Lunar South Pole. Sunlight barely grazes the crater rims while freezing shadows wait nearby. |
| 2 | `intro-crew-habitat` | 12s | `HAIL_ENV.cockpitShell` + 4 crew sprites | 4 phi hành gia sống trong hệ khép kín | **Bốn người, một mái nhà.** Ryan, Mizuki, Trọng và Dmitri sống chung trong khoang kín. Mỗi hơi thở và giọt nước đều cần được giữ gìn. | **Four Astronauts, One Home.** Ryan, Mizuki, Trọng, and Dmitri share one sealed habitat. Every breath of air and drop of water must be protected. |
| 3 | `intro-finite-resources` | 12s | `HAIL_EQUIPMENT.fabricatorIdle` + `HAIL_INVENTORY.*` | O₂, nước, MRE và điện đều hữu hạn | **Tài nguyên có giới hạn.** Oxy, nước sạch, đồ ăn MRE và pin đều có thể cạn. Máy lọc WRS và xưởng in 3D giúp trạm tự chủ lâu hơn. | **Finite Daily Supplies.** Oxygen, clean water, MRE packs, and battery power can all run out. Your WRS recycler and 3D Fabricator keep the base running. |
| 4 | `intro-rover-science` | 12s | `HAIL_ROVER.active` + `HAIL_ENV.lunarCrater` / `lunarPsr` | Rover khảo sát 3 vùng để kiếm khoa học & tài nguyên | **Rover thám hiểm Nam Cực.** Cử Rover vượt miệng hố, đồng bằng bụi và vùng tối PSR để tìm băng nước cổ đại và gửi dữ liệu về Trái Đất. | **Rover Polar Expeditions.** Send your Rover across craters, dusty regolith fields, and shadowed PSRs to hunt ancient water ice and collect science data. |
| 5 | `intro-lunar-night` | 14s | `HAIL_ENV.lunarNight` + `HAIL_EQUIPMENT.consoleDesk` | Đêm Mặt Trăng bắt đầu Sol 15 (Solar = 0) | **Đêm Mặt Trăng từ Sol 15.** Mặt Trời lặn suốt 14 ngày! Pin mặt trời tạo 0 kWh. Cả trạm phải sống nhờ lò Fission và pin tích trữ. | **Lunar Night at Sol 15.** The Sun sets for 14 full Sols! Solar panels make 0 kWh. Your crew relies on the Fission reactor and stored batteries. |
| 6 | `intro-take-command` | 13s | `HAIL_SVG.badgeNasaStem` + full cockpit preview | Chiến dịch khảo sát 32 Sol (không giải cứu) | **Đến lượt bạn chỉ huy!** Hãy dẫn dắt trạm Artemis suốt 32 Sol, vượt bão Mặt Trời và đưa cả đội an toàn đón bình minh Sol 29. | **Your Turn to Command!** Lead Artemis Base through 32 Sols, handle solar storms, and bring the entire crew safely to the Sol 29 sunrise. |

---

## 4. Guided Sol 1 Script (Action-Driven · Không tự chơi thay người chơi)

### Nguyên tắc thực thi đã khóa theo codebase Phase 1
- Tại `initial-state.json`, Sol 1 khởi đầu ở `clock.phase === 'briefing'` với event bắt buộc `sol1-arrival-check` (`mandatory: true`).
- Cả 5 hệ thống (`solar`, `recycler`, `scrubber`, `airlock`, `fabricator`) khởi đầu ở `integrity: 1.0`, nên nút **Repair (Sửa)** trong `SystemControls` bị disabled ở Sol 1 (`E_SYSTEM_NOMINAL`). Vì thế bước `crew-assignment` hướng dẫn giao nhiệm vụ hợp lệ (`rest` / `emergency-response` / `medical-care` hoặc nâng cấp hệ thống nếu muốn), còn `systems-panel` hướng dẫn đọc/hiểu trạng thái hệ thống và xác nhận chuyển pha có chủ đích.
- **Ngân sách chữ (Hard Gate):** Mọi popover Guided Sol 1 có tổng số từ `title + body` **≤ 45 từ** ở **cả VI và EN**.

| # | `stepId` | `data-tour` Target | Phase yêu cầu | Expected Action (Thao tác thật) | Completion Condition | Fallback khi target mất / sai phase / Replay | Analytics-Free `testEvent` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `sol1-open-briefing` | `open-briefing` | `briefing` | Bấm nút Giao ban / màn hình Decision để mở Starlog | `uiStore.activeModal === 'starlog'` | Nếu Starlog đã mở, chuyển ngay sang bước 2; trên mobile target nút Giao ban trong `.hail-action-band`. | `onboarding:test:sol1-open-briefing` |
| 2 | `sol1-weather-status` | `weather-status` | `briefing` | Đọc trạng thái thời tiết NASA DONKI & bấm **Tiếp** trong popover | Người chơi bấm xác nhận **Tiếp** trên popover | Nếu Starlog bị đóng giữa chừng, fallback về `[data-tour="open-briefing"]`; nếu modal thiếu vùng DONKI, fallback sang `[data-tour="telemetry-donki"]`. | `onboarding:test:sol1-weather-status` |
| 3 | `sol1-event-choice` | `event-choice` | `briefing` | Chọn 1 phương án trong `StarlogModal` (`calibrate-now` hoặc `hold-parts`) | `dispatch({ type: 'event/resolve' })` thành công (`activeEventId === null`) | Nếu command bị từ chối, giữ nguyên bước và hiển thị lý do thân thiện trong live region; nếu `activeEventId` đã `null`, cho bấm **Tiếp**. | `onboarding:test:sol1-event-choice` |
| 4 | `sol1-crew-assignment` | `crew-assignment` | `engineering` | Chuyển sang Pha 2 (nếu cần), mở Crew và giao 1 nhiệm vụ hợp lệ (`crew/assign`) | Có ít nhất 1 phi hành gia `assignedTask !== null` | Nếu vẫn ở `briefing`, hướng dẫn bấm `[data-tour="starlog-confirm"]` / `[data-tour="primary-phase-cta"]` để vào Pha 2; nếu modal Crew chưa mở, highlight `[data-tour="open-crew"]` + `waitForElement`; ở chế độ Replay `sol > 1`, cho xác nhận đọc. | `onboarding:test:sol1-crew-assignment` |
| 5 | `sol1-systems-panel` | `systems-panel` | `engineering` | Mở bảng Hệ thống, xem độ bền 5 module & WRS rồi bấm xác nhận/tiếp tục | `activeModal === 'menu'` đã được mở và người chơi xác nhận tiếp tục | Nếu `menu` chưa mở, highlight `[data-tour="open-systems"]` + `waitForElement`; trên mobile dùng nút Hệ thống ở bottom bar. | `onboarding:test:sol1-systems-panel` |
| 6 | `sol1-open-comms` | `open-comms` | `comms` | Chuyển sang Pha 3 (nếu cần), mở CAPCOM hoặc Rover để kiểm tra tiếp tế 4-Sol & expedition | `activeModal === 'comms' \|\| activeModal === 'expedition'` được mở | Nếu vẫn ở `engineering`, hướng dẫn bấm `[data-tour="primary-phase-cta"]` vào Pha 3; trên mobile highlight nút CAPCOM trong `.hail-action-band`. | `onboarding:test:sol1-open-comms` |
| 7 | `sol1-resource-forecast` | `resource-forecast` | `rationing` | Chuyển sang Pha 4, mở bảng End-Sol và xem dòng Dự báo Cuối Sol | `[data-tour="resource-forecast"]` hiển thị và người chơi bấm xác nhận | Nếu đang ở `comms`, hướng dẫn bấm `[data-tour="primary-phase-cta"]`; nếu `EndOfDayModal` chưa mở, highlight `[data-tour="open-end-sol"]`; trên mobile cuộn tới khối forecast trước khi định vị popover. | `onboarding:test:sol1-resource-forecast` |
| 8 | `sol1-end-sol` | `end-sol` | `rationing` | Bấm cần gạt **Chốt Sol 1** trong `EndOfDayModal` (`sol/end`) | `gameState.clock.phase === 'debrief'` (hoặc `clock.sol > 1`) | Nếu `EndOfDayModal` đóng, highlight `[data-tour="primary-phase-cta"]`; nếu bị chặn bởi domain error, hiện thông báo lỗi thân thiện và giữ nguyên bước. | `onboarding:test:sol1-end-sol` |
| 9 | `sol1-debrief-brief` | `debrief-brief` | `debrief` | Đọc tóm tắt Sol 1 & bản tin NASA Science Brief rồi đóng Debrief (hoặc bấm Hoàn tất) | `gameState.clock.sol >= 2` hoặc người chơi bấm **Hoàn tất** trên popover | Nếu `NightCutsceneModal` đã đóng sang Sol 2 trước khi render step, tự hoàn tất tour an toàn (`sol1GuideStatus = 'completed'`). | `onboarding:test:sol1-debrief-brief` |

### Copy VI/EN chính thức cho từng bước Guided Sol 1 (Đều ≤ 45 từ/ngôn ngữ)

1. **`sol1-open-briefing`**
   - **VI:** *Mở Giao ban Sáng* — Mỗi ngày bắt đầu bằng Giao ban. Hãy bấm nút Giao ban hoặc màn hình Decision để mở bảng Starlog. *(23 từ)*
   - **EN:** *Open Morning Briefing* — Every Sol begins with Briefing. Click the Briefing button or Decision screen to open your Starlog. *(19 từ)*
2. **`sol1-weather-status`**
   - **VI:** *Xem Thời tiết Mặt Trời* — Đây là dữ liệu bão Mặt Trời NASA DONKI hôm nay. Bão mạnh làm sửa máy khó hơn và tăng bức xạ. Bấm Tiếp để xem sự cố. *(29 từ)*
   - **EN:** *Check Solar Weather* — This shows today's NASA DONKI solar weather. Stronger storms lower repair odds and raise radiation. Click Next to check today's alert. *(25 từ)*
3. **`sol1-event-choice`**
   - **VI:** *Xử lý Sự kiện Bắt buộc* — Chỉ huy Ryan cần bạn chọn một phương án bên dưới. Hãy đọc chi phí tài nguyên rồi bấm nút lựa chọn để hoàn tất. *(29 từ)*
   - **EN:** *Resolve Mandatory Event* — Commander Ryan needs your decision below. Check the resource cost, then click one choice button to resolve today's check. *(23 từ)*
4. **`sol1-crew-assignment`**
   - **VI:** *Giao việc Phi hành đoàn* — Mở bảng Crew và giao một việc hợp lệ hôm nay, như Nghỉ ngơi, Trực CAPCOM hoặc Chăm sóc y tế. *(25 từ)*
   - **EN:** *Assign a Crew Task* — Open the Crew panel and assign one valid task today, such as Rest, CAPCOM Duty, or Medical Care. *(23 từ)*
5. **`sol1-systems-panel`**
   - **VI:** *Kiểm tra Hệ thống Trạm* — Mở Hệ thống để xem độ bền 5 máy móc và máy lọc WRS. Hôm nay máy còn 100%, bạn hãy xem kỹ rồi chuyển pha. *(30 từ)*
   - **EN:** *Inspect Station Systems* — Open Systems to check health for all five modules and the WRS recycler. Everything starts at 100% today—review and advance. *(25 từ)*
6. **`sol1-open-comms`**
   - **VI:** *Liên lạc & Thám hiểm Rover* — Mở CAPCOM hoặc Rover. Nhớ rằng tàu hàng mất 4 Sol để tới nơi, còn Rover cần đúng dụng cụ trước khi phóng. *(30 từ)*
   - **EN:** *Comms & Rover Check* — Open CAPCOM or Rover. Remember cargo landers take 4 Sols to arrive, and Rover expeditions need matching gear before launch. *(25 từ)*
7. **`sol1-resource-forecast`**
   - **VI:** *Xem Dự báo Cuối Sol* — Mở bảng End-Sol, kiểm tra khẩu phần MRE, WRS và dòng Dự báo Cuối Sol để chắc chắn Pin, O₂ và Nước an toàn. *(29 từ)*
   - **EN:** *Check End-Sol Forecast* — Open End-Sol and check MRE rations, WRS, and the End-Sol Forecast so Battery, O₂, and Water stay safe overnight. *(25 từ)*
8. **`sol1-end-sol`**
   - **VI:** *Gạt cần Chốt Sol 1* — Mọi thứ đã sẵn sàng! Hãy gạt cần Chốt Sol 1 để kết thúc ngày đầu tiên và xem báo cáo khoa học NASA. *(29 từ)*
   - **EN:** *Pull the End-Sol Lever* — Everything is ready! Pull the End-Sol 1 lever to finish your first day and read your NASA science debrief. *(25 từ)*
9. **`sol1-debrief-brief`**
   - **VI:** *Báo cáo & Khoa học NASA* — Xem lại mức điện, O₂ và nước sau đêm đầu tiên cùng bản tin NASA. Bấm Thức dậy để bước vào Sol 2! *(29 từ)*
   - **EN:** *Debrief & NASA Brief* — Review overnight battery, O₂, and water changes plus today's NASA Science Brief. Click Wake Up to start Sol 2! *(24 từ)*

---

## 5. Contextual Hint Inventory & Rule Chống Spam

### Quy tắc điều phối & Anti-Spam (Bắt buộc cho Phase 2.5)
1. **Tối đa 1 hint hoạt động cùng lúc** (ưu tiên theo `priority` giảm dần).
2. **Không cạnh tranh màn hình quan trọng:** Tuyệt đối ẩn/hoãn mọi hint khi `sol1GuideStatus === 'active'`, đang mở Intro, đang mở `NightCutsceneModal` (`debrief` / `terminal`), hoặc đang có `activeModal === 'starlog'` / `'launch'` / `'tutorial'`.
3. **Cooldown theo Sol:** Sau khi người chơi bấm **Đóng / Dismiss**, cùng một `hintId` **không** hiện lại trong cùng `clock.sol` (trừ trường hợp **Critical Safety Escalation**: chỉ số xấu hơn rõ rệt so với lúc dismiss — ví dụ dự báo chuyển từ "thấp" sang `<= 0` hoặc `blackout === true`, và phải nêu rõ lý do leo thang).
4. **Phân biệt `dismissPolicy`:**
   - `educational-permanent`: Cho phép tùy chọn **"Đừng nhắc lại"** (`dismissedHintIds`), chỉ áp dụng cho hint kiến thức/hướng dẫn.
   - `safety-per-sol`: Chỉ cho tắt trong Sol hiện tại, **không** có "Đừng nhắc lại" vĩnh viễn cho cảnh báo sinh tồn hoặc lỗi domain.
5. **Hint không hành động hộ:** CTA của hint **chỉ** mở panel đích (`openModal(...)`) hoặc focus nút đích; tuyệt đối không dispatch `GameCommand`.
6. **Copy & Visual Budget:** Mỗi hint **≤ 35 từ/ngôn ngữ**, cấu trúc `Vấn đề → Tại sao → CTA`, luôn có **Icon + Label + Giá trị số** (không dùng màu làm tín hiệu duy nhất).

### Bảng 8 Contextual Hints P1

| `hintId` | Priority | Trigger Selector (Pure Read-Only) | Cooldown / `maxShows` | `dismissPolicy` | `ctaTarget` | Copy VI (≤ 35 từ) | Copy EN (≤ 35 từ) |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `hint-end-sol-critical-delta` | 100 | `phase === 'rationing'` && (`forecast.blackout` \|\| `nextOxygen <= 0` \|\| `nextWater <= 0` \|\| `blockingReasons.length > 0`) | 1 Sol / không giới hạn nếu leo thang | `safety-per-sol` | `open-end-sol` | **Nguy cơ cạn kiệt đêm nay:** Dự báo cho thấy thiếu điện hoặc sinh tồn. Mở **End-Sol** để kiểm tra MRE, WRS và ưu tiên điện. | **Tonight's forecast shows danger:** Power blackout or life-support shortage ahead. Open **End-Sol** to check MREs, WRS, and power priority. |
| `hint-critical-forecast` | 90 | `batteryKWh < 14` \|\| `oxygenKg < 18` \|\| `waterL < 22` \|\| `mrePacks < 6` | 1 Sol / tối đa 4 lần/campaign (trừ leo thang) | `safety-per-sol` | `open-comms` hoặc `open-end-sol` | **Cảnh báo {metric} thấp ({value}):** Nguồn dự trữ sắp xuống mức nguy hiểm. Mở **CAPCOM** đặt tiếp tế hoặc **End-Sol** để tiết kiệm. | **Low {metric} alert ({value}):** Reserves are nearing critical levels. Open **CAPCOM** to order supplies or **End-Sol** to conserve. |
| `hint-pending-event-deadline` | 85 | `activeEventView !== null` && (`activeEventView.mandatory` \|\| `activeEventView.deadlineSol - sol <= 1`) | 1 Sol / 1 lần mỗi `eventId` | `safety-per-sol` | `open-briefing` | **Sự kiện sắp hết hạn (Sol {deadline}):** "{title}" cần xử lý trước khi quá hạn để tránh phạt nặng. Mở **Starlog** ngay. | **Event deadline on Sol {deadline}:** "{title}" needs a choice before expiration to avoid penalties. Open **Starlog** now. |
| `hint-sol15-load-shedding` | 80 | `sol === lunarNight.startSol` (15) && `phase !== 'debrief'` && `!dismissed('hint-sol15-load-shedding')` | Vĩnh viễn / `maxShows: 1` | `educational-permanent` | `open-end-sol` | **Đêm Trăng bắt đầu (Solar = 0 kWh):** Trạm chỉ còn lò Fission (+8 kWh). Mở **End-Sol** và giữ **ECLSS** ở ưu tiên điện số 1. | **Lunar Night begins (Solar = 0 kWh):** Only Fission (+8 kWh) remains. Open **End-Sol** and keep **ECLSS** at Power Priority #1. |
| `hint-sol13-14-readiness` | 75 | `(sol === 13 \|\| sol === 14)` && `readiness.unmetCriticalCount > 0` | 1 Sol / `maxShows: 2` | `safety-per-sol` | `open-end-sol` | **Sắp bước vào Đêm Trăng Sol 15:** Pin hoặc nước/O₂ chưa đạt mức an toàn. Mở **End-Sol** xem Checklist Đêm Trăng. | **Sol 15 Lunar Night is near:** Battery, water, or O₂ readiness is incomplete. Open **End-Sol** to review the Night Checklist. |
| `hint-late-cargo-before-night` | 70 | `sol >= recommendedLastCargoSol` (10) && `sol < lunarNight.startSol` (15) && `!activeOrder` && `padCooldownSols === 0` | 2 Sol / `maxShows: 2` | `educational-permanent` | `open-comms` | **Cửa sổ tàu hàng sắp đóng:** Tàu bay mất 4 Sol. Hãy mở **CAPCOM** đặt nước, O₂ hoặc pin trước khi mặt trời lặn. | **Cargo window closing soon:** Landers take 4 Sols to arrive. Open **CAPCOM** to order water, O₂, or battery before sunset. |
| `hint-rover-issue` | 65 | `activeMission?.status === 'signal-lost'` \|\| (`activeMission?.status === 'recovery-pending'` && `sol >= expectedReturnSol`) \|\| (`phase === 'comms'` && `!activeMission` && thiếu đồ cho cửa sổ hiện tại) | 1 Sol / `maxShows: 3` | `safety-per-sol` | `open-rover` | **Rover cần bạn kiểm tra:** Rover đang mất tín hiệu, chờ thu hồi hoặc thiếu trang bị. Mở **Rover** để xử lý kịp thời. | **Rover needs attention:** Signal is lost, recovery is due, or required gear is missing. Open **Rover** to inspect. |
| `hint-idle-crew-engineering` | 50 | `phase === 'engineering'` && `selectAvailableCrew(state).length > 0` && `sol >= 2` | 1 Sol / `maxShows: 3` | `educational-permanent` | `open-crew` | **Còn {count} phi hành gia đang rảnh:** Trước khi rời Pha Kỹ thuật, hãy mở **Crew** để giao sửa máy, nâng cấp hoặc nghỉ ngơi. | **{count} astronauts are still idle:** Before leaving Engineering, open **Crew** to assign repairs, upgrades, or rest. |

---

## 6. Bảng `data-tour` Target Contract (Desktop / Mobile / Modal)

Quy tắc bắt buộc:
- **Không** target bằng Tailwind class, `.hail-*` CSS class hay text đã dịch VI/EN.
- Mọi interactive trigger giữ vùng chạm tối thiểu `44×44 px` trên mobile.
- File `src/onboarding/targets.ts` (Phase 2.1) phải xuất các hằng số selector từ bảng này.

| `data-tour` ID | Vị trí Desktop (`>= 761px`) | Vị trí Mobile (`<= 760px`) / Fallback | Vị trí trong Modal | Ghi chú `waitForElement` & Fallback |
| --- | --- | --- | --- | --- |
| `title-new-mission` | Nút `New Mission` trên Title Screen | Nút `New Mission` trên Title Screen | — | Luôn sẵn sàng ở Title Screen. |
| `title-continue` | Nút `Continue Mission` trên Title Screen | Nút `Continue Mission` trên Title Screen | — | Disabled nếu chưa có save hợp lệ; ẩn/thay bằng Recovery Gate nếu save lỗi. |
| `title-how-to-play` | Nút `How to Play` trên Title Screen | Nút `How to Play` trên Title Screen | — | Mở Tutorial Overview / Replay Intro. |
| `open-briefing` | Màn hình `DECISION` trên `.hail-decision-console` hoặc nút `Giao ban` ở `.hail-action-band` | Nút `Giao ban` ở `.hail-action-band` (hoặc `EventPriorityBanner`) | — | Ưu tiên `[data-tour="open-briefing"]` trên action bar nếu console bị che. |
| `weather-status` | — | — | Khối hiển thị mức NASA DONKI & xác suất sửa ở phần đầu `StarlogModal` | `waitForElement` khi `activeModal === 'starlog'`; fallback `[data-tour="telemetry-donki"]`. |
| `telemetry-donki` | Pill `DONKI: ...` trong `TelemetryTopBar` | Pill `DONKI: ...` trong `TelemetryTopBar` | — | Luôn hiển thị trên HUD cockpit. |
| `event-choice` | — | — | Vùng danh sách lựa chọn / nút vuông xanh-đỏ trong `StarlogModal` | `waitForElement` khi `activeModal === 'starlog'`; đảm bảo scroll vào vùng nhìn thấy trên mobile portrait. |
| `starlog-confirm` | — | — | Nút xanh `[01 · XÁC NHẬN]` trong `StarlogModal` (khi không còn mandatory event) | Dùng cho fallback khi người chơi đã resolve event nhưng chưa sang Pha 2. |
| `open-crew` | Nút `Crew` trong `.hail-action-band` (hoặc ghế phi hành gia trên `.hail-crew-stage`) | Nút `Crew` trong `.hail-action-band` | — | Target ổn định là nút `Crew` ở bottom bar để tránh lệ thuộc ảnh nền cockpit. |
| `crew-assignment` | — | — | Khối nút phân công (`Nghỉ / Trực CAPCOM / Chăm sóc`) trong `CharacterSheetModal` | `waitForElement` khi `activeModal === 'character'`. |
| `open-systems` | Nút `Hệ thống` trong `.hail-action-band` | Nút `Hệ thống` trong `.hail-action-band` | — | Target ổn định trên bottom bar. |
| `systems-panel` | — | — | Danh sách 5 hệ thống & WRS trong `SystemControls` (`activeModal === 'menu'`) | `waitForElement` khi `activeModal === 'menu'`. |
| `open-comms` | Trạm CAPCOM trên cockpit hoặc nút `CAPCOM` ở `.hail-action-band` | Nút `CAPCOM` ở `.hail-action-band` | — | Fallback sang nút `CAPCOM` ở bottom bar trên màn hình hẹp. |
| `open-rover` | Nút `Rover` ở `.hail-action-band` | Nút `Rover` ở `.hail-action-band` | — | Dùng cho CTA của contextual hint Rover. |
| `open-end-sol` | Màn hình `RATIONING / END-SOL` trên console | Nút chính `.is-primary` khi ở pha `rationing` | — | Luôn tồn tại ở bottom-right trong pha `rationing`. |
| `primary-phase-cta` | Nút chính `.is-primary` góc dưới phải `.hail-action-band-right` | Nút chính `.is-primary` góc dưới phải `.hail-action-band-right` | — | Đổi nhãn theo pha (`Xử lý Sự kiện` / `Pha tiếp →` / `End-Sol`). |
| `resource-forecast` | — | — | Dòng `Dự báo Cuối Sol` + `Xu hướng 5 Sol` trong `EndOfDayModal` | `waitForElement` khi `activeModal === 'end'`; auto-scroll vào khung nhìn trên mobile portrait. |
| `end-sol` | — | — | Cần gạt vật lý `Chốt Sol` trong `EndOfDayModal` | `waitForElement` khi `activeModal === 'end'`. |
| `debrief-brief` | — | — | Khối `DynamicSTEMBrief` + nút `Thức dậy vào Sol 2` trong `NightCutsceneModal` | `waitForElement` khi `clock.phase === 'debrief'`. |
| `hud-tutorial-trigger` | Nút `?` trong `.hail-utility-controls` | Nút `?` trong `.hail-utility-controls` (góc dưới phải trên portrait) | — | Mở Overview / Replay Tutorial. |

---

## 7. Playtest Script, Success Metrics & Test Plan (Keyboard / Mobile / Reduced Motion)

### 7.1 Kịch bản Playtest Quan sát (Nhóm tuổi 7–12 & Người chơi mới)
- **Thời lượng mỗi phiên:** 12–15 phút/người (tối thiểu 5 người chưa từng chơi).
- **Thiết lập:** Reset sạch `localStorage`, chọn ngẫu nhiên VI hoặc EN, thiết bị gồm cả Desktop (1280×720+) và Mobile portrait (390×844). Người quan sát **không** nhắc nút nào cần bấm trừ khi người chơi kẹt > 90 giây (ghi nhận làm blocker).
- **5 Nhiệm vụ quan sát:**
  1. Từ Title Screen, bắt đầu chiến dịch mới và xem/tương tác với Intro (ghi nhận có hiểu "vì sao ở đây" và "Sol 15 có gì" không).
  2. Hoàn thành Sol 1 qua Guided Sol 1 đến khi sang Sol 2 (đo thời gian, số lần bấm nhầm, số lần dùng Skip/Back).
  3. Tại Sol 2, tự tìm và mở đúng 5 khu vực theo yêu cầu miệng của người quan sát: **Briefing (Starlog), Crew, Systems, Comms/Rover, End Sol**.
  4. Thử bấm **Skip** ở một lượt chơi khác hoặc **Replay Tutorial** ở Sol 2 để xác nhận không mất trạng thái.
  5. Phỏng vấn nhanh 3 câu: *"Con thấy mục tiêu ở Đêm Trăng Sol 15 là gì?"*, *"Chữ có dài quá không?"*, *"Lúc nào con cảm thấy bị rối?"*

### 7.2 Success Metrics (KPI Khóa Gate)
| Chỉ số | Ngưỡng đạt (Pass) | Cách đo |
| --- | --- | --- |
| Thời gian hiểu bối cảnh & mục tiêu | **< 2 phút** | Từ lúc mở Title đến khi trả lời đúng câu hỏi mục tiêu Sol 15 / 32 Sol |
| Thời gian hoàn thành Guided Sol 1 | **< 8 phút** | Từ `game/start` Sol 1 đến khi sang Sol 2 `briefing` |
| Tỉ lệ nhận diện 5 khu vực sau Sol 1 | **≥ 80%** người chơi chỉ đúng 5/5 nút | Test chỉ định không gợi ý ở đầu Sol 2 |
| Tỉ lệ tự thoát / Skip / Resume không kẹt | **100%** (0 soft-lock) | Thử Skip, đóng modal, reload giữa từng bước |
| Copy budget | **100%** popover ≤ 45 từ (Sol 1) và ≤ 35 từ (Hints) | Kiểm tra tự động bằng test script |

### 7.3 Test Plan bắt buộc cho Keyboard, Mobile & Reduced Motion
1. **Keyboard-only & Focus Contract:**
   - Hoàn thành trọn luồng `Title → Intro → Mission Setup → Guided Sol 1 → Sol 2` chỉ bằng `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`.
   - Kiểm tra không xảy ra xung đột focus trap giữa `Driver.js` popover và `<dialog>` của `MissionDialog` / `NightCutsceneModal` (khi modal mở, focus phải nằm trong modal hoặc popover gắn với modal; đóng tour/modal phải trả focus về trigger hợp lệ).
   - `Escape` trên action step không được tự đánh dấu hoàn thành bước; chỉ đóng/tạm dừng an toàn hoặc hỏi xác nhận thoát tour.
   - Live region (`aria-live="polite"`) thông báo tên bước mới, hoàn thành bước, hoặc lý do khi command bị domain từ chối.
2. **Mobile (`390×844` portrait & `760×390` landscape):**
   - Tất cả nút trong Intro, Title, Popover (`Next/Back/Skip`) và CTA đích đều đạt tối thiểu `44×44 px`, không bị tràn ngang, không bị `.hail-utility-controls` hay `.hail-event-priority` che khuất.
   - Popover ở các bước trong modal (`Starlog`, `Character`, `SystemControls`, `EndOfDay`) phải tự động scroll target vào khung nhìn và đặt cạnh hợp lý (`side: 'top' | 'bottom'`), **không** che nút xác nhận chính hoặc cảnh báo đỏ.
3. **Reduced Motion (`uiStore.reducedMotion === true` & OS `prefers-reduced-motion: reduce`):**
   - Intro tắt hoàn toàn typewriter chạy chữ, parallax và nhấp nháy; chuyển cảnh bằng cut/fade ≤ 150ms.
   - Tour Driver.js tắt `animate` (nhảy tiêu điểm tức thì, không trượt mượt gây chóng mặt).
   - `AmbientCanvasLayer` và các pulse highlight tôn trọng `reducedMotion`, chỉ dùng viền tĩnh tương phản cao + icon/nhãn.

---

## 8. Machine-Readable Contract Snapshot (Single Source of Truth cho Phase 2.1–2.6)

Khối JSON dưới đây được kiểm tra tự động bởi `tests/phase-2-0-ux-contract.test.mjs` để khóa cứng ngân sách chữ, thời lượng intro, danh sách `data-tour` và `stepId`.

```json
{
  "contractVersion": "2.0.0",
  "tourVersion": "moon-sol1-v1",
  "copyLimits": {
    "guidedPopoverMaxWords": 45,
    "contextualHintMaxWords": 35
  },
  "intro": {
    "minDurationSec": 60,
    "maxDurationSec": 90,
    "minScenes": 5,
    "maxScenes": 7,
    "autoplayAudioBeforeGesture": false,
    "containsGameplayActions": false,
    "handoffTarget": "mission-setup",
    "scenes": [
      {
        "id": "intro-outpost-2050",
        "durationSec": 12,
        "idea": "Year 2050 Lunar South Pole outpost",
        "vi": "Năm 2050: Trạm Artemis. Chào mừng tới căn cứ Nam Cực Mặt Trăng. Nắng chỉ chạm nhẹ vành miệng hố, xung quanh là bóng tối lạnh giá.",
        "en": "Year 2050: Artemis Base. Welcome to our outpost at the Lunar South Pole. Sunlight barely grazes the crater rims while freezing shadows wait nearby."
      },
      {
        "id": "intro-crew-habitat",
        "durationSec": 12,
        "idea": "Four astronauts in closed-loop habitat",
        "vi": "Bốn người, một mái nhà. Ryan, Mizuki, Trọng và Dmitri sống chung trong khoang kín. Mỗi hơi thở và giọt nước đều cần được giữ gìn.",
        "en": "Four Astronauts, One Home. Ryan, Mizuki, Trọng, and Dmitri share one sealed habitat. Every breath of air and drop of water must be protected."
      },
      {
        "id": "intro-finite-resources",
        "durationSec": 12,
        "idea": "Finite O2, water, food, and battery power",
        "vi": "Tài nguyên có giới hạn. Oxy, nước sạch, đồ ăn MRE và pin đều có thể cạn. Máy lọc WRS và xưởng in 3D giúp trạm tự chủ lâu hơn.",
        "en": "Finite Daily Supplies. Oxygen, clean water, MRE packs, and battery power can all run out. Your WRS recycler and 3D Fabricator keep the base running."
      },
      {
        "id": "intro-rover-science",
        "durationSec": 12,
        "idea": "Rover surveys crater, regolith field, and PSR",
        "vi": "Rover thám hiểm Nam Cực. Cử Rover vượt miệng hố, đồng bằng bụi và vùng tối PSR để tìm băng nước cổ đại và gửi dữ liệu về Trái Đất.",
        "en": "Rover Polar Expeditions. Send your Rover across craters, dusty regolith fields, and shadowed PSRs to hunt ancient water ice and collect science data."
      },
      {
        "id": "intro-lunar-night",
        "durationSec": 14,
        "idea": "Lunar Night begins at Sol 15 with 0 solar",
        "vi": "Đêm Mặt Trăng từ Sol 15. Mặt Trời lặn suốt 14 ngày! Pin mặt trời tạo 0 kWh. Cả trạm phải sống nhờ lò Fission và pin tích trữ.",
        "en": "Lunar Night at Sol 15. The Sun sets for 14 full Sols! Solar panels make 0 kWh. Your crew relies on the Fission reactor and stored batteries."
      },
      {
        "id": "intro-take-command",
        "durationSec": 13,
        "idea": "Player takes command for 32-Sol survey campaign (not rescue)",
        "vi": "Đến lượt bạn chỉ huy! Hãy dẫn dắt trạm Artemis suốt 32 Sol, vượt bão Mặt Trời và đưa cả đội an toàn đón bình minh Sol 29.",
        "en": "Your Turn to Command! Lead Artemis Base through 32 Sols, handle solar storms, and bring the entire crew safely to the Sol 29 sunrise."
      }
    ]
  },
  "guidedSol1Steps": [
    {
      "stepId": "sol1-open-briefing",
      "target": "open-briefing",
      "phase": "briefing",
      "decorationOnly": false,
      "expectedAction": "Open Starlog modal via Briefing button or Decision console screen",
      "completionCondition": "uiStore.activeModal === 'starlog'",
      "fallback": "If Starlog already open, advance to sol1-weather-status; on mobile target bottom bar open-briefing.",
      "testEvent": "onboarding:test:sol1-open-briefing",
      "title": { "vi": "Mở Giao ban Sáng", "en": "Open Morning Briefing" },
      "body": {
        "vi": "Mỗi ngày bắt đầu bằng Giao ban. Hãy bấm nút Giao ban hoặc màn hình Decision để mở bảng Starlog.",
        "en": "Every Sol begins with Briefing. Click the Briefing button or Decision screen to open your Starlog."
      }
    },
    {
      "stepId": "sol1-weather-status",
      "target": "weather-status",
      "phase": "briefing",
      "decorationOnly": false,
      "expectedAction": "Read DONKI space weather status and confirm Continue",
      "completionCondition": "User clicks Next on popover",
      "fallback": "If Starlog closed, focus open-briefing; if DONKI block missing, fallback to telemetry-donki.",
      "testEvent": "onboarding:test:sol1-weather-status",
      "title": { "vi": "Xem Thời tiết Mặt Trời", "en": "Check Solar Weather" },
      "body": {
        "vi": "Đây là dữ liệu bão Mặt Trời NASA DONKI hôm nay. Bão mạnh làm sửa máy khó hơn và tăng bức xạ. Bấm Tiếp để xem sự cố.",
        "en": "This shows today's NASA DONKI solar weather. Stronger storms lower repair odds and raise radiation. Click Next to check today's alert."
      }
    },
    {
      "stepId": "sol1-event-choice",
      "target": "event-choice",
      "phase": "briefing",
      "decorationOnly": false,
      "expectedAction": "Select one response to sol1-arrival-check",
      "completionCondition": "Domain event/resolve succeeds and activeEventId === null",
      "fallback": "If command rejected, remain on step and announce reason; if already resolved, allow Next.",
      "testEvent": "onboarding:test:sol1-event-choice",
      "title": { "vi": "Xử lý Sự kiện Bắt buộc", "en": "Resolve Mandatory Event" },
      "body": {
        "vi": "Chỉ huy Ryan cần bạn chọn một phương án bên dưới. Hãy đọc chi phí tài nguyên rồi bấm nút lựa chọn để hoàn tất.",
        "en": "Commander Ryan needs your decision below. Check the resource cost, then click one choice button to resolve today's check."
      }
    },
    {
      "stepId": "sol1-crew-assignment",
      "target": "crew-assignment",
      "phase": "engineering",
      "decorationOnly": false,
      "expectedAction": "Open Crew panel and assign a valid task (crew/assign)",
      "completionCondition": "At least one crew member has assignedTask !== null",
      "fallback": "If still in briefing, point to starlog-confirm or primary-phase-cta; if modal closed, point to open-crew with waitForElement; in replay sol > 1 allow confirm.",
      "testEvent": "onboarding:test:sol1-crew-assignment",
      "title": { "vi": "Giao việc Phi hành đoàn", "en": "Assign a Crew Task" },
      "body": {
        "vi": "Mở bảng Crew và giao một việc hợp lệ hôm nay, như Nghỉ ngơi, Trực CAPCOM hoặc Chăm sóc y tế.",
        "en": "Open the Crew panel and assign one valid task today, such as Rest, CAPCOM Duty, or Medical Care."
      }
    },
    {
      "stepId": "sol1-systems-panel",
      "target": "systems-panel",
      "phase": "engineering",
      "decorationOnly": false,
      "expectedAction": "Open Systems panel, inspect module health and WRS, and confirm",
      "completionCondition": "Systems modal opened and user confirms",
      "fallback": "If menu modal closed, highlight open-systems with waitForElement; on mobile target bottom bar open-systems.",
      "testEvent": "onboarding:test:sol1-systems-panel",
      "title": { "vi": "Kiểm tra Hệ thống Trạm", "en": "Inspect Station Systems" },
      "body": {
        "vi": "Mở Hệ thống để xem độ bền 5 máy móc và máy lọc WRS. Hôm nay máy còn 100%, bạn hãy xem kỹ rồi chuyển pha.",
        "en": "Open Systems to check health for all five modules and the WRS recycler. Everything starts at 100% today—review and advance."
      }
    },
    {
      "stepId": "sol1-open-comms",
      "target": "open-comms",
      "phase": "comms",
      "decorationOnly": false,
      "expectedAction": "Open Comms/Logistics or Rover Expedition panel",
      "completionCondition": "activeModal === 'comms' || activeModal === 'expedition'",
      "fallback": "If still in engineering, point to primary-phase-cta; on mobile target bottom bar open-comms.",
      "testEvent": "onboarding:test:sol1-open-comms",
      "title": { "vi": "Liên lạc & Thám hiểm Rover", "en": "Comms & Rover Check" },
      "body": {
        "vi": "Mở CAPCOM hoặc Rover. Nhớ rằng tàu hàng mất 4 Sol để tới nơi, còn Rover cần đúng dụng cụ trước khi phóng.",
        "en": "Open CAPCOM or Rover. Remember cargo landers take 4 Sols to arrive, and Rover expeditions need matching gear before launch."
      }
    },
    {
      "stepId": "sol1-resource-forecast",
      "target": "resource-forecast",
      "phase": "rationing",
      "decorationOnly": false,
      "expectedAction": "Open End-Sol Allocation modal, inspect forecast, and confirm",
      "completionCondition": "EndOfDayModal resource-forecast viewed and user confirms",
      "fallback": "If still in comms, point to primary-phase-cta; if modal closed, point to open-end-sol; on mobile scroll forecast into view.",
      "testEvent": "onboarding:test:sol1-resource-forecast",
      "title": { "vi": "Xem Dự báo Cuối Sol", "en": "Check End-Sol Forecast" },
      "body": {
        "vi": "Mở bảng End-Sol, kiểm tra khẩu phần MRE, WRS và dòng Dự báo Cuối Sol để chắc chắn Pin, O₂ và Nước an toàn.",
        "en": "Open End-Sol and check MRE rations, WRS, and the End-Sol Forecast so Battery, O₂, and Water stay safe overnight."
      }
    },
    {
      "stepId": "sol1-end-sol",
      "target": "end-sol",
      "phase": "rationing",
      "decorationOnly": false,
      "expectedAction": "Pull the End-Sol lever to dispatch sol/end",
      "completionCondition": "gameState.clock.phase === 'debrief' || gameState.clock.sol > 1",
      "fallback": "If EndOfDayModal closed in rationing, point to primary-phase-cta; if blocked by domain rule, show friendly error and hold step.",
      "testEvent": "onboarding:test:sol1-end-sol",
      "title": { "vi": "Gạt cần Chốt Sol 1", "en": "Pull the End-Sol Lever" },
      "body": {
        "vi": "Mọi thứ đã sẵn sàng! Hãy gạt cần Chốt Sol 1 để kết thúc ngày đầu tiên và xem báo cáo khoa học NASA.",
        "en": "Everything is ready! Pull the End-Sol 1 lever to finish your first day and read your NASA science debrief."
      }
    },
    {
      "stepId": "sol1-debrief-brief",
      "target": "debrief-brief",
      "phase": "debrief",
      "decorationOnly": false,
      "expectedAction": "Read Sol 1 Debrief and NASA Science Brief, then wake up to Sol 2",
      "completionCondition": "debrief/dismiss dispatched (sol >= 2) or user clicks Finish",
      "fallback": "If debrief already dismissed, complete tour safely without modal error.",
      "testEvent": "onboarding:test:sol1-debrief-brief",
      "title": { "vi": "Báo cáo & Khoa học NASA", "en": "Debrief & NASA Brief" },
      "body": {
        "vi": "Xem lại mức điện, O₂ và nước sau đêm đầu tiên cùng bản tin NASA. Bấm Thức dậy để bước vào Sol 2!",
        "en": "Review overnight battery, O₂, and water changes plus today's NASA Science Brief. Click Wake Up to start Sol 2!"
      }
    }
  ],
  "contextualHints": [
    {
      "id": "hint-end-sol-critical-delta",
      "priority": 100,
      "cooldownSols": 1,
      "maxShows": null,
      "dismissPolicy": "safety-per-sol",
      "ctaTarget": "open-end-sol",
      "vi": "Nguy cơ cạn kiệt đêm nay: Dự báo cho thấy thiếu điện hoặc sinh tồn. Mở End-Sol để kiểm tra MRE, WRS và ưu tiên điện.",
      "en": "Tonight's forecast shows danger: Power blackout or life-support shortage ahead. Open End-Sol to check MREs, WRS, and power priority."
    },
    {
      "id": "hint-critical-forecast",
      "priority": 90,
      "cooldownSols": 1,
      "maxShows": 4,
      "dismissPolicy": "safety-per-sol",
      "ctaTarget": "open-comms",
      "vi": "Cảnh báo {metric} thấp ({value}): Nguồn dự trữ sắp xuống mức nguy hiểm. Mở CAPCOM đặt tiếp tế hoặc End-Sol để tiết kiệm.",
      "en": "Low {metric} alert ({value}): Reserves are nearing critical levels. Open CAPCOM to order supplies or End-Sol to conserve."
    },
    {
      "id": "hint-pending-event-deadline",
      "priority": 85,
      "cooldownSols": 1,
      "maxShows": null,
      "dismissPolicy": "safety-per-sol",
      "ctaTarget": "open-briefing",
      "vi": "Sự kiện sắp hết hạn (Sol {deadline}): {title} cần xử lý trước khi quá hạn để tránh phạt nặng. Mở Starlog ngay.",
      "en": "Event deadline on Sol {deadline}: {title} needs a choice before expiration to avoid penalties. Open Starlog now."
    },
    {
      "id": "hint-sol15-load-shedding",
      "priority": 80,
      "cooldownSols": 99,
      "maxShows": 1,
      "dismissPolicy": "educational-permanent",
      "ctaTarget": "open-end-sol",
      "vi": "Đêm Trăng bắt đầu (Solar = 0 kWh): Trạm chỉ còn lò Fission (+8 kWh). Mở End-Sol và giữ ECLSS ở ưu tiên điện số 1.",
      "en": "Lunar Night begins (Solar = 0 kWh): Only Fission (+8 kWh) remains. Open End-Sol and keep ECLSS at Power Priority #1."
    },
    {
      "id": "hint-sol13-14-readiness",
      "priority": 75,
      "cooldownSols": 1,
      "maxShows": 2,
      "dismissPolicy": "safety-per-sol",
      "ctaTarget": "open-end-sol",
      "vi": "Sắp bước vào Đêm Trăng Sol 15: Pin hoặc nước/O₂ chưa đạt mức an toàn. Mở End-Sol xem Checklist Đêm Trăng.",
      "en": "Sol 15 Lunar Night is near: Battery, water, or O₂ readiness is incomplete. Open End-Sol to review the Night Checklist."
    },
    {
      "id": "hint-late-cargo-before-night",
      "priority": 70,
      "cooldownSols": 2,
      "maxShows": 2,
      "dismissPolicy": "educational-permanent",
      "ctaTarget": "open-comms",
      "vi": "Cửa sổ tàu hàng sắp đóng: Tàu bay mất 4 Sol. Hãy mở CAPCOM đặt nước, O₂ hoặc pin trước khi mặt trời lặn.",
      "en": "Cargo window closing soon: Landers take 4 Sols to arrive. Open CAPCOM to order water, O₂, or battery before sunset."
    },
    {
      "id": "hint-rover-issue",
      "priority": 65,
      "cooldownSols": 1,
      "maxShows": 3,
      "dismissPolicy": "safety-per-sol",
      "ctaTarget": "open-rover",
      "vi": "Rover cần bạn kiểm tra: Rover đang mất tín hiệu, chờ thu hồi hoặc thiếu trang bị. Mở Rover để xử lý kịp thời.",
      "en": "Rover needs attention: Signal is lost, recovery is due, or required gear is missing. Open Rover to inspect."
    },
    {
      "id": "hint-idle-crew-engineering",
      "priority": 50,
      "cooldownSols": 1,
      "maxShows": 3,
      "dismissPolicy": "educational-permanent",
      "ctaTarget": "open-crew",
      "vi": "Còn {count} phi hành gia đang rảnh: Trước khi rời Pha Kỹ thuật, hãy mở Crew để giao sửa máy, nâng cấp hoặc nghỉ ngơi.",
      "en": "{count} astronauts are still idle: Before leaving Engineering, open Crew to assign repairs, upgrades, or rest."
    }
  ],
  "dataTourTargets": [
    "title-new-mission",
    "title-continue",
    "title-how-to-play",
    "open-briefing",
    "weather-status",
    "telemetry-donki",
    "event-choice",
    "starlog-confirm",
    "open-crew",
    "crew-assignment",
    "open-systems",
    "systems-panel",
    "open-comms",
    "open-rover",
    "open-end-sol",
    "primary-phase-cta",
    "resource-forecast",
    "end-sol",
    "debrief-brief",
    "hud-tutorial-trigger"
  ]
}
```
