// What ReadChapterControls reads from one link or button.
export type ChapterControlSnapshot = {
  tag: 'a' | 'button';
  raw_href: string | null;
  rel: string;
  aria_label: string | null;
  title: string | null;
  text_content: string;
  icon_classes: string[];
  image_alts: string[];
  has_disabled_attribute: boolean;
  aria_disabled: string | null;
  target: string | null;
};

// A link or button normalized for the next-chapter finder (spec 0006 §5.1).
export type ChapterControl = {
  control_index: number;
  tag: 'a' | 'button';
  href: string | null;
  rel_tokens: string[];
  label: string;
  icon_hint: string;
  is_disabled: boolean;
  opens_new_tab: boolean;
};

export type NextChapterSelection = {
  control_index: number;
  rule: 1 | 2 | 3 | 4 | 5;
};

export type ChapterArrival = 'arrived' | 'pending' | 'wrong-chapter';

export type PreloadEndReason =
  | 'done'
  | 'timeout'
  | 'wrong-chapter'
  | 'no-next-chapter'
  | 'no-pages'
  | 'start-refused'
  | 'run-ended'
  | 'canceled'
  | 'replaced'
  | 'source-tab-closed'
  | 'window-closed'
  | 'window-shown'
  | 'extension-disabled'
  | 'preload-off';

export type ChapterPreloadStep =
  'opening' | 'at-source' | 'moving' | 'waiting-pages' | 'translating';

// The background's walk through the next chapters (spec 0006 §7.1).
export type ChapterPreloadSession = {
  session_id: string;
  series_id: string;
  source_tab_id: number;
  source_hostname: string;
  window_id: number | null;
  preload_tab_id: number | null;
  source_chapter_number: string;
  previous_chapter_number: string;
  current_chapter_number: string | null;
  departed_page_url: string | null;
  prepared_chapter_numbers: string[];
  // The setting's chapter count when the session started.
  target_chapter_count: number;
  step: ChapterPreloadStep;
  step_started_at_ms: number;
  stable_page_count: number;
  stable_since_ms: number;
  has_seen_run: boolean;
};

export type PreloadStepDecision =
  | {
      kind: 'wait' | 'send-go-next' | 'send-start';
      session: ChapterPreloadSession;
    }
  | {
      kind: 'chapter-finished';
      session: ChapterPreloadSession;
      is_last: boolean;
    }
  | {
      kind: 'stop';
      reason: PreloadEndReason;
      session: ChapterPreloadSession;
    };

export type ChapterPreloadStatus = {
  session_id: string;
  series_id: string;
  source_chapter_number: string;
  state: 'preparing' | 'finished';
  current_chapter_number: string | null;
  prepared_chapter_numbers: string[];
};

// The first spec 0006 §4.2 condition that a preload start fails, logged so
// that a refused start can be diagnosed.
export type PreloadStartRefusal =
  | 'extension-disabled'
  | 'provider-not-configured'
  | 'series-not-bound'
  | 'auto-translate-off'
  | 'stale-series-state'
  | 'no-pages'
  | 'queue-not-idle';

// Commands that the background sends to the preload tab (spec 0006 §6.2).
export type PreloadCommandTarget = {
  GoToNextChapter: () => boolean;
  // null when the preload run started.
  StartPreloadTranslation: () => PreloadStartRefusal | null;
  ShowPreloadStatus: (status: ChapterPreloadStatus) => void;
  // The session ended because the user showed the window; the tab is a
  // normal tab from now on (spec 0006 §4.3).
  ReleasePreloadTab: () => void;
};

export type PreloadStartResponse = {
  accepted: boolean;
  reason?: PreloadStartRefusal;
};

export type RequestChapterPreloadMessage = {
  action: 'request-chapter-preload';
  series_id: string;
  chapter_number: string;
};

export type CancelChapterPreloadMessage = {
  action: 'cancel-chapter-preload';
  series_id: string;
};

export type ChapterPreloadResponse = { accepted: boolean };

// A content script asks whether its tab belongs to the preload window, so
// that auto-start never runs there (spec 0006 §6.1).
export type GetPreloadTabRoleMessage = { action: 'get-preload-tab-role' };

export type PreloadTabRoleResponse = { is_preload_tab: boolean };

export type GoToNextChapterMessage = { action: 'go-to-next-chapter' };

export type StartPreloadTranslationMessage = {
  action: 'start-preload-translation';
};

export type ChapterPreloadStatusMessage = {
  action: 'chapter-preload-status';
  status: ChapterPreloadStatus;
};
