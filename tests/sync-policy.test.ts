import assert from "node:assert/strict";
import test from "node:test";
import { changedItems, reconciliationAction, remoteChangeAction } from "../src/lib/sync-policy.ts";

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

test("item diffs only touch what this device changed", () => {
  const milk = { id: "milk", text: "Milk", done: false, doneDate: null };
  const eggs = { id: "eggs", text: "Eggs", done: false, doneDate: null };
  const bread = { id: "bread", text: "Bread", done: false, doneDate: null };
  const eggsDone = { ...eggs, done: true, doneDate: "2026-01-01T00:00:00.000Z" };

  const toggled = changedItems([milk, eggsDone, bread], [milk, eggs, bread]);
  assert.deepEqual(toggled.upserts, [{ item: eggsDone, position: 1 }]);
  assert.deepEqual(toggled.deletedIds, []);

  const reordered = changedItems([eggs, milk], [milk, eggs, bread]);
  assert.deepEqual(reordered.upserts.map(({ item, position }) => [item.id, position]), [["eggs", 0], ["milk", 1]]);
  assert.deepEqual(reordered.deletedIds, ["bread"]);
});
