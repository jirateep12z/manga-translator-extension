// React-free public entry; hooks are exported from './ui' so that non-UI
// modules never load React.
export { MIN_MANGA_IMAGES_FOR_PANEL } from './constants/page-scanner';
export {
  ArrayBufferToBase64,
  ClassifyImageSource,
  ParseDataUrl
} from './lib/image-source';
export { ResolveEffectiveSource } from './lib/resolve-effective-source';
export { SelectMangaPages } from './lib/select-manga-pages';
export {
  CreatePageScanner,
  type PageScanner
} from './services/page-scanner.service';
export { PreloadLazyPages } from './services/preload-lazy-pages.service';
export type { ImageSnapshot, ScannedPage } from './types/page-scanner';
