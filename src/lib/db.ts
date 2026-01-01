import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ShoppingList, AutocompleteItem } from '../types';

interface ShoppingListDB extends DBSchema {
  lists: {
    key: string;
    value: ShoppingList;
  };
  items: {
    key: string;
    value: AutocompleteItem;
    indexes: { 'name': string };
  };
}

const DB_NAME = 'ShoppingListDB';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<ShoppingListDB>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ShoppingListDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('lists')) {
          db.createObjectStore('lists', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('items')) {
          const itemsStore = db.createObjectStore('items', { keyPath: 'id' });
          itemsStore.createIndex('name', 'name', { unique: false });
        }
      },
    });
  }
  return dbPromise;
};

export const listService = {
  async getAll(): Promise<ShoppingList[]> {
    const db = await initDB();
    return db.getAll('lists');
  },

  async get(id: string): Promise<ShoppingList | undefined> {
    const db = await initDB();
    return db.get('lists', id);
  },

  async save(list: ShoppingList): Promise<string> {
    const db = await initDB();
    await db.put('lists', list);
    return list.id;
  },

  async delete(id: string): Promise<void> {
    const db = await initDB();
    await db.delete('lists', id);
  },

  async clear(): Promise<void> {
    const db = await initDB();
    await db.clear('lists');
  }
};

export const itemService = {
  async search(query: string): Promise<AutocompleteItem[]> {
    if (!query) return [];
    const db = await initDB();
    const allItems = await db.getAll('items');
    return allItems
      .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5);
  },

  async save(name: string): Promise<void> {
    const db = await initDB();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const tx = db.transaction('items', 'readwrite');
    const index = tx.store.index('name');
    const existing = await index.get(trimmedName);

    if (!existing) {
      await tx.store.put({ id: crypto.randomUUID(), name: trimmedName });
    }
    await tx.done;
  }
};
