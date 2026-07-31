import { openDB, DBSchema, IDBPDatabase } from "idb";
import { AutocompleteItem, ShoppingList } from "../types";

// buzzcut: Keep one list below 200 items so a complete Firestore sync fits in one atomic batch; split the model only if larger lists become a real requirement.
export const MAX_LIST_ITEMS = 200;
export const MAX_LIST_TITLE_LENGTH = 200;
export const MAX_ITEM_TEXT_LENGTH = 500;

export interface ListDeletion {
  id: string;
  deletedAt: string;
}

interface MetadataRecord {
  key: string;
  value: string;
}

interface ShoppingListDB extends DBSchema {
  lists: {
    key: string;
    value: ShoppingList;
  };
  items: {
    key: string;
    value: AutocompleteItem;
    indexes: { name: string };
  };
  deletions: {
    key: string;
    value: ListDeletion;
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
}

interface ListSyncAdapter {
  save(list: ShoppingList): Promise<void>;
  delete(id: string): Promise<void>;
  clear(ids: string[]): Promise<void>;
}

const GUEST_DB_NAME = "ShoppingListDB";
const DB_VERSION = 3;
const dbPromises = new Map<string, Promise<IDBPDatabase<ShoppingListDB>>>();

let activeUserId: string | null = null;
let syncAdapter: ListSyncAdapter | null = null;

function getDB(name: string) {
  let dbPromise = dbPromises.get(name);
  if (!dbPromise) {
    dbPromise = openDB<ShoppingListDB>(name, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("lists")) {
          db.createObjectStore("lists", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("items")) {
          const itemsStore = db.createObjectStore("items", { keyPath: "id" });
          itemsStore.createIndex("name", "name", { unique: false });
        }
        if (!db.objectStoreNames.contains("deletions")) {
          db.createObjectStore("deletions", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }
      },
    });
    dbPromises.set(name, dbPromise);
  }
  return dbPromise;
}

function userDBName(userId: string) {
  return `${GUEST_DB_NAME}-user-${userId}`;
}

function getActiveDB() {
  return getDB(activeUserId ? userDBName(activeUserId) : GUEST_DB_NAME);
}

async function initializeUserDB(userId: string) {
  const userDB = await getDB(userDBName(userId));
  const guestDB = await getDB(GUEST_DB_NAME);
  const claim = await guestDB.get("metadata", "claimedBy");
  const initialized = await userDB.get("metadata", "initialized");

  if (claim && claim.value !== userId) {
    if (!initialized) {
      await userDB.put("metadata", { key: "initialized", value: new Date().toISOString() });
    }
    return;
  }

  const [guestLists, guestItems, guestDeletions, userLists, userDeletions] = await Promise.all([
    guestDB.getAll("lists"),
    guestDB.getAll("items"),
    guestDB.getAll("deletions"),
    userDB.getAll("lists"),
    userDB.getAll("deletions"),
  ]);
  const userListById = new Map(userLists.map((list) => [list.id, list]));
  const userDeletionById = new Map(userDeletions.map((deletion) => [deletion.id, deletion]));
  const transaction = userDB.transaction(["lists", "items", "deletions", "metadata"], "readwrite");

  for (const list of guestLists) {
    const userList = userListById.get(list.id);
    const userDeletion = userDeletionById.get(list.id);
    const listTime = Date.parse(list.updatedAt ?? list.createdAt);
    if (
      (!userList || listTime >= Date.parse(userList.updatedAt ?? userList.createdAt)) &&
      (!userDeletion || listTime > Date.parse(userDeletion.deletedAt))
    ) {
      await transaction.objectStore("lists").put(list);
      await transaction.objectStore("deletions").delete(list.id);
    }
  }
  for (const deletion of guestDeletions) {
    const userList = userListById.get(deletion.id);
    const userDeletion = userDeletionById.get(deletion.id);
    if (
      (!userList || Date.parse(deletion.deletedAt) >= Date.parse(userList.updatedAt ?? userList.createdAt)) &&
      (!userDeletion || Date.parse(deletion.deletedAt) >= Date.parse(userDeletion.deletedAt))
    ) {
      await transaction.objectStore("lists").delete(deletion.id);
      await transaction.objectStore("deletions").put(deletion);
    }
  }
  for (const item of guestItems) await transaction.objectStore("items").put(item);
  await transaction.objectStore("metadata").put({ key: "initialized", value: new Date().toISOString() });
  await transaction.done;

  if (!claim) {
    await guestDB.put("metadata", { key: "claimedBy", value: userId });
  }
}

function listChanged() {
  window.dispatchEvent(new Event("lists-changed"));
}

function queueSync(operation: Promise<void>) {
  void operation.catch((error) => console.error("Firebase sync failed", error));
}

function validDate(value: string) {
  return value.length <= 40 && Number.isFinite(Date.parse(value));
}

