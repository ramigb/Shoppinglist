import { useEffect, useState } from "react";
import { listService } from "@/lib/db";
import { ShoppingList, SortOption } from "@/types";
import { ListCard } from "@/components/custom/ListCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function ListsPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>("newest");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [activeFocusId, setActiveFocusId] = useState<string | null>(null);

  const fetchLists = async () => {
    try {
      const allLists = await listService.getAll();
      setLists(allLists);
    } catch (e) {
      console.error("Failed to fetch lists", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();

    const handleListCreated = () => fetchLists();
    window.addEventListener("list-created", handleListCreated);
    return () => window.removeEventListener("list-created", handleListCreated);
  }, []);

  // Derive unique dates for filter
  const uniqueDates = Array.from(new Set(lists.map(l => new Date(l.createdAt).toLocaleDateString())))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Filter and Sort
  const filteredLists = lists
    .filter(list => dateFilter === "all" || new Date(list.createdAt).toLocaleDateString() === dateFilter)
    .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sort === "newest" ? dateB - dateA : dateA - dateB;
    });

  if (loading) return <div className="h-80 animate-pulse rounded-3xl bg-muted" aria-label="Loading lists" />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">All your lists</h1><p className="mt-2 text-muted-foreground">{lists.length} {lists.length === 1 ? "list" : "lists"}, saved on this device</p></div>

        <div className="flex w-full gap-3 sm:w-auto">
            <div className="flex-1 sm:w-40">
                <Label htmlFor="sort-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort</Label>
                <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                    <SelectTrigger id="sort-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex-1 sm:w-40">
                <Label htmlFor="filter-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</Label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger id="filter-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Dates</SelectItem>
                        {uniqueDates.map(date => (
                            <SelectItem key={date} value={date}>{date}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
      </div>

      <div className="space-y-5">
        {filteredLists.length > 0 ? (
            filteredLists.map(list => (
                <ListCard
                    key={list.id}
                    list={list}
                    onUpdate={fetchLists}
                    isFocusMode={activeFocusId === list.id}
                    toggleFocusMode={setActiveFocusId}
                />
            ))
        ) : (
            <div className="rounded-3xl border border-dashed bg-card py-14 text-center text-muted-foreground">No lists match this filter.</div>
        )}
      </div>
    </div>
  );
}
