export type DropPosition = "before" | "after";

export type SortOrderItem = {
  id: string;
  sortOrder: number;
};

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return [...items];
  }

  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveItemByDrop<T extends { id: string }>(
  items: T[],
  draggedId: string,
  overId: string,
  position: DropPosition
): T[] {
  if (draggedId === overId) {
    return [...items];
  }

  const draggedIndex = items.findIndex((item) => item.id === draggedId);
  if (draggedIndex < 0) {
    return [...items];
  }

  const dragged = items[draggedIndex];
  const remaining = items.filter((item) => item.id !== draggedId);
  const overIndex = remaining.findIndex((item) => item.id === overId);
  if (overIndex < 0) {
    return [...items];
  }

  const insertIndex = position === "before" ? overIndex : overIndex + 1;

  return [...remaining.slice(0, insertIndex), dragged, ...remaining.slice(insertIndex)];
}

export function renumberSortOrders(ids: string[], step = 10): SortOrderItem[] {
  return ids.map((id, index) => ({
    id,
    sortOrder: (index + 1) * step
  }));
}

export function buildSortOrderPatches(currentRows: SortOrderItem[], orderedIds: string[], step = 10): SortOrderItem[] {
  const currentMap = new Map(currentRows.map((row) => [row.id, row.sortOrder]));
  const seen = new Set<string>();

  const normalizedOrderedIds: string[] = [];

  for (const id of orderedIds) {
    if (!currentMap.has(id) || seen.has(id)) continue;
    normalizedOrderedIds.push(id);
    seen.add(id);
  }

  for (const row of currentRows) {
    if (seen.has(row.id)) continue;
    normalizedOrderedIds.push(row.id);
    seen.add(row.id);
  }

  return renumberSortOrders(normalizedOrderedIds, step).filter((nextRow) => currentMap.get(nextRow.id) !== nextRow.sortOrder);
}

export function getNextSortOrder(existingSortOrders: number[], step = 10): number {
  const maxSortOrder = existingSortOrders.reduce((max, value) => (value > max ? value : max), 0);
  return maxSortOrder > 0 ? maxSortOrder + step : step;
}
