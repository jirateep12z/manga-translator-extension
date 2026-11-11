// Reads file entries from an uncompressed tar archive (ustar, pax, or GNU).
const BLOCK_SIZE = 512;
const NAME_OFFSET = 0;
const NAME_LENGTH = 100;
const SIZE_OFFSET = 124;
const SIZE_LENGTH = 12;
const TYPEFLAG_OFFSET = 156;
const MAGIC_OFFSET = 257;
// POSIX ustar and pax archives. GNU archives write "ustar " and keep other
// data where the prefix would be, so their prefix is not read.
const POSIX_MAGIC = 'ustar\0';
const PREFIX_OFFSET = 345;
const PREFIX_LENGTH = 155;
// '0' and NUL both mark a regular file.
const REGULAR_FILE_TYPEFLAGS = new Set([0x30, 0x00]);
const OCTAL_PATTERN = /^[0-7]+$/;
const TEXT_DECODER = new TextDecoder();

function ReadText(header, offset, length) {
  const field = header.subarray(offset, offset + length);
  const end_index = field.indexOf(0);

  return TEXT_DECODER.decode(
    end_index === -1 ? field : field.subarray(0, end_index)
  );
}

function ReadEntryName(header) {
  const name = ReadText(header, NAME_OFFSET, NAME_LENGTH);
  const magic = TEXT_DECODER.decode(
    header.subarray(MAGIC_OFFSET, MAGIC_OFFSET + POSIX_MAGIC.length)
  );
  const prefix =
    magic === POSIX_MAGIC ? ReadText(header, PREFIX_OFFSET, PREFIX_LENGTH) : '';

  return prefix === '' ? name : `${prefix}/${name}`;
}

function ReadEntrySize(header) {
  const size_text = ReadText(header, SIZE_OFFSET, SIZE_LENGTH).trim();
  const size = OCTAL_PATTERN.test(size_text)
    ? Number.parseInt(size_text, 8)
    : Number.NaN;

  if (!Number.isSafeInteger(size)) {
    throw new Error('Invalid archive entry size');
  }

  return size;
}

function IsUnsafeEntryName(name) {
  return name.includes('..') || name.startsWith('/');
}

function IsEmptyBlock(block) {
  return block.every(byte => byte === 0);
}

/**
 * Returns a copy of each wanted regular file's bytes, by entry name. Every
 * entry name is checked, and a missing wanted entry fails the read.
 */
export function ReadTarEntries(archive_bytes, wanted_names) {
  const wanted_name_set = new Set(wanted_names);
  const entries = new Map();
  let offset = 0;

  while (offset + BLOCK_SIZE <= archive_bytes.length) {
    const header = archive_bytes.subarray(offset, offset + BLOCK_SIZE);

    if (IsEmptyBlock(header)) break;

    const name = ReadEntryName(header);

    if (IsUnsafeEntryName(name)) {
      throw new Error(`Unsafe archive entry name: ${name}`);
    }

    const size = ReadEntrySize(header);
    const data_start = offset + BLOCK_SIZE;
    const data_end = data_start + size;

    if (data_end > archive_bytes.length) throw new Error('Truncated archive');

    const is_wanted_file =
      REGULAR_FILE_TYPEFLAGS.has(header[TYPEFLAG_OFFSET]) &&
      wanted_name_set.has(name);

    if (is_wanted_file) {
      entries.set(name, archive_bytes.slice(data_start, data_end));
    }

    offset = data_start + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
  }

  const missing_name = wanted_names.find(name => !entries.has(name));

  if (missing_name !== undefined) {
    throw new Error(`Missing archive entry: ${missing_name}`);
  }

  return entries;
}
