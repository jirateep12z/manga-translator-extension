import type {
  GetPageStatusMessage,
  PageStatus
} from '@/features/chapter-translation';
import { IsPageStatus, UNAVAILABLE_PAGE_STATUS } from './describe-page-status';

export type ActiveTabDependencies = {
  QueryActiveTabId: () => Promise<number | null>;
  SendTabMessage: (
    tab_id: number,
    message: GetPageStatusMessage
  ) => Promise<unknown>;
};

export async function ReadActiveTabStatus(
  dependencies: ActiveTabDependencies
): Promise<{ tab_id: number | null; status: PageStatus }> {
  const tab_id = await dependencies.QueryActiveTabId();

  if (tab_id === null) return { tab_id, status: UNAVAILABLE_PAGE_STATUS };

  let response: unknown;

  // Pages without the content script (chrome://, the Web Store, or tabs
  // opened before install) reject the message.
  try {
    response = await dependencies.SendTabMessage(tab_id, {
      action: 'get-page-status'
    });
  } catch {
    return { tab_id, status: UNAVAILABLE_PAGE_STATUS };
  }

  return {
    tab_id,
    status: IsPageStatus(response) ? response : UNAVAILABLE_PAGE_STATUS
  };
}
