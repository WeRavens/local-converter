import { useEffect, useId } from 'react';
import { Download, X } from 'lucide-react';
import { computeReductionPercent, formatBytes } from '../engines/formatUtils';
import { QueueItem } from '../engines/types';
import { useI18n } from '../i18n/useI18n';

interface MediaPreviewModalProps {
  item: QueueItem | null;
  onClose: () => void;
}

export function MediaPreviewModal({ item, onClose }: MediaPreviewModalProps) {
  const { t } = useI18n();
  const titleId = useId();
  const isOpen = Boolean(item && item.result);

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

  if (!item || !item.result) return null;

  const isGif = item.result.filename.toLowerCase().endsWith('.gif');
  const isAudio =
    item.result.blob.type.startsWith('audio/') ||
    /\.(mp3|wav|m4a|ogg)$/i.test(item.result.filename);
  const reduction = computeReductionPercent(item.file.size, item.result.size);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tactile-card w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--studio-border)] px-5 py-3.5">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-extrabold text-[#141413] dark:text-[#F3F2EE]">
              {t('mediaPreviewTitle')}
            </h3>
            <p className="truncate font-mono text-xs tabular-nums text-[var(--studio-muted)]">
              {item.result.filename} • {formatBytes(item.file.size)} → {formatBytes(item.result.size)}{' '}
              ({reduction >= 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`})
            </p>
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

        <div className="p-5">
          <div className="tactile-well flex items-center justify-center overflow-hidden rounded-xl p-4">
            {isGif ? (
              <img
                src={item.result.url}
                alt={item.result.filename}
                className="max-h-96 rounded-lg object-contain"
              />
            ) : isAudio ? (
              <audio src={item.result.url} controls autoPlay className="w-full" />
            ) : (
              <video
                src={item.result.url}
                controls
                autoPlay
                className="max-h-96 w-full rounded-lg bg-black"
              />
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="tactile-key rounded-xl bg-[var(--studio-well)] px-4 py-2 text-xs font-bold text-[#141413] dark:text-[#F3F2EE]"
            >
              {t('close')}
            </button>
            <a
              href={item.result.url}
              download={item.result.filename}
              className="tactile-trigger inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold"
            >
              <Download className="h-3.5 w-3.5" />
              {t('download')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
