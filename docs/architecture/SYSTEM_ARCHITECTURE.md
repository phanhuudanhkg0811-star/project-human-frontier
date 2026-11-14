# 🏗️ Kiến trúc Hệ thống — Project Hail

> Căn cứ theo kế hoạch kỹ thuật tại `PHASE_1_1_STATE_FOUNDATION_PLAN.md` và `PHASE_1_MOON_IMPLEMENTATION_PLAN.md`.

---

## 1. Nguyên Tắc Cốt Lõi (Core Architectural Tenets)

1. **Headless & Deterministic Simulation Engine**:
   - Toàn bộ logic trò chơi, phương trình cân bằng tài nguyên, xử lý End-Sol và điều kiện sự kiện chạy bằng **Pure TypeScript**.
   - **Zero Dependency**: Thư mục `src/engine/` tuyệt đối không import React, DOM (`window`, `document`), Zustand, hay LocalStorage.
   - **Determinsitic Replay**: Cùng bộ `(initialState, commands, seed, content)` luôn cho ra 100% cùng một kết quả trên mọi môi trường.
   - Dùng pseudo-random generator có seed (`SeededPRNG - Mulberry32`), nghiêm cấm dùng `Math.random()`.

2. **Decoupled State & UI Layer**:
   - Quản lý state thông qua **Zustand store** làm facade/adapter giữa Headless Engine và React Components.
   - UI chỉ đóng vai trò hiển thị (presentation) và dispatch domain commands; UI không tự tính toán hay trực tiếp đột biến giá trị tài nguyên.

3. **Data-Driven Architecture**:
   - Toàn bộ chỉ số cân bằng, sự kiện, kịch bản thám hiểm rover và bài học STEM nằm trong các tệp JSON có JSON Schema kiểm thực chặt chẽ (`src/data/*.json`).

4. **Versioned Save State**:
   - Lưu trữ tiến trình chơi qua LocalStorage với `schemaVersion` và cơ chế migration tự động.

---

## 2. Sơ đồ Luồng Dữ Liệu (Data Flow)

```mermaid
flowchart TD
    subgraph DataLayer ["Data & Config (JSON + Schema)"]
        BalanceJSON["balance.json"]
        EventsJSON["events.json"]
        ExpeditionsJSON["expeditions.json"]
        ScienceJSON["science-briefs.json"]
    end

    subgraph CoreEngine ["Deterministic Core Engine (Pure TypeScript)"]
        StateReducer["State Reducer / Action Handlers"]
        EndSolResolver["End-Sol Deterministic Resolver"]
        EventScheduler["Event Condition Evaluator"]
        PRNG["Seeded PRNG (Mulberry32)"]
    end

    subgraph StoreLayer ["State Facade & Persistence"]
        ZustandStore["Zustand Store (GamePort Adapter)"]
        SaveAdapter["LocalStorage Save Adapter (Versioned)"]
    end

    subgraph Presentation ["Presentation Layer (React 19)"]
        CockpitView["Cockpit V12 Dashboard"]
        Panels["Crew / Systems / Rover / Comms Panels"]
        Modals["Morning Brief / End-Sol Debrief / STEM Report"]
    end

    DataLayer --> CoreEngine
    CoreEngine --> ZustandStore
    ZustandStore <--> SaveAdapter
    ZustandStore --> Presentation
    Presentation --"Dispatch Domain Commands"--> ZustandStore
    ZustandStore --"Execute Pure Actions"--> CoreEngine
```

---

## 3. Cỗ Máy Trạng Thái 5 Bước Mỗi Sol (Daily State Machine)

Một ngày trên Mặt Trăng (Sol) được chia thành 5 phase nghiêm ngặt:

```text
Title Screen
     │
     ▼
Morning Briefing ──> Engineering ──> Comms & Logistics ──> Rationing Plan ──> Resolving (End-Sol)
     ▲                                                                                │
     │                                                                                ▼
     └────────────────────────── Debrief & STEM Brief ◀───────────────────────────────┘
                                         │
                         (Nếu đạt terminal condition)
                                         ▼
                                Victory / Game Over
```

| Phase | Trách nhiệm chính của người chơi |
|---|---|
| **1. Morning Briefing** | Đọc báo cáo thời tiết vũ trụ NASA DONKI, nhận diện cảnh báo và quyết định lựa chọn sự kiện phát sinh đầu ngày. |
| **2. Engineering & Crew** | Phân công phi hành đoàn (*1 người - 1 việc - 1 Sol*), sửa chữa/nâng cấp hệ sinh thái trạm, quản lý ưu tiên nguồn điện. |
| **3. Comms & Logistics** | Gửi điện tín về Trái Đất (độ trễ 1.3s), điều phối phóng/thu hồi 3 chuyến xe tự hành Rover, yêu cầu tàu hàng tiếp tế (thời gian vận chuyển 4 Sol). |
| **4. Rationing** | Thiết lập khẩu phần ăn (MRE) và nước uống, bật/tắt máy tái chế nước WRS. |
| **5. Resolving & Debrief** | Chốt ngày; Resolver tính toán biến thiên tài nguyên, kiểm tra điều kiện sống còn, xuất báo cáo STEM và biểu đồ xu hướng 5 Sol kế tiếp. |

---

## 4. Cấu Trúc Thư Mục Source Chuẩn (`src/`)

```text
src/
├── app/                     # Bootstrap ứng dụng, Providers, Error Boundary
├── components/              # UI Primitives dùng chung (Buttons, Gauges, Badges)
├── features/                # Các mô-đun UI theo phase gameplay
│   ├── briefing/            # Morning Briefing & Event dialog
│   ├── engineering/         # Điều khiển 4 hệ thống, sửa chữa/nâng cấp
│   ├── crew/                # Bảng phân công 4 phi hành gia
│   ├── comms/               # Vô tuyến Trái Đất & tiếp tế tàu hàng
│   ├── rover/               # Lập kế hoạch 3 chuyến thám hiểm Rover
│   ├── rationing/           # Phân phối khẩu phần & ưu tiên tải điện
│   └── debrief/             # Báo cáo End-Sol, STEM brief & Report Card
├── engine/                  # Headless Deterministic Game Engine
│   ├── actions/             # Các hàm xử lý command nghiệp vụ thuần khiết
│   ├── events/              # Bộ thẩm định điều kiện kích hoạt sự kiện
│   ├── resolver/            # Bộ giải mô phỏng chuyển đổi ngày End-Sol
│   ├── rng/                 # Mulberry32 Seeded PRNG
│   ├── selectors/           # Pure state queries & Resource Predictor
│   └── validation/          # Guard rules & domain error codes
├── data/                    # JSON content đóng gói sẵn
│   ├── balance.json
│   ├── crew.json
│   ├── events.json
│   ├── expeditions.json
│   ├── initial-state.json
│   └── science-briefs.json
├── schemas/                 # JSON Schemas cho dữ liệu và save file
├── store/                   # Zustand store & LocalStorage persistence
├── types/                   # Khai báo TypeScript types chuẩn cho toàn bộ domain
├── utils/                   # Hàm định dạng số liệu, tính toán vật lý, audio
└── styles/                  # Toàn bộ CSS hệ thống
```
