import { useEffect, useState } from 'react';
import {
  FONT_LOAD_DESCRIPTOR,
  FONT_LOAD_SAMPLE_TEXT,
  FONT_LOAD_TIMEOUT_MS
} from '../constants/overlay';
import { LoadOverlayFont } from '../lib/load-overlay-font';
import type { OverlayFontLoad, OverlayFontStatus } from '../types/overlay';

const OVERLAY_FONT_LOG_EVENT = '[content] overlay-font';

// One load for each content-script session (spec 0003 §8.3).
let overlay_font_load: Promise<OverlayFontLoad> | null = null;

// Starts the load the first time, logs its result once (spec 0003 §12), and
// returns the same load afterward.
function ReadOverlayFontLoad(): Promise<OverlayFontLoad> {
  overlay_font_load ??= LoadOverlayFont({
    LoadFontFaces: () =>
      document.fonts.load(FONT_LOAD_DESCRIPTOR, FONT_LOAD_SAMPLE_TEXT),
    ReadNowMs: () => performance.now(),
    timeout_ms: FONT_LOAD_TIMEOUT_MS
  }).then(font_load => {
    console.info(OVERLAY_FONT_LOG_EVENT, font_load);

    return font_load;
  });

  return overlay_font_load;
}

export function UseOverlayFont(): OverlayFontStatus {
  const [font_status, set_font_status] = useState<OverlayFontStatus>('loading');

  useEffect(() => {
    let is_mounted = true;

    void ReadOverlayFontLoad().then(font_load => {
      if (is_mounted) set_font_status(font_load.font);
    });

    return () => {
      is_mounted = false;
    };
  }, []);

  return font_status;
}
