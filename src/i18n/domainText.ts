import type { ContentBundle } from '../types/index.ts';
import type { Locale } from './types.ts';

const SYSTEM_EN: Record<string, string> = {
  solar: 'Solar Array',
  recycler: 'Water Recycler (WRS)',
  scrubber: 'CO₂ Scrubber',
  airlock: 'Airlock',
  fabricator: '3D Fabricator',
};

const EQUIPMENT_EN: Record<string, string> = {
  core_drill: 'Core Drill',
  sealant_tape: 'Sealant Tape',
  solar_lantern: 'Solar Lantern',
  dust_shield: 'Dust Shield',
  radio_repeater: 'Radio Repeater',
  cryo_thermal_rig: 'Cryo Thermal Rig',
};

const ITEM_EN: Record<string, string> = {
  ...EQUIPMENT_EN,
  mre_pack: 'MRE Pack',
  medkit: 'Medkit',
};

const RESOURCE_EN: Record<string, string> = {
  batteryKWh: 'Battery',
  oxygenKg: 'Oxygen',
  waterL: 'Water',
  partsKg: 'Parts',
  mrePacks: 'MRE packs',
  medkits: 'Medkits',
  'Phụ tùng': 'Parts',
  Pin: 'Battery',
  Oxy: 'Oxygen',
  'Nước': 'Water',
  'gói MRE': 'MRE packs',
  Medkit: 'Medkit',
};

const PHASE_EN: Record<string, string> = {
  briefing: 'Morning Briefing',
  engineering: 'Engineering',
  comms: 'Comms & Rover',
  rationing: 'Rationing',
  resolving: 'Resolving Sol',
  debrief: 'Debrief',
  terminal: 'Terminal',
};

const TASK_EN: Record<string, string> = {
  'repair-system': 'Repair System',
  'upgrade-system': 'Upgrade System',
  rest: 'Rest',
  'emergency-response': 'Emergency Response',
  'medical-care': 'Medical Care',
  'rover-operate': 'Operate Rover',
};

const ACTION_EN: Record<string, string> = {
  craft: 'crafting',
  upgrade: 'upgrading',
  repair: 'repairing',
  recycle: 'recycling',
};

