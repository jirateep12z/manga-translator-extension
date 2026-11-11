import {
  MAX_IMPORT_FILE_BYTES,
  ValidateMemoryImport,
  type MemoryImportValidation
} from '@/features/memory';

export type ImportFileSource = { size: number; text: () => Promise<string> };

const MAX_IMPORT_FILE_MEGABYTES = MAX_IMPORT_FILE_BYTES / (1024 * 1024);

// The size is checked first so that an oversized file is never read.
export async function ReadImportFile(
  file: ImportFileSource,
  Validate: (value: unknown) => MemoryImportValidation = ValidateMemoryImport
): Promise<MemoryImportValidation> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      is_valid: false,
      error: `This file is larger than ${MAX_IMPORT_FILE_MEGABYTES} MB.`
    };
  }

  let parsed_value: unknown;

  try {
    parsed_value = JSON.parse(await file.text());
  } catch {
    return { is_valid: false, error: 'This file is not valid JSON.' };
  }

  return Validate(parsed_value);
}
