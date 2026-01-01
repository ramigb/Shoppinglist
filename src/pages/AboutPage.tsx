export default function AboutPage() {
  return (
    <div className="prose dark:prose-invert max-w-none">
      <h1>About Us</h1>
      <p>
        A lightweight, single-page shopping list builder that parses comma or
        newline separated items into timestamped todo-style lists. Lists are
        stored locally in your browser.
      </p>
      <h3>Features</h3>
      <ul>
        <li>
          <strong>Easy Entry</strong>: Paste items separated by commas or new
          lines to instantly build a shopping list.
        </li>
        <li>
          <strong>Auto-Titles</strong>: Automatic list title using the creation
          date/time (or add your own title).
        </li>
        <li>
          <strong>Check & Edit</strong>: Check items off like a todo list. Click
          on any list title or item text to edit it inline.
        </li>
        <li>
          <strong>Granular Control</strong>: Add new items to existing lists or
          delete individual items.
        </li>
        <li>
          <strong>Focus Mode</strong>: Expand a single list to full screen for
          distraction-free shopping.
        </li>
        <li>
          <strong>Sharing</strong>: Share your list with others via a generated
          URL.
        </li>
        <li>
          <strong>Persistence</strong>: Persists to localStorage via IndexedDB.
        </li>
        <li>
          <strong>PWA Support</strong>: Install as an app on your desktop or
          mobile device.
        </li>
        <li>
          <strong>Backup & Restore</strong>: Export and import your lists via
          JSON file.
        </li>
      </ul>
    </div>
  );
}
