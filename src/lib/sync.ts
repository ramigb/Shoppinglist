import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  clearDeletionTombstone,
  deleteListFromSync,
  getActiveListUser,
  getDeletionTombstones,
  listService,
  MAX_LIST_ITEMS,
  registerListSync,
  saveListFromSync,
  validateShoppingList,
} from "./db";
import { firestore } from "./firebase";
import { Item, ShoppingList } from "../types";

export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error";
type StatusListener = (status: SyncStatus) => void;

const listeners = new Set<StatusListener>();
let activeUserId: string | null = null;
let unsubscribes: Unsubscribe[] = [];
let onlineHandler: (() => void) | null = null;
let writeQueue = Promise.resolve();
let status: SyncStatus = "local";

function setStatus(nextStatus: SyncStatus) {
  status = nextStatus;
  for (const listener of listeners) listener(status);
}

function listCollection(userId: string) {
  return collection(firestore, "users", userId, "lists");
}

function listDocument(userId: string, listId: string) {
  return doc(firestore, "users", userId, "lists", listId);
}

function itemCollection(userId: string, listId: string) {
  return collection(firestore, "users", userId, "lists", listId, "items");
}

function deletionCollection(userId: string) {
  return collection(firestore, "users", userId, "deletions");
}

function deletionDocument(userId: string, listId: string) {
  return doc(firestore, "users", userId, "deletions", listId);
}

