// Build step: checks that dist/ holds what the OCR reader needs (spec 0002 §5.3) and the content script's fonts (spec 0003 §5.3).
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { FindExtensionBuildProblems } from './lib/check-extension-build.mjs';

const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist');
const LOG_PREFIX = '[check-extension-build]';

async function IsPresent(file_path) {
  try {
    await access(file_path);

    return true;
  } catch {
    return false;
  }
}

// The names in the folder, or none when it cannot be read, so that a missing
// folder is reported as missing files.
async function ListFileNames(directory_path) {
  try {
    return await readdir(directory_path);
  } catch {
    return [];
  }
}

const problems = FindExtensionBuildProblems({
  has_ort_wasm: await IsPresent(
    path.join(DIST_DIR, 'assets', 'ort-wasm-simd-threaded.jsep.wasm')
  ),
  has_offscreen_page: await IsPresent(path.join(DIST_DIR, 'offscreen.html')),
  background_source: await readFile(
    path.join(DIST_DIR, 'background.js'),
    'utf8'
  ),
  content_source: await readFile(path.join(DIST_DIR, 'content.js'), 'utf8'),
  asset_file_names: await ListFileNames(path.join(DIST_DIR, 'assets'))
});

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`${LOG_PREFIX} ${problem}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    `${LOG_PREFIX} OCR files and content-script fonts present; background.js has no ONNX Runtime or React.`
  );
}
