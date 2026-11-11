export function CreateKeyedSerialQueue(): <T>(
  key: string,
  task: () => Promise<T>
) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();

  return function RunSerialized<T>(
    key: string,
    task: () => Promise<T>
  ): Promise<T> {
    const previous_tail = tails.get(key) ?? Promise.resolve();
    const task_promise = previous_tail.then(task, task);
    const next_tail = task_promise.catch(() => undefined);

    tails.set(key, next_tail);
    next_tail.then(() => {
      if (tails.get(key) === next_tail) tails.delete(key);
    });

    return task_promise;
  };
}
