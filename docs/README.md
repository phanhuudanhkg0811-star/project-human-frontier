# 📚 Project Hail — Tài liệu dự án (Documentation Hub)

Chào mừng bạn đến với trung tâm tài liệu kỹ thuật và thiết kế của **Project Hail — Junior Astronaut Mission Trainer** (thuộc sáng kiến *Project Human Frontier* cho NASA Space Apps Challenge).

---

## 🗂️ Sơ đồ cấu trúc tài liệu (`docs/`)

```text
docs/
├── README.md                          # Mục lục trung tâm (bạn đang ở đây)
├── product/                           # Định hướng sản phẩm, phạm vi và mục tiêu
│   └── SCOPE_RECONCILIATION.md        # Quyết định phạm vi chính thức (Moon 32 Sol, Mars tách riêng)
├── plan/                              # Kế hoạch thực thi chi tiết theo từng giai đoạn
│   ├── first-phase/                   # PHASE 1: Moon Survival 32 Sol (Hiện tại)
│   │   ├── PHASE_1_SYNC_HANDOFF_FOR_TEAM.md      # Tóm tắt diff chốt mới 14/11 + checklist team
│   │   ├── PHASE_1_GAMEPLAY_KISS_SPEC.md         # Đặc tả KISS + Wall-Rack Cockpit
│   │   ├── PHASE_1_DOCUMENT_RECONCILIATION.md
│   │   ├── PHASE_1_MOON_IMPLEMENTATION_PLAN.md   # Master implementation plan
│   │   ├── PHASE_1_TEAM_EXECUTION_PLAN.md        # Phân công lane & ownership team
│   │   ├── PHASE_1_1_STATE_FOUNDATION_PLAN.md    # Domain state, commands, save/load
│   │   ├── PHASE_1_1_STATE_CONTRACT.md           # GameState + JSON contract Pure TS Engine & DONKI
│   │   ├── PHASE_1_2_ROVER_CREW_PLAN.md          # Crew assignment, inventory, rover
│   │   ├── PHASE_1_3_EVENTS_SOL7_PLAN.md         # Event tree, Sol 7 crisis
│   │   ├── PHASE_1_4_CAMPAIGN_BALANCE_PLAN.md    # Lunar Night, balance, ranking
│   │   ├── PHASE_1_5_COCKPIT_POLISH_PLAN.md      # Cockpit V12 -> Wall-Rack, audio, i18n VI/EN
│   │   └── PHASE_1_6_RELEASE_PLAN.md             # E2E test, performance, release gate
│   └── second-phase/                  # PHASE 2: Moon Complete onboarding & narrative
│       ├── PHASE_2_MOON_COMPLETE_MASTER_PLAN.md
│       ├── PHASE_2_0_UX_LOCK_PLAN.md
│       ├── PHASE_2_1_ONBOARDING_FOUNDATION_PLAN.md
│       ├── PHASE_2_2_TITLE_INTRO_PLAN.md
│       ├── PHASE_2_3_GUIDED_SOL1_PLAN.md
│       ├── PHASE_2_4_MOON_NARRATIVE_PLAN.md
│       ├── PHASE_2_5_CONTEXTUAL_HINTS_PLAN.md
│       └── PHASE_2_6_HARDENING_PLAN.md
├── architecture/                      # Kiến trúc kỹ thuật và hợp đồng dữ liệu
│   └── SYSTEM_ARCHITECTURE.md         # Pure TS Deterministic Engine, Static JSON, Zustand Store
├── game-design/                       # Tài liệu thiết kế trò chơi (GDD)
│   ├── HUMAN_FRONTIER_2050_GAME_SETUP.md         # CHUẨN CHỐT CHÍNH THỨC (14/11/2026)
│   └── GAME_DESIGN_DOCUMENT.md        # GDD nền (tham chiếu lịch sử)
├── ui-ux/                             # Đặc tả giao diện người dùng
│   └── COCKPIT_V12_SPEC.md            # Thiết kế Cockpit V12 (6 module, 2 rack, Observation Window)
└── asset-pipeline/                    # Quản lý tài nguyên đồ họa & âm thanh
    └── ASSET_SPECIFICATION.md         # Quy chuẩn asset WebP/SVG, Web Audio, bản quyền
```

---

## 🚀 Lộ trình triển khai & Các Campaign Độc Lập

Dự án giữ Moon và Mars là các campaign độc lập; số PHASE bên dưới là thứ tự triển khai sản phẩm theo [SCOPE_RECONCILIATION.md](product/SCOPE_RECONCILIATION.md):

