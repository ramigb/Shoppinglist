import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import {
  clearDeletionTombstone,
  deleteListFromSync,
  getActiveListUser,
  getDeletionTombstones,
  listService,
  MAX_LIST_ITEMS,
  MAX_LIST_MEMBERS,
  registerListSync,
  saveListFromSync,
  validateShoppingList,
} from "./db";
import { firebaseAuth, firestore } from "./firebase";
import {
  changedItems,
  modifiedAt,
  reconciliationAction,
} from "./sync-policy";
import { Item, ListInvite, ShoppingList } from "../types";

export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error";
type StatusListener = (status: SyncStatus) => void;

const listeners = new Set<StatusListener>();
// Tags this tab's list writes so the live listener can skip their echoes.
const writerId = crypto.randomUUID();
// Lists whose last remote write failed: their next write diffs against Firestore, not the local history.
const unsyncedListIds = new Set<string>();
// Lists whose remote update lost a race with a local edit; refreshed after that edit is written.
const staleListIds = new Set<string>();
let activeUserId: string | null = null;
let writeQueue = Promise.resolve();
let status: SyncStatus = "local";
let stopListening: Unsubscribe = () => {};

function setStatus(nextStatus: SyncStatus) {
  status = nextStatus;
  for (const listener of listeners) listener(status);
}

function listCollection() {
  return collection(firestore, "lists");
}

function listDocument(listId: string) {
  return doc(firestore, "lists", listId);
}

function itemCollection(listId: string) {
  return collection(firestore, "lists", listId, "items");
}

function legacyListCollection(userId: string) {
  return collection(firestore, "users", userId, "lists");
}

function legacyItemCollection(userId: string, listId: string) {
  return collection(firestore, "users", userId, "lists", listId, "items");
}

function deletionCollection(userId: string) {
  return collection(firestore, "users", userId, "deletions");
}

function deletionDocument(userId: string, listId: string) {
  return doc(firestore, "users", userId, "deletions", listId);
}

function inviteCollection() {
  return collection(firestore, "invites");
}

function inviteDocument(listId: string, email: string) {
  return doc(firestore, "invites", `${listId}_${email}`);
}

function dateValue(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function isPermissionDenied(error: unknown) {
  return error instanceof FirebaseError && error.code === "permission-denied";
}

function signedInUser() {
  const user = firebaseAuth.currentUser;
  if (!user?.email) throw new Error("Sign in to share lists.");
  return { uid: user.uid, email: user.email };
}

function sameMembers(a: Record<string, string> | undefined, b: unknown) {
  const bKeys = b && typeof b === "object" ? Object.keys(b).sort().join() : "";
  return Object.keys(a ?? {}).sort().join() === bKeys;
}

async function readRemoteItems(itemsRef: CollectionReference): Promise<Item[] | null> {
  const itemsSnapshot = await getDocs(itemsRef);
  const items: { item: Item; position: number }[] = [];
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
    // Legacy items have no position; they keep their old ID order at the end.
    const position = Number.isInteger(item.position) ? item.position : MAX_LIST_ITEMS;
    items.push({ item: { id: itemSnapshot.id, text: item.text, done: item.done, doneDate }, position });
  }
  return items.sort((a, b) => a.position - b.position).map(({ item }) => item);
}

async function readRemoteList(snapshot: DocumentSnapshot, itemsRef: CollectionReference): Promise<ShoppingList | null> {
  const data = snapshot.data({ serverTimestamps: "estimate" });
  if (!data || typeof data.title !== "string") return null;

  const createdAt = dateValue(data.createdAt);
  const updatedAt = dateValue(data.updatedAt);
  if (!createdAt || !updatedAt) return null;

  const items = await readRemoteItems(itemsRef);
  if (!items) return null;
  const list: ShoppingList = { id: snapshot.id, title: data.title, createdAt, updatedAt, items };
  if (data.ownerId !== undefined) list.ownerId = data.ownerId;
  if (data.members !== undefined) list.members = { ...data.members };
  try {
    validateShoppingList(list);
    return list;
  } catch (error) {
    console.error("Ignored invalid Firestore list", error);
    return null;
  }
}

