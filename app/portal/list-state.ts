/** Page boundaries can overlap as new records arrive. Keep one row per identity. */
export function appendUnique<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  return [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()];
}

/** Undo only our failed optimistic status change, preserving every other field and row. */
export function rollbackStatus<T extends { id: string; status: string }>(items: T[], id: string, optimistic: T["status"], original: T["status"]): T[] {
  return items.map((item) => item.id === id && item.status === optimistic ? { ...item, status: original } : item);
}
