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
  items: Item[];
}

export interface AutocompleteItem {
  id: string;
  name: string;
}

export type SortOption = 'newest' | 'oldest';
