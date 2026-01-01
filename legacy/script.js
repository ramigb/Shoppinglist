const DB_NAME = 'ShoppingListDB';
const DB_VERSION = 2;
const STORE_NAME = 'lists';
const ITEMS_STORE_NAME = 'items';

const ICONS = {
  minimize: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>',
  maximize: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>'
};

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
  createListBtn: document.getElementById('createListBtn'),
  createListModal: document.getElementById('create-list-modal'),
  closeModal: document.getElementById('closeModal'),
  homeListContainer: document.getElementById('home-list-container'),
  sortSelect: document.getElementById('sortSelect'),
  dateFilter: document.getElementById('dateFilter'),
};

let lists = [];
let db;
let activeFocusListId = null;
let currentSort = 'newest';
let currentDateFilter = 'all';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered:', reg.scope))
      .catch((err) => console.log('Service Worker registration failed:', err));
  });
}

initApp();

async function initApp() {
  try {
    await initDB();
    lists = await getAllLists();

    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('share');
    if (sharedData) {
      const sharedList = decodeList(sharedData);
      if (sharedList) {
        if (confirm(`Import shared list '${sharedList.title}'?`)) {
          lists.unshift(sharedList);
          await saveListToDB(sharedList);
          const newUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      } else {
        alert('Invalid or corrupted shared list link.');
      }
    }

    lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderLists();
    attachEvents();
    setupNavigation();
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
      if (!db.objectStoreNames.contains(ITEMS_STORE_NAME)) {
        const itemsStore = db.createObjectStore(ITEMS_STORE_NAME, { keyPath: 'id' });
        itemsStore.createIndex('name', 'name', { unique: false });
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
  elements.createListBtn.addEventListener('click', () => {
    elements.createListModal.showModal();
  });

  elements.closeModal.addEventListener('click', () => {
    elements.createListModal.close();
  });

  elements.createListModal.addEventListener('click', (e) => {
    if (e.target === elements.createListModal) {
      elements.createListModal.close();
    }
  });

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
    for (const text of parsed) {
      await saveItemToGlobalStore(text);
    }
    renderLists();
    elements.itemInput.value = '';
    elements.listTitle.value = '';
    elements.createListModal.close();

    // Switch to Home page to see the new list
    document.querySelector('[data-target="home-page"]').click();
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

  if (elements.sortSelect) {
    elements.sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderLists();
    });
  }

  if (elements.dateFilter) {
    elements.dateFilter.addEventListener('change', (e) => {
      currentDateFilter = e.target.value;
      renderLists();
    });
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

function createListNode(list) {
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

    const deleteBtn = itemNode.querySelector('.delete-item');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteItem(list.id, item.id));
    }

    ul.appendChild(itemNode);
  });

  const removeButton = node.querySelector('.remove-list');
  removeButton.addEventListener('click', () => removeList(list.id));

  const shareButton = node.querySelector('.share-list');
  shareButton.addEventListener('click', () => shareList(list));

  const focusButton = node.querySelector('.focus-list');

  // Restore focus state if this list is active
  if (list.id === activeFocusListId) {
    const card = node.querySelector('.list-card');
    card.classList.add('fullscreen');
    focusButton.innerHTML = ICONS.minimize;
  }

  focusButton.addEventListener('click', (e) => {
    const card = e.target.closest('.list-card');
    const isFullscreen = card.classList.toggle('fullscreen');

    if (isFullscreen) {
      activeFocusListId = list.id;
      focusButton.innerHTML = ICONS.minimize;
    } else {
      activeFocusListId = null;
      focusButton.innerHTML = ICONS.maximize;
    }
  });

  const addItemForm = node.querySelector('.add-item-form');
  const addItemInput = node.querySelector('.add-item-input');

  setupAutocomplete(addItemInput, (selectedValue) => {
      addItemToList(list.id, selectedValue);
      addItemInput.value = '';
  });

  addItemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = addItemInput.value.trim();
    if (text) {
      addItemToList(list.id, text);
      addItemInput.value = '';
    }
  });

  return node;
}

function getUniqueDates(lists) {
    const dates = new Set();
    lists.forEach(list => {
        const dateStr = new Date(list.createdAt).toLocaleDateString();
        dates.add(dateStr);
    });
    return Array.from(dates).sort((a, b) => new Date(b) - new Date(a)); // Descending dates
}

