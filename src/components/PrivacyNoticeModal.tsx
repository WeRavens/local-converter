import { useEffect, useId, useState } from 'react';
import { CheckCircle2, DownloadCloud, Loader2, ShieldCheck, X } from 'lucide-react';
import { preloadMediaEngine } from '../engines/mediaEngine';
import { useI18n } from '../i18n/useI18n';

interface PrivacyNoticeModalProps {
  open: boolean;
  onClose: () => void;
  onResetStats: () => void;
}

export function PrivacyNoticeModal({
  open,
  onClose,
  onResetStats,
}: PrivacyNoticeModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [cacheStatus, setCacheStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleCacheOfflineEngines = async () => {
    if (cacheStatus === 'loading') return;
    setCacheStatus('loading');
    try {
      const pdfWorkerPromise = fetch(`${window.location.origin}/pdf/pdf.worker.min.mjs`).then(
        (res) => {
          if (!res.ok) throw new Error('Failed to fetch PDF worker');
          return res.arrayBuffer();
        },
      );
      const avifWasmPromise = fetch(`${window.location.origin}/avif/avif_enc.wasm`).then((res) => {
        if (!res.ok) throw new Error('Failed to fetch AVIF encoder');
        return res.arrayBuffer();
      });
      await Promise.all([
        import('heic2any'),
        import('@jsquash/avif/codec/enc/avif_enc.js'),
        avifWasmPromise,
        import('pdfjs-dist'),
        pdfWorkerPromise,
        preloadMediaEngine(),
      ]);
      setCacheStatus('ready');
    } catch {
      setCacheStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tactile-card w-full max-w-lg rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="tactile-well flex h-9 w-9 items-center justify-center rounded-xl text-[#FF5416]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 id={titleId} className="text-base font-extrabold text-[#141413] dark:text-[#F3F2EE]">
              {t('privacyModalTitle')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-lg p-1 text-[var(--studio-muted)] hover:bg-[var(--studio-well)] hover:text-[#141413] dark:hover:text-[#F3F2EE]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#141413] dark:text-[#F3F2EE]">
          <p>{t('privacyModalBody1')}</p>
          <p className="tactile-well whitespace-pre-line rounded-xl p-3.5 font-mono text-[11px] leading-relaxed text-[var(--studio-muted)]">
            {t('privacyModalBody2')}
          </p>
          <p className="text-xs text-[var(--studio-muted)]">{t('privacyModalBody3')}</p>

          <div className="tactile-well rounded-xl p-3">
            <button
              type="button"
              onClick={handleCacheOfflineEngines}
              disabled={cacheStatus === 'loading'}
              className="tactile-key inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--studio-surface)] px-3 py-2 text-xs font-bold text-[#141413] disabled:opacity-60 dark:text-[#F3F2EE]"
            >
              {cacheStatus === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF5416]" />
                  {t('offlineCacheLoading')}
                </>
              ) : cacheStatus === 'ready' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t('offlineCacheReady')}
                </>
              ) : (
                <>
                  <DownloadCloud className="h-4 w-4 text-[#FF5416]" />
                  {t('offlineCacheBtn')}
                </>
              )}
            </button>
            {cacheStatus === 'error' && (
              <p className="mt-2 text-center text-[11px] text-rose-600 dark:text-rose-400">
                {t('offlineCacheError')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetStats}
            className="tactile-key rounded-lg bg-[var(--studio-well)] px-3 py-1.5 text-xs font-bold text-[#141413] hover:text-rose-600 dark:text-[#F3F2EE] dark:hover:text-rose-400"
          >
            {t('privacyModalResetStats')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="tactile-trigger rounded-xl px-4 py-2 text-xs font-bold"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
