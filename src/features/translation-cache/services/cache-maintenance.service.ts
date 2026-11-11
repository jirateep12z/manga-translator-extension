import { OpenDatabase } from '@/services/database';

export async function EvictLeastRecentlyUsed(
  max_readings: number
): Promise<number> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['page_readings', 'page_translations'],
    'readwrite'
  );
  const reading_store = transaction.objectStore('page_readings');
  const translation_index = transaction
    .objectStore('page_translations')
    .index('by_reading');
  const excess = (await reading_store.count()) - Math.max(0, max_readings);

  if (excess <= 0) {
    await transaction.done;

    return 0;
  }

  let evicted_count = 0;
  let reading_cursor = await reading_store.index('by_last_used').openCursor();

  while (reading_cursor && evicted_count < excess) {
    let translation_cursor = await translation_index.openCursor(
      reading_cursor.value.reading_key
    );

    while (translation_cursor) {
      await translation_cursor.delete();
      translation_cursor = await translation_cursor.continue();
    }

    await reading_cursor.delete();
    evicted_count++;
    reading_cursor = await reading_cursor.continue();
  }

  await transaction.done;

  return evicted_count;
}

export async function ClearCache(): Promise<void> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['page_readings', 'page_translations'],
    'readwrite'
  );

  await transaction.objectStore('page_readings').clear();
  await transaction.objectStore('page_translations').clear();
  await transaction.done;
}

export async function ReadCacheStats(): Promise<{
  page_count: number;
  estimated_bytes: number;
}> {
  const database = await OpenDatabase();
  const transaction = database.transaction(
    ['page_readings', 'page_translations'],
    'readonly'
  );
  const readings = await transaction.objectStore('page_readings').getAll();
  const translations = await transaction
    .objectStore('page_translations')
    .getAll();

  await transaction.done;

  return {
    page_count: readings.length,
    estimated_bytes: [...readings, ...translations].reduce(
      (total, record) => total + JSON.stringify(record).length,
      0
    )
  };
}
