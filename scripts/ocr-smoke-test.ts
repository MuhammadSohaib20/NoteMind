/**
 * OCR smoke test for scanned PDFs.
 *
 * Builds a PDF that looks exactly like a scanned lecture note — every page is
 * a single JPEG image with NO text layer (this is what pdf-parse chokes on,
 * and why the AI previously answered "[Uploaded Scanned PDF Document...]"
 * instead of the real content), then pushes it through the same service the
 * upload/index flow uses:
 *
 *   1. pdf-parse must return nothing (proves the "scanned" branch triggers)
 *   2. ocrScannedPdfBuffer must return the recognised text
 *
 * Run with:  npm run test:ocr
 */

import { ocrScannedPdfBuffer } from '../src/services/pdfOcr';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

function buildImagePdf(jpeg: Buffer, width: number, height: number): Buffer {
  const chunks: Buffer[] = [];
  let len = 0;
  const write = (data: Buffer | string) => {
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    chunks.push(b);
    len += b.length;
  };
  const offsets: number[] = [];

  write('%PDF-1.4\n');

  const writeObj = (num: number, body: string) => {
    offsets[num] = len;
    write(`${num} 0 obj\n${body}\nendobj\n`);
  };

  writeObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  writeObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  writeObj(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 220] ' +
      '/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>'
  );
  const content = 'q 500 0 0 220 0 0 cm /Im1 Do Q';
  writeObj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  offsets[5] = len;
  write(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ' +
      `/Length ${jpeg.length} >>\nstream\n`
  );
  write(jpeg);
  write('\nendstream\nendobj\n');

  const xrefPos = len;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  write(xref);

  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  // Draw the "scanned page" (a photo of lecture notes, effectively).
  const { createCanvas } = require('@napi-rs/canvas');
  const width = 1000;
  const height = 440;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('PDC Phase 2 Gate Review', 40, 120);
  ctx.font = '36px sans-serif';
  ctx.fillText('Entry criteria: requirements signed off', 40, 210);
  ctx.fillText('Exit criteria: test plan approved', 40, 280);
  ctx.fillText('Decision: GO / NO-GO by steering committee', 40, 350);
  const jpeg: Buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });

  const scannedPdf = buildImagePdf(jpeg, width, height);
  console.log(`[1] built scanned-style PDF: ${scannedPdf.length} bytes`);

  // Step 1: pdf-parse must find no text (this is the user's failing case).
  let textLayer = '';
  try {
    const parsed = await pdfParse(scannedPdf);
    textLayer = (parsed && parsed.text ? parsed.text : '').trim();
  } catch {
    textLayer = '';
  }
  console.log(`[2] pdf-parse text layer: ${JSON.stringify(textLayer.slice(0, 80))}`);
  if (textLayer.replace(/\s+/g, '').length > 0) {
    console.error('UNEXPECTED: pdf-parse found text, this PDF is not scanned-like.');
    process.exit(1);
  }
  console.log('    ✓ no text layer → upload flow will take the OCR branch');

  // Step 2: run the real OCR service.
  const started = Date.now();
  const ocrText = await ocrScannedPdfBuffer(scannedPdf);
  const elapsed = Date.now() - started;
  console.log(`[3] ocrScannedPdfBuffer returned in ${elapsed}ms:`);
  console.log(JSON.stringify(ocrText));

  const okWords = ['PDC', 'Phase', 'Entry', 'criteria', 'Exit', 'GO'];
  const found = okWords.filter((w) => ocrText.toLowerCase().includes(w.toLowerCase()));
  console.log(`[4] matched ${found.length}/${okWords.length} probe words: ${found.join(', ')}`);

  if (found.length >= 4) {
    console.log('OCR SMOKE TEST PASSED');
    process.exit(0);
  }
  console.log('OCR SMOKE TEST FAILED (too few words recognised)');
  process.exit(1);
}

main().catch((err) => {
  console.error('OCR SMOKE TEST ERROR:', err);
  process.exit(1);
});
