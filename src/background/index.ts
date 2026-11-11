import {
  CleanUpChapterPreloadAfterRestart,
  HandleChapterPreloadMessage,
  HandlePreloadTabRemoved,
  HandlePreloadWindowFocusChanged,
  HandlePreloadWindowRemoved
} from '@/features/chapter-preload';
import {
  HandleChapterStatusMessage,
  HandleChapterTranslationPort,
  HandleOpenOptionsMessage,
  HandleSeriesAutoTranslateMessage,
  HandleSummarizeChapterMessage
} from '@/features/chapter-translation';
import { HandleOcrIdleAlarm } from '@/features/ocr-reader';
import { HandleSeriesDetectionMessage } from '@/features/series-detection';
import {
  BroadcastPublicSettingsChange,
  HandleSettingsMessage,
  ReadSettings,
  WriteSettings
} from '@/features/settings';
import {
  HandleNetworkSettingsChange,
  InstallNetworkRules
} from '@/features/translation-pipeline';

chrome.storage.local
  .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
  .catch(error => {
    console.error('[background] Failed to restrict storage access:', error);
  });

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await WriteSettings(await ReadSettings());
  } catch (error) {
    console.error(
      '[background] Failed to initialize settings on install:',
      error
    );
  }
});

chrome.runtime.onMessage.addListener(HandleSettingsMessage);
chrome.runtime.onMessage.addListener(HandleSeriesDetectionMessage);
chrome.storage.onChanged.addListener(BroadcastPublicSettingsChange);

function InstallNetworkRulesSafely(): void {
  InstallNetworkRules().catch(error => {
    console.error('[background] install-network-rules', {
      outcome: 'failed',
      error
    });
  });
}

chrome.runtime.onConnect.addListener(HandleChapterTranslationPort);
chrome.runtime.onMessage.addListener(HandleChapterStatusMessage);
chrome.runtime.onMessage.addListener(HandleSeriesAutoTranslateMessage);
chrome.runtime.onMessage.addListener(HandleSummarizeChapterMessage);
chrome.runtime.onMessage.addListener(HandleOpenOptionsMessage);
chrome.runtime.onMessage.addListener(HandleChapterPreloadMessage);
chrome.tabs.onRemoved.addListener(tab_id => HandlePreloadTabRemoved(tab_id));
chrome.windows.onRemoved.addListener(HandlePreloadWindowRemoved);
chrome.windows.onFocusChanged.addListener(HandlePreloadWindowFocusChanged);
// A preload window left by a stopped service worker is closed (spec 0006
// §7.4).
CleanUpChapterPreloadAfterRestart();
chrome.alarms.onAlarm.addListener(HandleOcrIdleAlarm);
chrome.runtime.onInstalled.addListener(InstallNetworkRulesSafely);
chrome.runtime.onStartup.addListener(InstallNetworkRulesSafely);
chrome.storage.onChanged.addListener((changes, area_name) => {
  HandleNetworkSettingsChange(changes, area_name).catch(error => {
    console.error('[background] update-ollama-origin-rule', {
      outcome: 'failed',
      error
    });
  });
});
InstallNetworkRulesSafely();
