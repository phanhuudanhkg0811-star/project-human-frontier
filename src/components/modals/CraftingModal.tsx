import { useState } from 'react';
import { Hammer, RefreshCw, Sparkles, Wrench, XCircle } from 'lucide-react';
import { playSfx } from '../../audio/sfx.ts';
import { useGameStore } from '../../store/gameStore.ts';
import type { EquipmentId } from '../../types/index.ts';
import { HAIL_EQUIPMENT, HAIL_INVENTORY } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';
import { useI18n } from '../../i18n/useI18n.ts';
import { localizeEnumLabel } from '../../i18n/domainText.ts';

interface CraftingModalProps {
  onClose: () => void;
}

const ITEM_ICON: Record<string, string> = {
  mre_pack: HAIL_INVENTORY.mrePack,
  medkit: HAIL_INVENTORY.medicalKit,
  core_drill: HAIL_INVENTORY.sampleDrill,
  sealant_tape: HAIL_INVENTORY.sealantTape,
  solar_lantern: HAIL_INVENTORY.solarLantern,
  dust_shield: HAIL_INVENTORY.dustShield,
  radio_repeater: HAIL_INVENTORY.radioRepeater,
  cryo_thermal_rig: HAIL_INVENTORY.cryoThermalRig,
};

export function CraftingModal({ onClose }: CraftingModalProps) {
  const { t, pickText, localize, locale } = useI18n();
  const { gameState, bundle, dispatch } = useGameStore();
  const itemLabel = (itemId: string) => bundle.recipes.items.find((recipe) => recipe.id === itemId)?.name ?? itemId;
  const [feedback, setFeedback] = useState<string | null>(null);
  const inEngineering = gameState.clock.phase === 'engineering';
  const fabSys = gameState.systems.fabricator;
  const fabOffline = fabSys.status === 'offline';
  const fabDegraded = fabSys.integrity < 0.35;
  const fabBlocked = fabOffline || fabDegraded;
  const activeJob = gameState.fabricator.activeJob;
  const isBusy = gameState.fabricator.usedThisSol || activeJob !== null;

  const runAction = async (action: 'craft' | 'upgrade' | 'repair' | 'recycle', itemId: any) => {
    const res = await dispatch({ type: 'fabricator/queue', action, itemId });
    if (res.ok) playSfx(action === 'repair' ? 'repair' : 'upgrade', 0.55);
    setFeedback(res.ok ? res.effects[0]?.message ?? t('crafting.queued') : res.error.message);
  };

  const handleCancel = async () => {
    const res = await dispatch({ type: 'fabricator/cancel' });
    if (res.ok) playSfx('click', 0.45);
    setFeedback(res.ok ? res.effects[0]?.message ?? t('crafting.cancelled') : res.error.message);
  };

  return (
    <MissionDialog
      title={`${t('modal.craftingTitle')} · Lv${fabSys.level}/3`}
      eyebrow={t('modal.craftingEyebrow')}
      art={activeJob ? HAIL_EQUIPMENT.fabricatorWorking : HAIL_EQUIPMENT.fabricatorIdle}
      panelType="crafting"
      dockSide="left"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-slate-200">
        <div className="p-2.5 rounded-lg bg-slate-900/75 border border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            {t('crafting.stock')} <strong className="text-amber-300">{gameState.resources.partsKg} kg Parts</strong> ·{' '}
            <strong className="text-sky-300">{gameState.resources.waterL.toFixed(1)} L {t('crafting.water')}</strong> ·{' '}
            <strong className="text-emerald-300">{gameState.resources.batteryKWh.toFixed(1)} kWh {t('telemetry.battery')}</strong>
          </span>
          {!inEngineering && (
            <span className="text-amber-300 font-mono">{t('crafting.phaseLock')}</span>
          )}
          {fabOffline && (
            <span className="text-rose-300 font-mono">{t('crafting.offline')}</span>
          )}
          {fabDegraded && (
            <span className="text-amber-300 font-mono">{t('crafting.degraded')}</span>
          )}
        </div>

        {activeJob && (
          <div className="p-3 rounded-lg bg-cyan-950/50 border border-cyan-500/40 flex items-center justify-between gap-2 text-xs">
            <div>
              <strong className="text-cyan-200">{t('crafting.processing', { action: localizeEnumLabel('fabricatorAction', activeJob.action, locale), item: itemLabel(activeJob.itemId) })}</strong>
              <p className="text-slate-300 mt-0.5">
                {t('crafting.remaining', { sols: activeJob.solsRemaining, battery: activeJob.batteryReserved })}
              </p>
            </div>
            <button type="button" onClick={handleCancel} className="hail-btn hail-btn--warn flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" />
              {t('crafting.cancelRefund')}
            </button>
          </div>
        )}

        {feedback && (
          <div className="text-xs px-3 py-2 rounded bg-slate-900 border border-cyan-500/40 text-cyan-200">
            {localize(feedback, bundle)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          {bundle.recipes.items.map((recipe) => {
            const isEq = recipe.category === 'equipment';
            const eq = isEq ? gameState.equipment[recipe.id as EquipmentId] : null;
            const lockedByLevel = fabSys.level < recipe.requiredFabricatorLevel;
            const craftDuration = recipe.craftCost.durationSols ?? 1;
            const craftBatteryPerSol = craftDuration > 1 ? Number((recipe.craftCost.batteryKWh / craftDuration).toFixed(2)) : recipe.craftCost.batteryKWh;
            const canCraft =
              inEngineering &&
              !fabBlocked &&
              !isBusy &&
              !lockedByLevel &&
              (!isEq || !eq?.owned) &&
              gameState.resources.partsKg >= recipe.craftCost.partsKg &&
              gameState.resources.waterL >= recipe.craftCost.waterL &&
              gameState.resources.batteryKWh >= craftBatteryPerSol;

            const upgradeDuration = recipe.upgradeCost?.durationSols ?? 1;
            const upgradeBatteryPerSol = recipe.upgradeCost
              ? (upgradeDuration > 1 ? Number((recipe.upgradeCost.batteryKWh / upgradeDuration).toFixed(2)) : recipe.upgradeCost.batteryKWh)
              : 0;
            const canUpgrade =
              inEngineering &&
              !fabBlocked &&
              !isBusy &&
              recipe.upgradeCost !== null &&
              (recipe.id === 'medkit' ? gameState.resources.medkitLevel < 2 : Boolean(eq?.owned && eq.level < 2)) &&
              gameState.resources.partsKg >= (recipe.upgradeCost?.partsKg ?? 999) &&
              gameState.resources.waterL >= (recipe.upgradeCost?.waterL ?? 999) &&
              gameState.resources.batteryKWh >= upgradeBatteryPerSol;

            const repairCost = bundle.recipes.rules.repairCost;
            const repairDuration = repairCost.durationSols ?? 1;
            const repairBatteryPerSol = repairDuration > 1 ? Number((repairCost.batteryKWh / repairDuration).toFixed(2)) : repairCost.batteryKWh;
            const canRepair =
              inEngineering &&
              !fabBlocked &&
              !isBusy &&
              isEq &&
              Boolean(eq?.owned && eq.durability < 100) &&
              gameState.resources.partsKg >= repairCost.partsKg &&
              gameState.resources.waterL >= repairCost.waterL &&
              gameState.resources.batteryKWh >= repairBatteryPerSol;

            const canRecycle = inEngineering && !fabBlocked && !isBusy && isEq && Boolean(eq?.owned && !eq.reservedForRover);

            return (
              <div key={recipe.id} className="p-3 rounded-lg bg-slate-900/75 border border-slate-800 flex flex-col gap-2.5">
                <div className="flex items-start gap-3">
                  <img
                    src={ITEM_ICON[recipe.id] ?? HAIL_INVENTORY.spareParts}
                    alt=""
                    className="w-12 h-12 object-contain rounded-lg bg-slate-950 border border-slate-700/70 p-1.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm text-white">{recipe.name}</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {t('crafting.requiredLevel', { level: recipe.requiredFabricatorLevel })}
                      </span>
                      {eq?.owned && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                          {localizeEnumLabel('equipmentState', eq.state, locale)} ({eq.durability}%) · Lv{eq.level}
                        </span>
                      )}
                      {recipe.id === 'medkit' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/60 border border-sky-500/40 text-sky-300">
                          {t('crafting.medkitStock', { count: gameState.resources.medkits, level: gameState.resources.medkitLevel })}
                        </span>
                      )}
                      {recipe.id === 'mre_pack' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300">
                          {t('crafting.packStock', { count: gameState.resources.mrePacks })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300/90 mt-1 leading-relaxed">
                      {pickText(recipe.effectSummary, recipe.effectSummaryEn)}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      {t('crafting.craftCost', { parts: recipe.craftCost.partsKg, battery: recipe.craftCost.batteryKWh })}
                      {recipe.craftCost.waterL > 0 ? ` + ${recipe.craftCost.waterL}L` : ''} ({recipe.craftCost.durationSols}d)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/90">
                  <button type="button" disabled={!canCraft} onClick={() => runAction('craft', recipe.id)} className="hail-btn hail-btn--accent w-full text-[11px]">
                    <Hammer className="w-3.5 h-3.5" /> {t('crafting.craft')}
                  </button>
                  {recipe.upgradeCost && (
                    <button type="button" disabled={!canUpgrade} onClick={() => runAction('upgrade', recipe.id)} className="hail-btn w-full text-[11px]">
                      <Sparkles className="w-3.5 h-3.5" /> {t('crafting.upgrade')}
                    </button>
                  )}
                  {isEq && eq?.owned && (
                    <>
                      <button type="button" disabled={!canRepair} onClick={() => runAction('repair', recipe.id)} className="hail-btn hail-btn--warn w-full text-[11px]">
                        <Wrench className="w-3.5 h-3.5" /> {t('crafting.repair')}
                      </button>
                      <button type="button" disabled={!canRecycle} onClick={() => runAction('recycle', recipe.id)} className="hail-btn w-full text-[11px]">
                        <RefreshCw className="w-3.5 h-3.5" /> {t('crafting.recycle')}
                      </button>
                    </>
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
