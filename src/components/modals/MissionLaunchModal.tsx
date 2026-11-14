import { useState } from 'react';
import { Rocket } from 'lucide-react';
import { useGameStore } from '../../store/gameStore.ts';
import type { DifficultyId } from '../../types/index.ts';
import { MissionProgressionPanel } from '../MissionProgressionPanel.tsx';
import { MissionDialog } from './MissionDialog.tsx';

interface MissionLaunchModalProps {
  onClose: () => void;
}

export function MissionLaunchModal({ onClose }: MissionLaunchModalProps) {
  const { gameState, bundle, dispatch } = useGameStore();
  const [selectedProfile, setSelectedProfile] = useState(gameState.campaign.donkiProfileId);
  const [difficulty, setDifficulty] = useState<DifficultyId>(gameState.campaign.difficulty);
  const [seed, setSeed] = useState(gameState.campaign.seed);

  const handleStartNew = async () => {
    await dispatch({
      type: 'game/start',
      donkiProfileId: selectedProfile,
      difficulty,
      seed,
    });
    onClose();
  };

  return (
    <MissionDialog
      title="Thiết lập Chiến dịch & Mục tiêu Moon 32 Sol"
      eyebrow="NASA DONKI SPACE WEATHER PROFILES"
      panelType="launch"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 text-slate-200">
        <MissionProgressionPanel />

        <section className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/70 flex flex-col gap-3 text-xs">
          <h3 className="font-bold text-cyan-300">Khởi tạo Chiến dịch Mới với Mẫu Dữ liệu NASA DONKI (32 ngày)</h3>

          <div className="grid grid-cols-1 gap-2">
            {bundle.donki.samples.map((sample) => (
              <label
                key={sample.id}
                className={`p-2.5 rounded border cursor-pointer flex items-start gap-2.5 ${
                  selectedProfile === sample.id
                    ? 'border-cyan-400 bg-cyan-950/40'
                    : 'border-slate-800 bg-slate-950/70'
                }`}
              >
                <input
                  type="radio"
                  name="donki-profile"
                  checked={selectedProfile === sample.id}
                  onChange={() => setSelectedProfile(sample.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-semibold text-white">
                    {sample.name} <span className="font-mono text-[10px] text-cyan-300">({sample.startDate} → {sample.endDate})</span>
                  </div>
                  <p className="text-slate-400 mt-0.5">{sample.description}</p>
                  <p className="font-mono text-[10px] text-amber-300 mt-1">
                    FLR: {sample.summary.totalFlares} (X={sample.summary.xClassFlares}, M={sample.summary.mClassFlares}) · CME: {sample.summary.totalCmes} · SEP: {sample.summary.totalSeps} · IPS: {sample.summary.totalIps}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-slate-400">Độ khó:</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyId)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
              >
                {Object.values(bundle.campaign.difficultyProfiles).map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-400">Mission Seed (Deterministic):</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 205001)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-mono"
              />
            </label>
          </div>

          <button type="button" onClick={handleStartNew} className="hail-btn hail-btn--accent py-2 font-bold flex items-center justify-center gap-2">
            <Rocket className="w-4 h-4" />
            Bắt đầu Chiến dịch Mới (Reset về Sol 1)
          </button>
        </section>
      </div>
    </MissionDialog>
  );
}
