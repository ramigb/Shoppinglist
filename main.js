const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const GAPI_SRC = 'https://apis.google.com/js/api.js';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const dom = {
  clientId: document.getElementById('clientId'),
  apiKey: document.getElementById('apiKey'),
  loginButton: document.getElementById('loginButton'),
  logoutButton: document.getElementById('logoutButton'),
  refreshButton: document.getElementById('refreshButton'),
  statusText: document.getElementById('statusText'),
  fileContainer: document.getElementById('fileContainer'),
};

const state = {
  tokenClient: null,
  accessToken: null,
  gapiReady: false,
};

dom.loginButton.addEventListener('click', () => requestAccessToken(true));
dom.logoutButton.addEventListener('click', revokeToken);
dom.refreshButton.addEventListener('click', listFiles);

dom.clientId.addEventListener('input', maybeInitTokenClient);
dom.apiKey.addEventListener('input', () => {
  maybeInitTokenClient();
  if (state.gapiReady) return;
  initializeGapiClient();
});

async function loadScript(src) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) return existing.loaded || Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.loaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureLibrariesLoaded() {
  await Promise.all([loadScript(GAPI_SRC), loadScript(GIS_SRC)]);
}

function maybeInitTokenClient() {
  if (state.tokenClient) return;
  const clientId = dom.clientId.value.trim();
  if (!clientId) {
    setStatus('Paste your OAuth Client ID to enable login.');
    return;
  }

  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: handleTokenResponse,
  });
  setStatus('Identity client ready. Click "Login with Google".');
}

async function initializeGapiClient() {
  if (state.gapiReady) return;
  const apiKey = dom.apiKey.value.trim();
  if (!apiKey) {
    setStatus('Paste your API key to initialize the Drive client.');
    return;
  }
  await ensureLibrariesLoaded();
  await new Promise((resolve, reject) => {
    gapi.load('client', {
      callback: resolve,
      onerror: () => reject(new Error('gapi failed to load client library')),
    });
  });
  await gapi.client.init({ apiKey, discoveryDocs: [DISCOVERY_DOC] });
  state.gapiReady = true;
  setStatus('Drive client initialized. Ready to sign in.');
}

async function requestAccessToken(forcePrompt = false) {
  await ensureLibrariesLoaded();
  maybeInitTokenClient();
  if (!state.tokenClient) return;
  await initializeGapiClient();
  state.tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
}

function handleTokenResponse(tokenResponse) {
  if (!tokenResponse || tokenResponse.error) {
    setStatus(`Auth error: ${tokenResponse?.error ?? 'Unknown error'}`);
    return;
  }
  state.accessToken = tokenResponse.access_token;
  gapi.client.setToken(tokenResponse);
  setStatus('Authenticated. Loading files…');
  updateAuthUi(true);
  listFiles();
}

function updateAuthUi(isAuthed) {
  dom.loginButton.hidden = isAuthed;
  dom.logoutButton.hidden = !isAuthed;
  dom.refreshButton.hidden = !isAuthed;
}

function renderFiles(files) {
  dom.fileContainer.innerHTML = '';
  if (!files.length) {
    dom.fileContainer.innerHTML = '<p class="hint">No files found.</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'drive-file-list';
  files.forEach((file) => {
    const item = document.createElement('li');
    item.className = 'item';
    item.textContent = `${file.name} — ${file.id}`;
    list.appendChild(item);
  });
  dom.fileContainer.appendChild(list);
}

async function listFiles() {
  if (!(await ensureAccessToken())) return;
  try {
    const response = await gapi.client.drive.files.list({
      pageSize: 10,
      fields: 'files(id, name)',
      orderBy: 'modifiedTime desc',
    });
    renderFiles(response.result.files || []);
    setStatus('Loaded recent files.');
  } catch (error) {
    const message = error?.result?.error?.message || error.message;
    if (message && message.toLowerCase().includes('invalid') && state.tokenClient) {
      state.accessToken = null;
      requestAccessToken();
      return;
    }
    setStatus(`Failed to list files: ${message}`);
  }
}

async function ensureAccessToken() {
  if (state.accessToken) return true;
  await requestAccessToken();
  return Boolean(state.accessToken);
}

function revokeToken() {
  if (!state.accessToken) return;
  google.accounts.oauth2.revoke(state.accessToken);
  gapi.client.setToken('');
  state.accessToken = null;
  updateAuthUi(false);
  dom.fileContainer.innerHTML = '<p class="hint">Signed out. Sign in again to see files.</p>';
  setStatus('Revoked token and signed out.');
}

setStatus('Paste your OAuth Client ID and API Key to begin.');

function setStatus(message) {
  dom.statusText.textContent = message;
}

