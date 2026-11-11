import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { VALID_IMAGE_READERS } from '../constants/settings';
import { ChangeImageReader } from '../lib/change-stage-settings';
import type { ImageReader, Settings } from '../types/settings';

const IMAGE_READER_OPTIONS: { value: ImageReader; label: string }[] = [
  { value: 'ocr', label: 'On-device OCR' },
  { value: 'ai', label: 'AI model' }
];
const OCR_READER_DESCRIPTION_ID = 'image-reader-description';

type ImageReaderFieldProps = {
  settings: Settings;
  OnSettingsChange: (next_settings: Settings) => void;
};

export function ImageReaderField({
  settings,
  OnSettingsChange
}: ImageReaderFieldProps) {
  const is_ocr_reader = settings.image_reading.reader === 'ocr';

  return (
    <Field>
      <FieldLabel htmlFor="image-reader">Reader</FieldLabel>
      <Select
        value={settings.image_reading.reader}
        onValueChange={next_reader => {
          if (VALID_IMAGE_READERS.has(next_reader)) {
            OnSettingsChange(
              ChangeImageReader(settings, next_reader as ImageReader)
            );
          }
        }}
      >
        <SelectTrigger
          id="image-reader"
          className="w-full"
          aria-describedby={
            is_ocr_reader ? OCR_READER_DESCRIPTION_ID : undefined
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {IMAGE_READER_OPTIONS.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {is_ocr_reader ? (
        <FieldDescription id={OCR_READER_DESCRIPTION_ID}>
          Reads Korean, Japanese, Chinese, and English text on this device.
          Images are not uploaded.
        </FieldDescription>
      ) : null}
    </Field>
  );
}
