import { OpenDatabase, type SiteBindingRecord } from '@/services/database';

function IsSameBinding(
  binding: SiteBindingRecord,
  input: { series_path_pattern: string | null; series_id: string }
): boolean {
  if (input.series_path_pattern !== null) {
    return binding.series_path_pattern === input.series_path_pattern;
  }

  return (
    binding.series_path_pattern === null &&
    binding.series_id === input.series_id
  );
}

export async function ListBindingsByHostname(
  hostname: string
): Promise<SiteBindingRecord[]> {
  const database = await OpenDatabase();

  return database.getAllFromIndex('site_bindings', 'by_hostname', hostname);
}

export async function ListBindingsBySeries(
  series_id: string
): Promise<SiteBindingRecord[]> {
  const database = await OpenDatabase();

  return database.getAllFromIndex('site_bindings', 'by_series', series_id);
}

export async function UpsertSiteBinding(input: {
  hostname: string;
  series_path_pattern: string | null;
  series_id: string;
}): Promise<SiteBindingRecord> {
  const database = await OpenDatabase();
  const transaction = database.transaction('site_bindings', 'readwrite');
  const hostname_bindings = await transaction.store
    .index('by_hostname')
    .getAll(input.hostname);
  const existing_binding = hostname_bindings.find(binding =>
    IsSameBinding(binding, input)
  );
  const binding: SiteBindingRecord = {
    binding_id: existing_binding?.binding_id ?? crypto.randomUUID(),
    hostname: input.hostname,
    series_path_pattern: input.series_path_pattern,
    series_id: input.series_id,
    confirmed_at: new Date().toISOString()
  };

  await transaction.store.put(binding);
  await transaction.done;

  return binding;
}

export async function DeleteSiteBinding(binding_id: string): Promise<void> {
  const database = await OpenDatabase();

  await database.delete('site_bindings', binding_id);
}