async function writeRemoteList(userId: string, list: ShoppingList, previous?: ShoppingList) {
  validateShoppingList(list);
  const trustedPrevious = unsyncedListIds.has(list.id) ? undefined : previous;
  unsyncedListIds.add(list.id);
  const listRef = listDocument(list.id);
  const itemsRef = itemCollection(list.id);
  const sharedWithMe = Boolean(list.ownerId && list.ownerId !== userId);

  let remote: DocumentSnapshot;
  try {
    remote = await getDoc(listRef);
  } catch (error) {
    if (!sharedWithMe || !isPermissionDenied(error)) throw error;
    await dropLostList(list.id);
    return;
  }
  if (!remote.exists() && sharedWithMe) {
    await dropLostList(list.id);
    return;
  }

  let baseItems: Item[] = [];
  if (remote.exists() && trustedPrevious) baseItems = trustedPrevious.items;
  else if (remote.exists()) baseItems = (await readRemoteItems(itemsRef)) ?? [];
  const { upserts, deletedIds } = changedItems(list.items, baseItems);

  const batch = writeBatch(firestore);
  const listFields = { title: list.title, updatedAt: serverTimestamp(), writerId };
  if (remote.exists()) {
    batch.update(listRef, listFields);
  } else {
    batch.set(listRef, {
      ...listFields,
      createdAt: Timestamp.fromDate(new Date(list.createdAt)),
      ownerId: userId,
      memberIds: [userId],
      members: { [userId]: signedInUser().email },
    });
  }
  for (const { item, position } of upserts) {
    batch.set(doc(itemsRef, item.id), {
      text: item.text,
      done: item.done,
      doneDate: item.doneDate ? Timestamp.fromDate(new Date(item.doneDate)) : null,
      position,
      updatedAt: serverTimestamp(),
    });
  }
  for (const itemId of deletedIds) batch.delete(doc(itemsRef, itemId));
  batch.delete(deletionDocument(userId, list.id));

  await batch.commit();
  unsyncedListIds.delete(list.id);
}

// The owner deleted a shared list or removed this user from it.
async function dropLostList(listId: string) {
  unsyncedListIds.delete(listId);
  await deleteListFromSync(listId);
}

async function deleteRemoteList(userId: string, listId: string) {
  const listRef = listDocument(listId);
  let remote: DocumentSnapshot | null;
  try {
    remote = await getDoc(listRef);
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    remote = null; // Already removed from this shared list.
  }
  const batch = writeBatch(firestore);
  if (remote?.exists() && remote.data().ownerId === userId) {
    for (const item of (await getDocs(itemCollection(listId))).docs) batch.delete(item.ref);
    batch.delete(listRef);
  } else if (remote?.exists()) {
    // Deleting a list someone else shared means leaving it.
    batch.update(listRef, { memberIds: arrayRemove(userId), [`members.${userId}`]: deleteField(), writerId });
  }
  // buzzcut: Retain deletion markers so offline devices cannot resurrect lists; add server-side TTL only if deletion volume becomes material.
  batch.set(deletionDocument(userId, listId), { deletedAt: serverTimestamp() });
  await batch.commit();
  if (isActiveUser(userId)) await clearDeletionTombstone(listId);
}

async function readLegacyLists(userId: string) {
  const snapshot = await getDocs(legacyListCollection(userId));
  const lists = await Promise.all(
    snapshot.docs.map((listSnapshot) => readRemoteList(listSnapshot, legacyItemCollection(userId, listSnapshot.id))),
  );
  return { ids: snapshot.docs.map((listSnapshot) => listSnapshot.id), lists };
}

