function CountBigrams(code_points: string[]): Map<string, number> {
  const bigram_counts = new Map<string, number>();

  for (let index = 0; index < code_points.length - 1; index++) {
    const bigram = code_points[index] + code_points[index + 1];

    bigram_counts.set(bigram, (bigram_counts.get(bigram) ?? 0) + 1);
  }

  return bigram_counts;
}

export function DiceSimilarity(left: string, right: string): number {
  const left_text = left.replace(/\s+/g, '');
  const right_text = right.replace(/\s+/g, '');

  if (left_text === right_text) return left_text === '' ? 0 : 1;

  const left_code_points = Array.from(left_text);
  const right_code_points = Array.from(right_text);

  if (left_code_points.length < 2 || right_code_points.length < 2) return 0;

  const left_bigrams = CountBigrams(left_code_points);
  const right_bigrams = CountBigrams(right_code_points);
  let shared_count = 0;

  for (const [bigram, left_count] of left_bigrams) {
    shared_count += Math.min(left_count, right_bigrams.get(bigram) ?? 0);
  }

  return (
    (2 * shared_count) /
    (left_code_points.length - 1 + right_code_points.length - 1)
  );
}
