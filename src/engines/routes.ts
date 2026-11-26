import { Language } from '../i18n/translations';
import {
  AudioConversionOptions,
  ImageConversionOptions,
  PdfConversionOptions,
  VideoConversionOptions,
} from './types';

export interface ToolRoute {
  path: string;
  labelId: string;
  labelEn: string;
  titleId: string;
  titleEn: string;
  acceptHintId: string;
  acceptHintEn: string;
  imageOptions?: Partial<ImageConversionOptions>;
  audioOptions?: Partial<AudioConversionOptions>;
  videoOptions?: Partial<VideoConversionOptions>;
  pdfOptions?: Partial<PdfConversionOptions>;
}

export const TOOL_ROUTES: ToolRoute[] = [
  {
    path: '/jpg-to-webp',
    labelId: 'JPG → WebP',
    labelEn: 'JPG → WebP',
    titleId: 'Konversi JPG/PNG ke WebP Lokal | LokalConvert',
    titleEn: 'Convert JPG/PNG to WebP Locally | LokalConvert',
    acceptHintId: 'Mode WebP aktif: optimalkan foto untuk website tanpa upload.',
    acceptHintEn: 'WebP mode active: optimize photos for web without uploads.',
    imageOptions: { format: 'webp', quality: 82, maxWidth: 1600, targetSizeBytes: null },
  },
  {
    path: '/kompres-foto-500kb',
    labelId: 'Kompres < 500 KB',
    labelEn: 'Compress < 500 KB',
    titleId: 'Kompres Foto Di Bawah 500 KB | LokalConvert',
    titleEn: 'Compress Photos Under 500 KB | LokalConvert',
    acceptHintId: 'Mode Loker/Portal aktif: otomatis cari kualitas terbaik di bawah 500 KB.',
    acceptHintEn: 'Portal Upload mode active: automatically keeps images under 500 KB.',
    imageOptions: { format: 'jpg', quality: 85, maxWidth: 1800, targetSizeBytes: 500 * 1024 },
  },
  {
    path: '/heic-to-jpg',
    labelId: 'HEIC → JPG',
    labelEn: 'HEIC → JPG',
    titleId: 'Konversi Foto iPhone HEIC ke JPG | LokalConvert',
    titleEn: 'Convert iPhone HEIC Photos to JPG | LokalConvert',
    acceptHintId: 'Mode HEIC aktif: ubah foto .heic/.heif iPhone ke JPG/WebP di browser.',
    acceptHintEn: 'HEIC mode active: convert iPhone .heic/.heif photos to JPG/WebP locally.',
    imageOptions: { format: 'jpg', quality: 88, targetSizeBytes: null },
  },
  {
    path: '/mp4-to-mp3',
    labelId: 'MP4 → MP3',
    labelEn: 'MP4 → MP3',
    titleId: 'Ekstrak Audio MP3 dari Video MP4 | LokalConvert',
    titleEn: 'Extract MP3 Audio from MP4 Video | LokalConvert',
    acceptHintId: 'Mode Ekstrak MP3 aktif: ambil audio 192 kbps dari video tanpa upload.',
    acceptHintEn: 'MP3 Extractor mode active: pull 192 kbps audio locally.',
    audioOptions: { format: 'mp3', audioBitrateKbps: 192, targetSizeBytes: null },
    videoOptions: { format: 'mp3', audioBitrateKbps: 192, targetSizeBytes: null },
  },
  {
    path: '/video-whatsapp',
    labelId: 'Video WA < 15 MB',
    labelEn: 'WA Video < 15 MB',
    titleId: 'Kompres Video Di Bawah 15 MB | LokalConvert',
    titleEn: 'Compress Video Under 15 MB | LokalConvert',
    acceptHintId: 'Mode Video WhatsApp aktif: atur bitrate otomatis di bawah 15 MB.',
    acceptHintEn: 'WhatsApp Video mode active: auto-tunes bitrate under 15 MB.',
    videoOptions: {
      format: 'mp4',
      resolution: '720p',
      audioBitrateKbps: 128,
      targetSizeBytes: 15 * 1024 * 1024,
    },
  },
  {
    path: '/video-to-gif',
    labelId: 'Video → GIF',
    labelEn: 'Video → GIF',
    titleId: 'Ubah Video ke GIF Animasi | LokalConvert',
    titleEn: 'Convert Video to Animated GIF | LokalConvert',
    acceptHintId: 'Mode GIF aktif: buat GIF tajam dengan kontrol FPS & target ukuran.',
    acceptHintEn: 'GIF mode active: create crisp animated GIFs with target size control.',
    videoOptions: { format: 'gif', gifFps: 12, gifWidth: 480, targetSizeBytes: 3 * 1024 * 1024 },
  },
  {
    path: '/image-to-pdf',
    labelId: 'Gambar → PDF',
    labelEn: 'Image → PDF',
    titleId: 'Gabung Gambar ke PDF Lokal | LokalConvert',
    titleEn: 'Convert Images to PDF Locally | LokalConvert',
    acceptHintId: 'Mode Gambar ke PDF aktif: gabungkan foto/scan jadi satu dokumen PDF.',
    acceptHintEn: 'Image to PDF mode active: combine photos/scans into a single PDF.',
    imageOptions: { format: 'pdf', quality: 85, maxWidth: 1800, combineIntoSinglePdf: true },
  },
  {
    path: '/kompres-pdf',
    labelId: 'Kompres PDF',
    labelEn: 'Compress PDF',
    titleId: 'Kompres PDF Di Browser | LokalConvert',
    titleEn: 'Compress PDF Locally | LokalConvert',
    acceptHintId: 'Mode Kompres PDF aktif: perkecil ukuran PDF di bawah batas MB/KB.',
    acceptHintEn: 'PDF Compression mode active: shrink PDF files under your target size.',
    pdfOptions: { operation: 'compress', targetSizeBytes: 1024 * 1024 },
  },
  {
    path: '/merge-pdf',
    labelId: 'Gabung PDF',
    labelEn: 'Merge PDF',
    titleId: 'Gabung Beberapa File PDF | LokalConvert',
    titleEn: 'Merge Multiple PDF Files | LokalConvert',
    acceptHintId: 'Mode Gabung PDF aktif: masukkan 2+ file PDF untuk digabungkan.',
    acceptHintEn: 'Merge PDF mode active: drop 2+ PDF files to combine them.',
    pdfOptions: { operation: 'merge', targetSizeBytes: null },
  },
];

export function matchToolRoute(pathname: string): ToolRoute | null {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return TOOL_ROUTES.find((r) => r.path === clean) ?? null;
}

export function getRouteDocumentTitle(route: ToolRoute | null, lang: Language): string {
  if (!route) {
    return lang === 'id'
      ? 'LokalConvert — Converter File Privat di Browser'
      : 'LokalConvert — Private In-Browser File Converter';
  }
  return lang === 'id' ? route.titleId : route.titleEn;
}
