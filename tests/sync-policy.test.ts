import assert from "node:assert/strict";
import test from "node:test";
import { reconciliationAction, remoteChangeAction } from "../src/lib/sync-policy.ts";

const older = { createdAt: "2026-01-01T00:00:00.000Z" };
const newer = { createdAt: "2026-01-01T00:00:01.000Z" };

test("reconciliation does not write equal versions back to Firestore", () => {
  assert.equal(reconciliationAction(older, older), "save-remote");
  assert.equal(reconciliationAction(newer, older), "write-local");
  assert.equal(reconciliationAction(undefined, newer), "save-remote");
});

test("remote listeners ignore stale snapshots", () => {
  assert.equal(remoteChangeAction(newer, older), "ignore");
  assert.equal(remoteChangeAction(older, newer), "save-remote");
});
