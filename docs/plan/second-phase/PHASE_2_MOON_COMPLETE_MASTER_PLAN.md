# PHASE 2 — Moon Complete master plan

> **Quyết định roadmap ngày 14/11/2026:** PHASE 2 hoàn thiện trải nghiệm Moon Survival đã có engine/gameplay từ PHASE 1. Mars vẫn là campaign độc lập nhưng được dời sang PHASE 3. Advanced Moon → Mars được dời sang PHASE 4.

## 1. Mục tiêu

Biến Moon Survival 32 Sol từ một campaign đầy đủ luật thành sản phẩm có hành trình người chơi hoàn chỉnh: vào game rõ ràng, hiểu bối cảnh, học bằng thao tác thật, cảm nhận được các mốc kịch tính và kết thúc với phản hồi hữu ích.

PHASE 2 không viết lại deterministic engine, balance nền hoặc save campaign. Trọng tâm là onboarding, narrative presentation, contextual guidance, accessibility và kiểm thử hành trình người mới.

## 2. Player journey chuẩn

```text
Boot / Save Recovery
        ↓
Title Screen ──→ Continue Mission
        ↓
Intro 60–90 giây (Skip / Replay)
        ↓
Mission Setup
        ↓
Guided Sol 1 bằng thao tác thật
        ↓
Sol 2–14: tự chơi + contextual hints
        ↓
Sol 7 crisis → Lunar Night transition
        ↓
Sol 15–28 survival
        ↓
Sol 29 sunrise / recovery
        ↓
Victory hoặc Defeat → Report Card → Replay
```

Intro trả lời “Vì sao tôi ở đây?”. Guided Sol 1 trả lời “Tôi phải làm gì?”. Contextual hints chỉ xuất hiện khi người chơi thật sự cần trợ giúp.

## 3. Các phase con

| Phase | Tài liệu | Outcome |
| --- | --- | --- |
| 2.0 | [UX Lock](PHASE_2_0_UX_LOCK_PLAN.md) | Khóa journey, script, event map và acceptance test |
| 2.1 | [Onboarding Foundation](PHASE_2_1_ONBOARDING_FOUNDATION_PLAN.md) | State/version, Driver.js adapter và selector contract |
| 2.2 | [Title & Intro](PHASE_2_2_TITLE_INTRO_PLAN.md) | Title screen, prologue, mission handoff |
| 2.3 | [Guided Sol 1](PHASE_2_3_GUIDED_SOL1_PLAN.md) | Tutorial bằng hành động xuyên các modal |
| 2.4 | [Moon Narrative](PHASE_2_4_MOON_NARRATIVE_PLAN.md) | Sol 7, Lunar Night, sunrise và ending có presentation riêng |
| 2.5 | [Contextual Hints](PHASE_2_5_CONTEXTUAL_HINTS_PLAN.md) | Trợ giúp theo state, không cầm tay liên tục |
| 2.6 | [Hardening](PHASE_2_6_HARDENING_PLAN.md) | A11y, responsive, persistence, E2E và release gate |

Thứ tự dependency: `2.0 → 2.1 → (2.2 + 2.4) → 2.3 → 2.5 → 2.6`. Phase 2.2 và 2.4 có thể sản xuất nội dung/asset song song sau khi 2.0 freeze.

## 4. Phạm vi P0/P1/P2

### P0 — Bắt buộc

- Title screen: New Mission, Continue, How to Play, Settings, Credits.
- Intro VI/EN, tối đa 90 giây, có Skip/Replay/reduced-motion.
- Guided Sol 1 dùng thao tác gameplay thật; không tự dispatch command thay người chơi.
- Onboarding progress có version, resume và reset.
- Sol 7, Lunar Night, sunrise, victory/defeat có presentation phân biệt.
- Keyboard/focus, save/reload và E2E critical journey.

### P1 — Nên có

- Contextual hint cho resource, cargo, assignment, rover và event deadline.
- CTA mở đúng panel và giải thích disabled reason.
- Report Card đưa ra 2–3 gợi ý dựa trên run vừa kết thúc.
- Playtest có quan sát với người chưa biết game.

### P2 — Hoãn trước nếu thiếu thời gian

- Voice-over đầy đủ.
- Cinematic dài hoặc video prerender nặng.
- Hint AI/tự sinh.
- Account, cloud save, analytics cá nhân.
- Bất kỳ gameplay Mars nào.

## 5. Nguyên tắc kỹ thuật

- Onboarding là UI/persistence state, không tham gia resolver hoặc replay hash.
- Dùng `data-tour` ổn định; không target bằng class trình bày hoặc text VI/EN.
- Persist `stepId`, không persist index.
- Mỗi tour có `tourVersion`; update breaking phải có migration hoặc restart rõ ràng.
- Driver.js nằm sau một adapter nội bộ để component không phụ thuộc trực tiếp vào thư viện.
- Tour cleanup khi unmount, đổi campaign, terminal state hoặc mở flow không tương thích.
- Không chèn luật gameplay vào intro, hint hoặc component.

## 6. KPI và acceptance

- Người mới hiểu bối cảnh/mục tiêu trong dưới 2 phút.
- Người mới hoàn thành Sol 1 trong dưới 8 phút mà không cần tài liệu ngoài game.
- Sau Sol 1, người chơi xác định được Briefing, Crew, Systems, Comms/Rover và End Sol.
- 100% người chơi có thể Skip, Replay hoặc Resume tutorial mà không kẹt campaign.
- Reload ở mọi bước onboarding không duplicate command hoặc làm sai phase.
- Critical journey chạy được bằng keyboard ở VI và EN.
- Reduced motion không còn typewriter/parallax/pulse bắt buộc.
- Không có console error, missing target, focus leak hoặc overlay mắc kẹt.

## 7. Release gates

1. **Gate UX:** script, journey, copy budget và target map được freeze.
2. **Gate Foundation:** onboarding state, migration, adapter và fixture test đạt.
3. **Gate Guided Sol:** hoàn thành Sol 1 bằng click lẫn keyboard; skip/resume đạt.
4. **Gate Narrative:** các mốc Moon hiển thị đúng một lần và theo campaign state.
5. **Gate Reliability:** save/reload, mobile, reduced motion, VI/EN và E2E đạt.

## 8. Definition of Done

- [ ] Toàn bộ P0 hoàn tất.
- [ ] Không còn vào thẳng cockpit ở first launch nếu chưa có lựa chọn của người chơi.
- [ ] Intro và tutorial là hai flow độc lập, có thể replay riêng.
- [ ] Guided Sol 1 dạy qua hành động thật và không thay đổi deterministic outcome ngoài command của người chơi.
- [ ] Mọi target động có wait/fallback; không hiện popover vô nghĩa giữa màn hình.
- [ ] Sol 7, Lunar Night, sunrise và terminal outcome có narrative presentation riêng.
- [ ] Onboarding state có version/migration và không làm hỏng save PHASE 1.
- [ ] A11y, responsive, persistence và E2E gates đạt ở VI/EN.
- [ ] Docs, README và roadmap khớp release.

## 9. Ngoài phạm vi

- Mars Survival, MOXIE, Mars dust storm và radio latency 14 phút.
- Hohmann transfer và carry-over Moon → Mars.
- Thay đổi balance Moon nếu playtest không chứng minh được blocker cụ thể.

**Mốc kết thúc:** Moon Survival có thể được đưa cho một người chơi mới và tự giải thích, tự dẫn dắt, tự kết thúc như một game hoàn chỉnh.