function dateValue(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

async function readRemoteList(userId: string, snapshot: DocumentSnapshot): Promise<ShoppingList | null> {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  if (
    !data ||
    typeof data.title !== "string" ||
    !Number.isInteger(data.itemCount) ||
    data.itemCount < 0 ||
    data.itemCount > MAX_LIST_ITEMS
  ) return null;

  const createdAt = dateValue(data.createdAt);
  const updatedAt = dateValue(data.updatedAt);
  if (!createdAt || !updatedAt) return null;

  const itemsSnapshot = await getDocs(itemCollection(userId, snapshot.id));
  const items: Item[] = [];
  for (const itemSnapshot of itemsSnapshot.docs) {
    const item = itemSnapshot.data();
    const doneDate = item.doneDate === null ? null : dateValue(item.doneDate);
    if (
      typeof item.text !== "string" ||
      typeof item.done !== "boolean" ||
      (item.doneDate !== null && !doneDate)
    ) {
      return null;
    }
    items.push({ id: itemSnapshot.id, text: item.text, done: item.done, doneDate });
  }

  if (items.length > MAX_LIST_ITEMS || items.length !== data.itemCount) return null;
  const list = { id: snapshot.id, title: data.title, createdAt, updatedAt, items };
  try {
    validateShoppingList(list);
    return list;
  } catch (error) {
    console.error("Ignored invalid Firestore list", error);
    return null;
  }
}

async function writeRemoteList(userId: string, list: ShoppingList) {
  validateShoppingList(list);
  const listRef = listDocument(userId, list.id);
  const itemsRef = itemCollection(userId, list.id);
  const existingList = await getDoc(listRef);
  const existingItems = existingList.exists() ? (await getDocs(itemsRef)).docs : [];
  const itemIds = new Set(list.items.map((item) => item.id));
  const batch = writeBatch(firestore);

  batch.set(listRef, {
    title: list.title,
    createdAt: Timestamp.fromDate(new Date(list.createdAt)),
    updatedAt: serverTimestamp(),
    itemCount: list.items.length,
  });

  for (const item of list.items) {
    batch.set(doc(itemsRef, item.id), {
      text: item.text,
      done: item.done,
      doneDate: item.doneDate ? Timestamp.fromDate(new Date(item.doneDate)) : null,
      updatedAt: serverTimestamp(),
    });
  }
  for (const item of existingItems) {
    if (!itemIds.has(item.id)) batch.delete(item.ref);
  }
  batch.delete(deletionDocument(userId, list.id));

  await batch.commit();
}

async function deleteRemoteList(userId: string, listId: string) {
  const listRef = listDocument(userId, listId);
  const existingList = await getDoc(listRef);
  const items = existingList.exists() ? (await getDocs(itemCollection(userId, listId))).docs : [];
  const batch = writeBatch(firestore);
  for (const item of items) batch.delete(item.ref);
  batch.delete(listRef);
  // buzzcut: Retain deletion markers so offline devices cannot resurrect lists; add server-side TTL only if deletion volume becomes material.
  batch.set(deletionDocument(userId, listId), { deletedAt: serverTimestamp() });
  await batch.commit();
  if (isActiveUser(userId)) await clearDeletionTombstone(listId);
}

function modifiedAt(list: ShoppingList) {
  return Date.parse(list.updatedAt ?? list.createdAt);
}

function isActiveUser(userId: string) {
  return activeUserId === userId && getActiveListUser() === userId;
}

function readRemoteDeletion(snapshot: DocumentSnapshot) {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  const deletedAt = dateValue(data?.deletedAt);
  return deletedAt ? { id: snapshot.id, deletedAt } : null;
}

async function reconcile(userId: string) {
  const [localLists, remoteSnapshot, remoteDeletionSnapshot, tombstones] = await Promise.all([
    listService.getAll(),
    getDocs(listCollection(userId)),
    getDocs(deletionCollection(userId)),
    getDeletionTombstones(),
  ]);
  const remoteLists = await Promise.all(
    remoteSnapshot.docs.map((snapshot) => readRemoteList(userId, snapshot)),
  );
  const localById = new Map(localLists.map((list) => [list.id, list]));
  const remoteById = new Map(
    remoteLists.filter((list): list is ShoppingList => list !== null).map((list) => [list.id, list]),
  );
  const remoteDeletions = new Map(
    remoteDeletionSnapshot.docs
      .map(readRemoteDeletion)
      .filter((deletion): deletion is { id: string; deletedAt: string } => deletion !== null)
      .map((deletion) => [deletion.id, deletion]),
  );

  if (!isActiveUser(userId)) return;

  for (const deletion of remoteDeletions.values()) {
    if (!isActiveUser(userId)) return;
    const local = localById.get(deletion.id);
    if (local && modifiedAt(local) > Date.parse(deletion.deletedAt)) {
      await writeRemoteList(userId, local);
      remoteDeletions.delete(deletion.id);
    } else {
      if (local) await deleteListFromSync(deletion.id);
      else await clearDeletionTombstone(deletion.id);
      localById.delete(deletion.id);
      remoteById.delete(deletion.id);
    }
  }

  for (const deletion of tombstones) {
    if (!isActiveUser(userId)) return;
    const remote = remoteById.get(deletion.id);
    if (remoteDeletions.has(deletion.id)) {
      await clearDeletionTombstone(deletion.id);
    } else if (!remote || Date.parse(deletion.deletedAt) >= modifiedAt(remote)) {
      await deleteRemoteList(userId, deletion.id);
      remoteById.delete(deletion.id);
    } else {
      await saveListFromSync(remote);
    }
  }

  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  for (const id of ids) {
    if (!isActiveUser(userId)) return;
    const local = localById.get(id);
    const remote = remoteById.get(id);
    if (local && (!remote || modifiedAt(local) >= modifiedAt(remote))) {
      await writeRemoteList(userId, local);
    } else if (remote) {
      await saveListFromSync(remote);
    }
  }
}

async function applyRemoteChange(userId: string, snapshot: DocumentSnapshot) {
  const remote = await readRemoteList(userId, snapshot);
  if (!remote || !isActiveUser(userId)) return;
  const local = await listService.get(remote.id);
  if (!local || modifiedAt(remote) >= modifiedAt(local)) {
    await saveListFromSync(remote);
  } else {
    await queueWrite(userId, () => writeRemoteList(userId, local));
  }
}

async function applyRemoteDeletion(userId: string, snapshot: DocumentSnapshot) {
  const deletion = readRemoteDeletion(snapshot);
  if (!deletion || !isActiveUser(userId)) return;
  const local = await listService.get(deletion.id);
  if (local && modifiedAt(local) > Date.parse(deletion.deletedAt)) {
    await queueWrite(userId, () => writeRemoteList(userId, local));
  } else if (local) {
    await deleteListFromSync(deletion.id);
  } else {
    await clearDeletionTombstone(deletion.id);
  }
}

function listen(userId: string) {
  unsubscribes.push(onSnapshot(
    listCollection(userId),
    (snapshot) => {
      void (async () => {
        for (const change of snapshot.docChanges()) {
          if (activeUserId !== userId) return;
          if (change.type !== "removed") {
            await applyRemoteChange(userId, change.doc);
          }
        }
        if (activeUserId === userId) setStatus("synced");
      })().catch((error) => {
        console.error("Failed to apply Firebase update", error);
        setStatus(navigator.onLine ? "error" : "offline");
      });
    },
    (error) => {
      console.error("Firestore listener failed", error);
      setStatus(navigator.onLine ? "error" : "offline");
    },
  ));
  unsubscribes.push(onSnapshot(
    deletionCollection(userId),
    (snapshot) => {
      void (async () => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "removed") await applyRemoteDeletion(userId, change.doc);
        }
      })().catch((error) => {
        console.error("Failed to apply Firebase deletion", error);
        setStatus(navigator.onLine ? "error" : "offline");
      });
    },
    (error) => {
      console.error("Firestore deletion listener failed", error);
      setStatus(navigator.onLine ? "error" : "offline");
    },
  ));
}

