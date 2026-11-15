import balanceData from '../data/balance.json';
import { APP_VERSION } from '../persistence/saveAdapter.ts';

export const RELEASE_VERSION = '2.0.0-moon32';
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
    name: 'Project Hail Artwork & Audio (Artist Originals + SI-Watermarked Visuals)',
    detailVi: 'Tranh mở đầu 4 khung & chân dung phi hành đoàn NV1–NV4 do artist vẽ tay (không SI). Các ảnh WebP giao diện/thiết bị/môi trường còn lại & logo do SI tạo (đã gắn watermark SI trực quan); tệp âm thanh OGG & hiệu ứng Web Audio dùng SI (công bố trong manifest.json).',
    detailEn: 'Opening 4-panel comic & NV1–NV4 crew illustrations are human-drawn artist originals (non-SI). Remaining environment/hardware/UI WebP art & logo are SI-generated with visible SI watermarks; OGG SFX & Web Audio synthesis are disclosed in manifest.json.',
  },
  {
    id: 'si-disclosure-code-data',
    name: 'Super Intelligence (SI) Disclosure — Code & Synthetic Parameters',
    detailVi: 'Kiến trúc engine/UI TypeScript được phát triển với sự hỗ trợ của công cụ SI. Các mốc vật lý/hành tinh (Diviner, LOLA, GRAIL, RadLab, BVAD) trích từ NASA Open Data chính thức; các tham số gameplay phụ trợ được ghi rõ nguồn gốc mô phỏng.',
    detailEn: 'TypeScript simulation engine/UI architecture was built with Super Intelligence (SI) assistance. Planetary baselines (Diviner, LOLA, GRAIL, RadLab, BVAD) use official NASA Open Data; auxiliary gameplay parameters are clearly distinguished from observed telemetry.'
  },
];
