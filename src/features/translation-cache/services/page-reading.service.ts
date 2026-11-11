import {
  OpenDatabase,
  type PageReadingRecord,
  type TextRegion
} from '@/services/database';
import {
  MAX_CACHED_PAGE_READINGS,
  QUOTA_RECOVERY_KEEP_RATIO
} from '../constants/cache';
import { WithQuotaRecovery } from '../lib/with-quota-recovery';
import { EvictLeastRecentlyUsed } from './cache-maintenance.service';

async function RecoverQuota(): Promise<void> {
  const database = await OpenDatabase();
  const reading_count = await database.count('page_readings');

  await EvictLeastRecentlyUsed(
    Math.floor(reading_count * QUOTA_RECOVERY_KEEP_RATIO)
  );
}

export async function ReadPageReading(
  reading_key: string
): Promise<PageReadingRecord | undefined> {
  const database = await OpenDatabase();

  return database.get('page_readings', reading_key);
}

export async function FindPageReadingByImageUrl(
  image_url: string
): Promise<PageReadingRecord | undefined> {
  const database = await OpenDatabase();

  return database.getFromIndex('page_readings', 'by_image_url', image_url);
}

// A new reading numbers its regions again, so the stored translations of an
// earlier reading of this image no longer match (spec 0002 §10).
async function WriteReadingWithoutStaleTranslations(
  record: PageReadingRecord
): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['page_readings', 'page_translations'],
    'readwrite'
  );
  const translation_index = transaction
    .objectStore('page_translations')
    .index('by_reading');

  async function DeleteStaleTranslations(): Promise<void> {
    let translation_cursor = await translation_index.openCursor(
      record.reading_key
    );

    while (translation_cursor) {
      await translation_cursor.delete();
      translation_cursor = await translation_cursor.continue();
    }
  }

  // Awaited together, so a failed request, such as a full quota, aborts the
  // whole write and rejects here without an unhandled rejection.
  await Promise.all([
    transaction.objectStore('page_readings').put(record),
    DeleteStaleTranslations(),
    transaction.done
  ]);
}

export async function SavePageReading(
  record: PageReadingRecord
): Promise<void> {
  await WithQuotaRecovery(
    () => WriteReadingWithoutStaleTranslations(record),
    RecoverQuota
  );
  await EvictLeastRecentlyUsed(MAX_CACHED_PAGE_READINGS);
}

function IsSameRegionOrder(
  stored_regions: readonly TextRegion[],
  analyzed_regions: readonly TextRegion[]
): boolean {
  return (
    stored_regions.length === analyzed_regions.length &&
    stored_regions.every(
      (stored_region, region_index) =>
        stored_region.region_id === analyzed_regions[region_index].region_id
    )
  );
}

// Writes only when the stored reading is the one that was analyzed: the same
// created_at and the same region IDs in the same order. Every other stored
// field stays, including last_used_at (spec 0003 §7.4).
async function WriteReadingAppearance(
  reading: PageReadingRecord
): Promise<boolean> {
  const database = await OpenDatabase();
  const transaction = database.transaction('page_readings', 'readwrite');
  const stored_reading = await transaction.store.get(reading.reading_key);

  if (
    !stored_reading ||
    stored_reading.created_at !== reading.created_at ||
    !IsSameRegionOrder(stored_reading.regions, reading.regions)
  ) {
    await transaction.done;

    return false;
  }

  const updated_reading: PageReadingRecord = {
    ...stored_reading,
    appearance_version: reading.appearance_version,
    regions: stored_reading.regions.map((stored_region, region_index) => {
      const { appearance: _stored_appearance, ...region_fields } =
        stored_region;
      const appearance = reading.regions[region_index].appearance;

      return appearance ? { ...region_fields, appearance } : region_fields;
    })
  };

  // Awaited together, as in WriteReadingWithoutStaleTranslations.
  await Promise.all([transaction.store.put(updated_reading), transaction.done]);

  return true;
}

// Saves the analysis result of a cached reading without touching its
// translations. Returns false, and writes nothing, when the reading is gone
// or was replaced since it was read.
export async function SavePageReadingAppearance(
  reading: PageReadingRecord
): Promise<boolean> {
  return WithQuotaRecovery(() => WriteReadingAppearance(reading), RecoverQuota);
}

export async function TouchPageReading(
  reading_key: string,
  now_iso: string
): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction('page_readings', 'readwrite');
  const reading = await transaction.store.get(reading_key);

  if (reading) {
    await transaction.store.put({ ...reading, last_used_at: now_iso });
  }

  await transaction.done;
}
