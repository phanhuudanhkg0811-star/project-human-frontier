import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Rocket } from 'lucide-react';
import { playSfx } from '../../audio/sfx.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { DifficultyId } from '../../types/index.ts';
import { MissionProgressionPanel } from '../MissionProgressionPanel.tsx';
import { HailSelect } from '../HailSelect.tsx';
import { MissionDialog } from './MissionDialog.tsx';
import { ArtifactExportButtons, TrainingReport } from '../CampaignReportCard.tsx';
import { useI18n } from '../../i18n/useI18n.ts';

const PROFILE_TONE_CLASS: Readonly<Record<string, string>> = {
  'may-2024-xstorm': 'is-extreme',
  'oct-2024-x9storm': 'is-balanced',
  'dec-2024-jan-2025-mixed': 'is-starter',
};

interface MissionLaunchModalProps {
  onClose: () => void;
}

export function MissionLaunchModal({ onClose }: MissionLaunchModalProps) {
  const { gameState, bundle, dispatch, hasSavedCampaign } = useGameStore();
  const appScreen = useUiStore((s) => s.appScreen);
  const enterCockpit = useUiStore((s) => s.enterCockpit);
  const [selectedProfile, setSelectedProfile] = useState(gameState.campaign.donkiProfileId);
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>(gameState.campaign.difficulty);
  const [seed, setSeed] = useState(gameState.campaign.seed);
  const { t, pickText } = useI18n();
  const showActiveCampaignReports = hasSavedCampaign || appScreen === 'cockpit';

  const handleStartNew = async () => {
    playSfx('launch', 0.6);
    const res = await dispatch({
      type: 'game/start',
      donkiProfileId: selectedProfile,
      difficulty,
      seed,
    });
    if (res.ok) {
      enterCockpit();
    }
    onClose();
  };

  return (
    <MissionDialog
      title={t('modal.launchTitle', { sols: bundle.campaign.targetSol })}
      eyebrow={t('modal.launchEyebrow')}
      panelType="launch"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 text-slate-200">
        {showActiveCampaignReports && (
          <>
            <MissionProgressionPanel />
            <TrainingReport state={gameState} bundle={bundle} />
            <ArtifactExportButtons />
          </>
        )}

        <section className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/70 flex flex-col gap-3 text-xs">
          <h3 className="font-bold text-cyan-300">{t('launch.newCampaign')}</h3>

          <div className="phf-launch-profile-list">
            {bundle.donki.samples.map((sample) => {
              const isSelected = selectedProfile === sample.id;
              const isExpanded = expandedProfileId === sample.id;
              const knownProfile = sample.id in PROFILE_TONE_CLASS;
              const toneClass = PROFILE_TONE_CLASS[sample.id] ?? 'is-balanced';
              const friendlyTitle = knownProfile
                ? t(`launch.profile.${sample.id}.title`)
                : sample.name;
              const badgeText = knownProfile
                ? t(`launch.profile.${sample.id}.badge`)
                : sample.startDate;
              const summaryText = knownProfile
                ? t(`launch.profile.${sample.id}.summary`)
                : sample.description;
              const detailPanelId = `donki-detail-${sample.id}`;

              return (
                <div
                  key={sample.id}
                  className={`phf-launch-profile-card ${isSelected ? 'is-selected' : ''}`.trim()}
                >
                  <div className="phf-launch-profile-row">
                    <label className="phf-launch-profile-select">
                      <input
                        type="radio"
                        name="donki-profile"
                        checked={isSelected}
                        onChange={() => setSelectedProfile(sample.id)}
                        className="phf-launch-radio"
                      />
                      <div className="phf-launch-profile-main">
                        <div className="phf-launch-profile-head">
                          <span className="phf-launch-profile-title">{friendlyTitle}</span>
                          <span className={`phf-launch-pill ${toneClass}`}>{badgeText}</span>
                          <span className="phf-launch-storm-count">
                            {t('launch.stormDaysCount', {
                              count: sample.summary.stormOrExtremeSols.length,
                            })}
                          </span>
                        </div>
                        <p className="phf-launch-profile-summary">{summaryText}</p>
                      </div>
                    </label>

                    <button
                      type="button"
                      className="phf-launch-detail-btn"
                      aria-expanded={isExpanded}
                      aria-controls={detailPanelId}
                      aria-label={t('launch.detailsAria', { name: friendlyTitle })}
                      onClick={() =>
                        setExpandedProfileId((prev) => (prev === sample.id ? null : sample.id))
                      }
                    >
                      <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{isExpanded ? t('launch.hideDetails') : t('launch.viewDetails')}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {isExpanded && (
                    <div id={detailPanelId} className="phf-launch-detail-drawer">
                      <div className="phf-launch-detail-meta">
                        <strong>{sample.name}</strong>
                        <span>
                          {t('launch.dateWindow', {
                            start: sample.startDate,
                            end: sample.endDate,
                          })}
                        </span>
                      </div>
                      <p className="phf-launch-detail-desc">{sample.description}</p>
                      <p className="phf-launch-detail-metrics">
                        FLR: {sample.summary.totalFlares} (X={sample.summary.xClassFlares}, M=
                        {sample.summary.mClassFlares}) · CME: {sample.summary.totalCmes} · SEP:{' '}
                        {sample.summary.totalSeps} · IPS: {sample.summary.totalIps}
                      </p>
                      <small className="phf-launch-detail-glossary">
                        {t('launch.telemetryGlossary')}
                      </small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <HailSelect
              label={t('common.difficulty')}
              value={difficulty}
              onChange={(val) => setDifficulty(val as DifficultyId)}
              options={Object.values(bundle.campaign.difficultyProfiles).map((d) => ({
                value: d.id,
                label: pickText(d.label, d.labelEn),
              }))}
            />
            <label className="hail-select-field">
              <span className="hail-select-label">{t('launch.seed')}</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="hail-select-trigger font-mono"
              />
            </label>
          </div>

          <button type="button" disabled={!Number.isSafeInteger(seed)} onClick={handleStartNew} className="hail-btn hail-btn--accent py-2 font-bold flex items-center justify-center gap-2">
            <Rocket className="w-4 h-4" aria-hidden="true" />
            {t('launch.start')}
          </button>
        </section>
      </div>
    </MissionDialog>
  );
}
