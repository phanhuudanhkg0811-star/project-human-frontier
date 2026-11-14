# PHASE 1 — Kế hoạch chia việc cho team

> [!IMPORTANT]
> **CẬP NHẬT PHÂN CÔNG & SCOPE (14/11/2026 — Option B):** Giữ nguyên khung phối hợp 6 lane bên dưới, nhưng áp dụng các điểm chốt mới từ [`HUMAN_FRONTIER_2050_GAME_SETUP.md`](../../game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md) & [`PHASE_1_SYNC_HANDOFF_FOR_TEAM.md`](PHASE_1_SYNC_HANDOFF_FOR_TEAM.md):
> - **Core & UI:** `3D Fabricator` (máy tự chạy `0` Crew slot, tối đa `1` lệnh/Sol) và `Wall-Rack Cockpit` (`UL Food`, `LL Fabricator`, `UR CAPCOM`, `LR Inventory`, `Center Telemetry Console`) được nâng thành **P0**.
> - **Visual/Asset:** Lead/User trực tiếp sinh bộ asset Wall-Rack & 6 Equipment theo AeroMatte 2050 — team Visual/UI chỉ tích hợp asset được bàn giao & hoàn thiện Console/Window.
> - **QA/Release:** Chuyển sang bộ kiểm thử thực tế nhẹ hơn (`~100` seed smoke, `4–5` E2E cốt lõi, `< 2.5 MB` bundle).

> **Mục tiêu:** tổ chức triển khai Moon Survival 32 Sol theo PHASE 1.1–1.6, cho phép làm song song nhưng giữ một nguồn state/contract duy nhất.

## 1. Các lane trách nhiệm

| Lane | Owner đề xuất | Sở hữu chính |
| --- | --- | --- |
| Product/Game Design | Nhóm trưởng | Scope, GDD, acceptance, event tree, balance approval |
| Core/Simulation | Web Developer A | Types, TS orchestrator, Pure TS deterministic resolver, DONKI probability model, replay |
| UI/Integration | Web Developer B | Zustand adapter, cockpit, feature panels, i18n, accessibility |
| Visual/Audio | Artist/Visual Lead | V12 assets, illustration, animation spec, audio/Web Audio direction |
| Content/STEM | Content/Game Designer | Event JSON, VI/EN copy, NASA source, dynamic brief mapping |
| QA/Release | QA hoặc thành viên luân phiên | Schema/test/E2E, CI, performance, release evidence |

Nếu team ít người, một người có thể giữ nhiều lane nhưng ownership file vẫn không đổi.

## 2. Quy tắc file ownership

| Khu vực | Owner | Reviewer bắt buộc |
| --- | --- | --- |
| `src/types`, `src/domain`, `src/schemas` | Core | Product + QA |
| `src/data`, schema, simulation catalog | Content | Core + QA |
| `src/store`, persistence | UI/Integration | Core + QA |
| `src/components`, styles | UI/Integration | Visual + QA |
| `public/assets` | Visual | UI |
| `tests`, CI | QA | Owner feature tương ứng |

Shared contract không sửa trực tiếp trong PR UI/content lớn. Tách thành contract PR nhỏ trước.

## 3. Dependency tổng

```text
1.1 State/contract/save
       ↓
1.2 Crew/rover/inventory ─────┐
       ↓                      │
1.3 Event tree + Lunar Night │
       ↓                      │
1.4 Full campaign/balance     │
       ↓                      │
1.5 V12/polish/i18n  ◀────────┘ Visual có thể sản xuất sớm
       ↓
1.6 E2E/performance/release
```

## 4. Giao việc PHASE 1.1

- Product: khóa `moon-32`, milestone 12/15/29/32 và difficulty profiles.
- Core: `GameState`, commands/results/errors, Pure TS deterministic resolver, DONKI space weather probability functions, selectors và preview qua cùng resolver.
- UI: `GamePort`, Zustand facade, UI store và dev panel.
- Content: balance/initial state/static DONKI & Diviner catalog, content/model/catalog version và provenance.
- QA: CI, invariant, JSON schema validation, corrupted save recovery, save/reload/migration, deterministic seed replay.
- Visual: V12 asset inventory và production schedule.

**Merge gate:** chơi hết một Sol, reload được, target/env lấy từ config.

## 5. Giao việc PHASE 1.2

