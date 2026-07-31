import { useEffect, useState } from "react";
import { listService } from "@/lib/db";
import { ShoppingList } from "@/types";
import { ListCard } from "@/components/custom/ListCard";
import { Button } from "@/components/ui/button";
import { ArrowRight, ListPlus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useCreateList } from "@/components/custom/create-list-context";

export default function HomePage() {
  const [latestList, setLatestList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);
  const { openCreateList } = useCreateList();

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

    const handleListsChanged = () => fetchLatest();
    window.addEventListener("lists-changed", handleListsChanged);

    // Refresh when app comes to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchLatest();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", fetchLatest);

    return () => {
      window.removeEventListener("lists-changed", handleListsChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", fetchLatest);
    };
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

  if (loading) return <div className="mx-auto h-80 max-w-3xl animate-pulse rounded-3xl bg-muted" aria-label="Loading your latest list" />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="size-4" /> Ready when you are</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Your next shop</h1>
          <p className="mt-2 text-muted-foreground">Check off items as you move through the store.</p>
        </div>
        {latestList && <Button asChild variant="ghost" className="hidden sm:flex"><Link to="/lists">All lists <ArrowRight className="size-4" /></Link></Button>}
      </div>
      {latestList ? (
        <ListCard
            list={latestList}
            onUpdate={fetchLatest}
            isFocusMode={activeFocusId === latestList.id}
            toggleFocusMode={setActiveFocusId}
        />
      ) : (
        <div className="rounded-3xl border border-dashed bg-card px-6 py-16 text-center shadow-sm">
          <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-accent text-primary"><ListPlus className="size-7" /></span>
          <h2 className="text-xl font-bold">Start with a fresh list</h2>
          <p className="mx-auto mb-6 mt-2 max-w-sm text-muted-foreground">Add everything at once—commas and new lines both work.</p>
          <Button type="button" onClick={openCreateList}>
            Create a List
          </Button>
        </div>
      )}
    </div>
  );
}
