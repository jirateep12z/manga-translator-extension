import type { EntityRecord } from '@/services/database';

// Records stored before spec 0004 lack the speech fields (spec 0004 §4.1)
// and the kind origin (amendment U3).
export type StoredEntityRecord = Omit<
  EntityRecord,
  'speech' | 'name_variants' | 'kind_origin'
> &
  Partial<Pick<EntityRecord, 'speech' | 'name_variants' | 'kind_origin'>>;

export function NormalizeEntityRecord(
  entity: StoredEntityRecord
): EntityRecord {
  return {
    ...entity,
    // A user-created entity starts with user notes, so the notes origin is
    // the best record of who set an old entity's kind.
    kind_origin: entity.kind_origin ?? entity.notes_origin,
    speech: entity.speech ?? {},
    name_variants: entity.name_variants ?? {}
  };
}
