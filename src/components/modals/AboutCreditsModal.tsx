import { NASA_DATA_SOURCES, RELEASE_META, THIRD_PARTY_CREDITS } from '../../config/releaseMeta.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { downloadArtifact } from '../../persistence/downloadArtifact.ts';
import { SAVE_STORAGE_KEY } from '../../persistence/saveAdapter.ts';
import { HAIL_SVG } from '../cabin/hailAssets.ts';
import { MissionDialog } from './MissionDialog.tsx';

export function AboutCreditsModal({ onClose }: { onClose: () => void }) {
  const { locale, t } = useI18n();

  const handleExportCurrentSave = () => {
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      if (raw) {
        downloadArtifact('moon32-save-snapshot.json', raw, true);
      }
    } catch {
      // Ignore restricted storage access in sandboxed environments.
    }
  };

  return (
    <MissionDialog
      title={t('about.title')}
      eyebrow={t('about.eyebrow')}
      art={HAIL_SVG.badgeNasaStem}
      panelType="about"
      dockSide="center"
      onClose={onClose}
    >
      <div className="space-y-4 text-sm text-slate-200">
        <section className="rounded-lg border border-cyan-500/35 bg-slate-900/60 p-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-300 mb-2">
            {t('about.versionHeading')}
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
            <dt className="text-slate-400">{t('about.releaseLabel')}</dt>
            <dd className="text-white">{RELEASE_META.releaseVersion}</dd>
            <dt className="text-slate-400">{t('about.schemaLabel')}</dt>
            <dd className="text-white">v{RELEASE_META.schemaVersion} (save {RELEASE_META.saveAppVersion})</dd>
            <dt className="text-slate-400">{t('about.contentLabel')}</dt>
            <dd className="text-white">{RELEASE_META.contentVersion}</dd>
            <dt className="text-slate-400">{t('about.modelLabel')}</dt>
            <dd className="text-white">{RELEASE_META.modelVersion}</dd>
            <dt className="text-slate-400">{t('about.catalogLabel')}</dt>
            <dd className="text-white">{RELEASE_META.catalogVersion}</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3 space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-amber-300">
            {t('about.nasaHeading')}
          </h3>
          <ul className="space-y-2 text-xs">
            {NASA_DATA_SOURCES.map((item) => (
              <li key={item.id} className="leading-relaxed">
                <strong className="text-slate-100">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2">
                      {item.name}
                    </a>
                  ) : item.name}
                </strong>
                <p className="text-slate-300">{locale === 'en' ? item.detailEn : item.detailVi}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3 space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-300">
            {t('about.creditsHeading')}
          </h3>
          <ul className="space-y-2 text-xs">
            {THIRD_PARTY_CREDITS.map((item) => (
              <li key={item.id} className="leading-relaxed">
                <strong className="text-slate-100">{item.name}</strong>
                <p className="text-slate-300">{locale === 'en' ? item.detailEn : item.detailVi}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-slate-400 leading-relaxed">
          {t('about.privacyNote')}
        </p>

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button
            type="button"
            className="hail-btn"
            onClick={handleExportCurrentSave}
          >
            {t('about.exportSaveBtn')}
          </button>
          <button
            type="button"
            className="hail-btn hail-btn--primary"
            onClick={onClose}
          >
            {t('common.closeDialog')}
          </button>
        </div>
      </div>
    </MissionDialog>
  );
}
