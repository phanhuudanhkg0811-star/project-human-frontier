import { useEffect, useState } from 'react';
import { Radio, PackageCheck, Send, Truck, AlertTriangle } from 'lucide-react';
import { playSfx } from '../audio/sfx.ts';
import { useGameStore } from '../store/gameStore.ts';
import type { CargoPackId } from '../types/index.ts';
import { useI18n } from '../i18n/useI18n.ts';

export function CommsLogisticsPanel() {
  const { gameState, bundle, dispatch } = useGameStore();
  const { t, pickText, localize } = useI18n();
  const [messageInput, setMessageInput] = useState(() => t('comms.defaultMessage', { sol: bundle.campaign.milestones.lunarNight.startSol }));
  const [slots, setSlots] = useState<Partial<Record<CargoPackId, number>>>({
    'water-pack': 2,
    'power-parts-pack': 2,
  });
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const inComms = gameState.clock.phase === 'comms';
  const totalSlots = Object.values(slots).reduce((a, b) => a + (b ?? 0), 0);
  const maxSlots = bundle.balance.logistics.maxSlots;

  useEffect(() => {
    const hasPending = gameState.logistics.radioMessages.some((m) => m.status === 'transmitting');
    if (!hasPending) return;
    const timer = window.setInterval(() => {
      dispatch({ type: 'comms/tick-radio', nowMs: Date.now() });
    }, 400);
    return () => clearInterval(timer);
  }, [gameState.logistics.radioMessages, dispatch]);

  const adjustSlot = (id: CargoPackId, delta: number) => {
    setSlots((prev) => {
      const nextCount = Math.max(0, (prev[id] ?? 0) + delta);
      const nextTotal = totalSlots - (prev[id] ?? 0) + nextCount;
      if (nextTotal > maxSlots) return prev;
      return { ...prev, [id]: nextCount };
    });
  };

  const handleOrderCargo = async () => {
    const res = await dispatch({ type: 'comms/order-cargo', slots });
    if (res.ok) playSfx('launch', 0.55);
    setStatusNote(res.ok ? res.effects[0]?.message ?? t('comms.ordered') : res.error.message);
  };

  const handleSendRadio = async () => {
    if (!messageInput.trim()) return;
    const res = await dispatch({
      type: 'comms/send-radio',
      id: `tx-sol${gameState.clock.sol}-${gameState.logistics.radioMessages.length + 1}`,
      message: messageInput.trim(),
      nowMs: Date.now(),
    });
    if (res.ok) playSfx('radio', 0.55);
    setStatusNote(res.ok ? res.effects[0]?.message ?? t('comms.sent') : res.error.message);
  };

  return (
    <div className="flex flex-col gap-4 text-slate-200">
      {!inComms && (
        <div className="text-xs px-3 py-2 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {t('comms.phaseWarning')}
        </div>
      )}

      {statusNote && (
        <div className="text-xs px-3 py-2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-100">
          {localize(statusNote, bundle)}
        </div>
      )}

      {/* Radio CAPCOM Section */}
      <section className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
            <Radio className="w-4 h-4" aria-hidden="true" />
            {t('comms.radioTitle')}
          </h3>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            aria-label={t('comms.radioTitle')}
            onChange={(e) => setMessageInput(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
          />
          <button
            type="button"
            disabled={!inComms}
            onClick={handleSendRadio}
            className="hail-btn hail-btn--accent flex items-center gap-1"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            {t('comms.transmit')}
          </button>
        </div>

        <div className="max-h-32 overflow-y-auto flex flex-col gap-1.5 text-xs">
          {gameState.logistics.radioMessages.length === 0 ? (
            <p className="text-slate-400">{t('comms.empty')}</p>
          ) : (
            gameState.logistics.radioMessages.slice(-4).map((m) => (
              <div key={m.id} className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <div className="text-cyan-200">
                  <strong>[Sol {m.sentSol}]</strong> {m.prompt}
                </div>
                <div className="text-emerald-300 mt-1">
                  {m.status === 'transmitting' ? t('comms.transmitting') : localize(m.reply ?? '', bundle)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Cargo 80 kg Section */}
      <section className="p-3 rounded-lg bg-slate-900/70 border border-slate-700/70 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
            <Truck className="w-4 h-4" />
            {t('comms.cargoTitle', { used: totalSlots * 20 })}
          </h3>
          {gameState.clock.sol >= bundle.campaign.milestones.recommendedLastCargoSol && !gameState.logistics.activeOrder && (
            <span className="text-[11px] text-amber-300 font-mono">{t('comms.recommended', {
              orderSol: bundle.campaign.milestones.recommendedLastCargoSol,
              nightSol: bundle.campaign.milestones.lunarNight.startSol,
            })}</span>
          )}
        </div>

        {gameState.logistics.activeOrder ? (
          <div className="p-3 rounded bg-emerald-950/40 border border-emerald-500/40 text-xs flex items-center gap-2 text-emerald-200">
            <PackageCheck className="w-4 h-4 shrink-0" />
            {t('comms.activeOrder', {
              ordered: gameState.logistics.activeOrder.orderedAtSol,
              arrival: gameState.logistics.activeOrder.arrivalSol,
            })}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {bundle.balance.logistics.packs.map((pack) => {
                const count = slots[pack.id] ?? 0;
                return (
                  <div key={pack.id} className="p-2.5 rounded bg-slate-950/75 border border-slate-800 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white">{pickText(pack.name, pack.nameEn)}</div>
                      <div className="text-[11px] text-slate-400">{pickText(pack.summary, pack.summaryEn)}</div>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <button type="button" disabled={count <= 0} onClick={() => adjustSlot(pack.id, -1)} className="hail-btn px-2 py-0.5">-</button>
                      <span className="w-4 text-center">{count}</span>
                      <button type="button" disabled={totalSlots >= maxSlots} onClick={() => adjustSlot(pack.id, 1)} className="hail-btn px-2 py-0.5">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-400">
                {gameState.logistics.padCooldownSols > 0
                  ? t('comms.padCooldown', { sols: gameState.logistics.padCooldownSols })
                  : t('comms.padReady')}
              </span>
              <button
                type="button"
                disabled={!inComms || totalSlots < 1 || gameState.logistics.padCooldownSols > 0}
                onClick={handleOrderCargo}
                className="hail-btn hail-btn--accent"
              >
                {t('comms.launchCargo', { kg: totalSlots * 20 })}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {t('comms.cargoAbstractionNote')}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
