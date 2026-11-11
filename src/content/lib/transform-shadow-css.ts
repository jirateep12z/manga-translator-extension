export type ShadowCssResult = { shadow_css: string; document_css: string };

const GLOBAL_RULE_PATTERN = /@(?:font-face|property)\b[^{]*\{[^{}]*\}/g;
const ROOT_SELECTOR_PATTERN = /:root(?![\w-])/g;
const REM_PATTERN = /(?<![\w.[\\-])(-?(?:\d*\.)?\d+)rem\b/g;
const ASSET_URL_PATTERN =
  /url\(\s*(['"]?)(?:\.{0,2}\/)*(assets\/[^'")\s]+)\1\s*\)/g;
const PX_PER_REM = 16;
const PX_DECIMAL_PLACES = 4;

function ConvertRemToPx(css_text: string): string {
  return css_text.replace(
    REM_PATTERN,
    (_match, rem_value: string) =>
      `${Number((Number(rem_value) * PX_PER_REM).toFixed(PX_DECIMAL_PLACES))}px`
  );
}

export function TransformShadowCss(
  css_text: string,
  ResolveAssetUrl: (asset_path: string) => string
): ShadowCssResult {
  const global_rules = css_text.match(GLOBAL_RULE_PATTERN) ?? [];
  const shadow_css = ConvertRemToPx(
    css_text
      .replace(GLOBAL_RULE_PATTERN, '')
      .replace(ROOT_SELECTOR_PATTERN, ':host')
  );
  const document_css = global_rules
    .join('\n')
    .replace(
      ASSET_URL_PATTERN,
      (_match, _quote: string, asset_path: string) =>
        `url("${ResolveAssetUrl(asset_path)}")`
    );

  return { shadow_css, document_css };
}
