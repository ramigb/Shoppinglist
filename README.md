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

## Tech Stack
- **Framework**: React 19, Vite, TypeScript
- **Styling**: Tailwind CSS v4, Shadcn UI
- **Routing**: React Router DOM
- **State/Storage**: IndexedDB (via `idb`)

## Running the app

To run the application locally, you'll need Node.js installed.

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start the development server:**
    ```bash
    npm run dev
    ```
    Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

3.  **Build for production:**
    ```bash
    npm run build
    ```
    The build artifacts will be stored in the `dist/` directory.

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
