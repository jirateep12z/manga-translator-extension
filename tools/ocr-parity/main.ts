// Development-only parity harness (spec 0002 §15.2): reads every fixture tile
// with the on-device engine and matches its lines against the SDK reference.
import type {
  OcrBackend,
  OcrEngine,
  OcrReadPageResult
} from '@/features/ocr-engine';
import { CreateOcrEngine } from '@/features/ocr-engine';
import type { OcrRegionAssembly } from '@/features/ocr-reader';
import { AssembleOcrRegions, FilterOcrLines } from '@/features/ocr-reader';
import ort_wasm_url from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { DrawTileOverlay } from './lib/draw-tile';
import {
  IsRecognizerChecked,
  SelectCountedReferenceLines
} from './lib/gate-measure';
import type { ReferenceLineMatch } from './lib/match-reference-lines';
import {
  MatchReferenceLine,
  NormalizeTextForGate,
  ToAxisAlignedBox
} from './lib/match-reference-lines';
import type {
  ParityGroup,
  ReferenceLine,
  ReferencePage,
  ReferenceRun,
  ReferenceTile
} from './lib/parity-groups';
import {
  MIN_REFERENCE_SCORE,
  ORT_WASM_ASSET_PATH,
  PARITY_GROUPS
} from './lib/parity-groups';
import type {
  MeasureSummary,
  ParityGroupSummary,
  TileResult
} from './lib/parity-summary';
import {
  ReadBackendPreference,
  SummarizeParityGroup
} from './lib/parity-summary';

type FailedLine = {
  tile_id: string;
  reference_text: string;
  engine_text: string | null;
  cer: number | null;
};
type TileRun = {
  tile_result: TileResult;
  gate_matches: ReferenceLineMatch[];
  raw_matches: ReferenceLineMatch[];
  failed_lines: FailedLine[];
};
type GroupRun = { summary: ParityGroupSummary; failed_lines: FailedLine[] };
type ParitySummary = {
  backend: OcrBackend;
  is_passed: boolean;
  groups: ParityGroupSummary[];
};

const FIXTURE_PAGES_PATH = '/fixtures/pages';
// Figures are drawn at most this wide, which bounds the canvas memory of a run.
const MAX_FIGURE_WIDTH_PX = 800;
const NO_OVERLAPPING_LINE_TEXT = '(no overlapping line)';
const NOT_AVAILABLE_TEXT = 'n/a';
const SUMMARY_COLUMNS = [
  'Language',
  'Gate matched / total',
  'Gate rate',
  'Gate wrong recognizer tiles',
  'Raw matched / total',
  'Raw rate',
  'Raw wrong recognizer tiles',
  'Median ms per tile'
];
const FAILURE_COLUMNS = ['Tile', 'SDK text', 'Engine text', 'CER'];

function ReadElement(element_id: string): HTMLElement {
  const element = document.getElementById(element_id);

  if (element === null) throw new Error(`Missing element: #${element_id}`);

  return element;
}

function ReadTable(element_id: string): HTMLTableElement {
  const element = ReadElement(element_id);

  if (!(element instanceof HTMLTableElement)) {
    throw new Error(`#${element_id} is not a table.`);
  }

  return element;
}

function SetStatus(message: string): void {
  ReadElement('parity-status').textContent = message;
}

async function FetchResponse(url: string): Promise<Response> {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

  return response;
}

function ResolveAssetUrl(asset_path: string): string {
  return asset_path === ORT_WASM_ASSET_PATH ? ort_wasm_url : `/${asset_path}`;
}

function CreateTileId(page: ReferencePage, tile: ReferenceTile): string {
  return `${page.set_name}/page-${page.page_number}/tile-${tile.tile_index}`;
}

function FormatCer(cer: number | null): string {
  return cer === null ? NOT_AVAILABLE_TEXT : cer.toFixed(3);
}

