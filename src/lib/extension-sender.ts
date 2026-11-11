export function IsOwnExtensionSender(
  sender: chrome.runtime.MessageSender
): boolean {
  return sender.id === chrome.runtime.id;
}

export function IsTrustedExtensionPage(
  sender: chrome.runtime.MessageSender
): boolean {
  return (
    IsOwnExtensionSender(sender) &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL(''))
  );
}
