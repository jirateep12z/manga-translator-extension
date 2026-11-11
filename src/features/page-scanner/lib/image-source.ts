const DATA_URL_PATTERN =
  /^data:([a-z]+\/[a-z0-9.+-]+)(?:;[^;,]*)*;base64,([\s\S]*)$/i;
const BASE64_CHUNK_BYTES = 0x8000;

export function ClassifyImageSource(
  source: string
): 'url' | 'inline' | 'unsupported' {
  if (/^https?:/i.test(source)) return 'url';
  if (/^(?:data|blob):/i.test(source)) return 'inline';

  return 'unsupported';
}

export function ParseDataUrl(
  data_url: string
): { mime_type: string; image_base64: string } | null {
  const match = DATA_URL_PATTERN.exec(data_url);

  if (!match) return null;

  return { mime_type: match[1], image_base64: match[2].replace(/\s+/g, '') };
}

export function ArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary_chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    binary_chunks.push(
      String.fromCharCode(
        ...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES)
      )
    );
  }

  return btoa(binary_chunks.join(''));
}