- Product: task catalog và ba Moon rover site.
- Core: crew assignment, medical, inventory, rover lifecycle/reservation.
- UI: crew board, rover planner, V12 rack bindings bằng mock port.
- Content: expedition/equipment/reward JSON.
- QA: lifecycle/save/replay/conflict tests.
- Visual: rover, site, medkit/MRE/sample/drill assets.

**Merge gate:** chạy được ba Moon mission, inventory/rack và save/replay.

## 6. Giao việc PHASE 1.3

- Product: duyệt decision tree và milestone schedule.
- Core: flags, conditions/effects, deadline, event chain, atomic effects.
- Content: 18–24 event VI/EN và NASA mappings.
- UI: Starlog, cost preview, deadline, dynamic brief context.
- QA: schema/reference/event explorer và golden Sol 7.
- Visual: event banners/overlays theo priority.

**Merge gate:** golden Sol 7 đạt; event Moon 1–32 reachable và replay deterministic.

## 7. Giao việc PHASE 1.4

- Product: Lunar Night/victory/rank requirement, scoring và balance sign-off.
- Core: day/night windows, load shedding và terminal evaluator.
- Content: difficulty/balance profiles và Report Card rubric.
- UI: mission progression, Lunar Night forecast, victory/game over/report card.
- QA: policy bots, 10k simulation, full campaign traces.
- Visual: sunset/night/sunrise/victory/defeat key art.

**Merge gate:** có full trace Moon 32 victory qua Lunar Night và các defeat trace.

## 8. Giao việc PHASE 1.5

- Visual: bàn giao V12 6 module + 2 rack, Moon day/night window, character/event art.
- UI: tích hợp tọa độ V12, responsive, Canvas, Web Audio và VI/EN.
- Content: tutorial, dynamic STEM brief, translation QA.
- Core: chỉ hỗ trợ selector/effect còn thiếu; không đổi balance đã freeze.
- QA: visual regression, tutorial, asset/license/audio cleanup.
- Product: playtest và duyệt educational clarity.

**Merge gate:** full campaign chơi được không cần debug UI, VI/EN đều hoàn chỉnh.

## 9. Giao việc PHASE 1.6

- QA dẫn release: E2E matrix, accessibility, browser, save migration.
- UI: fix accessibility/performance/layout blocker.
- Core: fix deterministic/save/engine blocker có regression test.
- Visual: asset optimization/license/credits.
- Content: final proofreading VI/EN và NASA citations.
- Product: release candidate sign-off, pitch/video/demo flow.

**Merge gate:** production deploy, smoke/rollback đạt và evidence package hoàn chỉnh.

## 10. Nhịp làm việc

- Contract sync ngắn đầu mỗi phase.
- Mỗi task có owner, reviewer, acceptance và fixture/screenshot nếu phù hợp.
- Merge nhỏ theo dependency; không giữ một branch feature nhiều tuần.
- UI dùng mock port/data sau contract freeze; không chờ engine để dựng presentation.
- Visual dùng asset manifest; UI không tự đổi tên/cắt asset ngoài contract.
- QA viết acceptance test song song, không đợi feature “xong”.

## 11. Board đề xuất

```text
Backlog → Contract Ready → In Progress → Review
→ Integrated → QA Gate → Product Accepted → Done
```

Một task chỉ vào `Done` khi code/content/asset, test và docs cùng hoàn tất.

## 12. RACI cho quyết định lớn

| Quyết định | A | R | C | I |
| --- | --- | --- | --- | --- |
| Scope/campaign | Nhóm trưởng | Product | Core/UI/Content | Cả team |
| State/command contract | Core Lead | Core | UI/QA | Product |
| Balance | Product | Content/Core | QA | UI/Visual |
| V12 visual | Visual Lead | Visual | UI/Product | QA |
| Release gate | Nhóm trưởng | QA | Mọi lane | Cả team |

`A`: chịu trách nhiệm cuối; `R`: thực hiện; `C`: tham vấn; `I`: được thông báo.

## 13. Definition of Done cấp team

- Không task mồ côi owner/reviewer.
- Không duplicate formula giữa engine và UI.
- Content/schema/reference đều validate.
- Asset có manifest/license và fallback.
- Mỗi phase đạt merge gate trước khi phase sau dùng contract đó.
- Full Moon 32 campaign deterministic, save/reload được và có E2E.
- VI/EN, accessibility, performance và release evidence đạt yêu cầu nhóm trưởng.
