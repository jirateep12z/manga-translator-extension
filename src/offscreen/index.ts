import { CreateOcrEngine } from '@/features/ocr-engine';
import { CreateOcrMessageHandler } from './services/ocr-message-handler.service';

// ONNX Runtime starts its WASM threads as module workers that load this same
// bundle. Workers have no document, so only the offscreen document listens.
if (typeof document !== 'undefined') {
  chrome.runtime.onMessage.addListener(
    CreateOcrMessageHandler(
      CreateOcrEngine({
        ResolveAssetUrl: asset_path => chrome.runtime.getURL(asset_path)
      })
    )
  );
}
