import type { ReadingDirection } from '@/features/settings';
import { AppError } from '@/lib/app-error';
import type { AiProvider, ReasoningEffortLevel } from '@/services/ai-provider';
import type { SourceLanguage, TextRegion } from '@/services/database';
import { IMAGE_READING_TEMPERATURE } from '../constants/pipeline';
import { IMAGE_READING_SYSTEM_PROMPT } from '../constants/prompts';
import { IMAGE_READING_JSON_SCHEMA } from '../constants/response-schemas';
import { BuildImageReadingUserText } from '../lib/build-user-text';
import { ComputeTiles } from '../lib/compute-tiles';
import {
  MergeTileRegions,
  PickSourceLanguage
} from '../lib/merge-tile-regions';
import { ValidateImageReadingResponse } from '../lib/validate-image-reading';
import type { ImageTile, NormalizedRegion } from '../types/pipeline';
import { EncodeTileAsJpegBase64, ReadImageSize } from './image-codec.service';
import { RunJsonStage } from './run-json-stage.service';
import { SnapPageRegions } from './snap-page-regions.service';

type ReadPageImageInput = {
  image_blob: Blob;
  provider: AiProvider;
  model: string;
  reasoning_effort: ReasoningEffortLevel | null;
  reading_direction: ReadingDirection;
  signal: AbortSignal;
};

type ReadPageImageResult = {
  width_px: number;
  height_px: number;
  source_language: SourceLanguage;
  regions: TextRegion[];
  model: string;
};

export async function ReadPageImage(
  input: ReadPageImageInput
): Promise<ReadPageImageResult> {
  const { width_px, height_px } = await ReadImageSize(input.image_blob);
  const tiles = ComputeTiles(width_px, height_px);

  if (tiles.length === 0) {
    throw new AppError('IMAGE_FETCH_FAILED', 'Unable to read this image.');
  }

  const tile_readings: { tile: ImageTile; regions: NormalizedRegion[] }[] = [];
  const languages: SourceLanguage[] = [];
  let model = input.model;

  for (const tile of tiles) {
    const tile_base64 = await EncodeTileAsJpegBase64(input.image_blob, tile);
    const result = await RunJsonStage({
      provider: input.provider,
      request: {
        model: input.model,
        system_prompt: IMAGE_READING_SYSTEM_PROMPT,
        user_text: BuildImageReadingUserText({
          reading_direction: input.reading_direction,
          tile_index: tile.tile_index,
          tile_count: tiles.length
        }),
        images_base64_jpeg: [tile_base64],
        json_schema: IMAGE_READING_JSON_SCHEMA,
        temperature: IMAGE_READING_TEMPERATURE,
        reasoning_effort: input.reasoning_effort
      },
      Validate: ValidateImageReadingResponse,
      signal: input.signal
    });

    tile_readings.push({ tile, regions: result.value.regions });
    languages.push(result.value.source_language);
    model = result.model;
  }

  return {
    width_px,
    height_px,
    source_language: PickSourceLanguage(languages),
    regions: await SnapPageRegions(
      input.image_blob,
      MergeTileRegions(tile_readings)
    ),
    model
  };
}
