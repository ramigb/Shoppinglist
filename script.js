const DB_NAME = 'ShoppingListDB';
const DB_VERSION = 1;
const STORE_NAME = 'lists';

const elements = {
  listTitle: document.getElementById('listTitle'),
  itemInput: document.getElementById('itemInput'),
  generateButton: document.getElementById('generateButton'),
  clearInput: document.getElementById('clearInput'),
  listContainer: document.getElementById('listContainer'),
  listTemplate: document.getElementById('listTemplate'),
  itemTemplate: document.getElementById('itemTemplate'),
  downloadBackup: document.getElementById('downloadBackup'),
  uploadBackup: document.getElementById('uploadBackup'),
  uploadInput: document.getElementById('uploadInput'),
};

let lists = [];
let db;
let activeFocusListId = null;

initApp();

async function initApp() {
  try {
    await initDB();
    lists = await getAllLists();
    lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderLists();
    attachEvents();
  } catch (error) {
    console.error('Failed to initialize app:', error);
  }
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => reject('IndexedDB error: ' + event.target.error);
    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

function getAllLists() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (event) => reject('Error fetching lists: ' + event.target.error);
  });
}

function saveListToDB(list) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(list);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject('Error saving list: ' + event.target.error);
  });
}

function deleteListFromDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject('Error deleting list: ' + event.target.error);
  });
}

function clearDB() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject('Error clearing DB: ' + event.target.error);
  });
}

function attachEvents() {
  elements.generateButton.addEventListener('click', async () => {
    const parsed = parseItems(elements.itemInput.value);
    if (!parsed.length) {
      alert('Add at least one item to create a list.');
      return;
    }
    const createdAt = new Date();
    const title = elements.listTitle.value.trim() || formatDate(createdAt);
    const list = {
      id: crypto.randomUUID(),
      title,
      createdAt: createdAt.toISOString(),
      items: parsed.map((text) => ({ id: crypto.randomUUID(), text, done: false, doneDate: null })),
    };
    lists.unshift(list);
    await saveListToDB(list);
    renderLists();
    elements.itemInput.value = '';
    elements.listTitle.value = '';
  });

  elements.clearInput.addEventListener('click', () => {
    elements.itemInput.value = '';
    elements.listTitle.value = '';
  });

  elements.downloadBackup.addEventListener('click', downloadBackup);

  if (elements.uploadBackup) {
    elements.uploadBackup.addEventListener('click', () => {
      elements.uploadInput.click();
    });
  }

  if (elements.uploadInput) {
    elements.uploadInput.addEventListener('change', handleFileUpload);
  }
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.lists || !Array.isArray(data.lists)) {
        alert('Invalid backup file format.');
        return;
      }

      if (confirm('This will overwrite your existing lists. Do you want to continue?')) {
        await clearDB();
        lists = data.lists;
        for (const list of lists) {
          await saveListToDB(list);
        }
        renderLists();
        alert('Backup restored successfully.');
      }
    } catch (error) {
      console.error('Error parsing backup file:', error);
      alert('Error parsing backup file.');
    } finally {
      event.target.value = ''; // Reset input
    }
  };
  reader.readAsText(file);
}

async function downloadBackup() {
  const lists = await getAllLists();
  const blob = new Blob([JSON.stringify({ lists }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shopping-list-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseItems(raw) {
  return raw
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderLists() {
  elements.listContainer.innerHTML = '';
  if (!lists.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No shopping lists yet.';
    empty.className = 'hint';
    elements.listContainer.appendChild(empty);
    return;
  }

  lists.forEach((list) => {
    const node = elements.listTemplate.content.cloneNode(true);
    const titleNode = node.querySelector('.list-title');
    titleNode.textContent = list.title;
    titleNode.addEventListener('blur', () => updateListTitle(list.id, titleNode.textContent));
    titleNode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleNode.blur();
      }
    });

    node.querySelector('.list-date').textContent = `Created ${formatDate(new Date(list.createdAt))}`;

    const ul = node.querySelector('.items');
    list.items.forEach((item) => {
      const itemNode = elements.itemTemplate.content.cloneNode(true);
      const checkbox = itemNode.querySelector('.item-checkbox');
      const text = itemNode.querySelector('.item-text');
      checkbox.checked = item.done;
      text.textContent = item.text;
      checkbox.addEventListener('change', () => toggleItem(list.id, item.id, checkbox.checked));

      text.addEventListener('blur', () => updateItemText(list.id, item.id, text.textContent));
      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          text.blur();
        }
      });

      ul.appendChild(itemNode);
    });

    const removeButton = node.querySelector('.remove-list');
    removeButton.addEventListener('click', () => removeList(list.id));

    const focusButton = node.querySelector('.focus-list');

    // Restore focus state if this list is active
    if (list.id === activeFocusListId) {
      const card = node.querySelector('.list-card');
      card.classList.add('fullscreen');
      focusButton.textContent = '✕';
    }

    focusButton.addEventListener('click', (e) => {
      const card = e.target.closest('.list-card');
      const isFullscreen = card.classList.toggle('fullscreen');

      if (isFullscreen) {
        activeFocusListId = list.id;
        focusButton.textContent = '✕';
      } else {
        activeFocusListId = null;
        focusButton.textContent = '⤢';
      }
    });

    const addItemForm = node.querySelector('.add-item-form');
    const addItemInput = node.querySelector('.add-item-input');
    addItemForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = addItemInput.value.trim();
      if (text) {
        addItemToList(list.id, text);
        addItemInput.value = '';
      }
    });

    elements.listContainer.appendChild(node);
  });
}

async function addItemToList(listId, text) {
  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return;

  const list = lists[listIndex];
  const newItem = {
    id: crypto.randomUUID(),
    text,
    done: false,
    doneDate: null
  };

  const updatedList = {
    ...list,
    items: [...list.items, newItem]
  };

  lists[listIndex] = updatedList;
  await saveListToDB(updatedList);
  // Re-render specifically this list or all lists. For simplicity, re-render all to keep state consistent
  renderLists();
}

async function toggleItem(listId, itemId, done) {
  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return;

  const list = lists[listIndex];
  const updatedList = {
    ...list,
    items: list.items.map((item) => (item.id === itemId ? {
      ...item,
      done,
      doneDate: done ? new Date().toISOString() : null
    } : item))
  };

  lists[listIndex] = updatedList;
  await saveListToDB(updatedList);
}

async function updateListTitle(listId, newTitle) {
  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return;

  const list = lists[listIndex];
  if (list.title === newTitle) return;

  const updatedList = { ...list, title: newTitle };
  lists[listIndex] = updatedList;
  await saveListToDB(updatedList);
}

async function updateItemText(listId, itemId, newText) {
  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return;

  const list = lists[listIndex];
  const item = list.items.find(i => i.id === itemId);
  if (item && item.text === newText) return;

  const updatedList = {
    ...list,
    items: list.items.map((item) => (item.id === itemId ? { ...item, text: newText } : item))
  };

  lists[listIndex] = updatedList;
  await saveListToDB(updatedList);
}

async function removeList(listId) {
  lists = lists.filter((list) => list.id !== listId);
  await deleteListFromDB(listId);
  renderLists();
}

export {
  toggleItem,
  handleFileUpload,
  parseItems,
  lists,
  initApp
};
