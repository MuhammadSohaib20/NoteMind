/**
 * Scanned-PDF OCR.
 *
 * pdf-parse can only read the text layer of a PDF. Scanned documents (photos
 * of lecture slides exported to PDF, CamScanner exports, ...) contain no text
 * layer at all, so the extractor used to fall back to a useless placeholder
 * string and the AI could never answer from those notes.
 *
 * This service closes that gap without Python (this project is pure
 * Node/TypeScript end to end):
 *
 *   1. `pdf-to-img` (pdfjs-dist + @napi-rs/canvas, both pure JS/prebuilt)
 *      rasterises each PDF page into an in-memory PNG.
 *   2. `tesseract.js` (WebAssembly build of Tesseract OCR, already a project
 *      dependency used for uploaded images) recognises the text of every page.
 *
 * Note on "PaddleOCR": PaddleOCR itself ships only as a Python package. The
 * closest zero-Python equivalent for a Node backend is this tesseract.js
 * pipeline — same capability (page-level OCR of scanned documents), same
 * languages, no runtime except Node.
 *
 * Safety rails:
 * - `PDF_OCR_MAX_PAGES` caps how many pages are recognised per document so a
 *   huge scan cannot monopolise memory/CPU or blow past request timeouts.
 * - The tesseract worker is created lazily and reused across pages/requests.
 *   Language data is loaded from the local `eng.traineddata` file when
 *   present (fully offline), falling back to the CDN download otherwise.
 * - Every failure mode resolves to an empty string; callers keep their
 *   existing placeholder behaviour and nothing ever throws out of here.
 */

import fs from 'fs';
import path from 'path';
import type { Worker } from 'tesseract.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { aiConfig } from '../config/ai';

/** Resolution multiplier for page rasterisation. 2 ≈ 144 DPI, good for OCR. */
const OCR_SCALE = 2;

/** Largest edge kept when recognising photos; big scans are downscaled first. */
const MAX_IMAGE_DIMENSION = 2200;

let sharedWorker: Worker | null = null;
let sharedWorkerPromise: Promise<Worker> | null = null;

async function buildWorker(): Promise<Worker> {
  const { createWorker } = require('tesseract.js') as typeof import('tesseract.js');

  // Prefer the local eng.traineddata so OCR works offline and never depends
  // on a CDN round trip. Fall back to the default download on any problem.
  const projectRoot = path.resolve(__dirname, '..', '..');
  const localTrainedData = path.join(projectRoot, 'eng.traineddata');
  if (fs.existsSync(localTrainedData)) {
    try {
      // workerPath/corePath intentionally left at their Node defaults — the
      // package's Node worker script and local wasm core are used; only the
      // language data source is redirected to the local file.
      const worker = await createWorker('eng', 1, {
        langPath: projectRoot,
        gzip: false,
        cacheMethod: 'none',
      });
      return worker;
    } catch (err) {
      console.warn(
        '[ocr] local eng.traineddata unusable, falling back to CDN:',
        (err as Error).message
      );
    }
  }
  return createWorker('eng');
}

async function getWorker(): Promise<Worker> {
  if (sharedWorker) return sharedWorker;
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = buildWorker()
      .then((worker) => {
        sharedWorker = worker;
        return worker;
      })
      .catch((err) => {
        sharedWorkerPromise = null; // allow retry on the next request
        throw err;
      });
  }
  return sharedWorkerPromise;
}

/** Reset the cached worker (used by tests). */
export async function disposeOcrWorker(): Promise<void> {
  const worker = sharedWorker;
  sharedWorker = null;
  sharedWorkerPromise = null;
  if (worker) {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}

/**
 * OCR a single uploaded image (scanned page photo, screenshot, ...). Uses the
 * same shared, local-first tesseract worker as the scanned-PDF path, so image
 * uploads are recognised offline from ./eng.traineddata too. Very large
 * images are downscaled first so a phone-resolution scan cannot stall the
 * upload request.
 *
 * @returns the recognised text, or an empty string on any failure.
 */
export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) return '';

  let worker: Worker;
  try {
    worker = await getWorker();
  } catch (err) {
    console.error('[ocr] tesseract worker failed to start:', (err as Error).message);
    return '';
  }

  try {
    const image = await maybeDownscale(buffer);
    const result = await worker.recognize(image);
    const text = (result.data && result.data.text ? result.data.text : '').trim();
    return text.replace(/\s+/g, '').length > 0 ? text : '';
  } catch (err) {
    console.error('[ocr] image recognition failed:', (err as Error).message);
    return '';
  }
}

/** Downscale images whose longest edge exceeds MAX_IMAGE_DIMENSION. */
async function maybeDownscale(buffer: Buffer): Promise<Buffer> {
  try {
    const image = await loadImage(buffer);
    const maxEdge = Math.max(image.width, image.height);
    if (maxEdge <= MAX_IMAGE_DIMENSION) return buffer;
    const scale = MAX_IMAGE_DIMENSION / maxEdge;
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toBuffer('image/png');
  } catch {
    return buffer; // recognition may still succeed on the original
  }
}

/**
 * Render every page of a scanned PDF to a PNG and OCR it.
 *
 * @returns the recognised text (page blocks separated by blank lines), or an
 * empty string when the PDF cannot be rendered/recognised.
 */
export async function ocrScannedPdfBuffer(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) return '';

  let pdfToImg: any;
  try {
    // pdf-to-img is an ESM-only package; Node >= 22.12 supports require() of
    // ESM modules whose graph contains no top-level await (Node 24 is the
    // runtime for this project). Lazy require keeps a failure here from
    // breaking module loading of the server.
    pdfToImg = require('pdf-to-img');
  } catch (err) {
    console.warn('[ocr] pdf-to-img unavailable, scanned PDFs cannot be OCR\'d:', (err as Error).message);
    return '';
  }

  const maxPages = Math.max(1, aiConfig.pdfOcrMaxPages);
  const pageImages: Buffer[] = [];

  try {
    const doc = await pdfToImg.pdf(buffer, { scale: OCR_SCALE, format: 'png' });
    try {
      for await (const page of doc) {
        if (pageImages.length >= maxPages) break;
        pageImages.push(Buffer.from(page));
      }
    } finally {
      try {
        await doc.destroy();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.error('[ocr] PDF page rendering failed:', (err as Error).message);
    return '';
  }

  if (pageImages.length === 0) return '';

  let worker: Worker;
  try {
    worker = await getWorker();
  } catch (err) {
    console.error('[ocr] tesseract worker failed to start:', (err as Error).message);
    return '';
  }

  const parts: string[] = [];
  for (const [index, image] of pageImages.entries()) {
    try {
      const result = await worker.recognize(image);
      const text = (result.data && result.data.text ? result.data.text : '').trim();
      if (text.replace(/\s+/g, '').length > 0) {
        parts.push(text);
      }
    } catch (err) {
      console.error(`[ocr] page ${index + 1} recognition failed:`, (err as Error).message);
    }
  }

  return parts.join('\n\n').trim();
}
