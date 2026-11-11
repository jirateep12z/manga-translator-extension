// The background sends exactly one terminal reply (page-result or page-error)
// per translate-page request. When the content side cancels a request, it
// marks the page with the current run so that the late reply is recognized
// and a result from an earlier run can be dropped.
export type StaleReplyCounter = {
  Mark: (page_index: number, run_id: number) => void;
  Consume: (page_index: number) => number | null;
  Clear: () => void;
};

export function CreateStaleReplyCounter(): StaleReplyCounter {
  const stale_run_ids = new Map<number, number[]>();

  return {
    Mark: (page_index, run_id) => {
      stale_run_ids.set(page_index, [
        ...(stale_run_ids.get(page_index) ?? []),
        run_id
      ]);
    },
    Consume: page_index => {
      const [run_id, ...remaining_run_ids] =
        stale_run_ids.get(page_index) ?? [];

      if (run_id === undefined) return null;

      if (remaining_run_ids.length === 0) stale_run_ids.delete(page_index);
      else stale_run_ids.set(page_index, remaining_run_ids);

      return run_id;
    },
    Clear: () => stale_run_ids.clear()
  };
}
