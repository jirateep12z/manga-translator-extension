import { ReadSettings } from '@/features/settings';
import { IsRecord } from '@/lib/is-record';
import {
  CHAPTER_PRELOAD_SESSION_KEY,
  STATUS_POLL_INTERVAL_MS
} from '../constants/chapter-preload';
import type { ChapterPreloadSession } from '../types/chapter-preload';
import type { ChapterPreloadDependencies } from './chapter-preload-session.service';

// The Chrome APIs behind a preload session (spec 0006 §7).
export function CreateChromePreloadDependencies(): ChapterPreloadDependencies {
  return {
    CreateWindow: async url => {
      const created_window = await chrome.windows.create({
        url,
        state: 'minimized',
        focused: false
      });
      const tab_id = created_window?.tabs?.[0]?.id;

      if (
        typeof created_window?.id !== 'number' ||
        typeof tab_id !== 'number'
      ) {
        throw new Error('Preload window has no tab.');
      }

      return { window_id: created_window.id, tab_id };
    },
    RemoveWindow: async window_id => {
      await chrome.windows.remove(window_id);
    },
    IsWindowMinimized: async window_id =>
      (await chrome.windows.get(window_id)).state === 'minimized',
    MinimizeWindow: async window_id => {
      await chrome.windows.update(window_id, { state: 'minimized' });
    },
    SendTabMessage: (tab_id, message) =>
      chrome.tabs.sendMessage(tab_id, message),
    ReadPreloadSettings: async () => {
      const settings = await ReadSettings();

      return {
        is_enabled: settings.is_enabled,
        chapter_count: settings.next_chapter_preload_count
      };
    },
    ReadStoredSession: async () => {
      const stored = await chrome.storage.session.get(
        CHAPTER_PRELOAD_SESSION_KEY
      );
      const value: unknown = stored?.[CHAPTER_PRELOAD_SESSION_KEY];

      // Only the window ID is read back, after a restart (spec 0006 §7.4).
      return IsRecord(value) ? (value as ChapterPreloadSession) : null;
    },
    WriteStoredSession: async session => {
      if (session === null) {
        await chrome.storage.session.remove(CHAPTER_PRELOAD_SESSION_KEY);

        return;
      }

      await chrome.storage.session.set({
        [CHAPTER_PRELOAD_SESSION_KEY]: session
      });
    },
    StartTicker: OnTick => {
      const interval_id = setInterval(OnTick, STATUS_POLL_INTERVAL_MS);

      return () => clearInterval(interval_id);
    },
    NowMs: () => Date.now(),
    CreateSessionId: () => crypto.randomUUID()
  };
}
