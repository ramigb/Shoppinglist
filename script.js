const STORAGE_KEY = 'shoppinglists:data';
const DRIVE_FILE_NAME = 'shoppinglist-data.json';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const elements = {
  listTitle: document.getElementById('listTitle'),
  itemInput: document.getElementById('itemInput'),
  generateButton: document.getElementById('generateButton'),
  clearInput: document.getElementById('clearInput'),
  listContainer: document.getElementById('listContainer'),
  listTemplate: document.getElementById('listTemplate'),
  itemTemplate: document.getElementById('itemTemplate'),
  syncDrive: document.getElementById('syncDrive'),
  loadDrive: document.getElementById('loadDrive'),
  syncStatus: document.getElementById('syncStatus'),
  clientId: document.getElementById('clientId'),
  apiKey: document.getElementById('apiKey'),
  authorizeButton: document.getElementById('authorizeButton'),
  signoutButton: document.getElementById('signoutButton'),
};

let lists = readFromStorage();
let gapiInited = false;
let gisInited = false;
let tokenClient = null;

renderLists();
attachEvents();

function attachEvents() {
  maybeEnableButtons();

  elements.generateButton.addEventListener('click', () => {
    const parsed = parseItems(elements.itemInput.value);
    if (!parsed.length) {
      setStatus('Add at least one item to create a list.');
      return;
    }
    const createdAt = new Date();
    const title = elements.listTitle.value.trim() || formatDate(createdAt);
    const list = {
      id: crypto.randomUUID(),
      title,
      createdAt: createdAt.toISOString(),
      items: parsed.map((text) => ({ id: crypto.randomUUID(), text, done: false })),
    };
    lists.unshift(list);
    persist();
    renderLists();
    elements.itemInput.value = '';
    elements.listTitle.value = '';
    setStatus('List saved locally. Use Drive buttons to sync.');
  });

  elements.clearInput.addEventListener('click', () => {
    elements.itemInput.value = '';
    elements.listTitle.value = '';
  });

  elements.syncDrive.addEventListener('click', saveToDrive);
  elements.loadDrive.addEventListener('click', loadFromDrive);
  elements.authorizeButton.addEventListener('click', handleAuthClick);
  elements.signoutButton.addEventListener('click', handleSignoutClick);
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
    node.querySelector('.list-title').textContent = list.title;
    node.querySelector('.list-date').textContent = `Created ${formatDate(new Date(list.createdAt))}`;

    const ul = node.querySelector('.items');
    list.items.forEach((item) => {
      const itemNode = elements.itemTemplate.content.cloneNode(true);
      const checkbox = itemNode.querySelector('.item-checkbox');
      const text = itemNode.querySelector('.item-text');
      checkbox.checked = item.done;
      text.textContent = item.text;
      checkbox.addEventListener('change', () => toggleItem(list.id, item.id, checkbox.checked));
      ul.appendChild(itemNode);
    });

    const removeButton = node.querySelector('.remove-list');
    removeButton.addEventListener('click', () => removeList(list.id));

    elements.listContainer.appendChild(node);
  });
}

function toggleItem(listId, itemId, done) {
  lists = lists.map((list) =>
    list.id === listId
      ? { ...list, items: list.items.map((item) => (item.id === itemId ? { ...item, done } : item)) }
      : list
  );
  persist();
}

function removeList(listId) {
  lists = lists.filter((list) => list.id !== listId);
  persist();
  renderLists();
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

function readFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Unable to parse local data', error);
    return [];
  }
}

// ---- Google Drive integration ----
window.onload = () => {
  gapi.load('client', () => {
    maybeInitGapiClient();
  });
};

async function maybeInitGapiClient() {
  if (gapiInited) return;
  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) {
    setStatus('Add your Google API key and OAuth client ID to enable Drive sync.');
    return;
  }
  try {
    await gapi.client.init({
      apiKey,
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    gapiInited = true;
    setStatus('Google API ready. Sign in to start syncing.');
    maybeEnableButtons();
  } catch (error) {
    setStatus(`Failed to init Google API: ${error.message}`);
  }
}

function maybeEnableButtons() {
  const ready = gapiInited && gisInited;
  elements.authorizeButton.disabled = !ready;
}

function initTokenClient() {
  const clientId = elements.clientId.value.trim();
  const apiKey = elements.apiKey.value.trim();
  if (!clientId || !apiKey) {
    setStatus('Add your Google API key and OAuth client ID to enable Drive sync.');
    return;
  }

  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: handleTokenResponse,
    });
  }

  gisInited = true;
  maybeEnableButtons();
}

elements.clientId.addEventListener('input', initTokenClient);
elements.apiKey.addEventListener('input', () => {
  initTokenClient();
  maybeInitGapiClient();
});

function handleAuthClick() {
  if (!gisInited) {
    initTokenClient();
  }
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleTokenResponse(response) {
  if (response.error) {
    setStatus(`Auth error: ${response.error}`);
    return;
  }
  gapi.client.setToken(response); // eslint-disable-line no-undef
  setStatus('Signed in. You can sync lists with Drive.');
}

function handleSignoutClick() {
  const token = gapi.client.getToken(); // eslint-disable-line no-undef
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken(''); // eslint-disable-line no-undef
  }
  setStatus('Signed out from Google Drive.');
}

async function saveToDrive() {
  if (!ensureAuth()) return;
  setStatus('Syncing to Drive...');
  try {
    const fileId = await findDriveFile();
    const content = new Blob([JSON.stringify({ lists })], { type: 'application/json' });
    if (fileId) {
      await gapi.client.drive.files.update({
        fileId,
        uploadType: 'media',
        media: { mimeType: 'application/json', body: content },
      });
    } else {
      const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', content);
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${gapi.client.getToken().access_token}` }),
        body: form,
      });
    }
    setStatus('Drive sync complete.');
  } catch (error) {
    console.error(error);
    setStatus(`Drive sync failed: ${error.message}`);
  }
}

async function loadFromDrive() {
  if (!ensureAuth()) return;
  setStatus('Loading from Drive...');
  try {
    const fileId = await findDriveFile();
    if (!fileId) {
      setStatus('No Drive file found yet. Save once to create it.');
      return;
    }
    const response = await gapi.client.drive.files.get({
      fileId,
      alt: 'media',
    });
    if (response.body) {
      const parsed = JSON.parse(response.body);
      if (parsed.lists) {
        lists = parsed.lists;
        persist();
        renderLists();
        setStatus('Lists updated from Drive.');
      }
    }
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load from Drive: ${error.message}`);
  }
}

async function findDriveFile() {
  const response = await gapi.client.drive.files.list({
    q: `name='${DRIVE_FILE_NAME}'`,
    spaces: 'drive',
    fields: 'files(id, name)',
  });
  const file = response.result.files?.[0];
  return file ? file.id : null;
}

function ensureAuth() {
  const token = gapi.client.getToken(); // eslint-disable-line no-undef
  if (!token) {
    setStatus('Sign in with Google to use Drive sync.');
    return false;
  }
  if (!elements.apiKey.value.trim() || !elements.clientId.value.trim()) {
    setStatus('Add your API key and OAuth client ID.');
    return false;
  }
  return true;
}

function setStatus(message) {
  elements.syncStatus.textContent = message;
}
