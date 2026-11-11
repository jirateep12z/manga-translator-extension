import type { RgbColor } from '@/types/rgb-color';
import { PAPER_MAX_DISTANCE } from '../constants/region-appearance';
import type {
  ImageSize,
  PixelBox,
  RgbaImage
} from '../types/region-appearance';
import {
  ExpandPixelBox,
  IsPixelBoxOverlapping,
  IsPixelInBox
} from './pixel-box';
import { MeasureDistanceAt } from './pixel-sampling';

// The box expanded by the pad, or the box itself when that expansion would
// overlap another region's box (spec 0003 §6.5).
export function ComputePaddedBox(
  box: PixelBox,
  pad_px: number,
  other_boxes: readonly PixelBox[],
  image_size: ImageSize
): PixelBox {
  const expanded_box = ExpandPixelBox(box, pad_px, image_size);
  const is_overlapping = other_boxes.some(other_box =>
    IsPixelBoxOverlapping(expanded_box, other_box)
  );

  return is_overlapping ? box : expanded_box;
}

// True when every pixel of the line is paper and outside every blocked box.
function IsLineClear(input: {
  image: RgbaImage;
  line: PixelBox;
  background_color: RgbColor;
  blocked_boxes: readonly PixelBox[];
}): boolean {
  const { image, line, background_color, blocked_boxes } = input;

  for (let y_px = line.top_px; y_px < line.bottom_px; y_px++) {
    for (let x_px = line.left_px; x_px < line.right_px; x_px++) {
      const distance = MeasureDistanceAt(
        image,
        y_px * image.width_px + x_px,
        background_color
      );

      if (distance >= PAPER_MAX_DISTANCE) return false;

      for (const blocked_box of blocked_boxes) {
        if (IsPixelInBox(blocked_box, x_px, y_px)) return false;
      }
    }
  }

  return true;
}

// Grows the box one pixel per side and round, over paper, inside the padded
// box and outside the blocked boxes (spec 0003 §6.5).
export function GrowCoverBox(input: {
  image: RgbaImage;
  box: PixelBox;
  padded_box: PixelBox;
  background_color: RgbColor;
  blocked_boxes: readonly PixelBox[];
}): PixelBox {
  const { image, box, padded_box, background_color, blocked_boxes } = input;
  let cover_box = box;
  let is_growing = true;

  function TryGrow(line: PixelBox, grown_box: PixelBox): void {
    const is_inside_padded_box =
      line.left_px >= padded_box.left_px &&
      line.right_px <= padded_box.right_px &&
      line.top_px >= padded_box.top_px &&
      line.bottom_px <= padded_box.bottom_px;

    if (
      is_inside_padded_box &&
      IsLineClear({ image, line, background_color, blocked_boxes })
    ) {
      cover_box = grown_box;
      is_growing = true;
    }
  }

  while (is_growing) {
    is_growing = false;
    TryGrow(
      {
        ...cover_box,
        top_px: cover_box.top_px - 1,
        bottom_px: cover_box.top_px
      },
      { ...cover_box, top_px: cover_box.top_px - 1 }
    );
    TryGrow(
      {
        ...cover_box,
        top_px: cover_box.bottom_px,
        bottom_px: cover_box.bottom_px + 1
      },
      { ...cover_box, bottom_px: cover_box.bottom_px + 1 }
    );
    TryGrow(
      {
        ...cover_box,
        left_px: cover_box.left_px - 1,
        right_px: cover_box.left_px
      },
      { ...cover_box, left_px: cover_box.left_px - 1 }
    );
    TryGrow(
      {
        ...cover_box,
        left_px: cover_box.right_px,
        right_px: cover_box.right_px + 1
      },
      { ...cover_box, right_px: cover_box.right_px + 1 }
    );
  }

  return cover_box;
}
