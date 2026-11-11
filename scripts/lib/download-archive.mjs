const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTTPS_PROTOCOL = 'https:';

function AssertHttps(url) {
  if (url.protocol !== HTTPS_PROTOCOL) {
    throw new Error(`Only HTTPS downloads are allowed: ${url.href}`);
  }
}

/**
 * Downloads a file over HTTPS only, following at most five redirects that
 * also stay on HTTPS. One timeout covers every request and the body.
 */
export async function DownloadArchive({ url, timeout_ms, FetchUrl = fetch }) {
  const signal = AbortSignal.timeout(timeout_ms);
  let current_url = new URL(url);

  for (let redirect_count = 0; ; redirect_count++) {
    AssertHttps(current_url);

    const response = await FetchUrl(current_url.href, {
      redirect: 'manual',
      signal
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');

      // Release the redirect's body so its connection is not kept open.
      await response.body?.cancel();

      if (location === null) {
        throw new Error(`Redirect without a location: ${current_url.href}`);
      }
      if (redirect_count === MAX_REDIRECTS) {
        throw new Error(`Too many redirects: ${current_url.href}`);
      }

      current_url = new URL(location, current_url);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();

      throw new Error(`HTTP ${response.status}: ${current_url.href}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