function RenderTable(
  table: HTMLTableElement,
  caption_text: string,
  column_names: readonly string[],
  rows: readonly (readonly string[])[]
): void {
  table.replaceChildren();
  table.createCaption().textContent = caption_text;

  const header_row = table.createTHead().insertRow();

  for (const column_name of column_names) {
    const header_cell = document.createElement('th');

    header_cell.scope = 'col';
    header_cell.textContent = column_name;
    header_row.append(header_cell);
  }

  const table_body = table.createTBody();

  for (const row_values of rows) {
    const row = table_body.insertRow();

    for (const cell_value of row_values) {
      row.insertCell().textContent = cell_value;
    }
  }
}

async function AppendTileFigure(
  blob: Blob,
  result: OcrReadPageResult,
  assembly: OcrRegionAssembly,
  failed_reference_lines: readonly ReferenceLine[],
  caption_text: string
): Promise<void> {
  const image = await createImageBitmap(blob);

  try {
    const scale = Math.min(1, MAX_FIGURE_WIDTH_PX / image.width);
    const canvas = document.createElement('canvas');

    // Resizing a canvas resets its context, so the size comes first.
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', caption_text);

    const context = canvas.getContext('2d');

    if (context === null) {
      throw new Error('The 2D canvas context is not available.');
    }

    context.scale(scale, scale);
    DrawTileOverlay(context, {
      image,
      line_boxes: result.lines.map(line => line.bbox_px),
      region_boxes: assembly.regions.map(({ region_id, bbox_px }) => ({
        region_id,
        bbox_px
      })),
      failed_reference_boxes: failed_reference_lines.map(line =>
        ToAxisAlignedBox(line.poly)
      )
    });

    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');

    caption.textContent = caption_text;
    figure.append(canvas, caption);
    ReadElement('parity-tiles').append(figure);
  } finally {
    image.close();
  }
}

async function RunTile(
  engine: OcrEngine,
  group: ParityGroup,
  page: ReferencePage,
  tile: ReferenceTile
): Promise<TileRun> {
  const tile_id = CreateTileId(page, tile);
  const response = await FetchResponse(
    `${FIXTURE_PAGES_PATH}/${page.set_name}/${tile.tile_file}`
  );
  const blob = await response.blob();
  const result = await engine.ReadPage(blob);
  const assembly = AssembleOcrRegions({
    lines: result.lines,
    reading_direction: 'auto',
    recognizer: result.recognizer
  });
  // Spec 0002 §15.2, as amended: the gate measure counts only what reaches
  // translation, and the raw measure keeps the first run's rule.
  const counted_lines = SelectCountedReferenceLines(tile.lines);
  const kept_engine_lines = FilterOcrLines(result.lines);
  const raw_matches = tile.lines
    .filter(line => line.score >= MIN_REFERENCE_SCORE)
    .map(line => MatchReferenceLine(line, result.lines));
  const gate_matches = counted_lines.map(line => ({
    line,
    match: MatchReferenceLine(line, kept_engine_lines, NormalizeTextForGate)
  }));
  const failed_matches = gate_matches.filter(
    gate_match => !gate_match.match.is_passed
  );
  const { decode, detection, recognition } = result.duration_ms;

  await AppendTileFigure(
    blob,
    result,
    assembly,
    failed_matches.map(failed_match => failed_match.line),
    `${tile_id} · ${result.recognizer} · ${result.lines.length} lines, ` +
      `${assembly.kept_line_count} kept, ${assembly.regions.length} regions · ` +
      `${failed_matches.length} failed`
  );

  return {
    tile_result: {
      tile_id,
      recognizer: result.recognizer,
      ms_per_tile: decode + detection + recognition,
      is_recognizer_checked: IsRecognizerChecked(
        group.expected_recognizer,
        counted_lines
      )
    },
    gate_matches: gate_matches.map(gate_match => gate_match.match),
    raw_matches,
    failed_lines: failed_matches.map(({ line, match }) => ({
      tile_id,
      reference_text: line.text,
      engine_text: match.best_engine_text,
      cer: match.best_cer
    }))
  };
}

