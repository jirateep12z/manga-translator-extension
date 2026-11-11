import { FAILSAFE_SCHEMA, load } from 'js-yaml';

// "1./255." in PaddleOCR configs means 1 / 255.
const SCALE_FRACTION_PATTERN = /^\s*([^/]+)\/([^/]+)\s*$/;
const NORMALIZE_VALUE_COUNT = 3;
const IMAGE_SHAPE_LENGTH = 3;
const IMAGE_CHANNEL_COUNT = 3;

function IsRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function CreateFieldError(field_path) {
  return new Error(`Invalid or missing ${field_path} in inference.yml.`);
}

// FAILSAFE_SCHEMA keeps every scalar as text, so numbers are parsed here.
function ParseNumber(value) {
  return typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : Number.NaN;
}

function ReadText(value, field_path) {
  if (typeof value !== 'string' || value === '') {
    throw CreateFieldError(field_path);
  }

  return value;
}

function ReadFiniteNumber(value, field_path) {
  const number = ParseNumber(value);

  if (!Number.isFinite(number)) throw CreateFieldError(field_path);

  return number;
}

function ReadPositiveNumber(value, field_path) {
  const number = ReadFiniteNumber(value, field_path);

  if (number <= 0) throw CreateFieldError(field_path);

  return number;
}

function ReadPositiveInteger(value, field_path) {
  const number = ParseNumber(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw CreateFieldError(field_path);
  }

  return number;
}

function ReadNormalizeValues(value, field_path, ReadValue) {
  if (!Array.isArray(value) || value.length !== NORMALIZE_VALUE_COUNT) {
    throw CreateFieldError(field_path);
  }

  return value.map(item => ReadValue(item, field_path));
}

function ReadScale(value) {
  const field_path = 'NormalizeImage.scale';
  const fraction =
    typeof value === 'string' ? SCALE_FRACTION_PATTERN.exec(value) : null;
  const scale = fraction
    ? ParseNumber(fraction[1]) / ParseNumber(fraction[2])
    : ParseNumber(value);

  if (!Number.isFinite(scale) || scale <= 0) {
    throw CreateFieldError(field_path);
  }

  return scale;
}

function ReadImageShape(value) {
  const field_path = 'RecResizeImg.image_shape';

  if (!Array.isArray(value) || value.length !== IMAGE_SHAPE_LENGTH) {
    throw CreateFieldError(field_path);
  }

  const image_shape = value.map(item => ReadPositiveInteger(item, field_path));

  if (image_shape[0] !== IMAGE_CHANNEL_COUNT) {
    throw CreateFieldError(field_path);
  }

  return image_shape;
}

function ReadCharacterDict(value) {
  const is_valid =
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(character => typeof character === 'string');

  if (!is_valid) throw CreateFieldError('PostProcess.character_dict');

  return [...value];
}

function FindTransformStep(document, step_name) {
  const pre_process = IsRecord(document.PreProcess) ? document.PreProcess : {};
  const transform_ops = Array.isArray(pre_process.transform_ops)
    ? pre_process.transform_ops
    : [];
  const step = transform_ops.find(
    operation => IsRecord(operation) && Object.hasOwn(operation, step_name)
  );

  return step && IsRecord(step[step_name]) ? step[step_name] : {};
}

function BuildDetectionConfig(document, model_name) {
  const post_process = IsRecord(document.PostProcess)
    ? document.PostProcess
    : {};
  const normalize_image = FindTransformStep(document, 'NormalizeImage');

  return {
    model_name,
    thresh: ReadPositiveNumber(post_process.thresh, 'PostProcess.thresh'),
    box_thresh: ReadPositiveNumber(
      post_process.box_thresh,
      'PostProcess.box_thresh'
    ),
    unclip_ratio: ReadPositiveNumber(
      post_process.unclip_ratio,
      'PostProcess.unclip_ratio'
    ),
    max_candidates: ReadPositiveInteger(
      post_process.max_candidates,
      'PostProcess.max_candidates'
    ),
    mean: ReadNormalizeValues(
      normalize_image.mean,
      'NormalizeImage.mean',
      ReadFiniteNumber
    ),
    std: ReadNormalizeValues(
      normalize_image.std,
      'NormalizeImage.std',
      ReadPositiveNumber
    ),
    scale: ReadScale(normalize_image.scale)
  };
}

function BuildRecognitionConfig(document, model_name) {
  const post_process = IsRecord(document.PostProcess)
    ? document.PostProcess
    : {};
  const rec_resize_img = FindTransformStep(document, 'RecResizeImg');

  return {
    model_name,
    image_shape: ReadImageShape(rec_resize_img.image_shape),
    character_dict: ReadCharacterDict(post_process.character_dict)
  };
}

/**
 * Builds the config.json fields of spec 0002 §5.3 from a PaddleOCR
 * inference.yml. Throws when the YAML is malformed or a field is invalid.
 */
export function BuildModelConfig(yaml_text, role) {
  const parsed_document = load(yaml_text, { schema: FAILSAFE_SCHEMA });
  const document = IsRecord(parsed_document) ? parsed_document : {};
  const global_section = IsRecord(document.Global) ? document.Global : {};
  const model_name = ReadText(global_section.model_name, 'Global.model_name');

  if (role === 'detection') return BuildDetectionConfig(document, model_name);
  if (role === 'recognition') {
    return BuildRecognitionConfig(document, model_name);
  }

  throw new Error(`Unknown model role: ${role}`);
}