async function deleteLegacyList(userId: string, listId: string) {
  const items = await getDocs(legacyItemCollection(userId, listId));
  const batch = writeBatch(firestore);
  for (const item of items.docs) batch.delete(item.ref);
  batch.delete(doc(legacyListCollection(userId), listId));
  await batch.commit();
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
  const [localLists, remoteSnapshot, remoteDeletionSnapshot, tombstones, legacy] = await Promise.all([
    listService.getAll(),
    getDocs(query(listCollection(), where("memberIds", "array-contains", userId))),
    getDocs(deletionCollection(userId)),
    getDeletionTombstones(),
    readLegacyLists(userId),
  ]);
  const remoteLists = await Promise.all(
    remoteSnapshot.docs.map((snapshot) => readRemoteList(snapshot, itemCollection(snapshot.id))),
  );
  const localById = new Map(localLists.map((list) => [list.id, list]));
  const remoteById = new Map(
    remoteLists.filter((list): list is ShoppingList => list !== null).map((list) => [list.id, list]),
  );
  // Lists still stored under the pre-sharing users/{uid}/lists path migrate on this pass.
  const legacyOnlyIds = new Set<string>();
  for (const list of legacy.lists) {
    if (list && !remoteById.has(list.id)) {
      remoteById.set(list.id, list);
      legacyOnlyIds.add(list.id);
    }
  }
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

  for (const local of localById.values()) {
    if (local.ownerId && local.ownerId !== userId && !remoteById.has(local.id)) {
      await dropLostList(local.id);
      localById.delete(local.id);
    }
  }

  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  for (const id of ids) {
    if (!isActiveUser(userId)) return;
    const local = localById.get(id);
    const remote = remoteById.get(id);
    const action = reconciliationAction(local, remote);
    if (action === "write-local" && local) {
      // buzzcut: A list edited offline overwrites collaborators' concurrent remote edits (whole-list last-writer-wins); merge per item if this bites in practice.
      await writeRemoteList(userId, local);
    } else if (action === "save-remote" && remote) {
      await saveListFromSync(remote);
      if (legacyOnlyIds.has(id)) await writeRemoteList(userId, remote);
    }
  }

  for (const listId of legacy.ids) {
    if (!isActiveUser(userId)) return;
    await deleteLegacyList(userId, listId);
  }
}

// Pulls one list from Firestore into IndexedDB unless a local edit raced it.
async function applyRemoteList(userId: string, listId: string) {
  if (!isActiveUser(userId) || unsyncedListIds.has(listId)) return;
  const local = await listService.get(listId);
  const snapshot = await getDoc(listDocument(listId));
  if (!snapshot.exists()) return;
  const remote = await readRemoteList(snapshot, itemCollection(listId));
  if (!remote || !isActiveUser(userId)) return;
  const applied = await saveListFromSync(remote, local ? local.updatedAt ?? null : null);
  if (!applied) staleListIds.add(listId);
}

function listenForRemoteChanges(userId: string) {
  let initialSnapshot = true;
  return onSnapshot(
    query(listCollection(), where("memberIds", "array-contains", userId)),
    (snapshot) => {
      // The initial state is handled by reconcile, which runs right after this listener starts.
      if (initialSnapshot) {
        initialSnapshot = false;
        return;
      }
      for (const change of snapshot.docChanges()) {
        const listId = change.doc.id;
        if (change.type === "removed") {
          void queueWrite(userId, () => dropLostList(listId)).catch(() => {});
          continue;
        }
        if (change.doc.metadata.hasPendingWrites) continue;
        void queueWrite(userId, async () => {
          const local = await listService.get(listId);
          const data = change.doc.data();
          if (local && data.writerId === writerId && sameMembers(local.members, data.members)) return;
          await applyRemoteList(userId, listId);
        }).catch((error) => console.error("Live list update failed", error));
      }
    },
    (error) => {
      console.error("Live sync stopped", error);
      if (activeUserId === userId) setStatus(navigator.onLine ? "error" : "offline");
    },
  );
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
  save: (list, previous) => queueActiveWrite(async (userId) => {
    await writeRemoteList(userId, list, previous);
    if (staleListIds.delete(list.id)) await applyRemoteList(userId, list.id);
  }),
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
    stopListening = listenForRemoteChanges(userId);
    await this.sync();
  },

  async sync() {
    const userId = activeUserId;
    if (!userId) return;
    try {
      await queueWrite(userId, () => reconcile(userId));
      if (activeUserId === userId) setStatus("synced");
    } catch (error) {
      console.error("Firebase sync failed", error);
      if (activeUserId === userId) setStatus(navigator.onLine ? "error" : "offline");
    }
  },

  stop() {
    stopListening();
    stopListening = () => {};
    activeUserId = null;
    writeQueue = Promise.resolve();
    unsyncedListIds.clear();
    staleListIds.clear();
    setStatus("local");
  },
};