async function RunGroup(
  engine: OcrEngine,
  group: ParityGroup
): Promise<GroupRun> {
  const response = await FetchResponse(group.reference_path);
  const reference_run = (await response.json()) as ReferenceRun;
  const page_tiles = reference_run.pages.flatMap(page =>
    page.tiles.map(tile => ({ page, tile }))
  );
  const tile_results: TileResult[] = [];
  const gate_matches: ReferenceLineMatch[] = [];
  const raw_matches: ReferenceLineMatch[] = [];
  const failed_lines: FailedLine[] = [];

  for (const [tile_position, { page, tile }] of page_tiles.entries()) {
    SetStatus(
      `Reading ${group.language}: tile ${tile_position + 1} of ${page_tiles.length}`
    );

    const tile_run = await RunTile(engine, group, page, tile);

    tile_results.push(tile_run.tile_result);
    gate_matches.push(...tile_run.gate_matches);
    raw_matches.push(...tile_run.raw_matches);
    failed_lines.push(...tile_run.failed_lines);
  }

  return {
    summary: SummarizeParityGroup({
      language: group.language,
      expected_recognizer: group.expected_recognizer,
      gate_matches,
      raw_matches,
      tile_results
    }),
    failed_lines
  };
}

function FormatMeasure(measure: MeasureSummary): string[] {
  return [
    `${measure.passed_line_count} / ${measure.reference_line_count}`,
    `${(measure.match_rate * 100).toFixed(1)}%`,
    measure.wrong_recognizer_tiles.join(', ') || 'none'
  ];
}

function RenderSummary(summary: ParitySummary): void {
  RenderTable(
    ReadTable('parity-groups'),
    `Backend: ${summary.backend}`,
    SUMMARY_COLUMNS,
    summary.groups.map(group_summary => [
      group_summary.language,
      ...FormatMeasure(group_summary.gate),
      ...FormatMeasure(group_summary.raw),
      group_summary.median_ms_per_tile === null
        ? NOT_AVAILABLE_TEXT
        : group_summary.median_ms_per_tile.toFixed(0)
    ])
  );
  ReadElement('parity-summary').textContent = JSON.stringify(summary, null, 2);
}

function RenderFailures(failed_lines: readonly FailedLine[]): void {
  const failures_container = ReadElement('parity-failures');

  if (failed_lines.length === 0) {
    const empty_message = document.createElement('p');

    empty_message.textContent = 'No failed lines.';
    failures_container.replaceChildren(empty_message);

    return;
  }

  const failures_table = document.createElement('table');

  RenderTable(
    failures_table,
    `${failed_lines.length} reference lines failed the gate measure`,
    FAILURE_COLUMNS,
    failed_lines.map(failed_line => [
      failed_line.tile_id,
      failed_line.reference_text,
      failed_line.engine_text ?? NO_OVERLAPPING_LINE_TEXT,
      FormatCer(failed_line.cer)
    ])
  );
  failures_container.replaceChildren(failures_table);
}

async function RunParity(): Promise<void> {
  const engine = CreateOcrEngine({
    ResolveAssetUrl,
    backend_preference: ReadBackendPreference(location.search)
  });

  try {
    SetStatus('Loading the OCR models');

    const { backend } = await engine.WarmUp();
    const group_runs: GroupRun[] = [];

    for (const group of PARITY_GROUPS) {
      group_runs.push(await RunGroup(engine, group));
    }

    const summary: ParitySummary = {
      backend,
      is_passed: group_runs.every(group_run => group_run.summary.is_passed),
      groups: group_runs.map(group_run => group_run.summary)
    };

    RenderSummary(summary);
    RenderFailures(group_runs.flatMap(group_run => group_run.failed_lines));
    document.body.dataset.parityStatus = 'done';
    SetStatus(summary.is_passed ? 'Done: passed' : 'Done: failed');
  } finally {
    await engine.Dispose();
  }
}

RunParity().catch((error: unknown) => {
  console.error('[ocr-parity] run failed', error);
  document.body.dataset.parityStatus = 'failed';
  SetStatus(error instanceof Error ? error.message : String(error));
});
