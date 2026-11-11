const BASE64_CHUNK_BYTES = 32_768;
// Base64 encodes each group of 3 bytes as 4 characters, padding the last group.
const BASE64_BYTES_PER_GROUP = 3;
const BASE64_CHARACTERS_PER_GROUP = 4;

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

// Text that is not base64 makes `atob` throw; the error propagates.
export function Base64ToBytes(base64_text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64_text);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function ComputeBase64Length(byte_count: number): number {
  return (
    BASE64_CHARACTERS_PER_GROUP * Math.ceil(byte_count / BASE64_BYTES_PER_GROUP)
  );
}
