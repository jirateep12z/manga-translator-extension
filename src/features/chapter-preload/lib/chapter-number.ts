// A preload compares chapter numbers, so `url:` keys and typed text never
// start one (spec 0006 §3).
export function IsFiniteChapterNumber(chapter_number: string | null): boolean {
  return (
    chapter_number !== null &&
    chapter_number.trim() !== '' &&
    Number.isFinite(Number(chapter_number))
  );
}
