import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Eye,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  GripVertical,
  Layers,
  LayoutGrid,
  List,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { computeReductionPercent, formatBytes } from '../engines/formatUtils';
import {
  ConversionResult,
  CropAnchor,
  CropAspectRatio,
  ImageConversionOptions,
  QueueItem,
} from '../engines/types';
import { useI18n } from '../i18n/useI18n';

interface FileQueueListProps {
  items: QueueItem[];
  combinedResults: ConversionResult[];
  staleItemIds: Set<string>;
  imageOptions: ImageConversionOptions;
  isConverting: boolean;
  hasLargeMedia: boolean;
  onClearAll: () => void;
  onRemoveItem: (id: string) => void;
  onMoveItem: (id: string, direction: 'up' | 'down') => void;
  onReorderItems: (fromIndex: number, toIndex: number) => void;
  onRotateItem: (id: string) => void;
  onRetryItem: (id: string) => void;
  onCompareItem: (item: QueueItem) => void;
  onPreviewMediaItem: (item: QueueItem) => void;
}

function getCropOverlayStyle(ratio: CropAspectRatio, anchor: CropAnchor) {
  if (ratio === 'original') return null;
  const dims: Record<Exclude<CropAspectRatio, 'original'>, { w: string; h: string }> = {
    '1:1': { w: '72%', h: '72%' },
    '4:5': { w: '64%', h: '80%' },
    '16:9': { w: '88%', h: '50%' },
    '3:4': { w: '60%', h: '80%' },
  };
  const { w, h } = dims[ratio];
  const posClass =
    anchor === 'top'
      ? 'items-start justify-start pt-1 pl-1'
      : anchor === 'bottom'
        ? 'items-end justify-end pb-1 pr-1'
        : 'items-center justify-center';
  return { w, h, posClass };
}

