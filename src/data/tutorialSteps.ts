import type { Locale } from '../i18n/types.ts';

export interface TutorialStep {
  readonly id: string;
  readonly stepNumber: number;
  readonly icon: 'briefing' | 'engineering' | 'comms' | 'rationing' | 'lunar-night';
  readonly title: Readonly<Record<Locale, string>>;
  readonly cockpitArea: Readonly<Record<Locale, string>>;
  readonly summary: Readonly<Record<Locale, string>>;
  readonly checklist: Readonly<Record<Locale, readonly string[]>>;
  readonly stemTip: Readonly<Record<Locale, string>>;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'step-briefing',
    stepNumber: 1,
    icon: 'briefing',
    title: {
      vi: 'Bước 1 · Giao ban Sáng & Bão Mặt Trời DONKI',
      en: 'Step 1 · Morning Briefing & DONKI Space Weather',
    },
    cockpitArea: {
      vi: 'Vị trí Cockpit: Banner Cảnh báo phía trên & Nút "Giao ban / Starlog"',
      en: 'Cockpit Zone: Top Event Priority Banner & "Briefing / Starlog" Button',
    },
    summary: {
      vi: 'Mỗi Sol bắt đầu ở Pha Giao ban. Hãy đọc dự báo bức xạ NASA DONKI và xử lý sự kiện bắt buộc trước khi chuyển sang Pha Kỹ thuật.',
      en: 'Every Sol opens in the Briefing phase. Check the NASA DONKI radiation forecast and resolve any mandatory event before advancing to Engineering.',
    },
    checklist: {
      vi: [
        'Xem mức DONKI (Quiet → Extreme) để biết tỉ lệ sửa chữa và liều bức xạ mGy trong ngày.',
        'Nếu có sự kiện Bắt buộc, bấm "Xem sự kiện" để chọn phương án ít rủi ro nhất.',
        'Chú ý hạn chót (Deadline Sol) của sự kiện tùy chọn để không bị phạt quá hạn.',
      ],
      en: [
        'Check the DONKI weather level (Quiet to Extreme) to see repair odds and daily mGy radiation.',
        'When a Mandatory event is active, open Starlog and compare projected deltas before choosing.',
        'Track event deadlines so optional hazards do not expire with harsh penalties.',
      ],
    },
    stemTip: {
      vi: 'Mặt Trăng không có khí quyển hay từ trường dày: bão proton SEP từ Mặt Trời làm tăng bức xạ tức thì.',
      en: 'Without a thick atmosphere or magnetic shield, lunar bases face direct Solar Energetic Particle (SEP) radiation spikes.',
    },
  },
  {
    id: 'step-engineering',
    stepNumber: 2,
    icon: 'engineering',
    title: {
      vi: 'Bước 2 · Crew, Hệ thống & Máy in 3D Fabricator',
      en: 'Step 2 · Crew Assignments, Systems & 3D Fabricator',
    },
    cockpitArea: {
      vi: 'Vị trí Cockpit: 4 Ghế Phi hành đoàn · Telemetry Console · Tủ 3D Fab (Góc dưới trái)',
      en: 'Cockpit Zone: 4 Crew Seats · Center Telemetry Console · Lower-Left 3D Fabricator',
    },
    summary: {
      vi: 'Trong Pha Kỹ thuật, phân công phi hành đoàn sửa/nâng cấp các hệ thống sinh tồn và dùng máy in 3D để chế tạo dụng cụ hỗ trợ Rover hoặc xử lý sự cố.',
      en: 'During Engineering, assign crew to repair or upgrade life-support systems and run the 3D Fabricator to craft tools needed for Rover missions and events.',
    },
    checklist: {
      vi: [
        'Ưu tiên giữ Airlock & Scrubber trên mức hư hỏng nặng để tránh rò rỉ O₂.',
        'Dùng Engineer sửa/nâng cấp để được giảm chi phí phụ tùng (Parts).',
        'Chế tạo sẵn Core Drill, Sealant Tape hoặc Cryo Thermal Rig trước khi cử Rover đi xa.',
      ],
      en: [
        'Keep Airlock and Scrubber healthy first so oxygen does not leak overnight.',
        'Assign your Engineer to repairs and upgrades for a spare-parts discount.',
        'Fabricate Core Drill, Sealant Tape, or Cryo Thermal Rig ahead of Rover expeditions.',
      ],
    },
    stemTip: {
      vi: 'In 3D tại chỗ (ISM) giúp trạm tự tạo gioăng kín và dụng cụ thay vì chờ tàu phóng tốn kém từ Trái Đất.',
      en: 'In-Space Manufacturing lets lunar astronauts print replacement seals and tools instead of waiting on costly Earth launches.',
    },
  },
  {
    id: 'step-comms',
    stepNumber: 3,
    icon: 'comms',
    title: {
      vi: 'Bước 3 · Liên lạc CAPCOM, Tàu Cargo & Thám hiểm Rover',
      en: 'Step 3 · CAPCOM Comms, Supply Cargo & Rover Expeditions',
    },
    cockpitArea: {
      vi: 'Vị trí Cockpit: Góc trên phải CAPCOM · Góc dưới phải Giá Dụng cụ & Rover',
      en: 'Cockpit Zone: Upper-Right CAPCOM · Lower-Right Equipment Rack & Rover',
    },
    summary: {
      vi: 'Pha 3 là lúc phát điện tín về Houston, đặt tàu tiếp tế 80 kg (bay 4 Sol mới tới) và điều khiển Rover tới 3 vùng Nam Cực để kiếm Điểm Khoa học.',
      en: 'In Phase 3, transmit telemetry to Houston, order 80 kg cargo resupply ships (4-Sol transit), and deploy the Rover to 3 South Polar sites for Science points.',
    },
    checklist: {
      vi: [
        'Đặt Cargo nước/oxy/linh kiện sớm trước Sol 11 để tàu kịp đáp trước Đêm Trăng.',
        'Kiểm tra danh sách thiết bị yêu cầu của từng bãi đáp Rover trước khi phóng.',
        'Nếu Rover mất tín hiệu trong bão Mặt Trời, xử lý phục hồi tín hiệu kịp thời.',
      ],
      en: [
        'Order water, oxygen, or parts cargo before Sol 11 so it lands ahead of Lunar Night.',
        'Verify required Rover gear and assign an operator before launching an expedition.',
        'If solar weather disrupts Rover telemetry, trigger signal recovery right away.',
      ],
    },
    stemTip: {
      vi: 'Sóng vô tuyến đi giữa Trái Đất và Mặt Trăng mất ~1.3 giây mỗi chiều, nhưng tàu hàng vật lý vẫn mất tới 4 Sol.',
      en: 'Radio waves cross the Earth-Moon gap in ~1.3 seconds each way, whereas physical cargo landers take 4 full Sols.',
    },
  },
  {
    id: 'step-rationing',
    stepNumber: 4,
    icon: 'rationing',
    title: {
      vi: 'Bước 4 · Phân phối MRE, Bật WRS & Gạt cần Chốt Sol',
      en: 'Step 4 · MRE Rationing, WRS & End-Sol Forecast',
    },
    cockpitArea: {
      vi: 'Vị trí Cockpit: Bảng Điều khiển Trung tâm → Nút "End-Sol"',
      en: 'Cockpit Zone: Center Console → "End-Sol" Lever Button',
    },
    summary: {
      vi: 'Ở Pha 4, chia khẩu phần MRE cho người đói, quyết định bật máy tái chế nước WRS, sắp xếp thứ tự cắt tải điện rồi xem Dự báo 5 Sol trước khi gạt cần Chốt Sol.',
      en: 'In Phase 4, distribute MRE packs to hungry crew, toggle the WRS water recycler, set load-shedding priority, and inspect the 5-Sol forecast before ending the Sol.',
    },
    checklist: {
      vi: [
        'Theo dõi Độ no (Satiety): 1 MRE hồi +75%, tránh để crew rơi vào trạng thái Đói/Kiệt sức.',
        'Luôn đặt ECLSS (O₂/Nhiệt) ở vị trí ưu tiên điện số 1.',
        'Đọc bảng "Xu hướng 5 Sol tới" để phát hiện sớm nguy cơ thiếu Pin, Nước hoặc O₂.',
      ],
      en: [
        'Watch crew Satiety: each MRE restores +75%, preventing starvation before it blocks Rover work.',
        'Keep ECLSS (Oxygen & Thermal) at Priority #1 in your power load-shedding list.',
        'Review the 5-Sol trend forecast to catch battery, water, or oxygen shortfalls early.',
      ],
    },
    stemTip: {
      vi: 'Hệ thống WRS thu hồi ~90–95% nước xám, biến điện năng thành nguồn nước sạch bền vững cho phi hành đoàn.',
      en: 'Closed-loop WRS reclaims ~90–95% of greywater, trading electrical energy for sustainable drinking water.',
    },
  },
  {
    id: 'step-lunar-night',
    stepNumber: 5,
    icon: 'lunar-night',
    title: {
      vi: 'Bước 5 · Sống sót qua 14 Sol Đêm Trăng (Sol 15–28) & Thắng ở Sol 32',
      en: 'Step 5 · Surviving the 14-Sol Lunar Night (Sol 15–28) to Sol 32',
    },
    cockpitArea: {
      vi: 'Mục tiêu Chiến dịch: Đạt mốc Sơ kết Sol 12 → Vượt Đêm Trăng → Bình minh Sol 29 → Sol 32',
      en: 'Campaign Arc: Sol 12 Training Checkpoint → Lunar Night → Sol 29 Sunrise → Sol 32 Victory',
    },
    summary: {
      vi: 'Từ Sol 15 đến Sol 28, Mặt Trời lặn hoàn toàn: Pin Mặt Trời tạo 0 kWh và nhiệt độ bề mặt xuống cực tiểu mô hình -185.6°C. Trạm sống nhờ lò Fission (+8 kWh/Sol), pin tích trữ và dự trữ O₂/Nước.',
      en: 'From Sol 15 through Sol 28, the Sun sets completely: Solar arrays generate 0 kWh and surface temperatures plunge to a modeled minimum of -185.6°C. Survival depends on your Fission reactor (+8 kWh/Sol), battery reserve, and stocked water/O₂.',
    },
    checklist: {
      vi: [
        'Sol 1–14: Tích đầy Pin, nâng cấp WRS/Scrubber và tích trữ Nước + O₂ + MRE.',
        'Sol 15–28 (Lunar Night): Cân nhắc tắt bớt tải phụ nếu Pin xuống thấp; ưu tiên ECLSS & WRS.',
        'Sol 29–32 (Sunrise): Khôi phục Solar, hoàn tất chuyến Rover cuối cùng để đạt Rank S/A.',
      ],
      en: [
        'Sol 1–14 (Daylight): Charge batteries to full, upgrade WRS/Scrubber, and stockpile Water, O₂, and MREs.',
        'Sol 15–28 (Lunar Night): Shed non-essential power loads when needed; protect ECLSS and WRS.',
        'Sol 29–32 (Sunrise): Solar power returns — finish remaining Rover expeditions for an S/A Cadet Rank!',
      ],
    },
    stemTip: {
      vi: 'Lò phản ứng Fission Kilopower chạy liên tục 336 giờ đêm tối là chìa khóa cho căn cứ Nam Cực Mặt Trăng.',
      en: 'Compact Kilopower fission reactors deliver steady power across 336 hours of polar darkness.',
    },
  },
];
