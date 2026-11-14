import balanceData from '../data/balance.json';
import { APP_VERSION } from '../persistence/saveAdapter.ts';

export const RELEASE_VERSION = '1.6.0-moon32';
export const SAVE_SCHEMA_VERSION = 4 as const;

export interface AttributionEntry {
  readonly id: string;
  readonly name: string;
  readonly detailVi: string;
  readonly detailEn: string;
  readonly url?: string;
}

export const RELEASE_META = {
  releaseVersion: RELEASE_VERSION,
  saveAppVersion: APP_VERSION,
  schemaVersion: SAVE_SCHEMA_VERSION,
  contentVersion: balanceData.contentVersion,
  modelVersion: balanceData.modelVersion,
  catalogVersion: balanceData.catalogVersion,
} as const;

export const NASA_DATA_SOURCES: readonly AttributionEntry[] = [
  {
    id: 'nasa-donki',
    name: 'NASA DONKI (Space Weather Database)',
    detailVi: 'Dữ liệu bão mặt trời CME, SEP, IPS & Solar Flare (3 cửa sổ 32 ngày chuẩn hóa xác định).',
    detailEn: 'Solar Flare, CME, SEP & IPS storm telemetry timelines (3 deterministic 32-day windows).',
    url: 'https://api.nasa.gov/DONKI/',
  },
  {
    id: 'nasa-diviner-lola',
    name: 'NASA LRO Diviner & LOLA (PDS)',
    detailVi: 'Nhiệt độ bề mặt cực Nam Mặt Trăng (ngày/đêm cực đoan) & địa hình Shackleton / PSR.',
    detailEn: 'Lunar South Pole extreme thermal cycles & Shackleton / PSR terrain reference.',
    url: 'https://pds.nasa.gov/',
  },
  {
    id: 'nasa-osdr-radlab',
    name: 'NASA OSDR RadLab & Artemis ECLSS',
    detailVi: 'Tham chiếu liều bức xạ mGy và định mức hồi thu nước WRS / oxy ECLSS.',
    detailEn: 'Radiation dosimetry (mGy) & Artemis-class WRS / ECLSS life-support baselines.',
    url: 'https://visualization.osdr.nasa.gov/radlab/',
  },
];

export const THIRD_PARTY_CREDITS: readonly AttributionEntry[] = [
  {
    id: 'stack-core',
    name: 'React 18 · TypeScript · Zustand · Vite · Tailwind CSS',
    detailVi: 'Kiến trúc engine mô phỏng TypeScript thuần + UI cockpit tương tác.',
    detailEn: 'Pure TypeScript deterministic simulation engine + interactive tactile cockpit UI.',
  },
  {
    id: 'fonts-icons',
    name: 'Chakra Petch · JetBrains Mono · Lucide Icons',
    detailVi: 'Bộ chữ hiển thị STEM và biểu tượng điều khiển thân thiện trẻ 7–12 tuổi.',
    detailEn: 'Readable STEM telemetry typography & icon set tailored for cadets aged 7–12.',
  },
  {
    id: 'hail-assets',
    name: 'Project Hail AeroMatte 2050 Assets & Procedural Web Audio',
    detailVi: 'Bộ ảnh cockpit/crew/event WebP (manifest 141 assets) & âm thanh tổng hợp trình duyệt.',
    detailEn: 'Custom WebP cockpit/crew/event artwork (141-asset manifest) & synthesized Web Audio SFX.',
  },
];
