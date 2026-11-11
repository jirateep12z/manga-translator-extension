import { IsRecord } from '@/lib/is-record';
import type { DetectionConfig, RecognitionConfig } from '../types/ocr-engine';

type NumberTriple = [number, number, number];

const TRIPLE_LENGTH = 3;
const IMAGE_CHANNEL_COUNT = 3;

function IsConfigObject(value: unknown): value is Record<string, unknown> {
  return IsRecord(value) && !Array.isArray(value);
}

function IsNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function IsFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function IsPositiveNumber(value: unknown): value is number {
  return IsFiniteNumber(value) && value > 0;
}

function IsPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function IsNumberTriple(
  value: unknown,
  IsValidNumber: (candidate: unknown) => candidate is number
): value is NumberTriple {
  return (
    Array.isArray(value) &&
    value.length === TRIPLE_LENGTH &&
    value.every(candidate => IsValidNumber(candidate))
  );
}

function IsImageShape(value: unknown): value is NumberTriple {
  return (
    IsNumberTriple(value, IsPositiveInteger) && value[0] === IMAGE_CHANNEL_COUNT
  );
}

function IsCharacterDict(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(entry => typeof entry === 'string')
  );
}

function CopyTriple(triple: NumberTriple): NumberTriple {
  return [triple[0], triple[1], triple[2]];
}

/**
 * Validates a detection model's config.json (spec 0002 §6.1). Returns a new
 * object with only the known fields, or null when any field is invalid.
 */
export function ParseDetectionConfig(value: unknown): DetectionConfig | null {
  if (!IsConfigObject(value)) return null;

  const {
    model_name,
    thresh,
    box_thresh,
    unclip_ratio,
    max_candidates,
    mean,
    std,
    scale
  } = value;

  if (
    !IsNonEmptyText(model_name) ||
    !IsPositiveNumber(thresh) ||
    !IsPositiveNumber(box_thresh) ||
    !IsPositiveNumber(unclip_ratio) ||
    !IsPositiveInteger(max_candidates) ||
    !IsNumberTriple(mean, IsFiniteNumber) ||
    !IsNumberTriple(std, IsPositiveNumber) ||
    !IsPositiveNumber(scale)
  ) {
    return null;
  }

  return {
    model_name,
    thresh,
    box_thresh,
    unclip_ratio,
    max_candidates,
    mean: CopyTriple(mean),
    std: CopyTriple(std),
    scale
  };
}

/**
 * Validates a recognition model's config.json (spec 0002 §6.1). Returns a new
 * object with only the known fields, or null when any field is invalid.
 */
export function ParseRecognitionConfig(
  value: unknown
): RecognitionConfig | null {
  if (!IsConfigObject(value)) return null;

  const { model_name, image_shape, character_dict } = value;

  if (
    !IsNonEmptyText(model_name) ||
    !IsImageShape(image_shape) ||
    !IsCharacterDict(character_dict)
  ) {
    return null;
  }

  return {
    model_name,
    image_shape: CopyTriple(image_shape),
    character_dict: [...character_dict]
  };
}
