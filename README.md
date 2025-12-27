# Shopping List Generator

A lightweight, single-page shopping list builder that parses comma or newline separated items into timestamped todo-style lists. Lists are stored locally in your browser.

## Features
- Paste items separated by commas or new lines to instantly build a shopping list.
- Automatic list title using the creation date/time (or add your own title).
- Check items off like a todo list and delete entire lists.
- Persists to `localStorage` via IndexedDB.
- Works as a static page—open `index.html` directly or serve via any static host.
- Backup and restore your lists via JSON file.

## Running the app
Open `index.html` in a browser. Everything is handled client-side; no build tools are required.

## Data model
The backup file stores a JSON payload:
```json
{
  "lists": [
    {
      "id": "uuid",
      "title": "Shopping list title",
      "createdAt": "2024-01-01T12:34:56.000Z",
      "items": [
        { "id": "uuid", "text": "Milk", "done": false, "doneDate": null }
      ]
    }
  ]
}
```
