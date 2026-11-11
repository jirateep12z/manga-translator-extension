import type { PageStatus } from '@/features/chapter-translation';
import { IsChromeExtension } from '@/lib/is-chrome-extension';
import { SendTabMessage } from '@/lib/messaging';
import { useEffect, useState } from 'react';
import { UNAVAILABLE_PAGE_STATUS } from '../lib/describe-page-status';
import { ReadActiveTabStatus } from '../lib/read-active-tab-status';

type ActiveTabStatus = { tab_id: number | null; status: PageStatus };

const UNAVAILABLE_TAB_STATUS: ActiveTabStatus = {
  tab_id: null,
  status: UNAVAILABLE_PAGE_STATUS
};

async function QueryActiveTabId(): Promise<number | null> {
  const [active_tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return active_tab?.id ?? null;
}

export function UseActiveTabStatus(): ActiveTabStatus & {
  is_loading: boolean;
} {
  const is_extension = IsChromeExtension();
  const [active_tab_status, set_active_tab_status] =
    useState<ActiveTabStatus | null>(
      is_extension ? null : UNAVAILABLE_TAB_STATUS
    );

  useEffect(() => {
    if (!is_extension) return;

    let is_active = true;

    ReadActiveTabStatus({ QueryActiveTabId, SendTabMessage })
      .catch((error: unknown) => {
        console.warn('[popup] read-active-tab-status', {
          outcome: 'failed',
          error
        });

        return UNAVAILABLE_TAB_STATUS;
      })
      .then(next_status => {
        if (is_active) set_active_tab_status(next_status);
      });

    return () => {
      is_active = false;
    };
  }, [is_extension]);

  return {
    ...(active_tab_status ?? UNAVAILABLE_TAB_STATUS),
    is_loading: active_tab_status === null
  };
}
