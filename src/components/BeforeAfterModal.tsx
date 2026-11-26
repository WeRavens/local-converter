import { useEffect, useId, useState } from 'react';
import { Columns2, SlidersHorizontal, X } from 'lucide-react';
import { computeReductionPercent, formatBytes } from '../engines/formatUtils';
import { QueueItem } from '../engines/types';
import { useI18n } from '../i18n/useI18n';

interface BeforeAfterModalProps {
  item: QueueItem | null;
  onClose: () => void;
}

export function BeforeAfterModal({ item, onClose }: BeforeAfterModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [splitPercent, setSplitPercent] = useState(50);
  const [origDims, setOrigDims] = useState<{ w: number; h: number } | null>(null);
  const [viewModeOverride, setViewModeOverride] = useState<'slider' | 'side-by-side' | null>(null);

  const isOpen = Boolean(item && item.result && item.previewUrl);

  useEffect(() => {
    setOrigDims(null);
    setViewModeOverride(null);
    setSplitPercent(50);
  }, [item?.id, item?.result?.url]);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, onClose]);

  if (!item || !item.result || !item.previewUrl) return null;

  const reduction = computeReductionPercent(item.file.size, item.result.size);
  const hasAspectMismatch = Boolean(
    origDims &&
      item.result.width &&
      item.result.height &&
      origDims.h > 0 &&
      item.result.height > 0 &&
      Math.abs(origDims.w / origDims.h - item.result.width / item.result.height) > 0.03,
  );
  const activeMode = viewModeOverride ?? (hasAspectMismatch ? 'side-by-side' : 'slider');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tactile-card w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--studio-border)] px-5 py-3.5">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-extrabold text-[#141413] dark:text-[#F3F2EE]">
              {t('compareTitle')}
            </h3>
            <p className="truncate font-mono text-xs text-[var(--studio-muted)]">
              {item.result.filename}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="tactile-well inline-flex rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewModeOverride('slider')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                  activeMode === 'slider'
                    ? 'bg-[#FF5416] text-white'
                    : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {t('compareModeSlider')}
              </button>
              <button
                type="button"
                onClick={() => setViewModeOverride('side-by-side')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                  activeMode === 'side-by-side'
                    ? 'bg-[#FF5416] text-white'
                    : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
                }`}
              >
                <Columns2 className="h-3 w-3" />
                {t('compareModeSideBySide')}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="rounded-lg p-1.5 text-[var(--studio-muted)] hover:bg-[var(--studio-well)] hover:text-[#141413] dark:hover:text-[#F3F2EE]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
            <div className="tactile-well rounded-xl p-3">
              <div className="text-[var(--studio-muted)]">{t('compareOriginal')}</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-sm font-bold text-[#141413] dark:text-[#F3F2EE]">
                  {formatBytes(item.file.size)}
                </span>
                {origDims && (
                  <span className="text-[11px] text-[var(--studio-muted)]">
                    ({origDims.w}×{origDims.h})
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[#FF5416]/35 bg-[#FF5416]/5 p-3">
              <div className="flex items-center justify-between text-[#FF5416]">
                <span className="font-semibold">{t('compareConverted')}</span>
                <span className="font-mono font-bold tabular-nums">
                  {reduction >= 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-sm font-bold text-[#141413] dark:text-[#F3F2EE]">
                  {formatBytes(item.result.size)}
                </span>
                {item.result.width && item.result.height && (
                  <span className="text-[11px] text-[var(--studio-muted)]">
                    ({item.result.width}×{item.result.height})
                  </span>
                )}
              </div>
            </div>
          </div>

          {hasAspectMismatch && (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              {t('compareAspectDiffHint')}
            </p>
          )}

          {activeMode === 'side-by-side' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="tactile-well relative flex aspect-video items-center justify-center overflow-hidden rounded-xl p-2">
                <img
                  src={item.previewUrl}
                  alt={t('compareOriginal')}
                  onLoad={(e) =>
                    setOrigDims({
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    })
                  }
                  className="max-h-full max-w-full object-contain"
                />
                <span className="absolute left-3 top-3 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {t('compareOriginal')}
                </span>
              </div>
              <div className="tactile-well relative flex aspect-video items-center justify-center overflow-hidden rounded-xl !border-[#FF5416]/40 p-2">
                <img
                  src={item.result.url}
                  alt={t('compareConverted')}
                  className="max-h-full max-w-full object-contain"
                />
                <span className="absolute right-3 top-3 rounded-md bg-[#FF5416] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {t('compareConverted')}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="tactile-well relative mx-auto aspect-video w-full overflow-hidden rounded-xl select-none">
                <img
                  src={item.result.url}
                  alt={t('compareConverted')}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
                >
                  <img
                    src={item.previewUrl}
                    alt={t('compareOriginal')}
                    onLoad={(e) =>
                      setOrigDims({
                        w: e.currentTarget.naturalWidth,
                        h: e.currentTarget.naturalHeight,
                      })
                    }
                    className="h-full w-full object-contain"
                  />
                </div>

                <div
                  className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#FF5416] shadow-[0_0_8px_rgba(255,84,22,0.85)]"
                  style={{ left: `${splitPercent}%` }}
                />

                <span className="absolute left-3 top-3 rounded-md bg-black/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {t('compareOriginal')}
                </span>
                <span className="absolute right-3 top-3 rounded-md bg-[#FF5416] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                  {t('compareConverted')}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs font-semibold text-[var(--studio-muted)]">
                  {t('compareOriginal')}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={splitPercent}
                  onChange={(e) => setSplitPercent(Number(e.target.value))}
                  aria-label={t('compareTitle')}
                  className="studio-slider flex-1"
                />
                <span className="text-xs font-bold text-[#FF5416]">
                  {t('compareConverted')}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
