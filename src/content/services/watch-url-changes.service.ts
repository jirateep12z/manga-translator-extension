import { URL_POLL_INTERVAL_MS } from '../constants/content';
import { HasPageUrlChanged } from '../lib/has-page-url-changed';

// Content scripts run in an isolated world, so they cannot intercept the
// page's own history.pushState calls. Navigation events plus polling are used.
export function WatchUrlChanges(
  OnUrlChange: (url: string) => void
): () => void {
  let last_url = location.href;
  const navigation = (window as Window & { navigation?: EventTarget })
    .navigation;

  function Check(): void {
    const current_url = location.href;

    if (current_url === last_url) return;

    const has_page_changed = HasPageUrlChanged(last_url, current_url);

    last_url = current_url;

    if (has_page_changed) OnUrlChange(current_url);
  }

  window.addEventListener('popstate', Check);
  navigation?.addEventListener('currententrychange', Check);

  const interval_id = setInterval(Check, URL_POLL_INTERVAL_MS);

  return () => {
    window.removeEventListener('popstate', Check);
    navigation?.removeEventListener('currententrychange', Check);
    clearInterval(interval_id);
  };
}