async function runWrite(userId: string, operation: () => Promise<void>) {
  if (!isActiveUser(userId)) return;
  setStatus("syncing");
  try {
    await operation();
    if (activeUserId === userId) setStatus("synced");
  } catch (error) {
    setStatus(navigator.onLine ? "error" : "offline");
    throw error;
  }
}

function queueWrite(userId: string, operation: () => Promise<void>) {
  const queued = writeQueue.then(() => runWrite(userId, operation));
  writeQueue = queued.catch(() => {});
  return queued;
}

function queueActiveWrite(operation: (userId: string) => Promise<void>) {
  const userId = activeUserId;
  if (!userId) return Promise.resolve();
  return queueWrite(userId, () => operation(userId));
}

registerListSync({
  save: (list) => queueActiveWrite((userId) => writeRemoteList(userId, list)),
  delete: (id) => queueActiveWrite((userId) => deleteRemoteList(userId, id)),
  clear: (ids) => queueActiveWrite(async (userId) => {
    for (const id of ids) await deleteRemoteList(userId, id);
  }),
});

export const syncService = {
  subscribe(listener: StatusListener) {
    listeners.add(listener);
    listener(status);
    return () => {
      listeners.delete(listener);
    };
  },

  async start(userId: string) {
    this.stop();
    activeUserId = userId;
    setStatus("syncing");
    listen(userId);
    onlineHandler = () => {
      if (activeUserId !== userId) return;
      setStatus("syncing");
      void queueWrite(userId, () => reconcile(userId))
        .then(() => {
          if (activeUserId === userId) setStatus("synced");
        })
        .catch((error) => {
          console.error("Firebase reconnect sync failed", error);
          if (activeUserId === userId) setStatus("error");
        });
    };
    window.addEventListener("online", onlineHandler);
    try {
      await queueWrite(userId, () => reconcile(userId));
      if (activeUserId === userId) setStatus("synced");
    } catch (error) {
      console.error("Initial Firebase sync failed", error);
      if (activeUserId === userId) setStatus(navigator.onLine ? "error" : "offline");
    }
  },

  stop() {
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
    if (onlineHandler) window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
    activeUserId = null;
    writeQueue = Promise.resolve();
    setStatus("local");
  },
};
