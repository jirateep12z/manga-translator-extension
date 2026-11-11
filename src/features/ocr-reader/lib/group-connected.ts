function FindRoot(parents: number[], item_index: number): number {
  let root_index = item_index;

  while (parents[root_index] !== root_index) root_index = parents[root_index];

  // Path compression: point every visited item straight at the root.
  let current_index = item_index;

  while (parents[current_index] !== root_index) {
    const next_index = parents[current_index];

    parents[current_index] = root_index;
    current_index = next_index;
  }

  return root_index;
}

/**
 * Splits items into the connected groups of a link relation, checking every
 * pair (union-find). Each group keeps input order, and the groups are ordered
 * by their first item's input position.
 */
export function GroupConnected<TItem>(
  items: readonly TItem[],
  IsLinked: (first: TItem, second: TItem) => boolean
): TItem[][] {
  const parents = items.map((_, item_index) => item_index);

  for (let first_index = 0; first_index < items.length; first_index++) {
    for (
      let second_index = first_index + 1;
      second_index < items.length;
      second_index++
    ) {
      const first_root = FindRoot(parents, first_index);
      const second_root = FindRoot(parents, second_index);

      if (first_root === second_root) continue;
      if (!IsLinked(items[first_index], items[second_index])) continue;

      parents[Math.max(first_root, second_root)] = Math.min(
        first_root,
        second_root
      );
    }
  }

  const groups = new Map<number, TItem[]>();

  for (const [item_index, item] of items.entries()) {
    const root_index = FindRoot(parents, item_index);
    const group = groups.get(root_index);

    if (group === undefined) {
      groups.set(root_index, [item]);
    } else {
      group.push(item);
    }
  }

  return [...groups.values()];
}
