import { MAX_SERIES_TITLE_LENGTH } from '../constants/memory-manager';

export type SeriesTitleValidation =
  { is_valid: true; title: string } | { is_valid: false; error: string };

export function ValidateSeriesTitle(text: string): SeriesTitleValidation {
  const title = text.trim();

  if (title === '') return { is_valid: false, error: 'Enter a title.' };

  if (title.length > MAX_SERIES_TITLE_LENGTH) {
    return {
      is_valid: false,
      error: `Use ${MAX_SERIES_TITLE_LENGTH} characters or fewer.`
    };
  }

  return { is_valid: true, title };
}
