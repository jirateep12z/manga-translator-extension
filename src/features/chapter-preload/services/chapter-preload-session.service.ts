import type { PageStatus } from '@/features/chapter-translation';
import { IsRecord } from '@/lib/is-record';
import { TAB_MESSAGE_TIMEOUT_MS } from '../constants/chapter-preload';
import { IsFiniteChapterNumber } from '../lib/chapter-number';
import { IsPreloadPageStatus } from '../lib/chapter-preload-guards';
import { IsPreloadStartRefusal } from '../lib/resolve-preload-start-refusal';
import { ResolvePreloadStep } from '../lib/resolve-preload-step';
import type {
  ChapterPreloadSession,
  ChapterPreloadStatus,
  PreloadEndReason,
  PreloadStartRefusal
} from '../types/chapter-preload';

// chapter_count 0 means the setting is Off (spec 0006 §7.7).
export type PreloadSettings = { is_enabled: boolean; chapter_count: number };

const OFF_PRELOAD_SETTINGS: PreloadSettings = {
  is_enabled: false,
  chapter_count: 0
};

export type ChapterPreloadDependencies = {
  CreateWindow: (url: string) => Promise<{ window_id: number; tab_id: number }>;
  RemoveWindow: (window_id: number) => Promise<void>;
  IsWindowMinimized: (window_id: number) => Promise<boolean>;
  MinimizeWindow: (window_id: number) => Promise<void>;
  SendTabMessage: (
    tab_id: number,
    message: { action: string }
  ) => Promise<unknown>;
  ReadPreloadSettings: () => Promise<PreloadSettings>;
  ReadStoredSession: () => Promise<ChapterPreloadSession | null>;
  WriteStoredSession: (session: ChapterPreloadSession | null) => Promise<void>;
  StartTicker: (OnTick: () => void) => () => void;
  NowMs: () => number;
  CreateSessionId: () => string;
};

export type PreloadRequest = {
  series_id: string;
  chapter_number: string;
  source_tab_id: number;
  source_window_id: number;
  source_url: string;
};

export type ChapterPreloadManager = {
  RequestPreload: (request: PreloadRequest) => Promise<boolean>;
  CancelPreload: (
    series_id: string,
    sender_window_id: number | null
  ) => Promise<boolean>;
  Tick: () => Promise<void>;
  HandleTabRemoved: (tab_id: number) => Promise<void>;
  HandleWindowRemoved: (window_id: number) => Promise<void>;
  HandleWindowFocusChanged: (window_id: number) => Promise<void>;
  CleanUpAfterRestart: () => Promise<void>;
  // Waits for a window being created, so its tab cannot ask too early.
  IsPreloadTab: (tab_id: number, window_id: number) => Promise<boolean>;
  ReadSession: () => ChapterPreloadSession | null;
};

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const LOG_TAG = '[background] chapter-preload';

function ReadHttpUrl(url: string): URL | null {
  try {
    const parsed_url = new URL(url);

    return WEB_PROTOCOLS.has(parsed_url.protocol) ? parsed_url : null;
  } catch {
    return null;
  }
}

type LastPageStatus = Pick<
  PageStatus,
  'chapter_number' | 'page_count' | 'queue_status' | 'is_preload_run'
>;

type EndDetail = {
  // command: the page refused a command; step: a step rule stopped the
  // session; event: a message or browser event ended it.
  source: 'command' | 'step' | 'event';
  refusal: PreloadStartRefusal | null;
};

function IsAccepted(response: unknown): boolean {
  return IsRecord(response) && response.accepted === true;
}

// Only known refusal names reach the log, never text from the page.
function ReadRefusal(response: unknown): PreloadStartRefusal | null {
  return IsRecord(response) && IsPreloadStartRefusal(response.reason)
    ? response.reason
    : null;
}