1. **PHASE 1: Moon Survival (32 Sol)** *(Phạm vi trọng tâm hiện tại)*
   - **Sol 1–12 (Moon Training)**: Onboarding, làm quen hệ sinh thái trạm, 3 chuyến thám hiểm Rover (Lunar Crater, Regolith Field, PSR).
   - **Sol 7 (Golden Crisis)**: Tình huống đánh đổi sinh tử Sol 7: Cứu dữ liệu Rover hay Bảo vệ mạng sống căn cứ trạm.
   - **Sol 13–14 (Lunar Night Preparation)**: Sửa chữa, nâng cấp hệ thống, nạp đầy pin trước khi Mặt Trời lặn.
   - **Sol 15–28 (Lunar Night - 14 Sol)**: Đêm Mặt Trăng kéo dài, điện mặt trời bằng 0 kWh; sinh tồn bằng máy phát hạt nhân (Fission), pin lưu trữ và khẩu phần nghiêm ngặt.
   - **Sol 29–31 (Sunrise Recovery)**: Bình minh trở lại cực Nam Mặt Trăng, tái khởi động toàn bộ mạng lưới sinh mệnh.
   - **Sol 32 (Finale & NASA Cadet Report Card)**: Tổng kết chiến dịch 32 Sol, đánh giá cấp bậc S-Rank / A-Rank.

2. **PHASE 2: Moon Complete** *(Hoàn thiện trải nghiệm Moon trước khi mở Mars)*
   - Title/Continue/Recovery flow và intro bối cảnh 60–90 giây.
   - Guided Sol 1 bằng Driver.js và thao tác gameplay thật.
   - Contextual hints, milestone presentation và Moon Complete hardening.
   - Master plan: [PHASE_2_MOON_COMPLETE_MASTER_PLAN.md](plan/second-phase/PHASE_2_MOON_COMPLETE_MASTER_PLAN.md).

3. **PHASE 3: Mars Survival (36+ Sol)** *(Campaign độc lập)*
   - Màn chơi Sao Hỏa độc lập với initial state riêng (không kế thừa save từ Moon).
   - Đặc thù: Tạo oxy qua MOXIE, bão cát toàn cầu (dust storm), độ trễ vô tuyến 14 phút (radio latency).

4. **PHASE 4 / ADVANCED MODE: Two-Arc (Moon → Mars)** *(Giai đoạn nâng cao)*
   - Chế độ thử thách cao: Chặng Mặt Trăng → Chuyển tiếp Hohmann quỹ đạo → Đổ bộ Sao Hỏa.

---

## 📖 Hướng Dẫn Đọc Tài Liệu

- **Nếu bạn là Product Lead / Game Designer**:
  - Đọc **chuẩn chốt chính thức** [HUMAN_FRONTIER_2050_GAME_SETUP.md](game-design/HUMAN_FRONTIER_2050_GAME_SETUP.md), [PHASE_1_SYNC_HANDOFF_FOR_TEAM.md](plan/first-phase/PHASE_1_SYNC_HANDOFF_FOR_TEAM.md), [SCOPE_RECONCILIATION.md](product/SCOPE_RECONCILIATION.md) và [GAME_DESIGN_DOCUMENT.md](game-design/GAME_DESIGN_DOCUMENT.md).
- **Nếu bạn là Core / Simulation Engine Developer**:
  - Đọc [SYSTEM_ARCHITECTURE.md](architecture/SYSTEM_ARCHITECTURE.md), [PHASE 1.1 State Contract](plan/first-phase/PHASE_1_1_STATE_CONTRACT.md) và các kế hoạch [PHASE_1_1](plan/first-phase/PHASE_1_1_STATE_FOUNDATION_PLAN.md), [PHASE_1_3](plan/first-phase/PHASE_1_3_EVENTS_SOL7_PLAN.md), [PHASE_1_4](plan/first-phase/PHASE_1_4_CAMPAIGN_BALANCE_PLAN.md).
- **Nếu bạn là Frontend / UI/UX Developer**:
  - Đọc [COCKPIT_V12_SPEC.md](ui-ux/COCKPIT_V12_SPEC.md), [PHASE_1_5](plan/first-phase/PHASE_1_5_COCKPIT_POLISH_PLAN.md) và [PHASE 2 Moon Complete](plan/second-phase/PHASE_2_MOON_COMPLETE_MASTER_PLAN.md).
- **Nếu bạn là QA / Release Engineer**:
  - Đọc [PHASE_1_6](plan/first-phase/PHASE_1_6_RELEASE_PLAN.md) và kiểm tra ma trận CI trong [.github/workflows/ci.yml](../.github/workflows/ci.yml).
