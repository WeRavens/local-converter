import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Gauge,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  WifiOff,
  X,
} from 'lucide-react';
import { BeforeAfterModal } from './components/BeforeAfterModal';
import { ConversionWorkspace } from './components/ConversionWorkspace';
import { DropZone } from './components/DropZone';
import { FileQueueList } from './components/FileQueueList';
import { Header } from './components/Header';
import { MediaPreviewModal } from './components/MediaPreviewModal';
import { PrivacyNoticeModal } from './components/PrivacyNoticeModal';
import {
  applyBatchRenamePattern,
  detectFileCategory,
  formatBytes,
} from './engines/formatUtils';
import {
  convertImageFile,
  convertImagesToSinglePdf,
  decodeInputImageBlob,
  isAvifEncodingSupported,
} from './engines/imageEngine';
import {
  ConversionCanceledError,
  cancelActiveMediaConversion,
  convertMediaFile,
  formatFriendlyMediaError,
} from './engines/mediaEngine';
import { mergePdfFiles, processPdfFile } from './engines/pdfEngine';
import {
  DEFAULT_AUDIO_OPTIONS,
  DEFAULT_IMAGE_OPTIONS,
  DEFAULT_PDF_OPTIONS,
  DEFAULT_VIDEO_OPTIONS,
  addLocalProcessedBytes,
  deleteCustomPreset,
  getBuiltInPresets,
  loadCustomPresets,
  loadTotalBytesProcessedLocally,
  resetLocalProcessedBytes,
  saveCustomPreset,
} from './engines/presets';
import {
  TOOL_ROUTES,
  ToolRoute,
  getRouteDocumentTitle,
  matchToolRoute,
} from './engines/routes';
import {
  AudioConversionOptions,
  ConversionPreset,
  ConversionResult,
  FileCategory,
  ImageConversionOptions,
  PdfConversionOptions,
  QueueItem,
  RotationDegrees,
  VideoConversionOptions,
} from './engines/types';
import { I18nProvider, useI18n } from './i18n/useI18n';
import { ThemeProvider } from './i18n/useTheme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LARGE_MEDIA_THRESHOLD = 400 * 1024 * 1024; // 400 MB

function revokeItemUrls(item: QueueItem) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item.result?.url) URL.revokeObjectURL(item.result.url);
}

function getCategoryOptionsKey(
  category: FileCategory,
  imgOpts: ImageConversionOptions,
  audOpts: AudioConversionOptions,
  vidOpts: VideoConversionOptions,
  pOpts: PdfConversionOptions,
  renamePattern: string,
): string {
  const rename = renamePattern.trim();
  switch (category) {
    case 'image':
      return JSON.stringify({ imgOpts, rename });
    case 'audio':
      return JSON.stringify({ audOpts, rename });
    case 'video':
      return JSON.stringify({ vidOpts, rename });
    case 'pdf':
      return JSON.stringify({ pOpts, rename });
  }
}

