export type SetSeriesAutoTranslateMessage = {
  action: 'set-series-auto-translate';
  series_id: string;
  is_auto_translate_enabled: boolean;
};

export type SetSeriesAutoTranslateResponse =
  { success: true; is_auto_translate_enabled: boolean } | { success: false };