export function FileQueueList({
  items,
  combinedResults,
  staleItemIds,
  imageOptions,
  isConverting,
  hasLargeMedia,
  onClearAll,
  onRemoveItem,
  onMoveItem,
  onReorderItems,
  onRotateItem,
  onRetryItem,
  onCompareItem,
  onPreviewMediaItem,
}: FileQueueListProps) {
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const completedItems = items.filter((i) => i.status === 'done' && i.result);
  const sessionSavedBytes = completedItems.reduce((acc, item) => {
    if (!item.result) return acc;
    return acc + Math.max(0, item.file.size - item.result.size);
  }, 0);

  return (
    <section className="tactile-card space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border)] pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-bold tracking-wider text-[var(--studio-muted)]">
              {t('studioStageTitle')}
            </span>
            <h3 className="sr-only">{t('queueTitle')}</h3>
            <span className="tactile-well rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-[#141413] dark:text-[#F3F2EE]">
              {t('queueCount', { count: items.length })}
            </span>
          </div>
          {sessionSavedBytes > 0 && (
            <p className="mt-1 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              {t('totalSavedSummary', { saved: formatBytes(sessionSavedBytes) })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="tactile-well inline-flex rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label={t('viewList')}
              title={t('viewList')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                viewMode === 'list'
                  ? 'bg-[#FF5416] text-white shadow-xs'
                  : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('viewList')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label={t('viewGrid')}
              title={t('viewGrid')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition ${
                viewMode === 'grid'
                  ? 'bg-[#FF5416] text-white shadow-xs'
                  : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('viewGrid')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClearAll}
            disabled={isConverting}
            className="tactile-key inline-flex items-center gap-1.5 rounded-lg bg-[var(--studio-surface)] px-2.5 py-1.5 text-xs font-semibold text-[#141413] hover:text-rose-600 disabled:opacity-40 dark:text-[#F3F2EE] dark:hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('clearAll')}
          </button>
        </div>
      </div>

      {hasLargeMedia && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{t('largeVideoWarning')}</span>
        </div>
      )}

      {combinedResults.length > 0 && (
        <div className="space-y-2">
          {combinedResults.map((res) => (
            <div
              key={res.url}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    {t('combinedResultTitle')}
                  </div>
                  <div className="truncate text-sm font-bold text-[#141413] dark:text-[#F3F2EE]">
                    {res.filename}
                  </div>
                  <div className="font-mono text-xs font-semibold tabular-nums text-[var(--studio-muted)]">
                    {formatBytes(res.size)}
                  </div>
                </div>
              </div>
              <a
                href={res.url}
                download={res.filename}
                className="tactile-trigger inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold"
              >
                <Download className="h-3.5 w-3.5" />
                {t('download')}
              </a>
            </div>
          ))}
        </div>
      )}

      <div className={viewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2' : 'space-y-2.5'}>
        {items.map((item, idx) => {
          const reduction = item.result
            ? computeReductionPercent(item.file.size, item.result.size)
            : 0;
          const isStale = staleItemIds.has(item.id);
          const isImageResult = Boolean(
            item.result &&
              (item.result.blob.type.startsWith('image/') ||
                /\.(webp|jpg|jpeg|png|avif)$/i.test(item.result.filename)),
          );
          const isMediaPlayableResult = Boolean(
            item.result &&
              (item.result.blob.type.startsWith('audio/') ||
                item.result.blob.type.startsWith('video/') ||
                /\.(mp3|m4a|wav|ogg|mp4|webm|gif)$/i.test(item.result.filename)),
          );

          const effectiveRotation =
            ((imageOptions.rotationDeg + (item.rotationOverrideDeg ?? 0)) % 360) as number;
          const showConvertedImage = Boolean(isImageResult && !isStale && item.result?.url);
          const cropGuide =
            item.category === 'image' && !showConvertedImage
              ? getCropOverlayStyle(imageOptions.cropRatio, imageOptions.cropAnchor)
              : null;

          const isDropTarget = dropIdx === idx && dragIdx !== null && dragIdx !== idx;

          return (
            <div
              key={item.id}
              data-testid={`queue-item-${idx}`}
              draggable={!isConverting}
              onDragStart={(e) => {
                if (isConverting) return;
                setDragIdx(idx);
                e.dataTransfer?.setData('text/plain', String(idx));
              }}
              onDragOver={(e) => {
                if (dragIdx === null || isConverting) return;
                e.preventDefault();
                if (dropIdx !== idx) setDropIdx(idx);
              }}
              onDragLeave={() => {
                if (dropIdx === idx) setDropIdx(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== idx && !isConverting) {
                  onReorderItems(dragIdx, idx);
                }
                setDragIdx(null);
                setDropIdx(null);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setDropIdx(null);
              }}
              className={`tactile-well flex justify-between gap-3 rounded-xl p-3 transition ${
                viewMode === 'grid'
                  ? 'flex-col'
                  : 'flex-col sm:flex-row sm:items-center'
              } ${isDropTarget ? '!border-[#FF5416] ring-2 ring-[#FF5416]/40' : ''} ${
                dragIdx === idx ? 'opacity-60' : ''
              }`}
            >
              <div
                className={`flex min-w-0 gap-3 ${
                  viewMode === 'grid' ? 'flex-col' : 'items-center'
                }`}
              >
                {/* Drag handle + Sequence + Up/Down Controls */}
                <div
                  className={`flex items-center gap-1 ${
                    viewMode === 'grid' ? 'justify-between' : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {items.length > 1 && (
                      <span
                        title={t('dragToReorder')}
                        className="cursor-grab text-[var(--studio-muted)] hover:text-[#FF5416] active:cursor-grabbing"
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    )}
                    <span className="rounded bg-[var(--studio-surface)] px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-[var(--studio-muted)]">
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {items.length > 1 && (
                    <div className={viewMode === 'grid' ? 'flex gap-0.5' : 'flex flex-col gap-0.5'}>
                      <button
                        type="button"
                        onClick={() => onMoveItem(item.id, 'up')}
                        disabled={idx === 0 || isConverting}
                        title={t('moveUp')}
                        aria-label={t('moveUp')}
                        className="rounded p-0.5 text-[var(--studio-muted)] hover:bg-[var(--studio-surface)] hover:text-[#141413] disabled:opacity-25 dark:hover:text-[#F3F2EE]"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(item.id, 'down')}
                        disabled={idx === items.length - 1 || isConverting}
                        title={t('moveDown')}
                        aria-label={t('moveDown')}
                        className="rounded p-0.5 text-[var(--studio-muted)] hover:bg-[var(--studio-surface)] hover:text-[#141413] disabled:opacity-25 dark:hover:text-[#F3F2EE]"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Live WYSIWYG Thumbnail Preview */}
                <div
                  className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] ${
                    viewMode === 'grid' ? 'aspect-[4/3] w-full' : 'h-14 w-14'
                  }`}
                >
                  {item.previewUrl && item.category === 'image' ? (
                    <>
                      <img
                        src={showConvertedImage ? item.result?.url : item.previewUrl}
                        alt={item.file.name}
                        style={
                          showConvertedImage || effectiveRotation === 0
                            ? undefined
                            : { transform: `rotate(${effectiveRotation}deg)` }
                        }
                        className={`h-full w-full transition-transform duration-150 ${
                          viewMode === 'grid' ? 'object-contain p-1' : 'object-cover'
                        }`}
                      />
                      {cropGuide && (
                        <div
                          className={`pointer-events-none absolute inset-0 flex bg-black/25 ${cropGuide.posClass}`}
                        >
                          <div
                            style={{ width: cropGuide.w, height: cropGuide.h }}
                            className="flex items-end justify-end border border-dashed border-[#FF5416] bg-transparent p-0.5"
                          >
                            <span className="rounded bg-[#FF5416] px-1 font-mono text-[8px] font-bold text-white">
                              {imageOptions.cropRatio}
                            </span>
                          </div>
                        </div>
                      )}
                      {(item.rotationOverrideDeg ?? 0) > 0 && (
                        <span className="absolute bottom-1 left-1 rounded bg-[#141416]/85 px-1 font-mono text-[9px] font-bold text-[#FF5416]">
                          +{item.rotationOverrideDeg}°
                        </span>
                      )}
                    </>
                  ) : item.category === 'video' ? (
                    <FileVideo className="h-5 w-5 text-cyan-500" />
                  ) : item.category === 'audio' ? (
                    <FileAudio className="h-5 w-5 text-blue-500" />
                  ) : item.category === 'pdf' ? (
                    <FileText className="h-5 w-5 text-amber-500" />
                  ) : (
                    <FileImage className="h-5 w-5 text-[#FF5416]" />
                  )}
                </div>

                {/* Metadata & Telemetry */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-[#141413] sm:text-sm dark:text-[#F3F2EE]">
                    {item.result ? item.result.filename : item.file.name}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--studio-muted)]">
                    <span>{formatBytes(item.file.size)}</span>
                    {isStale && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-sans text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        {t('settingsChangedBadge')}
                      </span>
                    )}
                    {item.result && (
                      <>
                        <span>→</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatBytes(item.result.size)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            reduction >= 0
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-[var(--studio-surface)] text-[var(--studio-muted)]'
                          }`}
                        >
                          {reduction >= 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`}
                        </span>
                        {item.result.targetMet !== undefined && (
                          <span
                            className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-bold ${
                              item.result.targetMet
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {item.result.targetMet
                              ? t('targetMetBadge')
                              : t('targetBestEffortBadge')}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {(item.status === 'loading-engine' || item.status === 'processing') && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[#FF5416]">
                        <span>
                          {item.status === 'loading-engine'
                            ? t('statusLoadingEngine')
                            : `${t('statusProcessing')}...`}
                        </span>
                        <span className="tabular-nums">{item.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--studio-surface)]">
                        <div
                          className="h-full rounded-full bg-[#FF5416] transition-all duration-200"
                          style={{ width: `${Math.max(4, item.progress)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {item.status === 'canceled' && (
                    <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                      {t('statusCanceled')}
                    </p>
                  )}

                  {item.status === 'error' && (
                    <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                      {t('statusError')}: {item.errorMessage}
                    </p>
                  )}
                </div>
              </div>

              {/* Per-Card Actions */}
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {item.category === 'image' && (
                  <button
                    type="button"
                    onClick={() => onRotateItem(item.id)}
                    disabled={isConverting}
                    title={t('rotateItemLabel')}
                    aria-label={t('rotateItemLabel')}
                    className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2 py-1.5 font-mono text-[11px] font-bold text-[#141413] disabled:opacity-40 dark:text-[#F3F2EE]"
                  >
                    <RotateCw className="h-3.5 w-3.5 text-[#FF5416]" />
                    {(item.rotationOverrideDeg ?? 0) > 0 && (
                      <span>{item.rotationOverrideDeg}°</span>
                    )}
                  </button>
                )}

                {item.status === 'done' && item.result && (
                  <>
                    <CheckCircle2 className="hidden h-4 w-4 text-emerald-500 sm:block" />
                    {item.category === 'image' && item.previewUrl && isImageResult && (
                      <button
                        type="button"
                        onClick={() => onCompareItem(item)}
                        className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2.5 py-1.5 text-xs font-semibold text-[#141413] dark:text-[#F3F2EE]"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#FF5416]" />
                        {t('compare')}
                      </button>
                    )}
                    {isMediaPlayableResult && (
                      <button
                        type="button"
                        onClick={() => onPreviewMediaItem(item)}
                        className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2.5 py-1.5 text-xs font-semibold text-[#141413] dark:text-[#F3F2EE]"
                      >
                        <Play className="h-3.5 w-3.5 text-[#FF5416]" />
                        {t('previewMedia')}
                      </button>
                    )}
                    <a
                      href={item.result.url}
                      download={item.result.filename}
                      className="tactile-trigger inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t('download')}
                    </a>
                  </>
                )}

                {(item.status === 'error' || item.status === 'canceled') && (
                  <button
                    type="button"
                    onClick={() => onRetryItem(item.id)}
                    className="tactile-key inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('retry')}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  title={t('remove')}
                  aria-label={t('remove')}
                  disabled={item.status === 'processing' || item.status === 'loading-engine'}
                  className="rounded-lg p-1.5 text-[var(--studio-muted)] transition hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
