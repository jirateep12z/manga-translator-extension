# Manga Translator

Translate manga in place with a cross-site story memory, using OpenRouter or Ollama.

Manga Translator is a Chrome extension (Manifest V3) for readers who want to read Korean, Japanese, Chinese, or English manga in Thai or English without leaving the reading website. By default, it reads each page with on-device OCR, so page images stay on your computer; you can choose a vision-capable AI model to read pages instead. It translates the text with an AI model and draws the translation over the original speech bubbles. A local memory of characters, terms, and chapter summaries keeps translations consistent, and the same series keeps its memory across different reading websites. There is no backend: the extension talks only to the reading website, OpenRouter, and your own Ollama instance.

Built with React 19, TypeScript, Vite, Tailwind CSS v4, and shadcn/ui.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Features](#features)
- [Provider Setup](#provider-setup)
- [On-Device OCR](#on-device-ocr)
- [Privacy](#privacy)
- [Permissions](#permissions)
- [Development](#development)
- [Third-Party Licenses](#third-party-licenses)
- [Show your support](#show-your-support)
- [Author](#author)
- [License](#license)

## Install

Prerequisites:

- Node.js and npm
- Google Chrome (or another Chromium-based browser that supports Manifest V3)

Install the dependencies and build the extension into `dist`:

```sh
npm install
npm run build
```

The first build downloads the on-device OCR models; see [On-Device OCR](#on-device-ocr).

Load the extension in Chrome:

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" (toggle in the top right).
3. Click "Load unpacked".
4. Select the `dist` folder from this project.

## Usage

1. Open the options page and set up a translation provider; see [Provider Setup](#provider-setup).
2. Open a chapter on a reading website. When the page has at least three manga images, a floating panel appears.
3. Press "Translate chapter" in the panel, or start translation from the extension popup.
4. Click a translation to see the original text, or use "Show original" to hide every overlay.

The "Extension enabled" switch in the popup turns the on-page panel off and on.

After changing the source, rebuild the extension, then click the reload button on the extension card:

```sh
npm run build
```

Reload any reading page that was open before the extension was installed or updated.

## Features

### On-Page Translation

- **One-Click Chapter Translation**: A floating panel finds the manga images on the page and translates them one at a time, starting from the page you are viewing, with progress, Pause, Resume, and Stop.
- **Auto-Translate per Series**: The first "Translate chapter" press in a series turns on auto-translate for that series, so each chapter you open later translates without a click. The "Auto-translate this series" checkbox in the panel turns it off.
- **Saved Translations on Open**: A chapter translated before shows its saved translations as soon as it opens, without an AI call, even when auto-translate is off.
- **Next-Chapter Preload**: After a chapter of an auto-translate series finishes, the extension opens the next chapters one at a time in a minimized window and translates the pages that load there, so they show translations as soon as you open them. "Next chapters to prepare" in Settings sets how many (Off, or 1 to 5; 3 by default). Unchecking "Auto-translate this series" stops it.
- **On-Device OCR**: PaddleOCR models run inside the extension with ONNX Runtime Web, on WebGPU when it is available and on WebAssembly otherwise. They read Korean, Japanese, Chinese, and English pages, and only the text is sent for translation. See [On-Device OCR](#on-device-ocr) for its known limits.
- **Overlay Translations**: Each translation blends into the page. Inside a speech bubble or caption box, it fills the frame in the frame's own colors. On flat paper, a patch matches the paper. Inside a bubble or box on a gradient or pattern, a small soft blur hides the original text, and the translation gets an outline in a contrasting color. Sound effects, and text outside bubbles and boxes on artwork, dark, or patterned backgrounds, stay visible, with a small label below them. Text that the translation leaves unchanged, such as a logo, and pages already in the target language are left as they are. Translations use the Itim font, or the extension's standard fonts when Itim cannot load. The overlays stay aligned while you scroll or resize the window. Click a translation to see the original, or use "Show original" to hide every overlay.
- **Lazy-Loading Readers**: Images that load later, including readers that keep the real image URL in `data-src`, are picked up and added to the queue.
- **Per-Page Retry**: A failed page shows a Retry button. When an image cannot be downloaded, the retry captures the visible page instead.
- **Single-Page App Navigation**: Moving to the next chapter without a page reload cancels the queue, clears the overlays, and detects the series again.
- **Isolated Styling**: The panel lives in a closed shadow root and follows the extension theme, unaffected by the website's own CSS.

### Series Memory

- **Cross-Site Series Detection**: The extension matches the page title against known series. On a new website it asks you to confirm the series once, then links that website automatically.
- **Characters and Terms**: Names and terms found while translating are stored with their Thai and English translations, gender, and notes, and are reused on every later page.
- **Edit and Lock**: You can edit any translation. Edited entries are marked as user-edited, and locked entries are always used as written.
- **Speech Profiles**: For Thai, each character's self pronoun and sentence ending; for both languages, how the character addresses others. AI fills each value the first time it sees it. The **Speech** button lets you edit and lock values.
- **Automatic Name Correction**: When the model reports using a wrong spelling of a known name, the spelling is replaced and remembered as a spelling to avoid.
- **Dialogue Context**: About the last 40 lines of the chapter, instead of the last three pages.
- **Chapter Summaries**: Each finished chapter is summarized so that later chapters get story context. Summaries and the series synopsis are editable, and "Summarize again" regenerates one.
- **Merge Series**: Combine two series that are the same work, with a preview of what moves before you confirm.

### Cache and Data

- **Translation Cache**: Reopening a translated chapter in the same target language shows the stored translations without new AI calls, unless you changed the Reader since then. The cache keeps up to 2,000 page readings and removes the least recently used ones first. Chapters translated before overlay blending get the new look the next time you translate them: the extension downloads each page image once more and analyzes it on your computer, with no AI call. Pages read from a screen capture keep the old look.
- **Export and Import**: Export series, characters, terms, chapter summaries, and site links to a JSON file, and import it into another browser profile. Import shows a preview first and never deletes existing data. Files over 20 MB are rejected. Exports carry each character's speech profile and wrong spellings, and files exported before this update still import.
- **Clear Cache**: Remove cached translations while keeping your memory.

### Popup and Options

- **Popup**: Shows the current page's series, chapter, image count, and provider status, and starts translation, retranslation, or a series change on that page.
- **Options Page**: Manage series, characters and terms, chapters, and site links. Configure providers and preferences. Export, import, and clear data.

## Provider Setup

Translation runs in two stages: **image reading** and **translation**. Open the options page and go to **Settings**.

- **Reader**: **On-device OCR**, the default, reads page text on your computer. **AI model** sends each page image to a vision model instead; its provider and model fields appear below the Reader field.
- **Translation**: choose OpenRouter or Ollama, select the refresh button to load the model list, and pick a model. With the AI model reader, **Same as image reading** reuses the image-reading model.
- **Thinking**: for OpenRouter models that report reasoning settings, choose how much the model reasons before it answers. **Off** appears only when the model allows it. Ollama models have no Thinking field.

### OpenRouter

1. Create an API key at [openrouter.ai](https://openrouter.ai/).
2. Paste the key into **OpenRouter API key** and select **Test**.
3. With the AI model reader, choose a vision-capable model for image reading. Text-only models are hidden from that list.

### Ollama

1. Install [Ollama](https://ollama.com/) and pull a model for translation. Pull a vision model only if you use the AI model reader, for example:

   ```sh
   ollama pull qwen2.5vl
   ```

2. The default URL is `http://localhost:11434`. Enter a different URL in **Ollama URL** if needed, including `http://` or `https://`.
3. Select **Test**. If it reports that Ollama blocked the request, allow the extension's origin with the `OLLAMA_ORIGINS` environment variable (for example, `OLLAMA_ORIGINS=chrome-extension://*`) and restart Ollama.

## On-Device OCR

The first `npm run build` downloads three PaddleOCR models (about 45 MB) from the PaddleOCR model host, checks their SHA-256 checksums, and packages them with the ONNX Runtime Web binary. Later builds reuse the verified files, and the extension never downloads code or models while it runs. The package grows by about 75 MB.

OCR runs in a hidden extension page (an offscreen document) that opens when a chapter starts and closes after 5 idle minutes.

Known limits:

- Stylized sound effects are often misread. Text read with low confidence is skipped, so the original artwork stays visible there.
- Small horizontal Japanese captions with furigana can be missed or split.
- Website watermarks are translated like other text.
- Chinese pages and scanned Japanese raws have been tested less than Korean, Japanese, and English pages.

## Privacy

With the on-device OCR reader, page images stay on your computer and only the page text is sent to the translation provider. With the AI model reader, page images are sent as well. When you select OpenRouter, that data goes to OpenRouter and the model provider it routes to; when you select Ollama, it stays on your machine. Settings, memory, and the cache are stored locally in the browser. Exports never include your API key. For series with auto-translate on, the extension also opens the reading website's next chapters in a minimized window to translate them ahead.

## Permissions

| Permission              | Why it is needed                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `storage`               | Save settings in `chrome.storage.local`.                                                                  |
| `unlimitedStorage`      | Keep the series memory and translation cache in IndexedDB without the default storage quota.              |
| `declarativeNetRequest` | Send the reading website's `Referer` header when downloading page images, which many image hosts require. |
| `offscreen`             | Run the on-device OCR models in a hidden extension page.                                                  |
| `alarms`                | Close that page after 5 idle minutes to free its memory.                                                  |
| `<all_urls>`            | Run the page scanner on any reading website and download its images.                                      |

## Development

### Scripts

| Command                    | Description                                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Start the Vite dev server to preview the popup in a browser tab.                                                                                                                                                                              |
| `npm run build`            | Download the OCR models if needed, check the Tailwind CSS `@source` lists, type-check with `tsc -b`, build the popup, options page, offscreen OCR page, background, and content script into `dist`, then check the extension files in `dist`. |
| `npm run fetch-ocr-models` | Download and verify the OCR models into `public/ocr-models` (also run by `npm run build`).                                                                                                                                                    |
| `npm run ocr-parity`       | Start the development page that compares the OCR engine with PaddleOCR reference output. It needs local test pages in `tools/ocr-parity/fixtures`.                                                                                            |
| `npm run lint`             | Lint files in `src`.                                                                                                                                                                                                                          |
| `npm run lint:fix`         | Lint files in `src` and apply automatic fixes.                                                                                                                                                                                                |
| `npm run format`           | Format files in `src` with Prettier.                                                                                                                                                                                                          |

### Project Structure

```text
public/
  icons/                    # Extension icons
  manifest.json             # Manifest V3 definition
  ocr-models/               # OCR models, downloaded by the build, not committed
scripts/                    # Build steps: OCR model download and build checks
src/
  background/               # Background service worker entry
  content/                  # Content script entry, shadow host, and page app
  offscreen/                # Offscreen document entry that runs the OCR engine
  options/                  # Options page entry
  components/ui/            # shadcn/ui components
  constants/                # Shared constants
  features/
    chapter-preload/        # Next-chapter preload in a minimized window
    chapter-translation/    # Panel, translation queue, and chapter port
    memory/                 # Series, entity, chapter, and site-link repositories
    memory-manager/         # Options page series, chapters, and data sections
    ocr-engine/             # On-device OCR engine, ONNX Runtime Web
    ocr-reader/             # OCR text regions and the offscreen document client
    options/                # Options page shell and navigation
    overlay/                # Translation overlays and page badges
    page-scanner/           # Manga image detection on the page
    popup/                  # Popup app
    region-appearance/      # Text-region colors, frames, and boxes from page images
    series-detection/       # Page title parsing and series matching
    settings/               # Settings storage, form, and provider choice
    theme/                  # Theme hook and helpers
    translation-cache/      # Cached page readings and translations
    translation-pipeline/   # Image fetching and the two-stage AI pipeline
  services/
    ai-provider/            # OpenRouter and Ollama clients
    database/               # IndexedDB schema and connection
  hooks/                    # Shared React hooks
  lib/                      # Shared utilities
  types/                    # Shared types
  main.tsx                  # Popup entry point
  theme-init.ts             # Pre-render theme initialization
tools/
  ocr-parity/               # Development page that checks the OCR engine
index.html                  # Popup HTML
offscreen.html              # Offscreen document HTML
options.html                # Options page HTML
vite.config.ts              # Builds the popup, options page, and offscreen document
vite.background.config.ts   # Builds background.js as a single file
vite.content.config.ts      # Builds content.js
```

## Third-Party Licenses

- The packaged PaddleOCR models are licensed under Apache-2.0.
- ONNX Runtime Web is licensed under MIT.
- The Itim font, used for the overlays, is licensed under the SIL Open Font License 1.1 (OFL-1.1).

## Show your support

Give a ⭐️ if this project helped you!

## Author

**Made with ❤️ by @jirateep12z**

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 Jirateep Lumvasana
