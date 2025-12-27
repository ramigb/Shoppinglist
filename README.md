# Shopping List Generator

A lightweight, single-page shopping list builder that parses comma or newline separated items into timestamped todo-style lists. Lists are stored locally in your browser and can be synced to Google Drive—no backend required.

## Features
- Paste items separated by commas or new lines to instantly build a shopping list.
- Automatic list title using the creation date/time (or add your own title).
- Check items off like a todo list and delete entire lists.
- Persists to `localStorage` and can sync the same data file to Google Drive.
- Works as a static page—open `index.html` directly or serve via any static host.

## Running the app
Open `index.html` in a browser. Everything is handled client-side; no build tools are required.

## Enabling Google Drive sync
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Drive API** and configure an **OAuth Client ID** (type: Web Application) plus an **API Key**.
3. Add your OAuth Client ID and API Key into the inputs at the top of the app.
4. Click **Sign in with Google**, grant access, then use **Sync to Drive** or **Load from Drive** to save/restore `shoppinglist-data.json` in your Drive.

> The app requests the minimal `drive.file` scope so it can only manage files it creates.

## Data model
The Drive sync file stores a JSON payload:
```json
{
  "lists": [
    {
      "id": "uuid",
      "title": "Shopping list title",
      "createdAt": "2024-01-01T12:34:56.000Z",
      "items": [
        { "id": "uuid", "text": "Milk", "done": false }
      ]
    }
  ]
}
```

## Notes
- Drive sync requires running the app from a secure origin (https:// or localhost).
- If you change API credentials, re-enter them and sign in again to refresh the session.