const EXACT_VI_TO_EN: Record<string, string> = {
  'Artemis Lunar Base đi vào vận hành. Chuẩn bị cho chu kỳ 32 Sol và Đêm Trăng sắp tới.':
    'Artemis Lunar Base commissioned. Preparing for the 32-Sol cycle and upcoming Lunar Night.',
  'Tàu hàng tiếp tế từ Trái Đất đã hạ cánh an toàn.':
    'Resupply cargo ship from Earth landed safely.',
  '3D Fabricator đã nâng cấp công thức Medkit lên Cấp 2 (+50 Health).':
    '3D Fabricator upgraded the Medkit formula to Lv2 (+50 Health).',
  'Cảnh báo DONKI SEP/X-Flare: Phi hành đoàn chịu ảnh hưởng bức xạ mức cao (-8 Health).':
    'DONKI SEP/X-Flare warning: Crew sustained elevated radiation exposure (-8 Health).',
  'Không tìm thấy expedition config cho nhiệm vụ Rover đang hoạt động.':
    'Expedition configuration not found for the active Rover mission.',
  'Power ledger không cấp đủ 4 kWh hoặc người trực phóng không sẵn sàng.':
    'Power ledger could not supply 4 kWh or launch operator was unavailable.',
  'Thiếu điện hoặc người trực: lịch phóng Rover được giữ sang Sol kế tiếp.':
    'Insufficient power or operator unavailable: Rover launch held for next Sol.',
  'Mất tín hiệu quá 2 Sol.':
    'Signal lost for over 2 Sols.',
  'Rover mất tín hiệu quá 2 Sol; nhiệm vụ thất bại và thiết bị được thu hồi ở trạng thái hư hao.':
    'Rover lost signal for over 2 Sols; mission failed and equipment recovered in worn state.',
  'Không có crew đủ điều kiện sau một grace Sol.':
    'No eligible crew available after one grace Sol.',
  'Không có crew thu hồi sau một grace Sol; nhiệm vụ thất bại an toàn.':
    'No recovery operator available after one grace Sol; mission aborted safely.',
  'Nhiễu DONKI làm mất liên lạc Rover.':
    'DONKI interference severed Rover communications.',
  'Rover đã tới điểm thu hồi nhưng chưa có crew đủ điều kiện; bắt đầu grace Sol.':
    'Rover reached recovery zone without an eligible operator; grace Sol started.',
  'Thiếu điện: 3D Fabricator tạm hoãn chu kỳ in sang Sol kế tiếp.':
    'Insufficient power: 3D Fabricator paused its print cycle until next Sol.',
  'Lệnh không hợp lệ.': 'Invalid command.',
  'Nhiệm vụ đã kết thúc; chỉ có thể khởi động ván mới.':
    'Mission has ended; only starting a new campaign is allowed.',
  'Cần xử lý sự kiện Morning Briefing bắt buộc trước khi sang pha Kỹ thuật.':
    'Resolve the mandatory Morning Briefing event before advancing to Engineering.',
  'Sự kiện không khớp activeEventId hiện tại.':
    'Event does not match the current active event.',
  'Lựa chọn sự kiện không hợp lệ.':
    'Invalid event choice.',
  'Chỉ xử lý sự kiện tại pha hợp lệ trước khi chốt ngày.':
    'Events can only be resolved during a valid phase before closing the Sol.',
  'Sự kiện đã quá hạn xử lý.':
    'This event has expired.',
  'Chưa đủ điều kiện chọn phương án này.':
    'Requirements for this option are not met.',
  'Chỉ phân công phi hành đoàn trong pha Kỹ thuật hoặc Liên lạc.':
    'Crew tasks can only be assigned in Engineering or Comms.',
  'Thiếu targetSystemId để sửa chữa.':
    'Missing target system to repair.',
  'Thiếu targetSystemId để nâng cấp.':
    'Missing target system to upgrade.',
  'Chỉ hủy phân công phi hành gia trong pha Kỹ thuật hoặc Liên lạc.':
    'Crew assignments can only be cancelled in Engineering or Comms.',
  'Hãy hủy nâng cấp cấp cao hơn của cùng hệ thống trước để giữ đúng chi phí.':
    'Cancel the higher-level upgrade on the same system first to preserve accurate part refunds.',
  'Nhiệm vụ Rover đang giữ slot này; hãy hủy lịch hoặc đổi người thu hồi Rover.':
    'Rover mission holds this slot; cancel launch or reassign the recovery operator.',
  'Chỉ đặt lệnh 3D Fabricator trong pha Kỹ thuật.':
    '3D Fabricator jobs can only be queued during Engineering.',
  '3D Fabricator chỉ nhận tối đa 1 lệnh mỗi Sol.':
    '3D Fabricator accepts at most 1 job per Sol.',
  '3D Fabricator đang hỏng, cần sửa trước.':
    '3D Fabricator is offline and must be repaired first.',
  'Công thức không tồn tại.':
    'Recipe does not exist.',
  'Medkit đã đạt Cấp 2.':
    'Medkit is already at Lv2.',
  'Chỉ sửa chữa được Equipment.':
    'Only equipment items can be repaired.',
  'Chỉ tái chế được Equipment.':
    'Only equipment items can be recycled.',
  'Chỉ hủy lệnh 3D Fabricator trong pha Kỹ thuật.':
    '3D Fabricator jobs can only be cancelled during Engineering.',
  'Không có lệnh 3D Fabricator nào đang chạy.':
    'No active 3D Fabricator job to cancel.',
  'Đã hủy lệnh 3D Fabricator đang in dở (hoàn trả 50% vật tư, giữ giới hạn 1 lệnh/Sol).':
    'Cancelled in-progress 3D Fabricator job (50% material refund; 1 job/Sol limit remains used).',
  'Đã hủy lệnh 3D Fabricator và hoàn trả 100% vật tư (giữ giới hạn 1 lệnh/Sol).':
    'Cancelled 3D Fabricator job with 100% material refund (1 job/Sol limit remains used).',
  'Chỉ gửi điện tín CAPCOM trong pha Liên lạc.':
    'CAPCOM messages can only be transmitted during Comms.',
  'ID tin nhắn radio đã tồn tại.':
    'Radio message ID already exists.',
  'Đã phát tín hiệu vô tuyến tới Houston (1,3 s/chiều, phản hồi ~3,8 s).':
    'Radio transmission sent to Houston (1.3 s one-way, reply in ~3.8 s).',
  'CAPCOM Houston xác nhận: Đã ghi nhận dữ liệu telemetry trạm Artemis. Khuyến nghị theo dõi pin trước Đêm Trăng Sol 15.':
    'CAPCOM Houston confirms: Artemis station telemetry logged. Monitor battery reserves ahead of Sol 15 Lunar Night.',
  'CAPCOM Houston xác nhận: Đã ghi nhận dữ liệu telemetry trạm Artemis. Khuyến nghị theo dõi pin và tích lũy mẫu vật trước Đêm Trăng Sol 15.':
    'CAPCOM Houston confirms: Artemis base telemetry logged. Recommend monitoring battery reserves and stockpiling samples ahead of Sol 15 Lunar Night.',
  'CAPCOM Houston xác nhận: Trạm đang trong Đêm Trăng cực lạnh (-185°C). Hãy duy trì dòng điện nền lò Fission và bảo vệ đường ống sinh tồn ECLSS.':
    'CAPCOM Houston confirms: Base is weathering deep Lunar Night (-185°C). Maintain Fission baseload power and protect ECLSS life-support lines.',
  'CAPCOM Houston xác nhận: Bình minh Sol 29 đã tới Nam Cực Mặt Trăng. Pin mặt trời đã phát điện trở lại; dồn sức hoàn thành các mục tiêu khảo sát cuối cùng!':
    'CAPCOM Houston confirms: Sol 29 sunrise has reached the Lunar South Pole. Solar panels are generating power again; push to finish final survey objectives!',
  'Chỉ đặt tàu tiếp tế trong pha Liên lạc.':
    'Cargo resupply can only be ordered during Comms.',
  'Đang có tàu tiếp tế trên đường bay.':
    'A resupply cargo ship is already in transit.',
  'Bãi đáp đang hồi phục sau chuyến tiếp tế trước.':
    'Landing pad is cooling down after the previous delivery.',
  'Chỉ lập lịch Rover trong pha Liên lạc.':
    'Rover expeditions can only be scheduled during Comms.',
  'Rover đang có nhiệm vụ hoạt động.':
    'Rover already has an active mission.',
  'Chuyến thám hiểm không hợp lệ.':
    'Invalid expedition.',
  'Chuyến thám hiểm này đã được giải quyết và không thể chạy lại.':
    'This expedition has already been settled and cannot be repeated.',
  'Rover chỉ mang tối đa 3 thiết bị.':
    'Rover can carry at most 3 equipment items.',
  'Người trực phóng phải rảnh, Fit và không Tired/Starving.':
    'Launch operator must be idle, Fit, and neither Tired nor Starving.',
  'Chỉ hủy lịch Rover trong pha Liên lạc.':
    'Scheduled Rover launches can only be cancelled during Comms.',
  'Không có lịch Rover đang chờ để hủy.':
    'No scheduled Rover launch to cancel.',
  'Đã hủy lịch Rover và trả thiết bị về LR Rack.':
    'Rover launch cancelled and equipment returned to LR Rack.',
  'Chỉ khôi phục tín hiệu Rover trong pha Kỹ thuật hoặc Liên lạc.':
    'Rover signal recovery can only be performed in Engineering or Comms.',
  'Rover hiện không ở trạng thái mất tín hiệu.':
    'Rover is not currently in a signal-lost state.',
  'Đã khôi phục liên lạc với Rover.':
    'Restored communications with the Rover.',
  'Chỉ phân công thu hồi Rover trong pha Kỹ thuật hoặc Liên lạc.':
    'Rover recovery operator can only be assigned in Engineering or Comms.',
  'Rover chưa đến thời điểm phân công thu hồi.':
    'Rover is not ready for recovery assignment yet.',
  'Người thu hồi phải rảnh, Fit và không Tired/Starving.':
    'Recovery operator must be idle, Fit, and neither Tired nor Starving.',
  'Chỉ dùng Medkit trong pha Kỹ thuật hoặc Phân phối.':
    'Medkits can only be used in Engineering or Rationing.',
  'Không còn Medkit trong kho.':
    'No Medkits remaining in stock.',
  'Không thể điều trị phi hành gia đã evacuated.':
    'Cannot treat an evacuated astronaut.',
  'Chỉ Marcus Vance có bonus khi trực tiếp dùng Medkit.':
    'Only Marcus Vance provides a bonus when directly administering a Medkit.',
  'Marcus phải Fit và rảnh để trực tiếp dùng Medkit.':
    'Marcus must be Fit and idle to directly administer a Medkit.',
  'Chỉ bật/tắt WRS trong pha Kỹ thuật hoặc Phân phối.':
    'WRS can only be toggled in Engineering or Rationing.',
  'Chỉ chỉnh thứ tự ưu tiên điện trong pha Phân phối.':
    'Power priority can only be reordered in Rationing.',
  'Danh sách ưu tiên điện phải đủ 4 nhóm tải.':
    'Power priority list must contain all 4 load groups.',
  'Chỉ phát MRE trong pha Phân phối.':
    'MRE rations can only be distributed in Rationing.',
  'Không đủ gói MRE trong kho.':
    'Insufficient MRE packs in stock.',
  'Chỉ có thể chốt ngày (End-Sol) tại pha Phân phối (Rationing).':
    'End-Sol can only be resolved during the Rationing phase.',
  'Không ở màn hình Debrief.':
    'Not currently in the Debrief screen.',
  'Command không được hỗ trợ.':
    'Unsupported command.',
  'Expedition không tồn tại.':
    'Expedition does not exist.',
  'Cần ở pha Liên lạc.':
    'Must be in Comms phase.',
  'Rover đang bận.':
    'Rover is busy.',
  'Expedition đã được giải quyết.':
    'Expedition has already been settled.',
  'Chiến dịch đã kết thúc.':
    'Campaign has ended.',
  'Hãy xử lý sự kiện Morning Briefing bắt buộc trước.':
    'Resolve the mandatory Morning Briefing event first.',
  'Dùng nút Chốt ngày (End-Sol) hoặc Tiếp tục ở pha này.':
    'Use End-Sol or Continue during this phase.',
  'Hệ thống đang hoạt động 100%.':
    'System is already operating at 100%.',
  'Không có phi hành gia rảnh và Fit để sửa hệ thống.':
    'No idle and Fit astronaut available to repair systems.',
  'Chưa chọn phương án xử lý Sự kiện đầu ngày.':
    'No Morning Briefing event option selected yet.',
  'Hãy xác nhận báo cáo End-Sol để sang ngày mới.':
    'Acknowledge the End-Sol report to proceed to the next Sol.',
  'Đã tới Sol cuối nhưng chưa đủ điều kiện an toàn về crew, O₂ hoặc nước.':
    'Reached the final Sol without meeting crew, O₂, or water safety thresholds.',
  'Kết quả được giữ từ phiên bản cũ; không áp ngược rubric mới.':
    'Outcome preserved from legacy version without retroactive rubric rescoring.',
  'Trình duyệt không hỗ trợ localStorage.':
    'Browser does not support localStorage.',
  'SaveEnvelope phải là object.':
    'SaveEnvelope must be an object.',
  'File Save JSON bị hỏng.':
    'Corrupted Save JSON file.',
  'SaveEnvelope không hợp lệ.':
    'Invalid SaveEnvelope.',
  'Checksum SaveEnvelope không khớp.':
    'SaveEnvelope checksum mismatch.',
  'Metadata save không khớp state.':
    'Save metadata does not match game state.',
  'Không nhận diện content của save cũ.':
    'Unrecognized legacy save content version.',
  'Không nhận diện model của save cũ.':
    'Unrecognized legacy save simulation model.',
  'Không nhận diện catalog của save cũ.':
    'Unrecognized legacy save catalog version.',
  'Không thể migrate/validate Save.':
    'Unable to migrate or validate Save.',
  'Phiên bản content không khớp.':
    'Content version mismatch.',
  'Phiên bản simulation không khớp.':
    'Simulation model version mismatch.',
  'Phiên bản catalog không khớp.':
    'Catalog version mismatch.',
};

