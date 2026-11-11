export async function SendRuntimeMessage<TResponse>(message: {
  action: string;
}): Promise<TResponse> {
  return (await chrome.runtime.sendMessage(message)) as TResponse;
}

export async function SendTabMessage<TResponse>(
  tab_id: number,
  message: { action: string }
): Promise<TResponse> {
  return (await chrome.tabs.sendMessage(tab_id, message)) as TResponse;
}
