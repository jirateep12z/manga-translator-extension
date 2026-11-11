import { IsOwnExtensionSender } from '@/lib/extension-sender';
import { IsRecord } from '@/lib/is-record';

export function HandleOpenOptionsMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  SendResponse: (response: unknown) => void
): boolean {
  const is_open_options_message =
    IsRecord(message) && message.action === 'open-options-page';

  if (!is_open_options_message || !IsOwnExtensionSender(sender)) return false;

  chrome.runtime
    .openOptionsPage()
    .then(() => SendResponse({ success: true }))
    .catch(error => {
      console.error(
        '[background] open-options-page',
        { outcome: 'failed' },
        error
      );
      SendResponse({ success: false });
    });

  return true;
}
