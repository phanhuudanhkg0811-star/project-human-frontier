# PHASE 2.1 — Onboarding foundation và Driver.js integration

> **Mục tiêu:** tạo lớp onboarding bền vững, versioned và tách khỏi domain engine.

## State contract đề xuất

```ts
interface OnboardingState {
  introStatus: 'unseen' | 'skipped' | 'completed';
  tourVersion: 'moon-sol1-v1';
  activeTour: 'sol1' | null;
  activeStepId: string | null;
  sol1GuideStatus: 'unseen' | 'active' | 'skipped' | 'completed';
  contextualHintsEnabled: boolean;
  dismissedHintIds: readonly string[];
}
```

State này thuộc UI persistence. Nó không được đưa vào `GameState`, resolver input, replay trace hoặc canonical hash.

## Kiến trúc

- `onboarding/driverAdapter.ts`: lifecycle `start`, `resume`, `move`, `destroy`.
- `onboarding/tours/moonSol1Tour.ts`: definition dựa trên step ID.
- `onboarding/selectors.ts`: quyết định flow nào có thể khởi chạy.
- `onboarding/targets.ts`: hằng số selector `data-tour`.
- `onboarding/persistence.ts`: version, decode, migration và fail-safe reset.
- Copy nằm trong i18n catalog; không hardcode HTML từ dữ liệu ngoài.

## Driver.js rules

- Dùng selector hoặc function target; tránh giữ stale DOM element.
- Dùng action-driven step cho thao tác thật và `waitForElement` cho modal lazy-render.
- Target mất phải skip có log phát triển hoặc hiện fallback có CTA; không treo tour.
- Destroy instance khi component unmount, đổi save/campaign hoặc vào terminal flow.
- Respect reduced motion và keyboard; restore focus về trigger hợp lý.
- Chỉ có một driver instance toàn app.

## Persistence/migration

- Persist step ID, không persist array index.
- Unknown version → giữ campaign save, reset riêng onboarding và thông báo nhẹ.
- `game/start` reset active tour nhưng không tự xóa preference Skip/Completed nếu người chơi không yêu cầu.
- Có command UI riêng cho Replay và Reset onboarding.

## Tests/gate

- [ ] Decode/migration với missing, corrupt và future version.
- [ ] Start/resume/skip/complete/replay idempotent.
- [ ] Unmount/modal switch luôn cleanup overlay và listener.
- [ ] Missing/replaced target không crash.
- [ ] Onboarding thay đổi không làm replay hash thay đổi.
- [ ] Keyboard focus và reduced-motion contract đạt.
