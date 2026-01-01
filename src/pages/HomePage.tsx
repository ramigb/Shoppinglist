import { useEffect, useState } from "react";
import { listService } from "@/lib/db";
import { ShoppingList } from "@/types";
import { ListCard } from "@/components/custom/ListCard";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const [latestList, setLatestList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);

  const fetchLatest = async () => {
    try {
      const lists = await listService.getAll();
      if (lists.length > 0) {
        // Find list with latest createdAt
        const latest = lists.reduce((prev, current) =>
          (new Date(prev.createdAt) > new Date(current.createdAt)) ? prev : current
        , lists[0]);
        setLatestList(latest);
      } else {
        setLatestList(null);
      }
    } catch (e) {
      console.error("Failed to fetch lists", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatest();

    // Listen for list creation events from the dialog
    const handleListCreated = () => fetchLatest();
    window.addEventListener("list-created", handleListCreated);
    return () => window.removeEventListener("list-created", handleListCreated);
  }, []);

  const handleSharedList = async (encoded: string) => {
      try {
        const json = decodeURIComponent(escape(atob(encoded)));
        const minified = JSON.parse(json);

        if (!minified.t || !Array.isArray(minified.i)) throw new Error('Invalid structure');

        const newList: ShoppingList = {
            id: crypto.randomUUID(),
            title: minified.t,
            createdAt: new Date().toISOString(),
            items: minified.i.map((item: {t: string, d: number}) => ({
                id: crypto.randomUUID(),
                text: item.t,
                done: !!item.d,
                doneDate: null
            }))
        };

        if (confirm(`Import shared list '${newList.title}'?`)) {
             await listService.save(newList);
             // Clear query param
             window.history.replaceState({}, document.title, window.location.pathname);
             fetchLatest();
        }
      } catch (e) {
          console.error("Failed to decode shared list", e);
          alert("Invalid shared list link.");
      }
  };

  // Handle shared list import
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('share');
    if (sharedData) {
       handleSharedList(sharedData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Latest List</h1>
      {latestList ? (
        <ListCard
            list={latestList}
            onUpdate={fetchLatest}
            isFocusMode={activeFocusId === latestList.id}
            toggleFocusMode={setActiveFocusId}
        />
      ) : (
        <div className="text-center py-10">
          <p className="text-muted-foreground mb-4">No lists created yet.</p>
          <Button onClick={() => document.querySelector<HTMLButtonElement>('header button')?.click()}>
            Create a List
          </Button>
        </div>
      )}
    </div>
  );
}
