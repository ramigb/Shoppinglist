export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">About Basket</p>
      <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">A shopping list that stays out of your way.</h1>
      <p className="mb-10 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Fast to fill, easy to scan, and private by default. Your lists stay on this device unless you choose to share or export them.</p>
      <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
      <h2 className="mb-5 text-xl font-bold">What you can do</h2>
      <ul className="grid gap-3 text-muted-foreground sm:grid-cols-2">
        <li>
          <strong className="text-foreground">Easy entry</strong> — Paste items separated by commas or new
          lines to instantly build a shopping list.
        </li>
        <li>
          <strong className="text-foreground">Auto titles</strong> — Automatic list title using the creation
          date/time (or add your own title).
        </li>
        <li>
          <strong className="text-foreground">Check and edit</strong> — Check items off. Tap
          on any list title or item text to edit it inline.
        </li>
        <li>
          <strong className="text-foreground">Full control</strong> — Add new items to existing lists or
          delete individual items.
        </li>
        <li>
          <strong className="text-foreground">Focus mode</strong> — Expand a single list to full screen for
          distraction-free shopping.
        </li>
        <li>
          <strong className="text-foreground">Sharing</strong> — Share your list with others via a generated
          URL.
        </li>
        <li>
          <strong className="text-foreground">Private storage</strong> — Persists locally via IndexedDB.
        </li>
        <li>
          <strong className="text-foreground">Installable</strong> — Add it to your desktop or
          mobile device.
        </li>
        <li>
          <strong className="text-foreground">Backup</strong> — Export and import your lists via a
          JSON file.
        </li>
      </ul>
      </div>
    </div>
  );
}
