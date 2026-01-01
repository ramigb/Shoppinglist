global.document = {
  getElementById: () => ({ addEventListener: () => {} }),
  createElement: () => ({ click: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
};
global.window = {};
global.indexedDB = {
  open: () => ({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
  }),
};
global.Blob = class {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.crypto = { randomUUID: () => 'uuid' };

try {
  import('./script.js').then(() => {
    console.log('Script loaded successfully');
  }).catch(err => {
    console.error('Script load error:', err);
    process.exit(1);
  });
} catch (e) {
  console.error('Syntax error:', e);
  process.exit(1);
}
