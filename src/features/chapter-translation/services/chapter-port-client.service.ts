import { CHAPTER_TRANSLATION_PORT_NAME } from '../constants/port';
import { IsChapterPortResponse } from '../lib/is-chapter-port-response';
import type {
  ChapterPortRequest,
  ChapterPortResponse
} from '../types/port-messages';

export type ChapterPortClient = {
  Post: (message: ChapterPortRequest) => void;
  Disconnect: () => void;
};

export function CreateChapterPortClient(handlers: {
  OnMessage: (message: ChapterPortResponse) => void;
  OnUnexpectedDisconnect: () => void;
}): ChapterPortClient {
  let port: chrome.runtime.Port | null = null;

  function Connect(): chrome.runtime.Port {
    const connected_port = chrome.runtime.connect({
      name: CHAPTER_TRANSLATION_PORT_NAME
    });

    connected_port.onMessage.addListener((message: unknown) => {
      if (IsChapterPortResponse(message)) handlers.OnMessage(message);
    });
    connected_port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;

      if (port !== connected_port) return;

      port = null;
      handlers.OnUnexpectedDisconnect();
    });

    return connected_port;
  }

  return {
    Post: message => {
      port ??= Connect();
      port.postMessage(message);
    },
    Disconnect: () => {
      const current_port = port;

      port = null;
      current_port?.disconnect();
    }
  };
}
