import { useEffect, useRef, useState } from 'react';
import { Play, Scissors } from 'lucide-react';
import { formatDuration } from '../engines/formatUtils';
import { useI18n } from '../i18n/useI18n';

interface MediaTrimControlProps {
  idPrefix: 'audio' | 'video';
  mediaType: 'audio' | 'video';
  sampleFile?: File;
  trimStartSec: number | null;
  trimEndSec: number | null;
  isInvalid: boolean;
  onChangeTrim: (start: number | null, end: number | null) => void;
}

export function MediaTrimControl({
  idPrefix,
  mediaType,
  sampleFile,
  trimStartSec,
  trimEndSec,
  isInvalid,
  onChangeTrim,
}: MediaTrimControlProps) {
  const { t } = useI18n();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    if (!sampleFile || typeof URL.createObjectURL !== 'function') {
      setSampleUrl(null);
      return;
    }
    const url = URL.createObjectURL(sampleFile);
    setSampleUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [sampleFile]);

  const effectiveStart = Math.max(0, trimStartSec ?? 0);
  const effectiveEnd =
    duration > 0
      ? Math.min(duration, trimEndSec !== null && trimEndSec > 0 ? trimEndSec : duration)
      : trimEndSec ?? 0;

  const startPct = duration > 0 ? Math.min(100, (effectiveStart / duration) * 100) : 0;
  const endPct = duration > 0 ? Math.min(100, Math.max(startPct, (effectiveEnd / duration) * 100)) : 100;

  const captureTime = (edge: 'start' | 'end') => {
    const raw = mediaRef.current ? mediaRef.current.currentTime : currentTime;
    const rounded = Math.round(raw * 2) / 2;
    if (edge === 'start') {
      onChangeTrim(rounded, trimEndSec);
    } else {
      onChangeTrim(trimStartSec, rounded);
    }
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--studio-muted)]">
          <Scissors className="h-3.5 w-3.5 text-[#FF5416]" />
          <span>TRIM</span>
          {duration > 0 && (
            <span className="font-mono text-[10px] font-semibold tabular-nums text-[#141413] dark:text-[#F3F2EE]">
              {formatDuration(effectiveStart)} → {formatDuration(effectiveEnd)} / {formatDuration(duration)}
            </span>
          )}
        </div>

        {sampleUrl && (
          <button
            type="button"
            onClick={() => setPreviewOpen((prev) => !prev)}
            className="tactile-key inline-flex items-center gap-1 rounded-md bg-[var(--studio-well)] px-2 py-1 text-[11px] font-semibold text-[#141413] dark:text-[#F3F2EE]"
          >
            <Play className="h-3 w-3 text-[#FF5416]" />
            {t('trimMonitorToggle')}
          </button>
        )}
      </div>

      {/* Hidden metadata probe when monitor is collapsed */}
      {sampleUrl && !previewOpen && (
        mediaType === 'audio' ? (
          <audio
            src={sampleUrl}
            preload="metadata"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            className="hidden"
          />
        ) : (
          <video
            src={sampleUrl}
            preload="metadata"
            muted
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
            className="hidden"
          />
        )
      )}

      {sampleUrl && previewOpen && (
        <div className="space-y-2 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-well)] p-2">
          {mediaType === 'audio' ? (
            <audio
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={sampleUrl}
              controls
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              className="w-full"
            />
          ) : (
            <video
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={sampleUrl}
              controls
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setDuration(d);
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              className="max-h-40 w-full rounded bg-black"
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] font-semibold tabular-nums text-[var(--studio-muted)]">
              {formatDuration(currentTime)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => captureTime('start')}
                className="tactile-key rounded bg-[var(--studio-surface)] px-2 py-1 font-mono text-[10px] font-bold text-[#141413] dark:text-[#F3F2EE]"
              >
                [ {t('trimSetStart')}
              </button>
              <button
                type="button"
                onClick={() => captureTime('end')}
                className="tactile-key rounded bg-[var(--studio-surface)] px-2 py-1 font-mono text-[10px] font-bold text-[#141413] dark:text-[#F3F2EE]"
              >
                {t('trimSetEnd')} ]
              </button>
            </div>
          </div>
        </div>
      )}

      {duration > 0 && (
        <div className="relative flex h-6 items-center px-1">
          <div className="tactile-well relative h-2 w-full rounded-full">
            <div
              className="absolute top-0 h-full rounded-full bg-[#FF5416]"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(2, endPct - startPct)}%`,
              }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={Number(duration.toFixed(1))}
            step={0.5}
            value={Math.min(effectiveStart, duration)}
            onChange={(e) => {
              const nextStart = Number(e.target.value);
              const boundedEnd =
                trimEndSec !== null && nextStart >= trimEndSec
                  ? Math.min(duration, Number((nextStart + 0.5).toFixed(1)))
                  : trimEndSec;
              onChangeTrim(nextStart > 0 ? nextStart : null, boundedEnd);
            }}
            aria-label={t('trimStartLabel')}
            className="dual-range-input absolute inset-x-0 w-full"
          />
          <input
            type="range"
            min={0}
            max={Number(duration.toFixed(1))}
            step={0.5}
            value={Math.min(effectiveEnd, duration)}
            onChange={(e) => {
              const nextEnd = Number(e.target.value);
              const boundedStart =
                trimStartSec !== null && nextEnd <= trimStartSec
                  ? Math.max(0, Number((nextEnd - 0.5).toFixed(1)))
                  : trimStartSec;
              onChangeTrim(
                boundedStart,
                nextEnd < Number((duration - 0.2).toFixed(1)) ? nextEnd : null,
              );
            }}
            aria-label={t('trimEndLabel')}
            className="dual-range-input absolute inset-x-0 w-full"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor={`${idPrefix}-trim-start`}
            className="mb-1 block text-[11px] font-medium text-[var(--studio-muted)]"
          >
            {t('trimStartLabel')}
          </label>
          <input
            id={`${idPrefix}-trim-start`}
            type="number"
            min={0}
            step={0.5}
            placeholder="0"
            value={trimStartSec ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : Math.max(0, Number(e.target.value));
              onChangeTrim(val, trimEndSec);
            }}
            className={`tactile-well w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold text-[#141413] outline-none dark:text-[#F3F2EE] ${
              isInvalid ? '!border-rose-500' : 'focus:!border-[#FF5416]'
            }`}
          />
        </div>
        <div>
          <label
            htmlFor={`${idPrefix}-trim-end`}
            className="mb-1 block text-[11px] font-medium text-[var(--studio-muted)]"
          >
            {t('trimEndLabel')}
          </label>
          <input
            id={`${idPrefix}-trim-end`}
            type="number"
            min={0}
            step={0.5}
            placeholder="End"
            value={trimEndSec ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : Math.max(0, Number(e.target.value));
              onChangeTrim(trimStartSec, val);
            }}
            className={`tactile-well w-full rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold text-[#141413] outline-none dark:text-[#F3F2EE] ${
              isInvalid ? '!border-rose-500' : 'focus:!border-[#FF5416]'
            }`}
          />
        </div>
      </div>

      {isInvalid && (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {t('trimInvalidRange')}
        </p>
      )}
    </div>
  );
}
