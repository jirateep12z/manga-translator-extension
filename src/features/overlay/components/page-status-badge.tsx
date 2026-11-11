import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentRect, PageBadge } from '../types/overlay';

type PageStatusBadgeProps = {
  rect: DocumentRect;
  badge: PageBadge;
  page_index: number;
  OnRetry: () => void;
};

function BadgeContent({
  badge,
  page_index,
  OnRetry
}: Omit<PageStatusBadgeProps, 'rect'>) {
  if (badge.kind === 'translating') {
    return (
      <Badge variant="secondary">
        <Spinner aria-hidden="true" />
        Translating
      </Badge>
    );
  }

  if (badge.kind === 'failed') {
    return (
      <span className="pointer-events-auto flex gap-1">
        <Badge variant="destructive">Failed</Badge>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Retry page ${page_index + 1}`}
          onClick={event => {
            event.stopPropagation();
            OnRetry();
          }}
        >
          Retry
        </Button>
      </span>
    );
  }

  return (
    <span className="bg-background rounded-4xl">
      <Badge variant="outline">{badge.label}</Badge>
    </span>
  );
}

export function PageStatusBadge({
  rect,
  badge,
  page_index,
  OnRetry
}: PageStatusBadgeProps) {
  return (
    <div
      className="absolute -ml-1 -translate-x-full"
      style={{ left: rect.left_px + rect.width_px, top: rect.top_px + 4 }}
    >
      <BadgeContent badge={badge} page_index={page_index} OnRetry={OnRetry} />
    </div>
  );
}
