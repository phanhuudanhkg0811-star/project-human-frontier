# Quyết định phạm vi chính thức của Project Hail

> Cập nhật ngày **14/11/2026** theo quyết định mới nhất của chủ dự án. Tài liệu này cao hơn các GDD/handoff/roadmap cũ khi có mâu thuẫn.

## 1. Ba chế độ/campaign độc lập

```text
PHASE 1                         PHASE 2
Moon Survival                  Mars Survival
32 Sol                         Campaign riêng
Save/state riêng               Save/state riêng

              ADVANCED MODE — về sau
              Moon → Mars hai chặng
              Độ khó cao, không phải default
```

### Moon Campaign

- Màn độc lập 32 Sol.
- Không cần phóng sang Mars để thắng.
- Trọng tâm: rover training, Sol 7 crisis, chuẩn bị và sống qua Lunar Night 14 Sol.

### Mars Campaign

- Màn độc lập, bắt đầu từ Mars initial state riêng.
- Không nhận crew/resource/save từ Moon Campaign.
- MOXIE, radio latency, dust storm và Mars rover thuộc PHASE 2.

### Advanced Two-Arc Mode

- Moon → Hohmann transfer → Mars.
- Là difficulty/mode cao hơn, mở sau khi hai campaign độc lập ổn định.
- Có thể tái sử dụng engine/content nhưng có transition balance riêng.
- Không thuộc release gate PHASE 1.

## 2. PHASE 1 chính thức: Moon 32 Sol

| Chặng | Sol | Nội dung |
| --- | ---: | --- |
| Training I | 1–4 | Onboarding + Expedition 1 |
| Training II | 5–8 | Expedition 2 + golden crisis Sol 7 |
| Training III | 9–12 | Expedition 3 + Moon Training Report |
| Preparation | 13–14 | Sửa chữa, tích điện, cargo cuối trước đêm |
| Lunar Night | 15–28 | Solar 0 kWh; sống bằng fission, pin và rationing |
| Recovery | 29–31 | Mặt Trời trở lại, khôi phục hệ thống/tài nguyên |
| Finale | 32 | Tổng kiểm tra và Moon Victory/Defeat Report |

## 3. Điều kiện kết thúc baseline

Các ngưỡng nằm trong `moon32` campaign config, không hardcode ở UI.

- **Moon Victory:** hoàn thành End-Sol 32, còn crew hoạt động và trạm duy trì được life support.
- **S-Rank đề xuất:** 4 crew còn sống/fit, 3/3 expedition, system/resource vượt ngưỡng cao.
- **A-Rank đề xuất:** ít nhất 3 crew còn hoạt động, tối thiểu 2/3 expedition và đạt ngưỡng sống còn.
- **Defeat:** toàn bộ crew evacuated hoặc life-support collapse không thể phục hồi.

Ngưỡng rank cụ thể được khóa ở PHASE 1.4 bằng simulation, không viết trong component.

## 4. Yêu cầu nhóm trưởng được giữ trong Moon scope

- Cockpit V12: 6 module, 2 rack và Observation Window.
- Crew assignment, medical/First Aid, MRE, Sample Canister và Core Drill.
- Moon rover: Lunar Crater, Regolith Field, PSR.
- Event flags/choice-made, resource/environment conditions và effect mở rộng.
- 18–24 event phân nhánh **dành cho Moon**, gồm Lunar Night.
- LocalStorage persistence, Mission Seed và difficulty.
- Dynamic STEM Debrief, Resource Predictor và biểu đồ 5 Sol.
- Victory/Game Over/NASA Cadet Report Card.
- Canvas 2D Moon day/night, Web Audio procedural và VI/EN.
- Full E2E 32 Sol và performance/accessibility release gate.

## 5. Nội dung hoãn khỏi PHASE 1

- Mars campaign, MOXIE, Mars dust storm, 14-minute radio và Mars rover sites.
- Hohmann transfer và state carry-over Moon→Mars.
- Advanced Two-Arc balance, unlock flow và combined Report Card.

Code Mars prototype hiện có không cần xóa. Nó phải được cô lập theo `campaignId`/feature boundary để không xuất hiện hoặc ảnh hưởng Moon 32.

## 6. Campaign contract

```ts
type CampaignId = 'moon-32' | 'mars-survival' | 'moon-to-mars-advanced';

interface CampaignDefinition {
  id: CampaignId;
  totalSols: number | null;
  initialStateId: string;
  phases: readonly CampaignPhaseDefinition[];
  victoryRequirements: MissionRequirements;
  rankingRules: readonly RankingRule[];
}
```

State/save luôn ghi `campaignId`. Không được load save Moon vào Mars hoặc advanced mode nếu không có migration/transition chính thức.

## 7. Nguồn ưu tiên

1. Quyết định trong tài liệu này.
2. Kế hoạch PHASE 1.1–1.6 đã sửa cho Moon 32.
3. Tài liệu nhóm trưởng về V12, decision tree và award features trong phạm vi Moon.
4. Code/test/data contract hiện hành.
5. GDD/roadmap cũ.

## 8. Dependency V12

Tọa độ V12 đã được nhận vào PHASE 1.5. `assets_staging/hail-v12-rack-consolidation/` chưa có trong repository hiện tại; Visual Lead phải bàn giao asset/contract hoặc xác nhận fallback trước integration gate.

**Kết luận:** toàn team tập trung phát hành Moon Survival 32 Sol trước; Mars và chế độ hai chặng không được chen vào critical path PHASE 1.
