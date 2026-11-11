import type { BboxPx } from '@/services/database';

type BoxStyle = { color: string; line_width_px: number; line_dash: number[] };
type TileOverlayInput = {
  image: ImageBitmap;
  line_boxes: BboxPx[];
  region_boxes: { region_id: string; bbox_px: BboxPx }[];
  failed_reference_boxes: BboxPx[];
};

// Each kind of box has its own line pattern, so they differ without color.
const LINE_BOX_STYLE: BoxStyle = {
  color: '#2563eb',
  line_width_px: 2,
  line_dash: []
};
const REGION_BOX_STYLE: BoxStyle = {
  color: '#dc2626',
  line_width_px: 3,
  line_dash: [8, 4]
};
const FAILED_REFERENCE_BOX_STYLE: BoxStyle = {
  color: '#d97706',
  line_width_px: 2,
  line_dash: [2, 3]
};
const LABEL_FONT_SIZE_PX = 16;
const LABEL_PADDING_PX = 2;
const LABEL_BACKGROUND_COLOR = '#ffffff';

function StrokeBoxes(
  context: CanvasRenderingContext2D,
  boxes: readonly BboxPx[],
  style: BoxStyle
): void {
  context.save();
  context.strokeStyle = style.color;
  context.lineWidth = style.line_width_px;
  context.setLineDash(style.line_dash);

  for (const box of boxes) {
    context.strokeRect(box.x_px, box.y_px, box.width_px, box.height_px);
  }

  context.restore();
}

// Labels sit just above their box, or inside it at the top edge of the tile.
function DrawRegionLabels(
  context: CanvasRenderingContext2D,
  region_boxes: TileOverlayInput['region_boxes']
): void {
  context.save();
  context.font = `bold ${LABEL_FONT_SIZE_PX}px sans-serif`;
  context.textBaseline = 'top';

  for (const { region_id, bbox_px } of region_boxes) {
    const label_width_px =
      context.measureText(region_id).width + 2 * LABEL_PADDING_PX;
    const label_height_px = LABEL_FONT_SIZE_PX + 2 * LABEL_PADDING_PX;
    const label_y_px = Math.max(0, bbox_px.y_px - label_height_px);

    context.fillStyle = LABEL_BACKGROUND_COLOR;
    context.fillRect(bbox_px.x_px, label_y_px, label_width_px, label_height_px);
    context.fillStyle = REGION_BOX_STYLE.color;
    context.fillText(
      region_id,
      bbox_px.x_px + LABEL_PADDING_PX,
      label_y_px + LABEL_PADDING_PX
    );
  }

  context.restore();
}

/** Draws a tile with its engine lines, regions, and unmatched reference lines. */
export function DrawTileOverlay(
  context: CanvasRenderingContext2D,
  input: TileOverlayInput
): void {
  context.drawImage(input.image, 0, 0);
  StrokeBoxes(context, input.line_boxes, LINE_BOX_STYLE);
  StrokeBoxes(
    context,
    input.region_boxes.map(region_box => region_box.bbox_px),
    REGION_BOX_STYLE
  );
  StrokeBoxes(
    context,
    input.failed_reference_boxes,
    FAILED_REFERENCE_BOX_STYLE
  );
  DrawRegionLabels(context, input.region_boxes);
}
