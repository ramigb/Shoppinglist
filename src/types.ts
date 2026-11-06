export interface Item {
  id: string;
  text: string;
  done: boolean;
  doneDate: string | null; // ISO string
}

export interface ShoppingList {
  id: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string; added when local or cloud data changes
  items: Item[];
  ownerId?: string; // set once synced; absent means the signed-in user's own list
  members?: Record<string, string>; // uid -> email of everyone with access
}

export interface ListInvite {
  listId: string;
  listTitle: string;
  fromEmail: string;
  toEmail: string;
}

export interface AutocompleteItem {
  id: string;
  name: string;
}

export type SortOption = 'newest' | 'oldest';