export function validateShoppingList(list: ShoppingList) {
  if (!list.id || list.id.length > 128) throw new Error("Invalid list ID.");
  if (!list.title.trim() || list.title.length > MAX_LIST_TITLE_LENGTH) {
    throw new Error(`List titles must be 1-${MAX_LIST_TITLE_LENGTH} characters.`);
  }
  if (!validDate(list.createdAt) || (list.updatedAt && !validDate(list.updatedAt))) {
    throw new Error("Invalid list date.");
  }
  if (!Array.isArray(list.items) || list.items.length > MAX_LIST_ITEMS) {
    throw new Error(`Lists can contain at most ${MAX_LIST_ITEMS} items.`);
  }

  for (const item of list.items) {
    if (!item.id || item.id.length > 128) throw new Error("Invalid item ID.");
    if (!item.text.trim() || item.text.length > MAX_ITEM_TEXT_LENGTH) {
      throw new Error(`Item names must be 1-${MAX_ITEM_TEXT_LENGTH} characters.`);
    }
    if (typeof item.done !== "boolean") throw new Error("Invalid item state.");
    if (item.doneDate !== null && !validDate(item.doneDate)) {
      throw new Error("Invalid item completion date.");
    }
  }
}

export async function setActiveListUser(userId: string | null) {
  if (userId) await initializeUserDB(userId);
  activeUserId = userId;
  listChanged();
}

export function registerListSync(adapter: ListSyncAdapter) {
  syncAdapter = adapter;
}

export function getActiveListUser() {
  return activeUserId;
}

export async function getDeletionTombstones() {
  const db = await getActiveDB();
  return db.getAll("deletions");
}

export async function saveListFromSync(list: ShoppingList) {
  validateShoppingList(list);
  const db = await getActiveDB();
  const transaction = db.transaction(["lists", "deletions"], "readwrite");
  await transaction.objectStore("lists").put(list);
  await transaction.objectStore("deletions").delete(list.id);
  await transaction.done;
  listChanged();
}

export async function deleteListFromSync(id: string) {
  const db = await getActiveDB();
  const transaction = db.transaction(["lists", "deletions"], "readwrite");
  await transaction.objectStore("lists").delete(id);
  await transaction.objectStore("deletions").delete(id);
  await transaction.done;
  listChanged();
}

export async function clearDeletionTombstone(id: string) {
  const db = await getActiveDB();
  await db.delete("deletions", id);
}

export const listService = {
  async getAll(): Promise<ShoppingList[]> {
    const db = await getActiveDB();
    return db.getAll("lists");
  },

  async get(id: string): Promise<ShoppingList | undefined> {
    const db = await getActiveDB();
    return db.get("lists", id);
  },

  async save(list: ShoppingList): Promise<string> {
    const savedList = { ...list, updatedAt: new Date().toISOString() };
    validateShoppingList(savedList);
    const db = await getActiveDB();
    const transaction = db.transaction(["lists", "deletions"], "readwrite");
    await transaction.objectStore("lists").put(savedList);
    await transaction.objectStore("deletions").delete(savedList.id);
    await transaction.done;
    listChanged();
    if (activeUserId && syncAdapter) queueSync(syncAdapter.save(savedList));
    return savedList.id;
  },

  async delete(id: string): Promise<void> {
    const db = await getActiveDB();
    if (activeUserId) {
      const transaction = db.transaction(["lists", "deletions"], "readwrite");
      await transaction.objectStore("lists").delete(id);
      await transaction.objectStore("deletions").put({ id, deletedAt: new Date().toISOString() });
      await transaction.done;
      if (syncAdapter) queueSync(syncAdapter.delete(id));
    } else {
      const transaction = db.transaction(["lists", "deletions"], "readwrite");
      await transaction.objectStore("lists").delete(id);
      await transaction.objectStore("deletions").put({ id, deletedAt: new Date().toISOString() });
      await transaction.done;
    }
    listChanged();
  },

  async clear(): Promise<void> {
    const db = await getActiveDB();
    const lists = await db.getAll("lists");
    if (activeUserId) {
      const deletedAt = new Date().toISOString();
      const transaction = db.transaction(["lists", "deletions"], "readwrite");
      await transaction.objectStore("lists").clear();
      for (const list of lists) {
        await transaction.objectStore("deletions").put({ id: list.id, deletedAt });
      }
      await transaction.done;
      if (syncAdapter) queueSync(syncAdapter.clear(lists.map((list) => list.id)));
    } else {
      const deletedAt = new Date().toISOString();
      const transaction = db.transaction(["lists", "deletions"], "readwrite");
      await transaction.objectStore("lists").clear();
      for (const list of lists) {
        await transaction.objectStore("deletions").put({ id: list.id, deletedAt });
      }
      await transaction.done;
    }
    listChanged();
  },
};

export const itemService = {
  async search(query: string): Promise<AutocompleteItem[]> {
    if (!query) return [];
    const db = await getActiveDB();
    const allItems = await db.getAll("items");
    return allItems
      .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);
  },

  async save(name: string): Promise<void> {
    const db = await getActiveDB();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > MAX_ITEM_TEXT_LENGTH) return;

    const transaction = db.transaction("items", "readwrite");
    const index = transaction.store.index("name");
    const existing = await index.get(trimmedName);

    if (!existing) {
      await transaction.store.put({ id: crypto.randomUUID(), name: trimmedName });
    }
    await transaction.done;
  },
};
