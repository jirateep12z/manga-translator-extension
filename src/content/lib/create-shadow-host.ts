import {
  DOCUMENT_STYLE_ELEMENT_ID,
  HOST_Z_INDEX,
  SHADOW_HOST_TAG_NAME
} from '../constants/content';

export type ShadowHost = {
  host_element: HTMLElement;
  mount_element: HTMLDivElement;
  SetHidden: (is_hidden: boolean) => void;
  Remove: () => void;
};

let is_document_css_injected = false;
let has_logged_stylesheet_fallback = false;

function CreateStyleSheet(css_text: string): CSSStyleSheet | null {
  try {
    const sheet = new CSSStyleSheet();

    sheet.replaceSync(css_text);

    return sheet;
  } catch {
    if (!has_logged_stylesheet_fallback) {
      has_logged_stylesheet_fallback = true;
      console.warn('[content] constructable stylesheet unavailable');
    }

    return null;
  }
}

export function CreateShadowHost(shadow_css: string): ShadowHost {
  const host_element = document.createElement(SHADOW_HOST_TAG_NAME);

  host_element.style.cssText = `all: initial; display: block; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: ${HOST_Z_INDEX}; font-size: 16px;`;

  const shadow_root = host_element.attachShadow({ mode: 'closed' });
  const sheet = CreateStyleSheet(shadow_css);

  if (sheet) {
    shadow_root.adoptedStyleSheets = [sheet];
  } else {
    const style_element = document.createElement('style');

    style_element.textContent = shadow_css;
    shadow_root.append(style_element);
  }

  const mount_element = document.createElement('div');

  shadow_root.append(mount_element);
  document.documentElement.append(host_element);

  return {
    host_element,
    mount_element,
    SetHidden: is_hidden => {
      host_element.style.visibility = is_hidden ? 'hidden' : '';
    },
    Remove: () => host_element.remove()
  };
}

export function InjectDocumentCss(document_css: string): void {
  if (document_css === '' || is_document_css_injected) return;

  const sheet = CreateStyleSheet(document_css);

  is_document_css_injected = true;

  if (sheet) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

    return;
  }

  if (document.getElementById(DOCUMENT_STYLE_ELEMENT_ID)) return;

  const style_element = document.createElement('style');

  style_element.id = DOCUMENT_STYLE_ELEMENT_ID;
  style_element.textContent = document_css;
  (document.head ?? document.documentElement).append(style_element);
}