// Drives one preload session at a time (spec 0006 §7). Chrome APIs are
// injected so the rules can be tested without a browser.
export function CreateChapterPreloadManager(
  dependencies: ChapterPreloadDependencies
): ChapterPreloadManager {
  let session: ChapterPreloadSession | null = null;
  // The preload tab's last valid status, for the "ended" log.
  let last_status: LastPageStatus | null = null;
  let StopTicker: (() => void) | null = null;
  let is_tick_pending = false;
  let operation_chain: Promise<unknown> = Promise.resolve();
  // Settles once the window that StartSession is creating is in the session,
  // or its creation failed.
  let pending_window_creation: Promise<void> = Promise.resolve();
  // Windows that the manager removes itself, so onRemoved ignores them.
  const self_removed_window_ids = new Set<number>();

  // Every operation runs after the previous one (spec 0006 §7.2a).
  function RunSerially<T>(
    operation: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    const result = operation_chain.then(operation).catch((error: unknown) => {
      console.warn(LOG_TAG, {
        event: 'command-failed',
        session_id: session?.session_id ?? null,
        error
      });

      return fallback;
    });

    operation_chain = result;

    return result;
  }

  function IsCurrent(session_id: string): boolean {
    return session?.session_id === session_id;
  }

  async function SaveSession(
    next_session: ChapterPreloadSession
  ): Promise<void> {
    session = next_session;
    await dependencies.WriteStoredSession(next_session);
  }

  // A tab that never answers, such as a frozen one, counts as no answer
  // after TAB_MESSAGE_TIMEOUT_MS, so the serial queue cannot stall.
  async function SendTabMessageWithTimeout(
    tab_id: number,
    message: { action: string }
  ): Promise<unknown> {
    let timeout_id: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(resolve => {
      timeout_id = setTimeout(() => resolve(null), TAB_MESSAGE_TIMEOUT_MS);
    });

    try {
      // Promise.resolve().then turns a synchronous throw into a rejection.
      return await Promise.race([
        Promise.resolve()
          .then(() => dependencies.SendTabMessage(tab_id, message))
          .catch(() => null),
        timeout
      ]);
    } finally {
      clearTimeout(timeout_id);
    }
  }

  // Not awaited by callers: the panel line must never hold up the session.
  function SendStatus(
    status_session: ChapterPreloadSession,
    state: ChapterPreloadStatus['state']
  ): void {
    const status: ChapterPreloadStatus = {
      session_id: status_session.session_id,
      series_id: status_session.series_id,
      source_chapter_number: status_session.source_chapter_number,
      state,
      current_chapter_number:
        state === 'preparing' ? status_session.current_chapter_number : null,
      prepared_chapter_numbers: status_session.prepared_chapter_numbers
    };

    void SendTabMessageWithTimeout(status_session.source_tab_id, {
      action: 'chapter-preload-status',
      status
    } as { action: string });
  }

  async function RemoveOwnWindow(window_id: number): Promise<void> {
    self_removed_window_ids.add(window_id);
    await dependencies.RemoveWindow(window_id).catch(() => undefined);
  }

  async function EndSession(
    reason: PreloadEndReason,
    end_detail: EndDetail = { source: 'event', refusal: null }
  ): Promise<void> {
    const ended_session = session;
    const ended_last_status = last_status;

    if (ended_session === null) return;

    session = null;
    last_status = null;
    StopTicker?.();
    StopTicker = null;

    if (
      ended_session.window_id !== null &&
      reason !== 'window-shown' &&
      reason !== 'window-closed'
    ) {
      await RemoveOwnWindow(ended_session.window_id);
    }

    await dependencies.WriteStoredSession(null);
    SendStatus(ended_session, 'finished');

    // The user now reads in the shown window, so its tab auto-starts as a
    // normal tab again (spec 0006 §4.3). Not awaited, like SendStatus.
    if (reason === 'window-shown' && ended_session.preload_tab_id !== null) {
      void SendTabMessageWithTimeout(ended_session.preload_tab_id, {
        action: 'release-preload-tab'
      });
    }

    // Says which rule ended the session and what the page last reported,
    // without URLs, so a short session can be diagnosed.
    console.info(LOG_TAG, {
      event: 'ended',
      session_id: ended_session.session_id,
      series_id: ended_session.series_id,
      reason,
      source: end_detail.source,
      refusal: end_detail.refusal,
      last_status: ended_last_status
    });
  }

  async function SendCommand(
    active_session: ChapterPreloadSession,
    action: 'go-to-next-chapter' | 'start-preload-translation'
  ): Promise<unknown> {
    if (active_session.preload_tab_id === null) return null;

    return SendTabMessageWithTimeout(active_session.preload_tab_id, {
      action
    });
  }

  async function EndOnRefusedCommand(
    active_session: ChapterPreloadSession,
    response: unknown,
    reason: PreloadEndReason
  ): Promise<void> {
    if (IsAccepted(response) || !IsCurrent(active_session.session_id)) return;

    await EndSession(reason, {
      source: 'command',
      refusal: ReadRefusal(response)
    });
  }

  async function GoToNextChapter(
    active_session: ChapterPreloadSession
  ): Promise<void> {
    await EndOnRefusedCommand(
      active_session,
      await SendCommand(active_session, 'go-to-next-chapter'),
      'no-next-chapter'
    );
  }

  // Chrome can leave a window created as minimized on screen (QA-1). A failed
  // check or update is logged, not fatal: the preload tab still never
  // auto-starts.
  async function EnsureMinimized(
    window_id: number
  ): Promise<'minimized' | 'reminimized' | 'unknown'> {
    try {
      if (await dependencies.IsWindowMinimized(window_id)) return 'minimized';

      await dependencies.MinimizeWindow(window_id);

      return 'reminimized';
    } catch {
      return 'unknown';
    }
  }

  // A settings read that fails counts as Off, so no window opens and no AI
  // call is made by mistake.
  async function ReadPreloadSettingsSafely(): Promise<PreloadSettings> {
    try {
      return await dependencies.ReadPreloadSettings();
    } catch (error) {
      console.warn(LOG_TAG, {
        event: 'settings-read-failed',
        session_id: session?.session_id ?? null,
        error
      });

      return OFF_PRELOAD_SETTINGS;
    }
  }

  async function StartSession(request: PreloadRequest): Promise<boolean> {
    const source_url = ReadHttpUrl(request.source_url);
    const preload_settings = await ReadPreloadSettingsSafely();

    if (
      !preload_settings.is_enabled ||
      !Number.isInteger(preload_settings.chapter_count) ||
      preload_settings.chapter_count < 1 ||
      !IsFiniteChapterNumber(request.chapter_number) ||
      source_url === null ||
      (session !== null && session.window_id === request.source_window_id)
    ) {
      return false;
    }

    await EndSession('replaced');

    const now_ms = dependencies.NowMs();
    const opening_session: ChapterPreloadSession = {
      session_id: dependencies.CreateSessionId(),
      series_id: request.series_id,
      source_tab_id: request.source_tab_id,
      source_hostname: source_url.hostname,
      window_id: null,
      preload_tab_id: null,
      source_chapter_number: request.chapter_number,
      previous_chapter_number: request.chapter_number,
      current_chapter_number: null,
      departed_page_url: null,
      prepared_chapter_numbers: [],
      target_chapter_count: preload_settings.chapter_count,
      step: 'opening',
      step_started_at_ms: now_ms,
      stable_page_count: 0,
      stable_since_ms: now_ms,
      has_seen_run: false
    };

    await SaveSession(opening_session);

    let MarkWindowKnown: () => void = () => {};

    pending_window_creation = new Promise<void>(resolve => {
      MarkWindowKnown = resolve;
    });

    try {
      return await OpenWindow(opening_session, request.source_url);
    } finally {
      MarkWindowKnown();
    }
  }

  async function OpenWindow(
    opening_session: ChapterPreloadSession,
    source_url: string
  ): Promise<boolean> {
    let created_window: { window_id: number; tab_id: number };

    try {
      created_window = await dependencies.CreateWindow(source_url);
    } catch (error) {
      console.warn(LOG_TAG, {
        event: 'command-failed',
        session_id: opening_session.session_id,
        error
      });
      await EndSession('window-closed');

      return false;
    }

    // The session ended while the window was being created.
    if (!IsCurrent(opening_session.session_id)) {
      await RemoveOwnWindow(created_window.window_id);

      return true;
    }

    const opened_session: ChapterPreloadSession = {
      ...opening_session,
      window_id: created_window.window_id,
      preload_tab_id: created_window.tab_id,
      step: 'at-source',
      step_started_at_ms: dependencies.NowMs()
    };

    await SaveSession(opened_session);

    const window_state = await EnsureMinimized(created_window.window_id);

    StopTicker = dependencies.StartTicker(() => {
      void manager.Tick();
    });
    SendStatus(opened_session, 'preparing');
    console.info(LOG_TAG, {
      event: 'started',
      session_id: opened_session.session_id,
      series_id: opened_session.series_id,
      chapter_number: opened_session.source_chapter_number,
      window_state
    });

    return true;
  }

  async function RunTick(): Promise<void> {
    const current_session = session;

    if (
      current_session === null ||
      current_session.step === 'opening' ||
      current_session.preload_tab_id === null
    ) {
      return;
    }

    const preload_settings = await ReadPreloadSettingsSafely();

    if (!preload_settings.is_enabled) {
      await EndSession('extension-disabled');

      return;
    }

    // A changed count applies from the next session; only Off ends this one.
    if (preload_settings.chapter_count === 0) {
      await EndSession('preload-off');

      return;
    }

    const response = await SendTabMessageWithTimeout(
      current_session.preload_tab_id,
      { action: 'get-page-status' }
    );

    if (!IsCurrent(current_session.session_id)) return;

    const status = IsPreloadPageStatus(response) ? response : null;

    if (status !== null) {
      last_status = {
        // A `url:` chapter key holds the page path, so it is not logged.
        chapter_number: IsFiniteChapterNumber(status.chapter_number)
          ? status.chapter_number
          : null,
        page_count: status.page_count,
        queue_status: status.queue_status,
        is_preload_run: status.is_preload_run
      };
    }

    const decision = ResolvePreloadStep(
      current_session,
      status,
      dependencies.NowMs()
    );

    if (decision.session !== current_session) {
      await SaveSession(decision.session);
    }

    if (
      decision.session.current_chapter_number !== null &&
      decision.session.current_chapter_number !==
        current_session.current_chapter_number
    ) {
      SendStatus(decision.session, 'preparing');
    }

    switch (decision.kind) {
      case 'wait':
        return;
      case 'send-go-next':
        await GoToNextChapter(decision.session);

        return;
      case 'send-start':
        await EndOnRefusedCommand(
          decision.session,
          await SendCommand(decision.session, 'start-preload-translation'),
          'start-refused'
        );

        return;
      case 'chapter-finished':
        console.info(LOG_TAG, {
          event: 'chapter-prepared',
          session_id: decision.session.session_id,
          series_id: decision.session.series_id,
          chapter_number: decision.session.previous_chapter_number
        });

        if (decision.is_last) {
          await EndSession('done');

          return;
        }

        SendStatus(decision.session, 'preparing');
        await GoToNextChapter(decision.session);

        return;
      case 'stop':
        await EndSession(decision.reason, { source: 'step', refusal: null });
    }
  }

  const manager: ChapterPreloadManager = {
    RequestPreload: request => RunSerially(() => StartSession(request), false),
    CancelPreload: (series_id, sender_window_id) =>
      RunSerially(async () => {
        if (
          session === null ||
          session.series_id !== series_id ||
          (sender_window_id !== null && session.window_id === sender_window_id)
        ) {
          return false;
        }

        await EndSession('canceled');

        return true;
      }, false),
    Tick: () => {
      // A slow tick is never stacked behind another one.
      if (is_tick_pending) return Promise.resolve();

      is_tick_pending = true;

      return RunSerially(RunTick, undefined).finally(() => {
        is_tick_pending = false;
      });
    },
    HandleTabRemoved: tab_id =>
      RunSerially(async () => {
        if (session?.source_tab_id === tab_id) {
          await EndSession('source-tab-closed');
        }
      }, undefined),
    HandleWindowRemoved: window_id =>
      RunSerially(async () => {
        if (self_removed_window_ids.delete(window_id)) return;

        if (session?.window_id === window_id) {
          await EndSession('window-closed');
        }
      }, undefined),
    HandleWindowFocusChanged: window_id =>
      RunSerially(async () => {
        if (session === null || session.window_id !== window_id) return;

        // A brief focus at creation leaves the window minimized.
        const is_minimized = await dependencies
          .IsWindowMinimized(window_id)
          .catch(() => true);

        if (!is_minimized && session?.window_id === window_id) {
          await EndSession('window-shown');
        }
      }, undefined),
    CleanUpAfterRestart: () =>
      RunSerially(async () => {
        const stored_session = await dependencies.ReadStoredSession();

        if (stored_session === null) return;

        if (stored_session.window_id !== null) {
          await RemoveOwnWindow(stored_session.window_id);
        }

        await dependencies.WriteStoredSession(null);
        // Clears the "preparing" line in the reader's panel.
        SendStatus(stored_session, 'finished');
      }, undefined),
    IsPreloadTab: async (tab_id, window_id) => {
      await pending_window_creation;

      return (
        session !== null &&
        (session.preload_tab_id === tab_id || session.window_id === window_id)
      );
    },
    ReadSession: () => session
  };

  return manager;
}
