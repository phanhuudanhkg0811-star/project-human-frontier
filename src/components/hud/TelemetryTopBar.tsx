import { selectMissionProgress, selectWeatherOutlook } from '../../domain/selectors.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { DonkiLevel, SolPhase } from '../../types/index.ts';
import { HAIL_SVG } from '../cabin/hailAssets.ts';

const PHASE_LABELS: Record<SolPhase, string> = {
  briefing: 'PHA 1 · GIAO BAN SÁNG',
  engineering: 'PHA 2 · KỸ THUẬT & XƯỞNG 3D',
  comms: 'PHA 3 · LIÊN LẠC & ROVER',
  rationing: 'PHA 4 · KHẨU PHẦN & ĐIỆN',
  resolving: 'ĐANG TÍNH TOÁN END-SOL',
  debrief: 'PHA 5 · BÁO CÁO ĐÊM',
  terminal: 'KẾT THÚC CHIẾN DỊCH',
};

const DONKI_BADGE: Record<DonkiLevel, { label: string; colorClass: string }> = {
  quiet: { label: 'DONKI: YÊN TĨNH', colorClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/50' },
  moderate: { label: 'DONKI: HOẠT ĐỘNG NHẸ', colorClass: 'text-sky-300 border-sky-500/40 bg-sky-950/50' },
  storm: { label: 'DONKI: BÃO MẶT TRỜI', colorClass: 'text-amber-300 border-amber-500/50 bg-amber-950/60' },
  extreme: { label: 'DONKI: SIÊU BÃO X-CLASS', colorClass: 'text-rose-300 border-rose-500/60 bg-rose-950/70' },
};

export function TelemetryTopBar() {
  const { gameState, bundle } = useGameStore();
  const r = gameState.resources;
  const sol = gameState.clock.sol;
  const targetSol = gameState.campaign.targetSol;
  const progress = selectMissionProgress(gameState, bundle);
  const weather = selectWeatherOutlook(gameState, bundle);
  const badge = DONKI_BADGE[weather.level];

  const metrics = [
    { key: 'pwr', label: 'Pin', value: r.batteryKWh, cap: bundle.balance.storages.batteryKWh.max, unit: 'kWh', icon: HAIL_SVG.resPower, warn: r.batteryKWh < 14 },
    { key: 'o2', label: 'O₂', value: r.oxygenKg, cap: bundle.balance.storages.oxygenKg.max, unit: 'kg', icon: HAIL_SVG.resOxygen, warn: r.oxygenKg < 18 },
    { key: 'h2o', label: 'Nước', value: r.waterL, cap: bundle.balance.storages.waterL.max, unit: 'L', icon: HAIL_SVG.resWater, warn: r.waterL < 22 },
    { key: 'parts', label: 'Phụ tùng', value: r.partsKg, cap: bundle.balance.storages.partsKg.max, unit: 'kg', icon: HAIL_SVG.resParts, warn: r.partsKg < 4 },
    { key: 'mre', label: 'MRE', value: r.mrePacks, cap: bundle.balance.consumables.mrePacks.max, unit: 'gói', icon: HAIL_SVG.resFood, warn: r.mrePacks < 6 },
  ];

  return (
    <header className="hail-telemetry" aria-label="Thông số sinh tồn trạm Artemis">
      <div className="hail-mission-id">
        <img src={HAIL_SVG.badgeNasaStem} alt="NASA STEM" className="hail-emblem-icon" />
        <div className="hail-mission-titles">
          <div className="hail-title-row">
            <strong>ARTEMIS BASE</strong>
            <span className="hail-sol-pill">
              SOL {String(sol).padStart(2, '0')} / {targetSol}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${progress.isLunarNight ? 'text-indigo-200 border-indigo-400/50 bg-indigo-950/60' : 'text-amber-200 border-amber-400/40 bg-amber-950/40'}`}>
              {progress.isLunarNight ? 'ĐÊM TRĂNG (SOLAR 0)' : 'BAN NGÀY MẶT TRĂNG'}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${badge.colorClass}`} title={weather.headline ?? 'Dữ liệu NASA DONKI'}>
              {badge.label}
            </span>
          </div>
          <span className="hail-sub-row">
            {`MOON SURVIVAL 32 SOL · ${PHASE_LABELS[gameState.clock.phase]}`}
          </span>
        </div>
      </div>

      <dl className="hail-resource-strip">
        {metrics.map((m) => (
          <div key={m.key} className={`hail-res-pill ${m.warn ? 'is-warn' : ''}`} title={`${m.label}: ${m.value}/${m.cap} ${m.unit}`}>
            <img src={m.icon} alt="" className="hail-res-icon" />
            <div className="hail-res-data">
              <dt>{m.label}</dt>
              <dd>
                {Number.isInteger(m.value) ? m.value : m.value.toFixed(1)}
                <small>{m.unit}</small>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </header>
  );
}
