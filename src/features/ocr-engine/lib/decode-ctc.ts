import { AppError } from '@/lib/app-error';
import { CLASS_COUNT_MISMATCH_MESSAGE } from '../constants/ocr-engine';
import type { DecodedText, TensorData } from '../types/ocr-engine';

const BLANK_CLASS = '';
const SPACE_CLASS = ' ';
const BLANK_CLASS_INDEX = 0;
const NO_PREVIOUS_CLASS_INDEX = -1;
const OUTPUT_DIM_COUNT = 3;
const OUTPUT_MISMATCH_MESSAGE =
  'The recognition output does not match its classes.';

/**
 * Builds the recognizer's class list (spec 0002 §6.1): the CTC blank first,
 * then the dictionary, then a space class when the model has one more class.
 * Any other class count means the model and its dictionary do not match.
 */
export function BuildCharacterClasses(
  character_dict: readonly string[],
  class_count: number
): string[] {
  if (class_count === character_dict.length + 1) {
    return [BLANK_CLASS, ...character_dict];
  }

  if (class_count === character_dict.length + 2) {
    return [BLANK_CLASS, ...character_dict, SPACE_CLASS];
  }

  throw new AppError('OCR_UNAVAILABLE', CLASS_COUNT_MISMATCH_MESSAGE);
}

function ReadStepCount(output: TensorData, class_count: number): number {
  const [item_count, step_count, output_class_count] = output.dims;
  const is_matching_output =
    output.dims.length === OUTPUT_DIM_COUNT &&
    output_class_count === class_count &&
    item_count * step_count * output_class_count === output.data.length;

  if (!is_matching_output) throw new Error(OUTPUT_MISMATCH_MESSAGE);

  return step_count;
}

// Ties go to the lower class.
function FindBestClassIndex(
  data: Float32Array,
  step_offset: number,
  class_count: number
): number {
  let best_class_index = 0;

  for (let class_index = 1; class_index < class_count; class_index++) {
    if (
      data[step_offset + class_index] > data[step_offset + best_class_index]
    ) {
      best_class_index = class_index;
    }
  }

  return best_class_index;
}

function DecodeItem(
  data: Float32Array,
  item_offset: number,
  step_count: number,
  character_classes: readonly string[]
): DecodedText {
  const class_count = character_classes.length;
  let text = '';
  let probability_sum = 0;
  let kept_step_count = 0;
  let previous_class_index = NO_PREVIOUS_CLASS_INDEX;

  for (let step_index = 0; step_index < step_count; step_index++) {
    const step_offset = item_offset + step_index * class_count;
    const class_index = FindBestClassIndex(data, step_offset, class_count);
    const is_kept_step =
      class_index !== BLANK_CLASS_INDEX && class_index !== previous_class_index;

    previous_class_index = class_index;

    if (!is_kept_step) continue;

    text += character_classes[class_index];
    probability_sum += data[step_offset + class_index];
    kept_step_count++;
  }

  return {
    text: text.trim(),
    score: kept_step_count === 0 ? 0 : probability_sum / kept_step_count
  };
}

/**
 * Greedy CTC decoding of a recognition output shaped [items, steps, classes]
 * (spec 0002 §6.4 step 5): the best class per step, without blanks and
 * repeats. The score is the mean probability of the kept steps.
 */
export function DecodeCtcBatch(
  output: TensorData,
  character_classes: readonly string[]
): DecodedText[] {
  const class_count = character_classes.length;
  const step_count = ReadStepCount(output, class_count);
  const item_count = output.dims[0];
  const item_size = step_count * class_count;

  return Array.from({ length: item_count }, (_, item_index) =>
    DecodeItem(
      output.data,
      item_index * item_size,
      step_count,
      character_classes
    )
  );
}
