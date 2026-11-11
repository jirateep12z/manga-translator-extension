// ONNX Runtime's public class name; the background bundle must not contain it
// (spec 0002 §5.3).
const ONNX_RUNTIME_MARKER = 'InferenceSession';
// The symbol name that both React and its JSX runtime register; the service
// worker must not bundle React, which only the UI entry points ('ui.ts') pull
// in.
const REACT_MARKER = 'react.fragment';
// A font URL in the content script, such as /assets/itim-thai-400-normal.woff2.
const FONT_URL_PATTERN =
  /\/assets\/([A-Za-z0-9._-]+\.woff2?)(?![A-Za-z0-9._-])/g;
const ITIM_FILE_PREFIX = 'itim-';

// The font file names that the content script references, each once, in the
// order of their first appearance.
function ListReferencedFontFileNames(content_source) {
  return [
    ...new Set(
      Array.from(content_source.matchAll(FONT_URL_PATTERN), match => match[1])
    )
  ];
}

export function FindExtensionBuildProblems({
  has_ort_wasm,
  has_offscreen_page,
  background_source,
  content_source,
  asset_file_names
}) {
  const problems = [];

  if (!has_ort_wasm) {
    problems.push('dist/assets/ort-wasm-simd-threaded.jsep.wasm is missing.');
  }

  if (!has_offscreen_page) {
    problems.push('dist/offscreen.html is missing.');
  }

  if (background_source.includes(ONNX_RUNTIME_MARKER)) {
    problems.push(
      'dist/background.js contains ONNX Runtime (InferenceSession).'
    );
  }

  if (background_source.includes(REACT_MARKER)) {
    problems.push(
      "dist/background.js contains React; import UI code from a feature's 'ui' entry, not its 'index'."
    );
  }

  // The content script's fonts (spec 0003 §5.3).
  const font_file_names = ListReferencedFontFileNames(content_source);
  const present_asset_file_names = new Set(asset_file_names);

  for (const font_file_name of font_file_names) {
    if (!present_asset_file_names.has(font_file_name)) {
      problems.push(
        `dist/assets/${font_file_name} is missing; dist/content.js references it.`
      );
    }
  }

  if (
    !font_file_names.some(font_file_name =>
      font_file_name.startsWith(ITIM_FILE_PREFIX)
    )
  ) {
    problems.push(
      'dist/content.js references no Itim font file (assets/itim-*).'
    );
  }

  return problems;
}
