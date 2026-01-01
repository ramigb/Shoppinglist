# Shopping List Generator

A lightweight, single-page shopping list builder that parses comma or newline separated items into timestamped todo-style lists. Lists are stored locally in your browser.

## Features
- **Easy Entry**: Paste items separated by commas or new lines to instantly build a shopping list.
- **Auto-Titles**: Automatic list title using the creation date/time (or add your own title).
- **Check & Edit**: Check items off like a todo list. Click on any list title or item text to edit it inline.
- **Granular Control**: Add new items to existing lists or delete individual items.
- **Focus Mode**: Expand a single list to full screen for distraction-free shopping.
- **Sharing**: Share your list with others via a generated URL.
- **Persistence**: Persists to `localStorage` via IndexedDB.
- **PWA Support**: Install as an app on your desktop or mobile device.
- **Backup & Restore**: Export and import your lists via JSON file.

## Running the app
Open `index.html` in a browser. Everything is handled client-side; no build tools are required.
You can also install it as a PWA on supported browsers.

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