function updateDateFilterOptions() {
    if (!elements.dateFilter) return;

    // Save current selection if possible
    const currentSelection = elements.dateFilter.value;

    // Clear options except "All Dates"
    elements.dateFilter.innerHTML = '<option value="all">All Dates</option>';

    const uniqueDates = getUniqueDates(lists);
    uniqueDates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = date;
        elements.dateFilter.appendChild(option);
    });

    // Restore selection if it still exists, otherwise reset to 'all'
    if (uniqueDates.includes(currentSelection)) {
        elements.dateFilter.value = currentSelection;
    } else {
        currentDateFilter = 'all';
        elements.dateFilter.value = 'all';
    }
}

function renderLists() {
  updateDateFilterOptions();

  // --- Render Home (Last created list only) ---
  // Always shows the absolute latest created list, ignoring filters
  elements.homeListContainer.innerHTML = '';
  if (!lists.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No lists created yet. Click "Create List" to get started!';
    empty.className = 'hint';
    elements.homeListContainer.appendChild(empty);
  } else {
    // lists are maintained in creation order (desc) in global state for simplicity of adding new items
    // but to be safe, we can find max createdAt
    const latestList = lists.reduce((prev, current) => (new Date(prev.createdAt) > new Date(current.createdAt)) ? prev : current, lists[0]);
    elements.homeListContainer.appendChild(createListNode(latestList));
  }

  // --- Render My Lists (Filtered & Sorted) ---
  elements.listContainer.innerHTML = '';

  let processedLists = [...lists];

  // 1. Filter
  if (currentDateFilter !== 'all') {
      processedLists = processedLists.filter(list => {
          return new Date(list.createdAt).toLocaleDateString() === currentDateFilter;
      });
  }

  // 2. Sort
  processedLists.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      if (currentSort === 'newest') {
          return dateB - dateA;
      } else {
          return dateA - dateB;
      }
  });

  if (!processedLists.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No shopping lists match your filters.';
    empty.className = 'hint';
    elements.listContainer.appendChild(empty);
  } else {
    processedLists.forEach((list) => {
      elements.listContainer.appendChild(createListNode(list));
    });
  }
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
  await saveItemToGlobalStore(text);
  // Re-render specifically this list or all lists. For simplicity, re-render all to keep state consistent
  renderLists();
}

async function searchItems(query) {
  if (!query) return [];
  query = query.toLowerCase();
  console.log("Searching for:", query);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ITEMS_STORE_NAME], "readonly");
    const store = transaction.objectStore(ITEMS_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const allItems = request.result || [];
      console.log("All items count:", allItems.length);
      const results = allItems
        .filter(item => item.name && item.name.toLowerCase().includes(query))
        .slice(0, 5);
      console.log("Found results:", results);
      resolve(results);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

async function saveItemToGlobalStore(name) {
  if (!name || typeof name !== "string") return;
  name = name.trim();
  if (!name) return;

  console.log("Attempting to save to global store:", name);

  return new Promise((resolve, reject) => {
    if (!db) {
        console.error("DB not initialized");
        return resolve();
    }
    if (!db.objectStoreNames.contains(ITEMS_STORE_NAME)) {
        console.warn("Items store not found");
        return resolve();
    }

    try {
        const transaction = db.transaction([ITEMS_STORE_NAME], "readwrite");
        const store = transaction.objectStore(ITEMS_STORE_NAME);
        const index = store.index("name");
        const request = index.get(name);

        request.onsuccess = () => {
          if (!request.result) {
            console.log("Adding new item:", name);
            store.put({ id: crypto.randomUUID(), name });
          } else {
            console.log("Item exists:", name);
          }
          resolve();
        };
        request.onerror = (event) => {
          console.warn("Error saving item to global store:", event.target.error);
          resolve();
        };
    } catch(e) {
        console.error("Transaction error:", e);
        resolve();
    }
  });
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

async function deleteItem(listId, itemId) {
  if (!confirm('Are you sure you want to delete this item?')) return;

  const listIndex = lists.findIndex(l => l.id === listId);
  if (listIndex === -1) return;

  const list = lists[listIndex];
  const updatedList = {
    ...list,
    items: list.items.filter((item) => item.id !== itemId)
  };

  lists[listIndex] = updatedList;
  await saveListToDB(updatedList);
  renderLists();
}

async function removeList(listId) {
  if (!confirm('Are you sure you want to delete this list?')) return;
  lists = lists.filter((list) => list.id !== listId);
  await deleteListFromDB(listId);
  renderLists();
}

function shareList(list) {
  const encoded = encodeList(list);
  const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    alert('Link copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy: ', err);
    alert('Failed to copy link to clipboard.');
  });
}

export {
  toggleItem,
  handleFileUpload,
  parseItems,
  lists,
  initApp,
  encodeList,
  decodeList
};

