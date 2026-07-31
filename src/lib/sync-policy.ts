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
