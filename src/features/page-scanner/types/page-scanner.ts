export type ImageSnapshot = {
  element_id: string;
  current_src: string;
  src_attribute: string;
  lazy_attribute_values: string[];
  is_loaded: boolean;
  natural_width_px: number;
  natural_height_px: number;
  attribute_width_px: number | null;
  attribute_height_px: number | null;
  rendered_width_px: number;
  rendered_height_px: number;
  document_order: number;
  is_in_excluded_ancestor: boolean;
};

export type ScannedPage = {
  page_id: string;
  effective_source: string;
  document_order: number;
};

export type PageSelection = {
  pages: ScannedPage[];
  pending_element_ids: string[];
};