function encodeList(list) {
  const minified = {
    t: list.title,
    i: list.items.map(item => ({ t: item.text, d: item.done ? 1 : 0 }))
  };
  const json = JSON.stringify(minified);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeList(encoded) {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const minified = JSON.parse(json);

    // Validate structure
    if (!minified.t || !Array.isArray(minified.i)) {
      throw new Error('Invalid structure');
    }

    return {
      id: crypto.randomUUID(),
      title: minified.t,
      createdAt: new Date().toISOString(),
      items: minified.i.map(item => ({
        id: crypto.randomUUID(),
        text: item.t,
        done: !!item.d,
        doneDate: null
      }))
    };
  } catch (e) {
    console.error('Failed to decode:', e);
    return null;
  }
}

function setupAutocomplete(inputElement, onSelect) {
  let debounceTimer;
  const dropdown = document.createElement("ul");
  dropdown.className = "autocomplete-dropdown";
  dropdown.style.display = "none";
  inputElement.parentNode.appendChild(dropdown);

  inputElement.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = inputElement.value.trim();
    if (!query) {
      dropdown.style.display = "none";
      return;
    }

    debounceTimer = setTimeout(async () => {
      const results = await searchItems(query);
      if (results.length > 0) {
        dropdown.innerHTML = "";
        results.forEach((item) => {
          const li = document.createElement("li");
          li.className = "suggestion-item";
          li.textContent = item.name;
          li.addEventListener("click", () => {
            inputElement.value = item.name;
            dropdown.style.display = "none";
            // Optional: Auto-submit or just fill
            // onSelect(item.name);
          });
          dropdown.appendChild(li);
        });
        dropdown.style.display = "block";
      } else {
        dropdown.style.display = "none";
      }
    }, 300);
  });

  // Hide dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!inputElement.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}


function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      const targetId = link.getAttribute("data-target");

      // Update active link
      navLinks.forEach(l => l.classList.remove("active"));
      link.classList.add("active");

      // Show/Hide pages
      document.querySelectorAll(".page").forEach(page => {
        page.hidden = true;
      });
      const targetPage = document.getElementById(targetId);
      if (targetPage) {
        targetPage.hidden = false;

        // Trigger Stats render if needed
        if (targetId === "stats-page") {
          renderStats();
        }
      }
    });
  });
}


async function renderStats() {
  const statsContent = document.getElementById("statsContent");
  if (!statsContent) return;

  statsContent.innerHTML = "Loading stats...";

  try {
    const allLists = await getAllLists();

    // Aggregation
    const itemStats = {};
    let totalPurchases = 0;

    allLists.forEach(list => {
      list.items.forEach(item => {
        if (item.done && item.doneDate) {
           const name = item.text.trim(); // Normalize name?
           if (!itemStats[name]) {
             itemStats[name] = { count: 0, lastDate: item.doneDate };
           }
           itemStats[name].count++;
           if (new Date(item.doneDate) > new Date(itemStats[name].lastDate)) {
             itemStats[name].lastDate = item.doneDate;
           }
           totalPurchases++;
        }
      });
    });

    const sortedItems = Object.entries(itemStats).sort((a, b) => b[1].count - a[1].count);

    if (sortedItems.length === 0) {
      statsContent.innerHTML = "<p>No purchase history available yet.</p>";
      return;
    }

    const mostPurchased = sortedItems[0];
    const leastPurchased = sortedItems[sortedItems.length - 1];

    // Simple HTML generation
    let html = "<div class=\"stats-grid\">";

    html += `
      <div class=\"stat-card\">
        <h3>Total Items Purchased</h3>
        <p class=\"stat-value\">${totalPurchases}</p>
      </div>
      <div class=\"stat-card\">
        <h3>Most Purchased</h3>
        <p class=\"stat-value\">${mostPurchased[0]}</p>
        <p class=\"stat-sub\">${mostPurchased[1].count} times</p>
      </div>
      <div class=\"stat-card\">
        <h3>Least Purchased</h3>
        <p class=\"stat-value\">${leastPurchased[0]}</p>
        <p class=\"stat-sub\">${leastPurchased[1].count} times</p>
      </div>
    `;

    html += "</div>";

    // Detailed Table
    html += "<h3>Purchase History</h3>";
    html += "<table class=\"stats-table\"><thead><tr><th>Item</th><th>Count</th><th>Last Purchased</th></tr></thead><tbody>";

    sortedItems.slice(0, 10).forEach(([name, data]) => {
      html += `<tr>
        <td>${name}</td>
        <td>${data.count}</td>
        <td>${formatDate(new Date(data.lastDate))}</td>
      </tr>`;
    });

    html += "</tbody></table>";

    statsContent.innerHTML = html;

  } catch (err) {
    console.error("Error calculating stats:", err);
    statsContent.innerHTML = "<p>Error loading statistics.</p>";
  }
}
