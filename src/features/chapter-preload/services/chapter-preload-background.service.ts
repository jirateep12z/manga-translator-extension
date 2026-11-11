import { CreateChapterPreloadMessageHandler } from './chapter-preload-message.service';
import { CreateChapterPreloadManager } from './chapter-preload-session.service';
import { CreateChromePreloadDependencies } from './chrome-preload-dependencies.service';

// The background's single preload manager and its event entry points.
const chapter_preload_manager = CreateChapterPreloadManager(
  CreateChromePreloadDependencies()
);

export const HandleChapterPreloadMessage = CreateChapterPreloadMessageHandler(
  chapter_preload_manager
);

export function HandlePreloadTabRemoved(tab_id: number): void {
  void chapter_preload_manager.HandleTabRemoved(tab_id);
}

export function HandlePreloadWindowRemoved(window_id: number): void {
  void chapter_preload_manager.HandleWindowRemoved(window_id);
}

export function HandlePreloadWindowFocusChanged(window_id: number): void {
  void chapter_preload_manager.HandleWindowFocusChanged(window_id);
}

export function CleanUpChapterPreloadAfterRestart(): void {
  void chapter_preload_manager.CleanUpAfterRestart();
}
