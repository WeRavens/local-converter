import { describe, expect, it } from 'vitest';

/**
 * Queue reorder logic tests.
 *
 * The queue ordering is handled inside App.tsx's handleMoveItem(), which mutates
 * the React `queue` state array by swapping two adjacent elements.
 *
 * We isolate that swap logic here to verify it correctly changes order, so the
 * downstream processSingleItem loop (which iterates `remainingTargets` derived
 * from `queue`) processes items in the user-defined order.
 */

/** Minimal type to represent a queue item id-only. */
interface MinItem {
  id: string;
}

/**
 * Replicates the swap logic from App.tsx handleMoveItem.
 * Returns new array with elements swapped, or same array if swap is not possible.
 */
function moveItem(items: MinItem[], id: string, direction: 'up' | 'down'): MinItem[] {
  const idx = items.findIndex((q) => q.id === id);
  if (idx === -1) return items;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return items;
  const next = [...items];
  [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
  return next;
}

describe('handleMoveItem – queue reorder changes processing order', () => {
  const makeItems = (...ids: string[]): MinItem[] => ids.map((id) => ({ id }));

  it('moves an item up by swapping with the previous item', () => {
    const result = moveItem(makeItems('a', 'b', 'c'), 'b', 'up');
    expect(result.map((i) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves an item down by swapping with the next item', () => {
    const result = moveItem(makeItems('a', 'b', 'c'), 'b', 'down');
    expect(result.map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not move the first item further up', () => {
    const original = makeItems('a', 'b', 'c');
    const result = moveItem(original, 'a', 'up');
    expect(result).toBe(original); // same reference – no change
  });

  it('does not move the last item further down', () => {
    const original = makeItems('a', 'b', 'c');
    const result = moveItem(original, 'c', 'down');
    expect(result).toBe(original);
  });

  it('returns unchanged array for unknown id', () => {
    const original = makeItems('a', 'b');
    const result = moveItem(original, 'z', 'up');
    expect(result).toBe(original);
  });

  it('successive reorders cumulate correctly (c→top)', () => {
    let items = makeItems('a', 'b', 'c');
    items = moveItem(items, 'c', 'up'); // a, c, b
    items = moveItem(items, 'c', 'up'); // c, a, b
    expect(items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('processing order after reorder matches reordered array order', () => {
    // Simulate: initial order a→b→c, user moves c to top
    let queue = makeItems('a', 'b', 'c');
    queue = moveItem(queue, 'c', 'up'); // a, c, b
    queue = moveItem(queue, 'c', 'up'); // c, a, b

    // The dispatcher iterates queue in order – first element processed first
    const processingOrder = queue.map((item) => item.id);
    expect(processingOrder[0]).toBe('c');
    expect(processingOrder[1]).toBe('a');
    expect(processingOrder[2]).toBe('b');
  });
});
