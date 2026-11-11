export function CreateChunkedBody(
  text: string,
  chunk_size: number
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();

        return;
      }

      controller.enqueue(bytes.slice(offset, offset + chunk_size));
      offset += chunk_size;
    }
  });
}