function readInvite(snapshot: DocumentSnapshot): ListInvite | null {
  const data = snapshot.data();
  if (
    typeof data?.listId !== "string" ||
    typeof data.listTitle !== "string" ||
    typeof data.fromEmail !== "string" ||
    typeof data.toEmail !== "string"
  ) {
    return null;
  }
  return { listId: data.listId, listTitle: data.listTitle, fromEmail: data.fromEmail, toEmail: data.toEmail };
}

function isInvite(invite: ListInvite | null): invite is ListInvite {
  return invite !== null;
}

export function sharingErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "permission-denied") {
      return "That didn't go through. The person may already be invited, or the list may be full or gone.";
    }
    if (error.code === "unavailable") return "You appear to be offline. Try again when connected.";
    return "Something went wrong. Please try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export const sharingService = {
  async invite(list: ShoppingList, email: string) {
    const user = signedInUser();
    const toEmail = email.trim().toLowerCase();
    if (toEmail.length > 254 || !/^[^\s@/]+@[^\s@/]+$/.test(toEmail)) {
      throw new Error("Enter a valid email address.");
    }
    if (toEmail === user.email.toLowerCase()) throw new Error("You already have this list.");
    const members = Object.values(list.members ?? {});
    if (members.some((memberEmail) => memberEmail.toLowerCase() === toEmail)) {
      throw new Error("That person already has this list.");
    }
    if (members.length >= MAX_LIST_MEMBERS) {
      throw new Error(`A list can be shared with at most ${MAX_LIST_MEMBERS} people.`);
    }
    // Invite rules check list ownership, so the list must exist in Firestore first.
    await queueActiveWrite(async (userId) => {
      if (!(await getDoc(listDocument(list.id))).exists()) await writeRemoteList(userId, list);
    });
    await setDoc(inviteDocument(list.id, toEmail), {
      listId: list.id,
      listTitle: list.title,
      fromUid: user.uid,
      fromEmail: user.email,
      toEmail,
      createdAt: serverTimestamp(),
    });
  },

  async pendingInvites(listId: string) {
    const snapshot = await getDocs(query(inviteCollection(), where("fromUid", "==", signedInUser().uid)));
    return snapshot.docs.map(readInvite).filter(isInvite).filter((invite) => invite.listId === listId);
  },

  subscribeToMyInvites(email: string, onChange: (invites: ListInvite[]) => void) {
    return onSnapshot(
      query(inviteCollection(), where("toEmail", "==", email.toLowerCase())),
      (snapshot) => onChange(snapshot.docs.map(readInvite).filter(isInvite)),
      (error) => console.error("Could not load invitations", error),
    );
  },

  async accept(invite: ListInvite) {
    const user = signedInUser();
    const batch = writeBatch(firestore);
    batch.update(listDocument(invite.listId), {
      memberIds: arrayUnion(user.uid),
      [`members.${user.uid}`]: user.email,
      writerId,
    });
    batch.delete(inviteDocument(invite.listId, invite.toEmail));
    await batch.commit();
    await queueActiveWrite((userId) => applyRemoteList(userId, invite.listId));
  },

  // Declines an invitation, or cancels one the owner sent.
  async removeInvite(invite: ListInvite) {
    await deleteDoc(inviteDocument(invite.listId, invite.toEmail));
  },

  async removeMember(listId: string, memberId: string) {
    await updateDoc(listDocument(listId), {
      memberIds: arrayRemove(memberId),
      [`members.${memberId}`]: deleteField(),
      writerId,
    });
    await queueActiveWrite((userId) => applyRemoteList(userId, listId));
  },
};
