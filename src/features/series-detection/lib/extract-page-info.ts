import {
  BREADCRUMB_SELECTOR,
  MAX_BREADCRUMB_ITEMS,
  MAX_JSON_LD_SCRIPTS
} from '../constants/series-detection';
import type { PageInfo } from '../types/page-info';
import { BuildPageInfo } from './build-page-info';

export function ExtractPageInfo(
  document_ref: Document,
  location_ref: Location
): PageInfo {
  return BuildPageInfo({
    hostname: location_ref.hostname,
    href: location_ref.href,
    pathname: location_ref.pathname,
    json_ld_texts: Array.from(
      document_ref.querySelectorAll('script[type="application/ld+json"]'),
      element => element.textContent ?? ''
    ).slice(0, MAX_JSON_LD_SCRIPTS),
    og_title:
      document_ref
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content') ?? null,
    breadcrumb_texts: Array.from(
      document_ref.querySelectorAll(BREADCRUMB_SELECTOR),
      element => element.textContent ?? ''
    ).slice(0, MAX_BREADCRUMB_ITEMS),
    h1_text: document_ref.querySelector('h1')?.textContent ?? null,
    document_title: document_ref.title
  });
}
