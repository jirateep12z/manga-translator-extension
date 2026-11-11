const TRAILING_CARRIAGE_RETURN_PATTERN = /\r$/;

export async function* ReadTextLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered_text = '';
  let is_stream_finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        is_stream_finished = true;
        break;
      }

      buffered_text += decoder.decode(value, { stream: true });
      let newline_index = buffered_text.indexOf('\n');

      while (newline_index !== -1) {
        yield buffered_text
          .slice(0, newline_index)
          .replace(TRAILING_CARRIAGE_RETURN_PATTERN, '');
        buffered_text = buffered_text.slice(newline_index + 1);
        newline_index = buffered_text.indexOf('\n');
      }
    }

    buffered_text += decoder.decode();

    if (buffered_text.length > 0) {
      yield buffered_text.replace(TRAILING_CARRIAGE_RETURN_PATTERN, '');
    }
  } finally {
    if (!is_stream_finished) {
      await reader.cancel().catch(() => {});
    }

    reader.releaseLock();
  }
}
