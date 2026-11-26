import { useEffect, useState } from 'react';
import {
  BookmarkPlus,
  FileAudio,
  FileText,
  Film,
  Image as ImageIcon,
  RotateCw,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import { hasInvalidTrimRange } from '../engines/mediaMath';
import {
  AudioConversionOptions,
  AudioOutputFormat,
  ConversionPreset,
  CropAnchor,
  CropAspectRatio,
  ImageConversionOptions,
  ImageOutputFormat,
  PdfConversionOptions,
  PdfOperation,
  RotationDegrees,
  VideoConversionOptions,
  VideoOutputFormat,
  VideoResolution,
} from '../engines/types';
import { useI18n } from '../i18n/useI18n';
import { MediaTrimControl } from './MediaTrimControl';

interface ConversionWorkspaceProps {
  preferManualTab?: boolean;
  hasImages: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  hasPdf: boolean;
  pdfCount: number;
  firstAudioFile?: File;
  firstVideoFile?: File;
  avifSupported: boolean;
  imageOptions: ImageConversionOptions;
  audioOptions: AudioConversionOptions;
  videoOptions: VideoConversionOptions;
  pdfOptions: PdfConversionOptions;
  batchRenamePattern: string;
  builtInPresets: ConversionPreset[];
  customPresets: ConversionPreset[];
  onChangeImageOptions: (next: ImageConversionOptions) => void;
  onChangeAudioOptions: (next: AudioConversionOptions) => void;
  onChangeVideoOptions: (next: VideoConversionOptions) => void;
  onChangePdfOptions: (next: PdfConversionOptions) => void;
  onChangeBatchRenamePattern: (next: string) => void;
  onApplyPreset: (preset: ConversionPreset) => void;
  onSaveCustomPreset: (name: string, appliesTo: 'image' | 'audio' | 'video' | 'pdf') => void;
  onDeleteCustomPreset: (id: string) => void;
}

const IMAGE_FORMATS: ImageOutputFormat[] = ['webp', 'jpg', 'png', 'avif', 'pdf'];
const AUDIO_FORMATS: AudioOutputFormat[] = ['mp3', 'm4a', 'wav', 'ogg'];
const VIDEO_FORMATS: VideoOutputFormat[] = ['mp4', 'webm', 'gif', 'mp3', 'm4a', 'wav', 'ogg'];

const IMAGE_TARGET_CHIPS = [
  { label: '200 KB', bytes: 200 * 1024 },
  { label: '500 KB', bytes: 500 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
  { label: '2 MB', bytes: 2 * 1024 * 1024 },
];

const AUDIO_TARGET_CHIPS = [
  { label: '500 KB', bytes: 500 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
  { label: '2 MB', bytes: 2 * 1024 * 1024 },
  { label: '5 MB', bytes: 5 * 1024 * 1024 },
];

const VIDEO_TARGET_CHIPS = [
  { label: '3 MB', bytes: 3 * 1024 * 1024 },
  { label: '8 MB', bytes: 8 * 1024 * 1024 },
  { label: '15 MB', bytes: 15 * 1024 * 1024 },
  { label: '25 MB', bytes: 25 * 1024 * 1024 },
];

const PDF_TARGET_CHIPS = [
  { label: '300 KB', bytes: 300 * 1024 },
  { label: '500 KB', bytes: 500 * 1024 },
  { label: '1 MB', bytes: 1024 * 1024 },
  { label: '2 MB', bytes: 2 * 1024 * 1024 },
];

interface TargetSizeBoxProps {
  targetSizeBytes: number | null;
  defaultBytes: number;
  chips: { label: string; bytes: number }[];
  defaultCustomValue: string;
  defaultCustomUnit: 'KB' | 'MB';
  onChange: (bytes: number | null) => void;
}

function TargetSizeBox({
  targetSizeBytes,
  defaultBytes,
  chips,
  defaultCustomValue,
  defaultCustomUnit,
  onChange,
}: TargetSizeBoxProps) {
  const { t } = useI18n();
  const [customVal, setCustomVal] = useState(defaultCustomValue);
  const [customUnit, setCustomUnit] = useState<'KB' | 'MB'>(defaultCustomUnit);

  useEffect(() => {
    if (targetSizeBytes === null || targetSizeBytes <= 0) return;
    const currentNum = Number(customVal);
    const currentBytes =
      Number.isFinite(currentNum) && currentNum > 0
        ? Math.round(currentNum * (customUnit === 'MB' ? 1024 * 1024 : 1024))
        : null;
    if (currentBytes === targetSizeBytes) return;

    if (targetSizeBytes >= 1024 * 1024 && targetSizeBytes % (1024 * 1024) === 0) {
      setCustomVal(String(targetSizeBytes / (1024 * 1024)));
      setCustomUnit('MB');
    } else if (targetSizeBytes >= 1024 * 1024) {
      setCustomVal(String(Number((targetSizeBytes / (1024 * 1024)).toFixed(2))));
      setCustomUnit('MB');
    } else {
      setCustomVal(String(Math.max(1, Math.round(targetSizeBytes / 1024))));
      setCustomUnit('KB');
    }
  }, [targetSizeBytes]);

  const applyCustom = (val: string, unit: 'KB' | 'MB') => {
    if (val.trim() === '') return;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return;
    onChange(Math.round(num * (unit === 'MB' ? 1024 * 1024 : 1024)));
  };

  const isCustomActive =
    targetSizeBytes !== null && !chips.some((chip) => chip.bytes === targetSizeBytes);

  return (
    <div className="rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface)] p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={targetSizeBytes !== null}
          onChange={(e) => onChange(e.target.checked ? defaultBytes : null)}
          className="mt-0.5 h-4 w-4 rounded accent-[#FF5416]"
        />
        <div>
          <div className="text-xs font-bold text-[#141413] dark:text-[#F3F2EE]">
            {t('targetSizeEnable')}
          </div>
          <div className="text-[11px] leading-snug text-[var(--studio-muted)]">
            {t('targetSizeHint')}
          </div>
        </div>
      </label>

      {targetSizeBytes !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onChange(chip.bytes)}
              className={`tactile-key rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold ${
                targetSizeBytes === chip.bytes
                  ? '!border-[#d9410b] bg-[#FF5416] text-white'
                  : 'bg-[var(--studio-well)] text-[#141413] dark:text-[#F3F2EE]'
              }`}
            >
              &le; {chip.label}
            </button>
          ))}

          <div
            className={`tactile-well flex items-center gap-1 rounded-lg px-2 py-1 ${
              isCustomActive ? '!border-[#FF5416] ring-1 ring-[#FF5416]/40' : ''
            }`}
          >
            <span className="text-[10px] font-semibold uppercase text-[var(--studio-muted)]">
              {t('targetSizeCustom')}:
            </span>
            <input
              type="number"
              min={1}
              max={5000}
              value={customVal}
              onChange={(e) => {
                setCustomVal(e.target.value);
                applyCustom(e.target.value, customUnit);
              }}
              onBlur={() => {
                const num = Number(customVal);
                if (!Number.isFinite(num) || num <= 0) {
                  if (targetSizeBytes && targetSizeBytes > 0) {
                    const divisor = customUnit === 'MB' ? 1024 * 1024 : 1024;
                    setCustomVal(String(Math.max(1, Math.round(targetSizeBytes / divisor))));
                  } else {
                    setCustomVal(defaultCustomValue);
                  }
                }
              }}
              className="w-14 bg-transparent font-mono text-xs font-bold text-[#141413] outline-none dark:text-[#F3F2EE]"
            />
            <select
              value={customUnit}
              onChange={(e) => {
                const unit = e.target.value as 'KB' | 'MB';
                setCustomUnit(unit);
                applyCustom(customVal, unit);
              }}
              className="bg-transparent font-mono text-xs font-bold text-[#FF5416] outline-none"
            >
              <option value="KB">{t('unitKB')}</option>
              <option value="MB">{t('unitMB')}</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export function ConversionWorkspace({
  preferManualTab = false,
  hasImages,
  hasAudio,
  hasVideo,
  hasPdf,
  pdfCount,
  firstAudioFile,
  firstVideoFile,
  avifSupported,
  imageOptions,
  audioOptions,
  videoOptions,
  pdfOptions,
  batchRenamePattern,
  builtInPresets,
  customPresets,
  onChangeImageOptions,
  onChangeAudioOptions,
  onChangeVideoOptions,
  onChangePdfOptions,
  onChangeBatchRenamePattern,
  onApplyPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
}: ConversionWorkspaceProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'presets' | 'manual'>(
    preferManualTab ? 'manual' : 'presets',
  );
  const [savingScope, setSavingScope] = useState<'image' | 'audio' | 'video' | 'pdf' | null>(null);
  const [presetNameInput, setPresetNameInput] = useState('');

  useEffect(() => {
    if (preferManualTab) {
      setActiveTab('manual');
    }
  }, [preferManualTab]);

  const matchesScope = (scope: ConversionPreset['appliesTo']) =>
    (scope === 'image' && hasImages) ||
    (scope === 'audio' && hasAudio) ||
    (scope === 'video' && hasVideo) ||
    (scope === 'pdf' && hasPdf);

  const filteredBuiltIn = builtInPresets.filter((p) => matchesScope(p.appliesTo));
  const filteredCustom = customPresets.filter((p) => matchesScope(p.appliesTo));

  const handleConfirmSavePreset = () => {
    if (!savingScope) return;
    const trimmed = presetNameInput.trim();
    if (!trimmed) return;
    onSaveCustomPreset(trimmed, savingScope);
    setPresetNameInput('');
    setSavingScope(null);
  };

  const appendRenameToken = (token: string) => {
    const base = batchRenamePattern.trim();
    if (base.includes(token)) return;
    const next = base ? `${base}-${token}` : `file-${token}`;
    onChangeBatchRenamePattern(next);
  };

  const renderSavePresetRow = (scope: 'image' | 'audio' | 'video' | 'pdf') =>
    savingScope === scope ? (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#FF5416]/40 bg-[#FF5416]/5 p-2.5">
        <input
          type="text"
          value={presetNameInput}
          onChange={(e) => setPresetNameInput(e.target.value)}
          placeholder={t('savePresetPrompt')}
          className="tactile-well min-w-[140px] flex-1 rounded-lg px-2.5 py-1.5 text-xs text-[#141413] outline-none focus:!border-[#FF5416] dark:text-[#F3F2EE]"
        />
        <button
          type="button"
          onClick={handleConfirmSavePreset}
          className="tactile-trigger rounded-lg px-3 py-1.5 text-xs font-bold"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => setSavingScope(null)}
          className="rounded-lg px-2 py-1.5 text-xs text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]"
        >
          {t('close')}
        </button>
      </div>
    ) : null;

  const isVideoContainerOutput = videoOptions.format === 'mp4' || videoOptions.format === 'webm';
  const isVideoGifOutput = videoOptions.format === 'gif';
  const isVideoWavOutput = videoOptions.format === 'wav';
  const audioTrimInvalid = hasInvalidTrimRange(
    audioOptions.trimStartSec,
    audioOptions.trimEndSec,
  );
  const videoTrimInvalid = hasInvalidTrimRange(
    videoOptions.trimStartSec,
    videoOptions.trimEndSec,
  );

  return (
    <section className="tactile-card rounded-2xl p-4">
      <div className="mb-3.5 flex items-center justify-between border-b border-[var(--studio-border)] pb-2.5">
        <span className="font-mono text-[11px] font-bold tracking-wider text-[var(--studio-muted)]">
          {t('studioInspectorTitle')}
        </span>

        <div className="tactile-well inline-flex rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition ${
              activeTab === 'presets'
                ? 'bg-[#FF5416] text-white shadow-xs'
                : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            {t('modePresets')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition ${
              activeTab === 'manual'
                ? 'bg-[#FF5416] text-white shadow-xs'
                : 'text-[var(--studio-muted)] hover:text-[#141413] dark:hover:text-[#F3F2EE]'
            }`}
          >
            <Sliders className="h-3 w-3" />
            {t('modeManual')}
          </button>
        </div>
      </div>

      {/* Batch Rename Well */}
      <div className="mb-4 space-y-1.5">
        <div className="tactile-well flex items-center gap-2 rounded-xl px-2.5 py-1.5">
          <Tag className="h-3.5 w-3.5 shrink-0 text-[#FF5416]" />
          <input
            type="text"
            value={batchRenamePattern}
            onChange={(e) => onChangeBatchRenamePattern(e.target.value)}
            title={t('batchRenameLabel')}
            aria-label={t('batchRenameLabel')}
            placeholder={t('batchRenamePlaceholder')}
            className="w-full bg-transparent font-mono text-xs text-[#141413] outline-none placeholder:font-sans placeholder:text-[var(--studio-muted)] dark:text-[#F3F2EE]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => appendRenameToken('{name}')}
            className="rounded border border-[var(--studio-border)] bg-[var(--studio-well)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--studio-muted)] hover:border-[#FF5416] hover:text-[#141413] dark:hover:text-[#F3F2EE]"
          >
            {t('insertTokenName')} &#123;name&#125;
          </button>
          <button
            type="button"
            onClick={() => appendRenameToken('{nn}')}
            className="rounded border border-[var(--studio-border)] bg-[var(--studio-well)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--studio-muted)] hover:border-[#FF5416] hover:text-[#141413] dark:hover:text-[#F3F2EE]"
          >
            {t('insertTokenNum')} &#123;nn&#125;
          </button>
        </div>
      </div>

      {activeTab === 'presets' && (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--studio-muted)]">
              {t('builtInPresetsTitle')}
            </h3>
            <div className="grid gap-2">
              {filteredBuiltIn.map((preset) => {
                const badge =
                  preset.imageOptions?.format ||
                  preset.audioOptions?.format ||
                  preset.videoOptions?.format ||
                  preset.pdfOptions?.operation ||
                  preset.appliesTo;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onApplyPreset(preset);
                      setActiveTab('manual');
                    }}
                    className="tactile-key flex flex-col items-start rounded-xl bg-[var(--studio-well)] p-3 text-left"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#141413] dark:text-[#F3F2EE]">
                        {preset.name}
                      </span>
                      <span className="rounded border border-[#FF5416]/35 bg-[#FF5416]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-[#FF5416]">
                        {badge}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-[var(--studio-muted)]">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredCustom.length > 0 && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--studio-muted)]">
                {t('customPresetsTitle')}
              </h3>
              <div className="grid gap-2">
                {filteredCustom.map((preset) => (
                  <div
                    key={preset.id}
                    className="tactile-well flex items-start justify-between gap-2 rounded-xl p-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onApplyPreset(preset);
                        setActiveTab('manual');
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="text-xs font-bold text-[#FF5416]">{preset.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--studio-muted)]">
                        {preset.description}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCustomPreset(preset.id)}
                      title={t('deletePreset')}
                      aria-label={t('deletePreset')}
                      className="rounded-lg p-1 text-[var(--studio-muted)] transition hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'manual' && (
        <div className="space-y-4">
          {hasImages && (
            <div className="tactile-well space-y-3.5 rounded-xl border-l-4 !border-l-[#FF5416] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[#FF5416]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('imageSettingsTitle')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSavingScope('image')}
                  className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2 py-1 text-[11px] font-semibold text-[#141413] dark:text-[#F3F2EE]"
                >
                  <BookmarkPlus className="h-3 w-3 text-[#FF5416]" />
                  {t('savePresetBtn')}
                </button>
              </div>

              {renderSavePresetRow('image')}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-[var(--studio-muted)]">
                  {t('outputFormat')}
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {IMAGE_FORMATS.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onChangeImageOptions({ ...imageOptions, format: fmt })}
                      className={`tactile-key rounded-lg py-1.5 font-mono text-xs font-bold uppercase ${
                        imageOptions.format === fmt
                          ? '!border-[#d9410b] bg-[#FF5416] text-white'
                          : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                {imageOptions.format === 'avif' && !avifSupported && (
                  <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-300">
                    {t('avifUnsupported')}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('qualityLabel')}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums text-[#FF5416]">
                    {imageOptions.quality}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={imageOptions.quality}
                  disabled={imageOptions.format === 'png'}
                  onChange={(e) =>
                    onChangeImageOptions({ ...imageOptions, quality: Number(e.target.value) })
                  }
                  className="studio-slider w-full disabled:opacity-40"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('maxWidthLabel')}
                  </label>
                  <select
                    value={imageOptions.maxWidth ?? 'original'}
                    onChange={(e) =>
                      onChangeImageOptions({
                        ...imageOptions,
                        maxWidth: e.target.value === 'original' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 text-xs font-semibold text-[#141413] outline-none focus:border-[#FF5416] dark:text-[#F3F2EE]"
                  >
                    <option value="original">{t('originalSizeOption')}</option>
                    <option value="2560">2560 px (2K)</option>
                    <option value="1920">1920 px (Full HD)</option>
                    <option value="1600">1600 px (Web)</option>
                    <option value="1280">1280 px (HD)</option>
                    <option value="800">800 px (Compact)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('cropRatioLabel')}
                  </label>
                  <select
                    value={imageOptions.cropRatio}
                    onChange={(e) =>
                      onChangeImageOptions({
                        ...imageOptions,
                        cropRatio: e.target.value as CropAspectRatio,
                      })
                    }
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 text-xs font-semibold text-[#141413] outline-none focus:border-[#FF5416] dark:text-[#F3F2EE]"
                  >
                    <option value="original">{t('cropOriginal')}</option>
                    <option value="1:1">{t('cropSquare')}</option>
                    <option value="4:5">{t('cropPortrait')}</option>
                    <option value="16:9">{t('cropLandscape')}</option>
                    <option value="3:4">{t('cropPasFoto')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('rotateLabel')}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([0, 90, 180, 270] as RotationDegrees[]).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => onChangeImageOptions({ ...imageOptions, rotationDeg: deg })}
                        className={`tactile-key inline-flex items-center justify-center gap-1 rounded-lg py-1.5 font-mono text-xs font-bold ${
                          imageOptions.rotationDeg === deg
                            ? '!border-[#d9410b] bg-[#FF5416] text-white'
                            : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                        }`}
                      >
                        {deg > 0 && <RotateCw className="h-3 w-3" />}
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {imageOptions.cropRatio !== 'original' && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                      {t('cropAnchorLabel')}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ['center', t('anchorCenter')],
                          ['top', t('anchorTop')],
                          ['bottom', t('anchorBottom')],
                        ] as [CropAnchor, string][]
                      ).map(([anchor, label]) => (
                        <button
                          key={anchor}
                          type="button"
                          onClick={() =>
                            onChangeImageOptions({ ...imageOptions, cropAnchor: anchor })
                          }
                          className={`tactile-key rounded-lg py-1.5 text-[11px] font-bold ${
                            imageOptions.cropAnchor === anchor
                              ? '!border-[#d9410b] bg-[#FF5416] text-white'
                              : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {imageOptions.format === 'pdf' && (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 py-2 text-xs font-semibold text-[#141413] dark:text-[#F3F2EE]">
                  <input
                    type="checkbox"
                    checked={imageOptions.combineIntoSinglePdf}
                    onChange={(e) =>
                      onChangeImageOptions({
                        ...imageOptions,
                        combineIntoSinglePdf: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-[#FF5416]"
                  />
                  <span>{t('combinePdfLabel')}</span>
                </label>
              )}

              <TargetSizeBox
                targetSizeBytes={imageOptions.targetSizeBytes}
                defaultBytes={500 * 1024}
                chips={IMAGE_TARGET_CHIPS}
                defaultCustomValue="500"
                defaultCustomUnit="KB"
                onChange={(bytes) =>
                  onChangeImageOptions({ ...imageOptions, targetSizeBytes: bytes })
                }
              />
            </div>
          )}

          {hasAudio && (
            <div className="tactile-well space-y-3.5 rounded-xl border-l-4 !border-l-blue-500 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4 text-blue-500" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('audioSettingsTitle')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSavingScope('audio')}
                  className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2 py-1 text-[11px] font-semibold text-[#141413] dark:text-[#F3F2EE]"
                >
                  <BookmarkPlus className="h-3 w-3 text-blue-500" />
                  {t('savePresetBtn')}
                </button>
              </div>

              {renderSavePresetRow('audio')}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('outputFormat')}
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {AUDIO_FORMATS.map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => onChangeAudioOptions({ ...audioOptions, format: fmt })}
                        className={`tactile-key rounded-lg py-1.5 font-mono text-xs font-bold uppercase ${
                          audioOptions.format === fmt
                            ? '!border-blue-600 bg-blue-600 text-white'
                            : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {audioOptions.format !== 'wav' && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                      {t('audioBitrateLabel')}
                    </label>
                    <select
                      value={audioOptions.audioBitrateKbps}
                      onChange={(e) =>
                        onChangeAudioOptions({
                          ...audioOptions,
                          audioBitrateKbps: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#141413] outline-none focus:border-blue-500 dark:text-[#F3F2EE]"
                    >
                      <option value={96}>96 kbps (Compact)</option>
                      <option value={128}>128 kbps (Standard)</option>
                      <option value={192}>192 kbps (High)</option>
                      <option value={320}>320 kbps (Max)</option>
                    </select>
                  </div>
                )}
              </div>

              <MediaTrimControl
                idPrefix="audio"
                mediaType="audio"
                sampleFile={firstAudioFile}
                trimStartSec={audioOptions.trimStartSec ?? null}
                trimEndSec={audioOptions.trimEndSec ?? null}
                isInvalid={audioTrimInvalid}
                onChangeTrim={(start, end) =>
                  onChangeAudioOptions({
                    ...audioOptions,
                    trimStartSec: start,
                    trimEndSec: end,
                  })
                }
              />

              {audioOptions.format !== 'wav' && (
                <TargetSizeBox
                  targetSizeBytes={audioOptions.targetSizeBytes}
                  defaultBytes={2 * 1024 * 1024}
                  chips={AUDIO_TARGET_CHIPS}
                  defaultCustomValue="2"
                  defaultCustomUnit="MB"
                  onChange={(bytes) =>
                    onChangeAudioOptions({ ...audioOptions, targetSizeBytes: bytes })
                  }
                />
              )}
            </div>
          )}

          {hasVideo && (
            <div className="tactile-well space-y-3.5 rounded-xl border-l-4 !border-l-cyan-500 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4 text-cyan-500" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('videoSettingsTitle')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSavingScope('video')}
                  className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2 py-1 text-[11px] font-semibold text-[#141413] dark:text-[#F3F2EE]"
                >
                  <BookmarkPlus className="h-3 w-3 text-cyan-500" />
                  {t('savePresetBtn')}
                </button>
              </div>

              {renderSavePresetRow('video')}

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                  {t('outputFormat')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {VIDEO_FORMATS.map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => onChangeVideoOptions({ ...videoOptions, format: fmt })}
                      className={`tactile-key rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold uppercase ${
                        videoOptions.format === fmt
                          ? '!border-cyan-600 bg-cyan-600 text-white'
                          : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {isVideoContainerOutput && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                      {t('resolutionLabel')}
                    </label>
                    <select
                      value={videoOptions.resolution}
                      onChange={(e) =>
                        onChangeVideoOptions({
                          ...videoOptions,
                          resolution: e.target.value as VideoResolution,
                        })
                      }
                      className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#141413] outline-none focus:border-cyan-500 dark:text-[#F3F2EE]"
                    >
                      <option value="original">{t('originalSizeOption')}</option>
                      <option value="1080p">1080p (Full HD)</option>
                      <option value="720p">720p (HD)</option>
                      <option value="480p">480p (Compact)</option>
                    </select>
                  </div>
                )}

                {isVideoGifOutput && (
                  <>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-[var(--studio-muted)]">
                          {t('gifFpsLabel')}
                        </span>
                        <span className="font-mono text-xs font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
                          {videoOptions.gifFps} fps
                        </span>
                      </div>
                      <input
                        type="range"
                        min={6}
                        max={24}
                        value={videoOptions.gifFps}
                        onChange={(e) =>
                          onChangeVideoOptions({
                            ...videoOptions,
                            gifFps: Number(e.target.value),
                          })
                        }
                        className="studio-slider w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                        {t('gifWidthLabel')}
                      </label>
                      <select
                        value={videoOptions.gifWidth}
                        onChange={(e) =>
                          onChangeVideoOptions({
                            ...videoOptions,
                            gifWidth: Number(e.target.value),
                          })
                        }
                        className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#141413] outline-none focus:border-cyan-500 dark:text-[#F3F2EE]"
                      >
                        <option value={320}>320 px</option>
                        <option value={480}>480 px</option>
                        <option value={640}>640 px</option>
                        <option value={800}>800 px</option>
                      </select>
                    </div>
                  </>
                )}

                {!isVideoGifOutput && !isVideoWavOutput && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                      {t('audioBitrateLabel')}
                    </label>
                    <select
                      value={videoOptions.audioBitrateKbps}
                      onChange={(e) =>
                        onChangeVideoOptions({
                          ...videoOptions,
                          audioBitrateKbps: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#141413] outline-none focus:border-cyan-500 dark:text-[#F3F2EE]"
                    >
                      <option value={96}>96 kbps (Compact)</option>
                      <option value={128}>128 kbps (Standard)</option>
                      <option value={192}>192 kbps (High)</option>
                      <option value={320}>320 kbps (Max)</option>
                    </select>
                  </div>
                )}
              </div>

              <MediaTrimControl
                idPrefix="video"
                mediaType="video"
                sampleFile={firstVideoFile}
                trimStartSec={videoOptions.trimStartSec ?? null}
                trimEndSec={videoOptions.trimEndSec ?? null}
                isInvalid={videoTrimInvalid}
                onChangeTrim={(start, end) =>
                  onChangeVideoOptions({
                    ...videoOptions,
                    trimStartSec: start,
                    trimEndSec: end,
                  })
                }
              />

              {!isVideoWavOutput && (
                <TargetSizeBox
                  targetSizeBytes={videoOptions.targetSizeBytes}
                  defaultBytes={isVideoGifOutput ? 3 * 1024 * 1024 : 15 * 1024 * 1024}
                  chips={VIDEO_TARGET_CHIPS}
                  defaultCustomValue={isVideoGifOutput ? '3' : '15'}
                  defaultCustomUnit="MB"
                  onChange={(bytes) =>
                    onChangeVideoOptions({ ...videoOptions, targetSizeBytes: bytes })
                  }
                />
              )}
            </div>
          )}

          {hasPdf && (
            <div className="tactile-well space-y-3.5 rounded-xl border-l-4 !border-l-amber-500 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('pdfSettingsTitle')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSavingScope('pdf')}
                  className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-surface)] px-2 py-1 text-[11px] font-semibold text-[#141413] dark:text-[#F3F2EE]"
                >
                  <BookmarkPlus className="h-3 w-3 text-amber-500" />
                  {t('savePresetBtn')}
                </button>
              </div>

              {renderSavePresetRow('pdf')}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold text-[var(--studio-muted)]">
                  {t('pdfOperationLabel')}
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['compress', t('pdfOpCompress')],
                      ['merge', t('pdfOpMerge')],
                      ['to-images', t('pdfOpToImages')],
                      ['extract-pages', t('pdfOpExtract')],
                    ] as [PdfOperation, string][]
                  ).map(([op, label]) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => onChangePdfOptions({ ...pdfOptions, operation: op })}
                      className={`tactile-key rounded-lg px-2 py-1.5 text-xs font-bold ${
                        pdfOptions.operation === op
                          ? '!border-amber-600 bg-amber-500 text-slate-950'
                          : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {pdfOptions.operation === 'merge' && pdfCount < 2 && (
                  <p className="mt-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                    {t('pdfMergeNeedsTwo')}
                  </p>
                )}
              </div>

              {pdfOptions.operation === 'to-images' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('pdfImageFormatLabel')}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['jpg', 'png', 'webp'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => onChangePdfOptions({ ...pdfOptions, imageFormat: fmt })}
                        className={`tactile-key rounded-lg py-1.5 font-mono text-xs font-bold uppercase ${
                          pdfOptions.imageFormat === fmt
                            ? '!border-amber-600 bg-amber-500 text-slate-950'
                            : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {pdfOptions.operation === 'extract-pages' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[var(--studio-muted)]">
                    {t('pdfPageRangeLabel')}
                  </label>
                  <input
                    type="text"
                    value={pdfOptions.pageRange}
                    onChange={(e) =>
                      onChangePdfOptions({ ...pdfOptions, pageRange: e.target.value })
                    }
                    placeholder={t('pdfPageRangePlaceholder')}
                    className="w-full rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-2.5 py-1.5 font-mono text-xs text-[#141413] outline-none focus:border-amber-500 dark:text-[#F3F2EE]"
                  />
                </div>
              )}

              {pdfOptions.operation === 'compress' && (
                <div className="space-y-2">
                  <TargetSizeBox
                    targetSizeBytes={pdfOptions.targetSizeBytes}
                    defaultBytes={1024 * 1024}
                    chips={PDF_TARGET_CHIPS}
                    defaultCustomValue="1"
                    defaultCustomUnit="MB"
                    onChange={(bytes) =>
                      onChangePdfOptions({ ...pdfOptions, targetSizeBytes: bytes })
                    }
                  />
                  <p className="text-[11px] leading-snug text-[var(--studio-muted)]">
                    {t('pdfRasterizeNote')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
