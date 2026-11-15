import { useState } from 'react';
import { HeartPulse, Coffee, ShieldAlert, Undo2 } from 'lucide-react';
import { playSfx } from '../../audio/sfx.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import type { CrewId } from '../../types/index.ts';
import { getHailCrewVisual } from '../cabin/hailAssets.ts';
import { HailSelect } from '../HailSelect.tsx';
import { MissionDialog } from './MissionDialog.tsx';
import { useI18n } from '../../i18n/useI18n.ts';
import { TOUR_TARGET_IDS } from '../../onboarding/targets.ts';

interface CharacterSheetModalProps {
  onClose: () => void;
}

const HUNGER_BADGE = {
  ok: 'text-emerald-300 bg-emerald-950/50 border-emerald-500/40',
  hungry: 'text-amber-300 bg-amber-950/60 border-amber-500/40',
  starving: 'text-rose-300 bg-rose-950/70 border-rose-500/60',
} as const;

export function CharacterSheetModal({ onClose }: CharacterSheetModalProps) {
  const { t, locale, pickText, localize } = useI18n();
  const { gameState, bundle, dispatch } = useGameStore();
  const { selectedCrewId } = useUiStore();
  const [note, setNote] = useState<string | null>(null);
  const [medTarget, setMedTarget] = useState<CrewId>(selectedCrewId ?? 'cmd');
  const canAssign = gameState.clock.phase === 'engineering' || gameState.clock.phase === 'comms';
  const medPhaseOpen = gameState.clock.phase === 'engineering' || gameState.clock.phase === 'rationing';
  const medTargetCrew = gameState.crew[medTarget];
  const canUseMedkit =
    medPhaseOpen &&
    gameState.resources.medkits > 0 &&
    medTargetCrew.condition !== 'evacuated' &&
    medTargetCrew.health < 100;
  const canMarcusAssist =
    canUseMedkit && gameState.crew.doc.condition === 'fit' && gameState.crew.doc.assignedTask === null;

  const handleAssign = async (crewId: CrewId, task: 'rest' | 'emergency-response' | 'medical-care') => {
    const res = await dispatch({
      type: 'crew/assign',
      crewId,
      task,
      targetCrewId: task === 'medical-care' ? medTarget : undefined,
    });
    if (res.ok) playSfx('click', 0.45);
    setNote(res.ok ? res.effects[0]?.message ?? t('character.assigned') : res.error.message);
  };

  const handleUnassign = async (crewId: CrewId) => {
    const res = await dispatch({ type: 'crew/unassign', crewId });
    if (res.ok) playSfx('click', 0.4);
    setNote(res.ok ? res.effects[0]?.message ?? t('character.unassigned') : res.error.message);
  };

  const handleMedkit = async (withMarcus: boolean) => {
    const res = await dispatch({
      type: 'crew/use-medkit',
      targetCrewId: medTarget,
      administeredByCrewId: withMarcus ? 'doc' : undefined,
    });
    if (res.ok) playSfx('repair', 0.55);
    setNote(res.ok ? res.effects[0]?.message ?? t('character.medkitUsed') : res.error.message);
  };

  return (
    <MissionDialog
      title={t('modal.characterTitle')}
      eyebrow={t('modal.characterEyebrow')}
      panelType="character"
      dockSide="center"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        <p className="text-[11px] leading-relaxed text-slate-400 px-1">
          {t('character.initialBaselineNote')}
        </p>

        {note && (
          <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
            {localize(note, bundle)}
          </div>
        )}

        <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-700/80 flex flex-col gap-2.5 text-xs">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-rose-300 shrink-0" />
            <strong>{t('character.medkitStock', { count: gameState.resources.medkits })}</strong>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <HailSelect
                label={t('character.medkitTarget')}
                size="sm"
                value={medTarget}
                onChange={(val) => setMedTarget(val as CrewId)}
                options={(['cmd', 'eng', 'doc', 'geo'] as const).map((id) => ({
                  value: id,
                  label: gameState.crew[id].name,
                  meta: gameState.crew[id].roleTag,
                  disabled: gameState.crew[id].condition === 'evacuated',
                }))}
              />
            </div>
            <button
              type="button"
              disabled={!canUseMedkit}
              title={canUseMedkit ? undefined : t('character.medkitHint')}
              onClick={() => handleMedkit(false)}
              className="hail-btn"
            >
              {t('character.selfAdminister', { amount: gameState.resources.medkitLevel === 2 ? 50 : 30 })}
            </button>
            <button
              type="button"
              disabled={!canMarcusAssist}
              title={canMarcusAssist ? undefined : canUseMedkit ? t('character.marcusHint') : t('character.medkitHint')}
              onClick={() => handleMedkit(true)}
              className="hail-btn hail-btn--accent"
            >
              {t('character.marcusAdminister')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-tour={TOUR_TARGET_IDS.CREW_ASSIGNMENT}>
          {(['cmd', 'eng', 'doc', 'geo'] as const).map((crewId) => {
            const member = gameState.crew[crewId];
            const profile = bundle.crewCatalog.find((p) => p.id === crewId);
            const visual = getHailCrewVisual(crewId, member, false, locale);
            const isSelected = selectedCrewId === crewId;
            const isTired = member.morale < bundle.balance.crew.tiredBelowMorale;

            return (
              <div
                key={crewId}
                className={`p-3 rounded-lg bg-slate-900/75 border flex flex-col gap-2 ${isSelected ? 'border-teal-400/80 ring-1 ring-teal-400/40' : 'border-slate-700/80'
                  }`}
              >
                <div className="flex items-start gap-3">
                  <img
                    src={visual.portrait}
                    alt={member.name}
                    className="w-16 h-16 rounded-lg object-contain bg-slate-950 border border-slate-600 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <strong className="text-sm text-white truncate">{member.name}</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                        {member.roleTag} · {visual.stateLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {profile ? pickText(profile.perkDescription, profile.perkDescriptionEn) : ''}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px] font-mono">
                      <span className={`px-1.5 py-0.5 rounded border ${HUNGER_BADGE[member.hungerState]}`}>
                        {t('character.satiety', { state: t(`enum.hunger.${member.hungerState}`), pct: Math.round(member.satiety) })}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border ${member.condition === 'fit' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/40' : 'text-rose-300 border-rose-500/50 bg-rose-950/50'}`}>
                        {t(`enum.condition.${member.condition}`)}
                      </span>
                      {isTired && (
                        <span className="px-1.5 py-0.5 rounded border text-amber-300 border-amber-500/40 bg-amber-950/50">
                          {t('character.tired')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3 KISS bars + radiation */}
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-slate-950/80 p-2 rounded">
                  <div>
                    <div className="text-slate-400">Health</div>
                    <strong className="text-emerald-300">{Math.round(member.health)}/100</strong>
                  </div>
                  <div>
                    <div className="text-slate-400">Morale</div>
                    <strong className="text-sky-300">{Math.round(member.morale)}/100</strong>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('character.radiation')}</div>
                    <strong className="text-amber-300">{member.radiationMgy.toFixed(1)} mGy</strong>
                  </div>
                </div>

                {/* Task row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
                  {member.assignedTask ? (
                    <>
                      <span className="text-cyan-300 font-mono">{t('character.assignment', { task: member.assignedTask.type })}</span>
                      <button type="button" disabled={!canAssign} onClick={() => handleUnassign(crewId)} className="hail-btn flex items-center gap-1">
                        <Undo2 className="w-3 h-3" aria-hidden="true" /> {t('character.cancel')}
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 w-full">
                      <button type="button" disabled={!canAssign || member.condition === 'evacuated'} onClick={() => handleAssign(crewId, 'rest')} className="hail-btn flex items-center gap-1">
                        <Coffee className="w-3 h-3" aria-hidden="true" /> {t('character.rest')}
                      </button>
                      {crewId === 'cmd' && (
                        <button type="button" disabled={!canAssign || member.condition !== 'fit' || isTired} onClick={() => handleAssign(crewId, 'emergency-response')} className="hail-btn hail-btn--accent flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" aria-hidden="true" /> {t('character.capcom')}
                        </button>
                      )}
                      {crewId === 'doc' && (
                        <div className="flex items-end gap-1.5 flex-1 min-w-[200px]">
                          <div className="flex-1 min-w-0">
                            <HailSelect
                              label={t('character.careTarget')}
                              size="sm"
                              value={medTarget}
                              onChange={(val) => setMedTarget(val as CrewId)}
                              options={(['cmd', 'eng', 'doc', 'geo'] as const).map((id) => ({
                                value: id,
                                label: gameState.crew[id].name.split(' ')[0],
                                meta: gameState.crew[id].roleTag,
                              }))}
                            />
                          </div>
                          <button type="button" disabled={!canAssign || member.condition === 'evacuated' || medTargetCrew.condition === 'evacuated'} onClick={() => handleAssign(crewId, 'medical-care')} className="hail-btn hail-btn--accent flex items-center gap-1 shrink-0">
                            <HeartPulse className="w-3 h-3" aria-hidden="true" /> {t('character.care')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MissionDialog>
  );
}
