import type { SeriesMergePreview } from '@/features/memory';

function FormatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DescribeMergePreview(preview: SeriesMergePreview): string[] {
  return [
    FormatCount(preview.alias_count, 'alias', 'aliases'),
    FormatCount(preview.binding_count, 'site link', 'site links'),
    `${FormatCount(preview.chapter_count, 'chapter', 'chapters')} (${preview.merged_chapter_count} merged with existing chapters)`,
    `${FormatCount(preview.entity_count, 'character or term', 'characters and terms')} (${preview.merged_entity_count} merged with existing entries)`
  ];
}