const sysName = (id: string) => SYSTEM_EN[id] ?? id;
const eqName = (id: string) => EQUIPMENT_EN[id] ?? id;
const itemName = (id: string) => ITEM_EN[id] ?? id;
const resName = (id: string) => RESOURCE_EN[id] ?? id;
const phaseName = (id: string) => PHASE_EN[id] ?? id;
const taskName = (id: string) => TASK_EN[id] ?? id;

/** Localize domain/engine/persistence messages dynamically for display without altering state data. */
export function localizeDomainText(text: string, locale: Locale, bundle?: ContentBundle): string {
  if (!text || locale === 'vi') return text;

  const exact = EXACT_VI_TO_EN[text];
  if (exact) return exact;

  if (bundle) {
    for (const ev of bundle.events) {
      for (const ch of ev.choices) {
        if (ch.log === text && ch.logEn?.trim()) {
          return ch.logEn;
        }
      }
    }
  }

  let m: RegExpMatchArray | null;

  if ((m = text.match(/^Kết thúc Sol (\d+): Pin ([\d.-]+) kWh, O₂ ([\d.-]+) kg, Nước ([\d.-]+) L\.$/))) {
    return `End of Sol ${m[1]}: Battery ${m[2]} kWh, O₂ ${m[3]} kg, Water ${m[4]} L.`;
  }
  if ((m = text.match(/^Sự kiện "(.+?)" đã quá hạn ở cuối Sol (\d+)\.$/))) {
    const matchedEv = bundle?.events.find((e) => e.title === m![1]);
    const title = matchedEv?.titleEn?.trim() ? matchedEv.titleEn : m[1];
    return `Event "${title}" expired at the end of Sol ${m[2]}.`;
  }
  if ((m = text.match(/^Chuyến (\S+) dừng khẩn cấp từ sự kiện (\S+)\.$/))) {
    return `Expedition ${m[1]} aborted due to event ${m[2]}.`;
  }
  if ((m = text.match(/^(.+?) sửa (\S+) hoàn chỉnh \((\d+)%\)\.$/))) {
    return `${m[1]} fully repaired ${sysName(m[2])} (${m[3]}%).`;
  }
  if ((m = text.match(/^Bão hạt DONKI làm gián đoạn: (.+?) chỉ khắc phục được một phần (\S+) \((\d+)%\)\.$/))) {
    return `DONKI particle storm interference: ${m[1]} only partially repaired ${sysName(m[2])} (${m[3]}%).`;
  }
  if ((m = text.match(/^(.+?) nâng cấp (\S+) lên Cấp (\d+)\.$/))) {
    return `${m[1]} upgraded ${sysName(m[2])} to Lv${m[3]}.`;
  }
  if ((m = text.match(/^(.+?): (\S+) đã đạt cấp tối đa Lv(\d+)\.$/))) {
    return `${m[1]}: ${sysName(m[2])} has already reached max level Lv${m[3]}.`;
  }
  if ((m = text.match(/^3D Fabricator hoàn tất (\S+) (\S+)\.$/))) {
    return `3D Fabricator finished ${ACTION_EN[m[1]] ?? m[1]} ${itemName(m[2])}.`;
  }
  if ((m = text.match(/^Đã tái chế (\S+), thu hồi \+([\d.]+) kg Phụ tùng\.$/))) {
    return `Recycled ${eqName(m[1])}, recovered +${m[2]} kg Parts.`;
  }
  if ((m = text.match(/^Xung kích DONKI IPS\/CME làm suy giảm nhẹ hệ thống (\S+)\.$/))) {
    return `DONKI IPS/CME shockwave slightly degraded ${sysName(m[1])}.`;
  }
  if ((m = text.match(/^Cửa sổ (.+?) đã đóng trước khi Rover nhận đủ điều kiện phóng\.$/))) {
    return `Launch window for ${m[1]} closed before the Rover met launch requirements.`;
  }
  if ((m = text.match(/^Rover đã được cấp ([\d.]+) kWh và rời trạm tới (.+)\.$/))) {
    return `Rover supplied with ${m[1]} kWh and departed for ${m[2]}.`;
  }
  if ((m = text.match(/^Rover vẫn mất tín hiệu \((\d+)\/2 Sol\)\.$/))) {
    return `Rover still in signal loss (${m[1]}/2 Sols).`;
  }
  if ((m = text.match(/^Rover đã thu hồi trễ bởi (.+?); nhận (.+)\.$/))) {
    return `Rover recovered late by ${m[1]}; received ${m[2]}.`;
  }
  if ((m = text.match(/^Hiểm họa (\S+) không được khắc chế\.$/))) {
    return `Hazard ${m[1]} was not mitigated.`;
  }
  if ((m = text.match(/^Rover hoàn tất "(.+?)"; (.+?) thu hồi (.+)\.$/))) {
    return `Rover completed "${m[1]}"; ${m[2]} recovered ${m[3]}.`;
  }
  if ((m = text.match(/^Bắt đầu chiến dịch Moon 32 Sol \((.+?)\)\.$/))) {
    return `Started Moon 32 Sol campaign (${m[1]}).`;
  }
  if ((m = text.match(/^Không thể chuyển pha từ "(.+?)"\.$/))) {
    return `Cannot advance phase from "${phaseName(m[1])}".`;
  }
  if ((m = text.match(/^Chuyển sang pha (\S+)\.$/))) {
    return `Switched to ${phaseName(m[1])} phase.`;
  }
  if ((m = text.match(/^(.+?) đã rời trạm\.$/))) {
    return `${m[1]} has evacuated the station.`;
  }
  if ((m = text.match(/^(.+?) đã nhận nhiệm vụ trong Sol này\.$/))) {
    return `${m[1]} already has an assigned task this Sol.`;
  }
  if ((m = text.match(/^(.+?) đang bị thương \(Injured\), chỉ có thể Rest hoặc Medical Care\.$/))) {
    return `${m[1]} is Injured and can only perform Rest or Medical Care.`;
  }
  if ((m = text.match(/^(.+?) đang mệt \(Tired\), không thể trực Rover hoặc xử lý khẩn cấp\.$/))) {
    return `${m[1]} is Tired and cannot operate the Rover or handle emergency response.`;
  }
  if ((m = text.match(/^(.+?) đang đói lả \(Starving\), bị cấm vận hành Rover\.$/))) {
    return `${m[1]} is Starving and cannot operate the Rover.`;
  }
  if ((m = text.match(/^Cần ([\d.]+) kg Phụ tùng để sửa hệ thống\.$/))) {
    return `Requires ${m[1]} kg Parts to repair the system.`;
  }
  if ((m = text.match(/^(\S+) đã đạt hoặc đang chờ nâng cấp tối đa \(Lv(\d+)\)\.$/))) {
    return `${sysName(m[1])} is already at or queued for max level (Lv${m[2]}).`;
  }
  if ((m = text.match(/^Cần ([\d.]+) kg Phụ tùng để nâng cấp (\S+)\.$/))) {
    return `Requires ${m[1]} kg Parts to upgrade ${sysName(m[2])}.`;
  }
  if ((m = text.match(/^Đã phân công (.+?): (\S+)\.$/))) {
    return `Assigned ${m[1]}: ${taskName(m[2])}.`;
  }
  if ((m = text.match(/^(.+?) chưa được giao việc\.$/))) {
    return `${m[1]} has no assigned task.`;
  }
  if ((m = text.match(/^Đã hủy phân công cho (.+?)\.$/))) {
    return `Unassigned ${m[1]}.`;
  }
  if ((m = text.match(/^Cần 3D Fabricator Lv(\d+) để chế tạo (.+)\.$/))) {
    return `Requires 3D Fabricator Lv${m[1]} to craft ${m[2]}.`;
  }
  if ((m = text.match(/^(.+?) đã có trên LR Rack\.$/))) {
    return `${m[1]} is already on the LR Rack.`;
  }
  if ((m = text.match(/^(.+?) không có nâng cấp Lv2\.$/))) {
    return `${m[1]} has no Lv2 upgrade.`;
  }
  if ((m = text.match(/^Chưa sở hữu (.+?) để nâng cấp\.$/))) {
    return `${m[1]} is not owned yet to upgrade.`;
  }
  if ((m = text.match(/^(.+?) đã đạt Cấp 2\.$/))) {
    return `${m[1]} has already reached Lv2.`;
  }
  if ((m = text.match(/^(.+?) không cần sửa chữa\.$/))) {
    return `${m[1]} does not need repair.`;
  }
  if ((m = text.match(/^(.+?) không thể tái chế lúc này\.$/))) {
    return `${m[1]} cannot be recycled right now.`;
  }
  if ((m = text.match(/^Cần ([\d.]+) kg Phụ tùng\.$/))) {
    return `Requires ${m[1]} kg Parts.`;
  }
  if ((m = text.match(/^Cần ([\d.]+) L Nước\.$/))) {
    return `Requires ${m[1]} L Water.`;
  }
  if ((m = text.match(/^3D Fabricator bắt đầu (\S+) (.+)\.$/))) {
    return `3D Fabricator started ${ACTION_EN[m[1]] ?? m[1]} ${m[2]}.`;
  }
  if ((m = text.match(/^Tổng số slot phải từ 1 đến (\d+) \(tối đa 80 kg\)\.$/))) {
    return `Total slots must be between 1 and ${m[1]} (max 80 kg).`;
  }
  if ((m = text.match(/^Đã phóng tàu tiếp tế \((\d+) kg\), dự kiến hạ cánh tại Sol (\d+)\.$/))) {
    return `Launched cargo resupply (${m[1]} kg), expected landing at Sol ${m[2]}.`;
  }
  if ((m = text.match(/^Chỉ có thể lập lịch chuyến này trong Sol (\d+)-(\d+)\.$/))) {
    return `This expedition can only be scheduled during Sol ${m[1]}-${m[2]}.`;
  }
  if ((m = text.match(/^Thiết bị (\S+) không sẵn sàng gắn lên Rover\.$/))) {
    return `Equipment ${eqName(m[1])} is not ready to load onto the Rover.`;
  }
  if ((m = text.match(/^(.+?) đã lập lịch phóng Rover tới (.+)\.$/))) {
    return `${m[1]} scheduled Rover launch to ${m[2]}.`;
  }
  if ((m = text.match(/^Chỉ phân công thu hồi từ Sol (\d+)\.$/))) {
    return `Recovery operator can only be assigned starting Sol ${m[1]}.`;
  }
  if ((m = text.match(/^(.+?) sẽ trực thu hồi Rover\.$/))) {
    return `${m[1]} will stand by for Rover recovery.`;
  }
  if ((m = text.match(/^(.+?) đang có Health tối đa\.$/))) {
    return `${m[1]} already has maximum Health.`;
  }
  if ((m = text.match(/^Đã dùng Medkit cho (.+?): Health (\d+)\.$/))) {
    return `Administered Medkit to ${m[1]}: Health ${m[2]}.`;
  }
  if ((m = text.match(/^Đã hoàn tất tính toán End-Sol (\d+)\.$/))) {
    return `Completed End-Sol ${m[1]} resolution.`;
  }
  if ((m = text.match(/^Bắt đầu Sol (\d+)\.$/))) {
    return `Started Sol ${m[1]}.`;
  }
  if ((m = text.match(/^Cửa sổ Sol (\d+)-(\d+)\.$/))) {
    return `Window Sol ${m[1]}-${m[2]}.`;
  }
  if ((m = text.match(/^Cảnh báo đói lả: (.+?) cần phát MRE\.$/))) {
    return `Starvation warning: ${m[1]} need MRE rations.`;
  }
  if ((m = text.match(/^Yêu cầu thiết bị (\S+) còn tốt\.$/))) {
    return `Requires functional ${eqName(m[1])}.`;
  }
  if ((m = text.match(/^Yêu cầu điều kiện (\S+)\.$/))) {
    return `Requires condition: ${m[1]}.`;
  }
  if ((m = text.match(/^(.+?) cần ở trạng thái Fit\.$/))) {
    return `${m[1]} must be Fit.`;
  }
  if ((m = text.match(/^(.+?) đang bận nhiệm vụ khác\.$/))) {
    return `${m[1]} is busy with another task.`;
  }
  if ((m = text.match(/^Không đủ (\S+) \((.+?)\)\.$/))) {
    return `Insufficient ${resName(m[1])} (${m[2]}).`;
  }
  if ((m = text.match(/^Không đủ (.+?) cho lựa chọn này\.$/))) {
    return `Insufficient ${resName(m[1])} for this choice.`;
  }
  if ((m = text.match(/^Hoàn thành (\d+) Sol sinh tồn tại Căn cứ Mặt Trăng Artemis!$/))) {
    return `Survived ${m[1]} Sols at Artemis Lunar Base!`;
  }
  if ((m = text.match(/^Đội phi hành gia dưới ngưỡng (\d+) người hoạt động\.$/))) {
    return `Active crew dropped below ${m[1]} astronauts.`;
  }
  if ((m = text.match(/^Cạn dưỡng khí (\d+) Sol liên tiếp\.$/))) {
    return `Oxygen depleted for ${m[1]} consecutive Sols.`;
  }
  if ((m = text.match(/^Cạn nước sạch (\d+) Sol liên tiếp\.$/))) {
    return `Clean water depleted for ${m[1]} consecutive Sols.`;
  }
  if ((m = text.match(/^Không thể ghi Save: (.+)$/))) {
    return `Unable to write Save: ${m[1]}`;
  }
  if ((m = text.match(/^SaveEnvelope thiếu trường (\S+)\.$/))) {
    return `SaveEnvelope missing field ${m[1]}.`;
  }
  if ((m = text.match(/^SaveEnvelope\.(\S+) không hợp lệ\.$/))) {
    return `Invalid SaveEnvelope.${m[1]}.`;
  }
  if ((m = text.match(/^Phiên bản ứng dụng không khớp \(Save: (.+?), App: (.+?)\)\.$/))) {
    return `App version mismatch (Save: ${m[1]}, App: ${m[2]}).`;
  }
  if ((m = text.match(/^Đã nâng cấp save v(\d+) lên v4\..+$/))) {
    return `Upgraded save v${m[1]} to v4. Continuing under Phase 1.4 rules; missing legacy history data is noted. Original save was retained if browser storage permitted.`;
  }

  return text;
}