export function ConverterApp() {
  const { lang, t } = useI18n();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>(queue);
  queueRef.current = queue;

  const [combinedResults, setCombinedResults] = useState<ConversionResult[]>([]);
  const combinedRef = useRef<ConversionResult[]>(combinedResults);
  combinedRef.current = combinedResults;

  const mountedItemIdsRef = useRef<Set<string>>(new Set());
  const countedStatKeysRef = useRef<Set<string>>(new Set());
  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [activeRoute, setActiveRoute] = useState<ToolRoute | null>(() =>
    typeof window !== 'undefined' ? matchToolRoute(window.location.pathname) : null,
  );

  const [imageOptions, setImageOptions] = useState<ImageConversionOptions>(() => ({
    ...DEFAULT_IMAGE_OPTIONS,
    ...(activeRoute?.imageOptions ?? {}),
  }));
  const [audioOptions, setAudioOptions] = useState<AudioConversionOptions>(() => ({
    ...DEFAULT_AUDIO_OPTIONS,
    ...(activeRoute?.audioOptions ?? {}),
  }));
  const [videoOptions, setVideoOptions] = useState<VideoConversionOptions>(() => ({
    ...DEFAULT_VIDEO_OPTIONS,
    ...(activeRoute?.videoOptions ?? {}),
  }));
  const [pdfOptions, setPdfOptions] = useState<PdfConversionOptions>(() => ({
    ...DEFAULT_PDF_OPTIONS,
    ...(activeRoute?.pdfOptions ?? {}),
  }));
  const [batchRenamePattern, setBatchRenamePattern] = useState('');

  const [customPresets, setCustomPresets] = useState<ConversionPreset[]>(loadCustomPresets);
  const [avifSupported, setAvifSupported] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

  const [compareItem, setCompareItem] = useState<QueueItem | null>(null);
  const [mediaPreviewItem, setMediaPreviewItem] = useState<QueueItem | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [totalLocalBytes, setTotalLocalBytes] = useState(loadTotalBytesProcessedLocally);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const builtInPresets = useMemo(() => getBuiltInPresets(lang), [lang]);

  useEffect(() => {
    isAvifEncodingSupported().then(setAvifSupported);
  }, []);

  useEffect(() => {
    document.title = getRouteDocumentTitle(activeRoute, lang);
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        activeRoute
          ? lang === 'id'
            ? activeRoute.acceptHintId
            : activeRoute.acceptHintEn
          : t('heroSubtitle'),
      );
    }
  }, [activeRoute, lang, t]);

  const applyRouteOptions = useCallback((route: ToolRoute | null) => {
    setImageOptions({ ...DEFAULT_IMAGE_OPTIONS, ...(route?.imageOptions ?? {}) });
    setAudioOptions({ ...DEFAULT_AUDIO_OPTIONS, ...(route?.audioOptions ?? {}) });
    setVideoOptions({ ...DEFAULT_VIDEO_OPTIONS, ...(route?.videoOptions ?? {}) });
    setPdfOptions({ ...DEFAULT_PDF_OPTIONS, ...(route?.pdfOptions ?? {}) });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const matched = matchToolRoute(window.location.pathname);
      setActiveRoute(matched);
      applyRouteOptions(matched);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyRouteOptions]);

  const navigateToRoute = useCallback(
    (route: ToolRoute | null) => {
      const targetPath = route ? route.path : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
      setActiveRoute(route);
      applyRouteOptions(route);
    },
    [applyRouteOptions],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      mountedItemIdsRef.current.clear();
      queueRef.current.forEach(revokeItemUrls);
      combinedRef.current.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, []);

  const recordProcessedFile = useCallback((file: File) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (countedStatKeysRef.current.has(key)) return;
    countedStatKeysRef.current.add(key);
    setTotalLocalBytes(addLocalProcessedBytes(file.size));
  }, []);

  const handleInstallPwa = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleFilesAdded = useCallback((files: File[]) => {
    const additions: QueueItem[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      const category = detectFileCategory(file);
      if (!category) {
        rejected.push(file.name);
        continue;
      }
      const isStandardPreviewableImage =
        category === 'image' &&
        !file.name.toLowerCase().endsWith('.heic') &&
        !file.name.toLowerCase().endsWith('.heif');
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      mountedItemIdsRef.current.add(id);
      additions.push({
        id,
        file,
        category,
        previewUrl: isStandardPreviewableImage ? URL.createObjectURL(file) : undefined,
        status: 'pending',
        progress: 0,
      });

      if (category === 'image' && !isStandardPreviewableImage) {
        decodeInputImageBlob(file)
          .then((blob) => {
            if (!mountedItemIdsRef.current.has(id)) return;
            const url = URL.createObjectURL(blob);
            setQueue((prev) => {
              if (!prev.some((q) => q.id === id)) {
                URL.revokeObjectURL(url);
                return prev;
              }
              return prev.map((q) => (q.id === id ? { ...q, previewUrl: url } : q));
            });
          })
          .catch(() => {});
      }
    }

    if (rejected.length > 0) {
      setSkippedFiles(rejected);
    } else {
      setSkippedFiles([]);
    }

    if (additions.length > 0) {
      setQueue((prev) => [...prev, ...additions]);
    }
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const invalidateCombinedCategory = useCallback((category: FileCategory) => {
    if (category !== 'image' && category !== 'pdf') return;
    setCombinedResults((prev) => {
      const removed = prev.filter((r) => r.sourceCategory === category);
      if (removed.length === 0) return prev;
      removed.forEach((r) => URL.revokeObjectURL(r.url));
      return prev.filter((r) => r.sourceCategory !== category);
    });
  }, []);

  const currentOptionsKeyByCategory = useMemo(
    () => ({
      image: getCategoryOptionsKey(
        'image',
        imageOptions,
        audioOptions,
        videoOptions,
        pdfOptions,
        batchRenamePattern,
      ),
      audio: getCategoryOptionsKey(
        'audio',
        imageOptions,
        audioOptions,
        videoOptions,
        pdfOptions,
        batchRenamePattern,
      ),
      video: getCategoryOptionsKey(
        'video',
        imageOptions,
        audioOptions,
        videoOptions,
        pdfOptions,
        batchRenamePattern,
      ),
      pdf: getCategoryOptionsKey(
        'pdf',
        imageOptions,
        audioOptions,
        videoOptions,
        pdfOptions,
        batchRenamePattern,
      ),
    }),
    [imageOptions, audioOptions, videoOptions, pdfOptions, batchRenamePattern],
  );

  const staleItemIds = useMemo(() => {
    const stale = new Set<string>();
    for (const item of queue) {
      if (item.status !== 'done' || !item.appliedOptionsKey) continue;
      const expectedKey =
        item.category === 'image'
          ? `${currentOptionsKeyByCategory.image}::rot=${item.rotationOverrideDeg ?? 0}`
          : currentOptionsKeyByCategory[item.category];
      if (item.appliedOptionsKey !== expectedKey) {
        stale.add(item.id);
      }
    }
    return stale;
  }, [queue, currentOptionsKeyByCategory]);

  const hasActionableTargets = useMemo(() => {
    if (queue.length === 0) return false;
    if (
      queue.some(
        (item) =>
          item.status === 'pending' ||
          item.status === 'error' ||
          item.status === 'canceled' ||
          staleItemIds.has(item.id),
      )
    ) {
      return true;
    }

    const allImages = queue.filter((i) => i.category === 'image');
    if (imageOptions.format === 'pdf' && imageOptions.combineIntoSinglePdf && allImages.length > 0) {
      const expectedKey = `${currentOptionsKeyByCategory.image}::${allImages
        .map((i) => `${i.id}@${i.rotationOverrideDeg ?? 0}`)
        .join(',')}`;
      const hasCombined = combinedResults.some(
        (r) => r.sourceCategory === 'image' && r.appliedOptionsKey === expectedKey,
      );
      if (!hasCombined) return true;
    }

    const allPdfs = queue.filter((i) => i.category === 'pdf');
    if (pdfOptions.operation === 'merge' && allPdfs.length >= 2) {
      const expectedKey = `${currentOptionsKeyByCategory.pdf}::${allPdfs.map((i) => i.id).join(',')}`;
      const hasCombined = combinedResults.some(
        (r) => r.sourceCategory === 'pdf' && r.appliedOptionsKey === expectedKey,
      );
      if (!hasCombined) return true;
    }

    return false;
  }, [queue, staleItemIds, imageOptions, pdfOptions, combinedResults, currentOptionsKeyByCategory]);

  const processSingleItem = useCallback(
    async (
      item: QueueItem,
      indexInBatch: number,
      imgOpts: ImageConversionOptions,
      audOpts: AudioConversionOptions,
      vidOpts: VideoConversionOptions,
      pOpts: PdfConversionOptions,
      renamePattern: string,
      signal: AbortSignal,
    ) => {
      if (signal.aborted) return;

      if (item.result?.url) {
        URL.revokeObjectURL(item.result.url);
      }

      const baseKey = getCategoryOptionsKey(
        item.category,
        imgOpts,
        audOpts,
        vidOpts,
        pOpts,
        renamePattern,
      );
      const appliedKey =
        item.category === 'image'
          ? `${baseKey}::rot=${item.rotationOverrideDeg ?? 0}`
          : baseKey;

      updateItem(item.id, {
        status: 'processing',
        progress: 5,
        errorMessage: undefined,
        result: undefined,
      });

      try {
        let result: ConversionResult;
        if (item.category === 'image') {
          const effectiveRotation = (((imgOpts.rotationDeg + (item.rotationOverrideDeg ?? 0)) %
            360) as RotationDegrees);
          const effectiveImgOpts: ImageConversionOptions = {
            ...imgOpts,
            rotationDeg: effectiveRotation,
          };
          const outName = renamePattern.trim()
            ? applyBatchRenamePattern(item.file.name, renamePattern, indexInBatch, imgOpts.format)
            : undefined;
          result = await convertImageFile(
            item.file,
            effectiveImgOpts,
            (pct) => updateItem(item.id, { progress: pct }),
            outName,
            signal,
          );
        } else if (item.category === 'audio') {
          const outName = renamePattern.trim()
            ? applyBatchRenamePattern(item.file.name, renamePattern, indexInBatch, audOpts.format)
            : undefined;
          result = await convertMediaFile(
            item.file,
            audOpts,
            {
              onStage: (stage) =>
                updateItem(item.id, {
                  status: stage === 'loading-engine' ? 'loading-engine' : 'processing',
                }),
              onProgress: (pct) => updateItem(item.id, { status: 'processing', progress: pct }),
            },
            outName,
            signal,
          );
        } else if (item.category === 'video') {
          const outName = renamePattern.trim()
            ? applyBatchRenamePattern(item.file.name, renamePattern, indexInBatch, vidOpts.format)
            : undefined;
          result = await convertMediaFile(
            item.file,
            vidOpts,
            {
              onStage: (stage) =>
                updateItem(item.id, {
                  status: stage === 'loading-engine' ? 'loading-engine' : 'processing',
                }),
              onProgress: (pct) => updateItem(item.id, { status: 'processing', progress: pct }),
            },
            outName,
            signal,
          );
        } else {
          if (pOpts.operation === 'merge') {
            throw new Error(t('pdfMergeNeedsTwo'));
          }
          const ext = pOpts.operation === 'to-images' ? pOpts.imageFormat : 'pdf';
          const outName = renamePattern.trim()
            ? applyBatchRenamePattern(item.file.name, renamePattern, indexInBatch, ext)
            : undefined;
          result = await processPdfFile(
            item.file,
            pOpts,
            (pct) => updateItem(item.id, { progress: pct }),
            outName,
            signal,
          );
        }

        if (signal.aborted) {
          URL.revokeObjectURL(result.url);
          updateItem(item.id, { status: 'canceled', progress: 0 });
          return;
        }

        updateItem(item.id, {
          status: 'done',
          progress: 100,
          result,
          appliedOptionsKey: appliedKey,
        });

        recordProcessedFile(item.file);
      } catch (err) {
        if (err instanceof ConversionCanceledError || signal.aborted) {
          updateItem(item.id, { status: 'canceled', progress: 0, errorMessage: undefined });
          return;
        }
        const message =
          item.category === 'audio' || item.category === 'video'
            ? formatFriendlyMediaError(err, lang)
            : err instanceof Error
              ? err.message
              : String(err);
        updateItem(item.id, {
          status: 'error',
          progress: 0,
          errorMessage: message,
        });
      }
    },
    [lang, recordProcessedFile, t, updateItem],
  );

  const runBatchConversion = async (forceAll: boolean) => {
    if (isConverting || queue.length === 0) return;

    const myRunId = runIdRef.current + 1;
    runIdRef.current = myRunId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    setIsConverting(true);

    const imgOpts = { ...imageOptions };
    const audOpts = { ...audioOptions };
    const vidOpts = { ...videoOptions };
    const pOpts = { ...pdfOptions };
    const renamePattern = batchRenamePattern;

    const imgKey = getCategoryOptionsKey('image', imgOpts, audOpts, vidOpts, pOpts, renamePattern);
    const pdfKey = getCategoryOptionsKey('pdf', imgOpts, audOpts, vidOpts, pOpts, renamePattern);

    const targets = forceAll
      ? [...queue]
      : queue.filter(
          (item) =>
            item.status === 'pending' ||
            item.status === 'error' ||
            item.status === 'canceled' ||
            staleItemIds.has(item.id),
        );

    const allImages = queue.filter((i) => i.category === 'image');
    const isCombineImagesActive =
      imgOpts.format === 'pdf' && imgOpts.combineIntoSinglePdf && allImages.length > 0;
    const allPdfs = queue.filter((i) => i.category === 'pdf');
    const isMergePdfsActive = pOpts.operation === 'merge' && allPdfs.length >= 2;

    const imageCombinedKey = `${imgKey}::${allImages
      .map((i) => `${i.id}@${i.rotationOverrideDeg ?? 0}`)
      .join(',')}`;
    const pdfCombinedKey = `${pdfKey}::${allPdfs.map((i) => i.id).join(',')}`;

    const shouldRebuildCombinedImages =
      isCombineImagesActive &&
      (forceAll ||
        targets.some((i) => i.category === 'image') ||
        !combinedResults.some(
          (r) => r.sourceCategory === 'image' && r.appliedOptionsKey === imageCombinedKey,
        ));

    const shouldRebuildMergedPdfs =
      isMergePdfsActive &&
      (forceAll ||
        targets.some((i) => i.category === 'pdf') ||
        !combinedResults.some(
          (r) => r.sourceCategory === 'pdf' && r.appliedOptionsKey === pdfCombinedKey,
        ));

    const retainedCombined = combinedResults.filter((r) => {
      if (r.sourceCategory === 'image') {
        if (!isCombineImagesActive || shouldRebuildCombinedImages) {
          URL.revokeObjectURL(r.url);
          return false;
        }
        return true;
      }
      if (r.sourceCategory === 'pdf') {
        if (!isMergePdfsActive || shouldRebuildMergedPdfs) {
          URL.revokeObjectURL(r.url);
          return false;
        }
        return true;
      }
      URL.revokeObjectURL(r.url);
      return false;
    });

    const nextCombined: ConversionResult[] = [...retainedCombined];
    setCombinedResults(nextCombined);

    try {
      let remainingTargets = [...targets];

      if (shouldRebuildCombinedImages) {
        allImages.forEach((i) => {
          if (i.result?.url) URL.revokeObjectURL(i.result.url);
          updateItem(i.id, {
            status: 'processing',
            progress: 10,
            errorMessage: undefined,
            result: undefined,
          });
        });
        try {
          const outName = renamePattern.trim()
            ? applyBatchRenamePattern(allImages[0].file.name, renamePattern, 0, 'pdf')
            : 'images-combined.pdf';
          const perFileRotations = allImages.map(
            (i) => ((imgOpts.rotationDeg + (i.rotationOverrideDeg ?? 0)) % 360) as RotationDegrees,
          );
          const combinedPdf = await convertImagesToSinglePdf(
            allImages.map((i) => i.file),
            imgOpts,
            (pct) => allImages.forEach((i) => updateItem(i.id, { progress: pct })),
            outName,
            signal,
            perFileRotations,
          );
          if (signal.aborted) {
            URL.revokeObjectURL(combinedPdf.url);
            allImages.forEach((i) => updateItem(i.id, { status: 'canceled', progress: 0 }));
          } else {
            combinedPdf.sourceCategory = 'image';
            combinedPdf.appliedOptionsKey = imageCombinedKey;
            allImages.forEach((i) => {
              updateItem(i.id, {
                status: 'done',
                progress: 100,
                result: undefined,
                appliedOptionsKey: `${imgKey}::rot=${i.rotationOverrideDeg ?? 0}`,
              });
              recordProcessedFile(i.file);
            });
            nextCombined.push(combinedPdf);
            setCombinedResults([...nextCombined]);
          }
        } catch (err) {
          if (err instanceof ConversionCanceledError || signal.aborted) {
            allImages.forEach((i) =>
              updateItem(i.id, { status: 'canceled', progress: 0, errorMessage: undefined }),
            );
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            allImages.forEach((i) =>
              updateItem(i.id, { status: 'error', progress: 0, errorMessage: msg }),
            );
          }
        }
        remainingTargets = remainingTargets.filter((i) => i.category !== 'image');
      } else if (isCombineImagesActive) {
        remainingTargets = remainingTargets.filter((i) => i.category !== 'image');
      }

      if (shouldRebuildMergedPdfs && !signal.aborted) {
        allPdfs.forEach((i) => {
          if (i.result?.url) URL.revokeObjectURL(i.result.url);
          updateItem(i.id, {
            status: 'processing',
            progress: 10,
            errorMessage: undefined,
            result: undefined,
          });
        });
        try {
          const outName = renamePattern.trim()
            ? applyBatchRenamePattern(allPdfs[0].file.name, renamePattern, 0, 'pdf')
            : 'merged-document.pdf';
          const mergedPdf = await mergePdfFiles(
            allPdfs.map((i) => i.file),
            (pct) => allPdfs.forEach((i) => updateItem(i.id, { progress: pct })),
            outName,
            signal,
          );
          if (signal.aborted) {
            URL.revokeObjectURL(mergedPdf.url);
            allPdfs.forEach((i) => updateItem(i.id, { status: 'canceled', progress: 0 }));
          } else {
            mergedPdf.sourceCategory = 'pdf';
            mergedPdf.appliedOptionsKey = pdfCombinedKey;
            allPdfs.forEach((i) => {
              updateItem(i.id, {
                status: 'done',
                progress: 100,
                result: undefined,
                appliedOptionsKey: pdfKey,
              });
              recordProcessedFile(i.file);
            });
            nextCombined.push(mergedPdf);
            setCombinedResults([...nextCombined]);
          }
        } catch (err) {
          if (err instanceof ConversionCanceledError || signal.aborted) {
            allPdfs.forEach((i) =>
              updateItem(i.id, { status: 'canceled', progress: 0, errorMessage: undefined }),
            );
          } else {
            const msg = err instanceof Error ? err.message : String(err);
            allPdfs.forEach((i) =>
              updateItem(i.id, { status: 'error', progress: 0, errorMessage: msg }),
            );
          }
        }
        remainingTargets = remainingTargets.filter((i) => i.category !== 'pdf');
      } else if (isMergePdfsActive) {
        remainingTargets = remainingTargets.filter((i) => i.category !== 'pdf');
      }

      for (let i = 0; i < remainingTargets.length; i += 1) {
        if (signal.aborted) break;
        await processSingleItem(
          remainingTargets[i],
          i,
          imgOpts,
          audOpts,
          vidOpts,
          pOpts,
          renamePattern,
          signal,
        );
      }
    } finally {
      if (runIdRef.current === myRunId) {
        setIsConverting(false);
      }
    }
  };

  const handleConvertAll = () => runBatchConversion(!hasActionableTargets);
  const handleReconvertAll = () => runBatchConversion(true);

  const handleCancelConversion = () => {
    runIdRef.current += 1;
    abortControllerRef.current?.abort();
    cancelActiveMediaConversion();
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'processing' || item.status === 'loading-engine'
          ? { ...item, status: 'canceled', progress: 0 }
          : item,
      ),
    );
    setIsConverting(false);
  };

  const handleRetryItem = async (id: string) => {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx === -1 || isConverting) return;

    const myRunId = runIdRef.current + 1;
    runIdRef.current = myRunId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    invalidateCombinedCategory(queue[idx].category);
    setIsConverting(true);
    try {
      await processSingleItem(
        queue[idx],
        idx,
        imageOptions,
        audioOptions,
        videoOptions,
        pdfOptions,
        batchRenamePattern,
        controller.signal,
      );
    } finally {
      if (runIdRef.current === myRunId) {
        setIsConverting(false);
      }
    }
  };

  const handleRemoveItem = (id: string) => {
    mountedItemIdsRef.current.delete(id);
    const target = queue.find((q) => q.id === id);
    if (target) {
      invalidateCombinedCategory(target.category);
      revokeItemUrls(target);
    }
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const handleMoveItem = (id: string, direction: 'up' | 'down') => {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= queue.length) return;
    invalidateCombinedCategory(queue[idx].category);
    if (queue[swapIdx].category !== queue[idx].category) {
      invalidateCombinedCategory(queue[swapIdx].category);
    }
    setQueue((prev) => {
      const pIdx = prev.findIndex((q) => q.id === id);
      if (pIdx === -1) return prev;
      const pSwap = direction === 'up' ? pIdx - 1 : pIdx + 1;
      if (pSwap < 0 || pSwap >= prev.length) return prev;
      const next = [...prev];
      [next[pIdx], next[pSwap]] = [next[pSwap], next[pIdx]];
      return next;
    });
  };

  const handleReorderItems = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= queue.length || toIndex >= queue.length) return;
    invalidateCombinedCategory(queue[fromIndex].category);
    if (queue[toIndex].category !== queue[fromIndex].category) {
      invalidateCombinedCategory(queue[toIndex].category);
    }
    setQueue((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleRotateItem = (id: string) => {
    invalidateCombinedCategory('image');
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const current = item.rotationOverrideDeg ?? 0;
        const nextDeg = ((current + 90) % 360) as RotationDegrees;
        return { ...item, rotationOverrideDeg: nextDeg };
      }),
    );
  };

  const handleClearAll = () => {
    mountedItemIdsRef.current.clear();
    queue.forEach(revokeItemUrls);
    combinedResults.forEach((r) => URL.revokeObjectURL(r.url));
    setCombinedResults([]);
    setQueue([]);
  };

  const handleDownloadAllZip = async () => {
    const doneItems = queue.filter((q) => q.status === 'done' && q.result);
    const allResults: ConversionResult[] = [
      ...combinedResults,
      ...doneItems.map((item) => item.result!).filter(Boolean),
    ];
    if (allResults.length === 0) return;

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const usedNames = new Map<string, number>();

    for (const result of allResults) {
      const rawName = result.filename;
      const count = usedNames.get(rawName) ?? 0;
      usedNames.set(rawName, count + 1);

      let uniqueName = rawName;
      if (count > 0) {
        const dotIdx = rawName.lastIndexOf('.');
        uniqueName =
          dotIdx > 0
            ? `${rawName.slice(0, dotIdx)} (${count + 1})${rawName.slice(dotIdx)}`
            : `${rawName} (${count + 1})`;
      }
      zip.file(uniqueName, result.blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lokalconvert-${Date.now()}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleApplyPreset = (preset: ConversionPreset) => {
    if (preset.appliesTo === 'image' && preset.imageOptions) {
      setImageOptions((prev) => ({ ...prev, ...preset.imageOptions }));
    }
    if (preset.appliesTo === 'audio' && preset.audioOptions) {
      setAudioOptions((prev) => ({ ...prev, ...preset.audioOptions }));
    }
    if (preset.appliesTo === 'video' && preset.videoOptions) {
      setVideoOptions((prev) => ({ ...prev, ...preset.videoOptions }));
    }
    if (preset.appliesTo === 'pdf' && preset.pdfOptions) {
      setPdfOptions((prev) => ({ ...prev, ...preset.pdfOptions }));
    }
  };

  const handleSaveCustomPreset = (
    name: string,
    appliesTo: 'image' | 'audio' | 'video' | 'pdf',
  ) => {
    if (appliesTo === 'image') {
      const descParts = [
        imageOptions.format.toUpperCase(),
        imageOptions.rotationDeg > 0 ? `${imageOptions.rotationDeg}°` : null,
        imageOptions.cropRatio !== 'original' ? imageOptions.cropRatio : null,
        imageOptions.maxWidth ? `max ${imageOptions.maxWidth}px` : null,
        imageOptions.targetSizeBytes
          ? `<= ${formatBytes(imageOptions.targetSizeBytes)}`
          : `${imageOptions.quality}%`,
      ].filter(Boolean);
      setCustomPresets(
        saveCustomPreset({
          name,
          description: descParts.join(' • '),
          appliesTo: 'image',
          imageOptions: { ...imageOptions },
        }),
      );
    } else if (appliesTo === 'audio') {
      const descParts = [
        audioOptions.format.toUpperCase(),
        audioOptions.targetSizeBytes
          ? `<= ${formatBytes(audioOptions.targetSizeBytes)}`
          : `${audioOptions.audioBitrateKbps} kbps`,
      ].filter(Boolean);
      setCustomPresets(
        saveCustomPreset({
          name,
          description: descParts.join(' • '),
          appliesTo: 'audio',
          audioOptions: { ...audioOptions },
        }),
      );
    } else if (appliesTo === 'video') {
      const descParts = [
        videoOptions.format.toUpperCase(),
        videoOptions.targetSizeBytes ? `<= ${formatBytes(videoOptions.targetSizeBytes)}` : null,
      ].filter(Boolean);
      setCustomPresets(
        saveCustomPreset({
          name,
          description: descParts.join(' • '),
          appliesTo: 'video',
          videoOptions: { ...videoOptions },
        }),
      );
    } else {
      const descParts = [
        pdfOptions.operation,
        pdfOptions.targetSizeBytes ? `<= ${formatBytes(pdfOptions.targetSizeBytes)}` : null,
      ].filter(Boolean);
      setCustomPresets(
        saveCustomPreset({
          name,
          description: descParts.join(' • '),
          appliesTo: 'pdf',
          pdfOptions: { ...pdfOptions },
        }),
      );
    }
  };

  const handleDeleteCustomPreset = (id: string) => {
    setCustomPresets(deleteCustomPreset(id));
  };

  const hasImages = queue.some((item) => item.category === 'image');
  const firstAudioFile = queue.find((item) => item.category === 'audio')?.file;
  const firstVideoFile = queue.find((item) => item.category === 'video')?.file;
  const hasAudio = Boolean(firstAudioFile);
  const hasVideo = Boolean(firstVideoFile);
  const pdfCount = queue.filter((item) => item.category === 'pdf').length;
  const hasPdf = pdfCount > 0;
  const completedCount = queue.filter((item) => item.status === 'done' && item.result).length;
  const totalDownloadables = completedCount + combinedResults.length;
  const hasLargeMedia = queue.some(
    (item) =>
      (item.category === 'audio' || item.category === 'video') &&
      item.file.size > LARGE_MEDIA_THRESHOLD,
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (compareItem || mediaPreviewItem || privacyOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (queueRef.current.length > 0 && !isConverting) {
          e.preventDefault();
          runBatchConversion(!hasActionableTargets);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        if (!isConverting && totalDownloadables >= 2) {
          e.preventDefault();
          handleDownloadAllZip();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="studio-grid-bg flex min-h-screen flex-col text-[#141413] transition-colors dark:text-[#F3F2EE]">
      <Header
        totalLocalBytes={totalLocalBytes}
        canInstallPwa={Boolean(installPrompt)}
        onInstallPwa={handleInstallPwa}
        onOpenPrivacyModal={() => setPrivacyOpen(true)}
        onNavigateHome={() => navigateToRoute(null)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        {activeRoute && (
          <div className="tactile-card flex flex-wrap items-center justify-between gap-2 rounded-xl border-l-4 !border-l-[#FF5416] px-4 py-2.5 text-xs">
            <span>
              <strong className="font-bold text-[#FF5416]">
                {lang === 'id' ? activeRoute.labelId : activeRoute.labelEn}:
              </strong>{' '}
              <span className="text-[#141413] dark:text-[#F3F2EE]">
                {lang === 'id' ? activeRoute.acceptHintId : activeRoute.acceptHintEn}
              </span>
            </span>
            <button
              type="button"
              onClick={() => navigateToRoute(null)}
              className="tactile-key inline-flex items-center gap-1 rounded-lg bg-[var(--studio-well)] px-2.5 py-1 font-bold text-[#141413] dark:text-[#F3F2EE]"
            >
              <X className="h-3.5 w-3.5 text-[#FF5416]" />
              {t('allToolsHome')}
            </button>
          </div>
        )}

        {skippedFiles.length > 0 && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{t('unsupportedFilesSkipped', { files: skippedFiles.join(', ') })}</span>
            </div>
            <button
              type="button"
              onClick={() => setSkippedFiles([])}
              aria-label={t('close')}
              className="rounded-lg p-1 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {queue.length === 0 && (
          <section className="space-y-6">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-2xl font-extrabold tracking-tight text-[#141413] sm:text-4xl dark:text-[#F3F2EE]">
                {t('heroTitle')}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[var(--studio-muted)] sm:text-base">
                {t('heroSubtitle')}
              </p>
            </div>

            <DropZone onFilesAdded={handleFilesAdded} />

            {/* Bento Quick-Workflows Grid */}
            <div className="space-y-2.5">
              <p className="text-center font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--studio-muted)]">
                {t('quickToolsLabel')}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-3">
                {TOOL_ROUTES.map((route) => {
                  const isActive = activeRoute?.path === route.path;
                  const channelColor = route.pdfOptions
                    ? 'bg-amber-500'
                    : route.videoOptions?.format === 'mp3'
                      ? 'bg-blue-500'
                      : route.videoOptions
                        ? 'bg-cyan-500'
                        : 'bg-[#FF5416]';
                  const tagText =
                    route.imageOptions?.targetSizeBytes
                      ? `< ${formatBytes(route.imageOptions.targetSizeBytes)}`
                      : route.videoOptions?.targetSizeBytes
                        ? `< ${formatBytes(route.videoOptions.targetSizeBytes)}`
                        : route.pdfOptions?.targetSizeBytes
                          ? `< ${formatBytes(route.pdfOptions.targetSizeBytes)}`
                          : route.imageOptions?.format?.toUpperCase() ||
                            route.videoOptions?.format?.toUpperCase() ||
                            route.pdfOptions?.operation?.toUpperCase() ||
                            'TOOL';

                  return (
                    <button
                      key={route.path}
                      type="button"
                      onClick={() => navigateToRoute(route)}
                      className={`tactile-key flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left ${
                        isActive
                          ? '!border-[#d9410b] bg-[#FF5416] text-white'
                          : 'bg-[var(--studio-surface)] text-[#141413] dark:text-[#F3F2EE]'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-bold">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isActive ? 'bg-white' : channelColor
                          }`}
                        />
                        {lang === 'id' ? route.labelId : route.labelEn}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          isActive
                            ? 'bg-black/20 text-white'
                            : 'bg-[var(--studio-well)] text-[var(--studio-muted)]'
                        }`}
                      >
                        {tagText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Technical Spec Telemetry Strip */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="tactile-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('featurePrivacyTitle')}
                  </h2>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--studio-muted)]">
                  {t('featurePrivacyDesc')}
                </p>
              </div>
              <div className="tactile-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-[#FF5416]" />
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('featureTargetTitle')}
                  </h2>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--studio-muted)]">
                  {t('featureTargetDesc')}
                </p>
              </div>
              <div className="tactile-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#141413] dark:text-[#F3F2EE]">
                    {t('featureOfflineTitle')}
                  </h2>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--studio-muted)]">
                  {t('featureOfflineDesc')}
                </p>
              </div>
            </div>
          </section>
        )}

        {queue.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_430px] lg:items-start">
            {/* Left Panel: Queue Stage */}
            <div className="space-y-4">
              <DropZone compact onFilesAdded={handleFilesAdded} />

              <FileQueueList
                items={queue}
                combinedResults={combinedResults}
                staleItemIds={staleItemIds}
                imageOptions={imageOptions}
                isConverting={isConverting}
                hasLargeMedia={hasLargeMedia}
                onClearAll={handleClearAll}
                onRemoveItem={handleRemoveItem}
                onMoveItem={handleMoveItem}
                onReorderItems={handleReorderItems}
                onRotateItem={handleRotateItem}
                onRetryItem={handleRetryItem}
                onCompareItem={setCompareItem}
                onPreviewMediaItem={setMediaPreviewItem}
              />
            </div>

            {/* Right Panel: Sticky Control Deck + Pinned Action Dock */}
            <div className="space-y-4 lg:sticky lg:top-[72px]">
              <ConversionWorkspace
                preferManualTab={Boolean(activeRoute)}
                hasImages={hasImages}
                hasAudio={hasAudio}
                hasVideo={hasVideo}
                hasPdf={hasPdf}
                pdfCount={pdfCount}
                firstAudioFile={firstAudioFile}
                firstVideoFile={firstVideoFile}
                avifSupported={avifSupported}
                imageOptions={imageOptions}
                audioOptions={audioOptions}
                videoOptions={videoOptions}
                pdfOptions={pdfOptions}
                batchRenamePattern={batchRenamePattern}
                builtInPresets={builtInPresets}
                customPresets={customPresets}
                onChangeImageOptions={setImageOptions}
                onChangeAudioOptions={setAudioOptions}
                onChangeVideoOptions={setVideoOptions}
                onChangePdfOptions={setPdfOptions}
                onChangeBatchRenamePattern={setBatchRenamePattern}
                onApplyPreset={handleApplyPreset}
                onSaveCustomPreset={handleSaveCustomPreset}
                onDeleteCustomPreset={handleDeleteCustomPreset}
              />

              {/* Sticky Tactile Action Dock */}
              <div className="tactile-card sticky bottom-3 z-20 rounded-2xl p-3.5 shadow-xl lg:static lg:shadow-none">
                <div className="flex flex-col gap-2">
                  {isConverting ? (
                    <button
                      type="button"
                      onClick={handleCancelConversion}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-700 bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-rose-500"
                    >
                      <Square className="h-4 w-4 fill-current" />
                      {t('cancelConversion')}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleConvertAll}
                        disabled={queue.length === 0}
                        className="tactile-trigger flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-extrabold"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Play className="h-4 w-4 fill-current" />
                          {hasActionableTargets ? t('convertAll') : t('reconvertAll')}
                        </span>
                        <kbd className="hidden rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white sm:inline-block">
                          Ctrl+↵
                        </kbd>
                      </button>

                      {hasActionableTargets && (completedCount > 0 || combinedResults.length > 0) && (
                        <button
                          type="button"
                          onClick={handleReconvertAll}
                          className="tactile-key inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--studio-well)] px-3 py-2 text-xs font-bold text-[#141413] dark:text-[#F3F2EE]"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-[#FF5416]" />
                          {t('reconvertAll')}
                        </button>
                      )}
                    </>
                  )}

                  {totalDownloadables >= 2 && (
                    <button
                      type="button"
                      onClick={handleDownloadAllZip}
                      className="tactile-key flex w-full items-center justify-between rounded-xl border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        {t('downloadAllZip')}
                      </span>
                      <kbd className="hidden rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold sm:inline-block">
                        Ctrl+⇧+D
                      </kbd>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--studio-border)] py-4 text-center font-mono text-[11px] text-[var(--studio-muted)]">
        {t('footerNote')}
      </footer>

      <BeforeAfterModal item={compareItem} onClose={() => setCompareItem(null)} />
      <MediaPreviewModal item={mediaPreviewItem} onClose={() => setMediaPreviewItem(null)} />
      <PrivacyNoticeModal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        onResetStats={() => {
          countedStatKeysRef.current.clear();
          setTotalLocalBytes(resetLocalProcessedBytes());
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ConverterApp />
      </I18nProvider>
    </ThemeProvider>
  );
}
