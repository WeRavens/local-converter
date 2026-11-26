# LokalConvert

**100% client-side, privacy-first file converter PWA** — convert and compress images, HEIC, AVIF, SVG, PDF, audio, and video directly inside your browser with zero server uploads.

## Key Features

- **Images, HEIC, AVIF & SVG**:
  - Convert to **WebP**, **JPG**, **PNG**, **AVIF** (native Canvas or local `@jsquash/avif` WebAssembly fallback), or **PDF**.
  - Automatic EXIF/GPS metadata stripping via Canvas/OffscreenCanvas Web Worker.
  - Per-image quick rotation (`↻ 90°`), global rotation, aspect-ratio crop (`1:1`, `4:5`, `16:9`, `3:4`) with focus anchor, max-width resize, and binary-search **Target File Size** optimization.
  - Live Before/After comparison modal (slider & side-by-side).
- **PDF Toolkit (`pdf-lib` & `pdfjs-dist`)**:
  - Lossless + rasterized target-size compression preserving original page dimensions.
  - Drag-and-drop card reordering for **Merge PDFs** and **Images → Single PDF**.
  - Extract page ranges (`1-3, 5`) or export pages to JPG/PNG/WebP (bundled as `.zip` for multi-page documents).
- **Audio & Video (`@ffmpeg/ffmpeg` WebAssembly)**:
  - Convert **MP4**, **WebM**, **GIF**, **MP3**, **M4A**, **WAV**, and **OGG**, or extract audio from video.
  - Interactive **Timeline Range Slider & Mini Player** for trimming audio/video clips.
  - Automatic bitrate & resolution tuning to fit target MB/KB budgets.
- **Tactile Precision Studio UI & Offline PWA**:
  - 2-panel Split-Studio workspace (`01 // Queue Stage` + sticky `02 // Control Deck` & Action Dock), List/Grid toggle, Light/Dark themes (`prefers-color-scheme`), and bilingual **ID / EN** support.
  - One-click **Download Full Offline Engines** pre-cache inside *Privacy & How It Works*.
  - Keyboard shortcuts: `Ctrl+V` (paste clipboard image), `Ctrl+Enter` (convert/re-convert), `Ctrl+Shift+D` (download all as `.zip`).

## Tech Stack

- React 19, TypeScript, Vite 8, Tailwind CSS v4
- `vite-plugin-pwa` (Workbox service worker with runtime caching for heavy WASM engines)
- `@jsquash/avif`, `heic2any`, `pdf-lib`, `pdfjs-dist`, `@ffmpeg/ffmpeg`, `jszip`
- Vitest & Testing Library

## Local Development

```bash
# Install dependencies (automatically syncs local FFmpeg, PDF.js, and AVIF WASM assets)
npm install

# Start dev server
npm run dev

# Build for production (automatically runs prebuild asset sync + tsc -b + vite build)
npm run build

# Run test suite
npx vitest run
```
