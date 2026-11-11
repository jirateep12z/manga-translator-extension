// The element at index floor(n / 2) of the values sorted in ascending order
// (spec 0003 §6.1). Throws a RangeError for an empty list.
export function CalculateMedian(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('CalculateMedian needs at least one value.');
  }

  const sorted_values = [...values].sort((first, second) => first - second);

  return sorted_values[Math.floor(sorted_values.length / 2)];
}
