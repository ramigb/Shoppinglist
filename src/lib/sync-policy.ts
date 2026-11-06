interface VersionedRecord {
  createdAt: string;
  updatedAt?: string;
}

export type ReconciliationAction = "write-local" | "save-remote" | "none";
export type RemoteChangeAction = "save-remote" | "ignore";

export function modifiedAt(record: VersionedRecord) {
  return Date.parse(record.updatedAt ?? record.createdAt);
}

export function reconciliationAction(
  local: VersionedRecord | undefined,
  remote: VersionedRecord | undefined,
): ReconciliationAction {
  if (!local) return remote ? "save-remote" : "none";
  if (!remote) return "write-local";
  return modifiedAt(local) > modifiedAt(remote) ? "write-local" : "save-remote";
}

export function remoteChangeAction(
  local: VersionedRecord | undefined,
  remote: VersionedRecord,
): RemoteChangeAction {
  return !local || modifiedAt(remote) >= modifiedAt(local) ? "save-remote" : "ignore";
}

interface SyncedItem {
  id: string;
  text: string;
  done: boolean;
  doneDate: string | null;
}

// Diffs against the version this device last synced, so concurrent edits by collaborators
// to other items are never overwritten or deleted.
export function changedItems<T extends SyncedItem>(next: T[], previous: T[]) {
  const previousById = new Map(previous.map((item, position) => [item.id, { item, position }]));
  const nextIds = new Set(next.map((item) => item.id));
  const upserts = next
    .map((item, position) => ({ item, position }))
    .filter(({ item, position }) => {
      const before = previousById.get(item.id);
      return (
        !before ||
        before.position !== position ||
        before.item.text !== item.text ||
        before.item.done !== item.done ||
        before.item.doneDate !== item.doneDate
      );
    });
  const deletedIds = previous.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
  return { upserts, deletedIds };
}
