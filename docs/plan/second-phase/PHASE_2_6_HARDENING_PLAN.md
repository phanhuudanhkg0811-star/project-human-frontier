# PHASE 2.6 — Accessibility, persistence, E2E và Moon Complete release

> **Mục tiêu:** chứng minh onboarding và narrative hoạt động ổn định trên critical journeys, không chỉ ở happy-path demo.

## Test matrix

### Critical journeys

1. First launch → Intro complete → New Mission → Guided Sol 1 → Debrief.
2. First launch → Skip Intro → Skip tutorial → chơi Sol 1 thủ công.
3. Continue save hiện có từ PHASE 1 mà không bị ép xem intro/tutorial.
4. Reload ở từng bước Guided Sol 1 và từng milestone presentation.
5. Corrupt onboarding prefs nhưng campaign save hợp lệ.
6. Sol 7 cả hai nhánh.
7. Sol 14→15, Sol 28→29, victory và defeat.
8. Replay intro/tutorial sau khi đã hoàn thành.

### Matrix

- VI/EN.
- Desktop 16:9 và mobile tab layout.
- Pointer và keyboard-only.
- Normal motion và reduced motion.
- New save, migrated save và corrupt UI prefs.

## Accessibility gates

- Focus trap/restore không xung đột giữa Driver.js và `MissionDialog`.
- Escape/Close có hành vi nhất quán; action step không thể vô tình bị advance.
- Screen reader đọc title, instruction, progress và action result.
- Target 44×44, contrast critical UI đạt WCAG AA.
- Không dùng animation, màu hoặc âm thanh làm tín hiệu duy nhất.

## Reliability/performance

- Driver.js và intro asset được code-split khỏi initial shell nếu hợp lý.
- Không leak event listener, overlay, scroll lock hoặc audio node.
- Missing target được theo dõi trong test/dev log và fail E2E critical path.
- Old UI prefs migrate fail-closed: reset onboarding, giữ campaign save.
- Bundle/asset budget được cập nhật và kiểm tra CI.

## Release gate

- [ ] Tất cả critical journeys đạt.
- [ ] Không blocker accessibility hoặc focus leak.
- [ ] Không console error/missing target trên happy path.
- [ ] Save PHASE 1 load được và onboarding migration có test.
- [ ] VI/EN và desktop/mobile đạt.
- [ ] Performance budget, docs, release notes và rollback plan hoàn tất.
- [ ] Playtest người mới đạt KPI trong master plan hoặc có issue được chấp thuận rõ ràng.

**Mốc kết thúc:** phát hành Moon Complete; chỉ sau gate này mới mở implementation Mars PHASE 3.
