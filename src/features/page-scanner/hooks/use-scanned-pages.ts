import { useSyncExternalStore } from 'react';
import type { PageScanner } from '../services/page-scanner.service';
import type { ScannedPage } from '../types/page-scanner';

export function UseScannedPages(scanner: PageScanner): readonly ScannedPage[] {
  return useSyncExternalStore(scanner.Subscribe, scanner.GetPages);
}
