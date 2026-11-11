import {
  MIN_MANGA_IMAGE_HEIGHT_PX,
  MIN_MANGA_IMAGE_WIDTH_PX,
  MIN_RELATIVE_RENDERED_WIDTH
} from '../constants/page-scanner';
import type {
  ImageSnapshot,
  PageSelection,
  ScannedPage
} from '../types/page-scanner';
import { ResolveCandidateSize } from './resolve-candidate-size';
import { ResolveEffectiveSource } from './resolve-effective-source';

type SizedCandidate = { snapshot: ImageSnapshot; effective_source: string };

function IsPortrait(candidate: SizedCandidate): boolean {
  return (
    candidate.snapshot.rendered_height_px >=
    candidate.snapshot.rendered_width_px
  );
}

// Double-page spreads render wider than single pages, so the widest portrait
// image sets the page width. Without portrait images, the widest one does.
function ResolveReferenceWidthPx(sized_candidates: SizedCandidate[]): number {
  const portrait_candidates = sized_candidates.filter(IsPortrait);
  const reference_candidates =
    portrait_candidates.length > 0 ? portrait_candidates : sized_candidates;

  return Math.max(
    0,
    ...reference_candidates.map(
      candidate => candidate.snapshot.rendered_width_px
    )
  );
}

export function SelectMangaPages(snapshots: ImageSnapshot[]): PageSelection {
  const pending_element_ids: string[] = [];
  const sized_candidates: SizedCandidate[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.is_in_excluded_ancestor) continue;

    const effective_source = ResolveEffectiveSource(snapshot);

    if (effective_source === null) continue;

    const size = ResolveCandidateSize(snapshot);

    if (size === null) {
      pending_element_ids.push(snapshot.element_id);
      continue;
    }

    if (
      size.width_px >= MIN_MANGA_IMAGE_WIDTH_PX &&
      size.height_px >= MIN_MANGA_IMAGE_HEIGHT_PX
    ) {
      sized_candidates.push({ snapshot, effective_source });
    }
  }

  const reference_width_px = ResolveReferenceWidthPx(sized_candidates);

  if (reference_width_px === 0) return { pages: [], pending_element_ids };

  const pages: ScannedPage[] = sized_candidates
    .filter(
      candidate =>
        candidate.snapshot.rendered_width_px >=
        MIN_RELATIVE_RENDERED_WIDTH * reference_width_px
    )
    .sort(
      (left, right) =>
        left.snapshot.document_order - right.snapshot.document_order
    )
    .map(candidate => ({
      page_id: candidate.snapshot.element_id,
      effective_source: candidate.effective_source,
      document_order: candidate.snapshot.document_order
    }));

  return { pages, pending_element_ids };
}
