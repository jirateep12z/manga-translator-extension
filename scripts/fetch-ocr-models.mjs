// Build step: downloads, verifies, and unpacks the OCR models listed in
// scripts/ocr-models.json into public/ocr-models/ (spec 0002 §5.3).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DownloadArchive } from './lib/download-archive.mjs';
import { FetchOcrModel } from './lib/fetch-ocr-model.mjs';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(import.meta.dirname, 'ocr-models.json');
const MODELS_DIR = path.join(ROOT_DIR, 'public', 'ocr-models');
const DOWNLOAD_TIMEOUT_MS = 120_000;
const LOG_PREFIX = '[fetch-ocr-models]';
const RESULT_MESSAGES = {
  skipped: 'up to date',
  downloaded: 'downloaded and verified'
};

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const results = await Promise.allSettled(
  manifest.models.map(model =>
    FetchOcrModel(model, {
      models_dir: MODELS_DIR,
      DownloadModel: url =>
        DownloadArchive({ url, timeout_ms: DOWNLOAD_TIMEOUT_MS })
    })
  )
);

for (const [model_index, result] of results.entries()) {
  if (result.status === 'fulfilled') {
    console.log(
      `${LOG_PREFIX} ${manifest.models[model_index].name}: ${RESULT_MESSAGES[result.value]}`
    );
  } else {
    const reason =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

    console.error(`${LOG_PREFIX} ${reason}`);
  }
}

if (results.some(result => result.status === 'rejected')) process.exitCode = 1;
