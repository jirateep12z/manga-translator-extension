import type { OverlayFontLoad } from '../types/overlay';

type FontLoadOutcome = OverlayFontLoad['outcome'];

// Loads Itim, or falls back when no font face loads, when loading fails, or
// when it takes as long as the timeout (spec 0003 §8.3). Never rejects.
export async function LoadOverlayFont(input: {
  LoadFontFaces: () => Promise<readonly unknown[]>;
  ReadNowMs: () => number;
  timeout_ms: number;
}): Promise<OverlayFontLoad> {
  const started_at_ms = input.ReadNowMs();
  let timeout_id: ReturnType<typeof setTimeout> | undefined;
  // A synchronous throw from LoadFontFaces counts as a rejection.
  const loading = new Promise<readonly unknown[]>(resolve =>
    resolve(input.LoadFontFaces())
  ).then(
    (font_faces): FontLoadOutcome =>
      font_faces.length > 0 ? 'loaded' : 'failed',
    (): FontLoadOutcome => 'failed'
  );
  const timing_out = new Promise<FontLoadOutcome>(resolve => {
    timeout_id = setTimeout(() => resolve('timed_out'), input.timeout_ms);
  });
  let outcome: FontLoadOutcome;

  try {
    outcome = await Promise.race([loading, timing_out]);
  } finally {
    clearTimeout(timeout_id);
  }

  return {
    font: outcome === 'loaded' ? 'itim' : 'fallback',
    load_ms: Math.round(input.ReadNowMs() - started_at_ms),
    outcome
  };
}
