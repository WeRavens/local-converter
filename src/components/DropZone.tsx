import React, { useEffect, useRef, useState } from 'react';
import { Clipboard, FolderOpen, Plus, UploadCloud } from 'lucide-react';
import { useI18n } from '../i18n/useI18n';

interface DropZoneProps {
  compact?: boolean;
  onFilesAdded: (files: File[]) => void;
}

const ACCEPTED_TYPES =
  'image/*,video/*,audio/*,application/pdf,.jpg,.jpeg,.png,.webp,.avif,.svg,.gif,.bmp,.heic,.heif,.pdf,.mp4,.mov,.webm,.mkv,.avi,.mp3,.wav,.m4a,.ogg,.flac,.aac';

export function DropZone({ compact = false, onFilesAdded }: DropZoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const namedFile =
              file.name === 'image.png'
                ? new File([file], `clipboard-${Date.now()}.png`, { type: file.type })
                : file;
            pastedFiles.push(namedFile);
          }
        }
      }
      if (pastedFiles.length > 0) {
        onFilesAdded(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onFilesAdded]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      onFilesAdded(files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onFilesAdded(files);
    }
    e.target.value = '';
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all ${
        isDragging
          ? 'border-[#FF5416] bg-[#FF5416]/10 shadow-lg shadow-[#FF5416]/10'
          : 'border-[var(--studio-border)] bg-[var(--studio-surface)] hover:border-[#FF5416]/75'
      } ${compact ? 'px-4 py-3' : 'px-6 py-10 sm:py-12'}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        onChange={handleFileInput}
        className="hidden"
      />

      {!compact && (
        <>
          <span className="pointer-events-none absolute left-3 top-3 h-3 w-3 border-l-2 border-t-2 border-[#FF5416]/70" />
          <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 border-r-2 border-t-2 border-[#FF5416]/70" />
          <span className="pointer-events-none absolute bottom-3 left-3 h-3 w-3 border-b-2 border-l-2 border-[#FF5416]/70" />
          <span className="pointer-events-none absolute bottom-3 right-3 h-3 w-3 border-b-2 border-r-2 border-[#FF5416]/70" />
        </>
      )}

      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="tactile-well flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#FF5416]">
              <Plus className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xs font-bold text-[#141413] sm:text-sm dark:text-[#F3F2EE]">
                {t('dropTitle')}
              </h2>
              <p className="truncate text-[11px] text-[var(--studio-muted)]">
                {t('dropPasteHint')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <kbd className="tactile-well hidden rounded px-2 py-1 font-mono text-[10px] font-bold text-[var(--studio-muted)] sm:inline-block">
              CTRL+V
            </kbd>
            <span className="tactile-trigger inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold">
              <FolderOpen className="h-3.5 w-3.5" />
              {t('selectFiles')}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center">
          <div className="tactile-well mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-[#FF5416] transition-transform group-hover:scale-105">
            <UploadCloud className="h-7 w-7" />
          </div>

          <h2 className="text-base font-bold tracking-tight text-[#141413] sm:text-lg dark:text-[#F3F2EE]">
            {t('dropTitle')}
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[var(--studio-muted)] sm:text-sm">
            {t('dropSubtitle')}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <span className="tactile-trigger inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold sm:text-sm">
              <FolderOpen className="h-4 w-4" />
              {t('selectFiles')}
            </span>
            <span className="tactile-well inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs text-[#141413] dark:text-[#F3F2EE]">
              <Clipboard className="h-3.5 w-3.5 text-[#FF5416]" />
              <span>{t('dropPasteHint')}</span>
              <kbd className="rounded border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1.5 py-0.5 font-mono text-[10px] font-bold">
                CTRL+V
              </kbd>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
