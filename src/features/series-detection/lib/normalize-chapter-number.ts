export function NormalizeChapterNumber(
  integer_part: string,
  decimal_part?: string
): string {
  const integer = integer_part.replace(/^0+(?=\d)/, '');
  const decimal = (decimal_part ?? '').replace(/0+$/, '');

  return decimal === '' ? integer : `${integer}.${decimal}`;
}
