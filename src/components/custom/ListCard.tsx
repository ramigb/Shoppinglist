import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ShoppingList, Item } from "@/types";
import { Copy, Expand, Minimize2, Plus, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { listService, itemService, MAX_ITEM_TEXT_LENGTH, MAX_LIST_TITLE_LENGTH } from "@/lib/db";
import { cn } from "@/lib/utils";

interface ListCardProps {
  list: ShoppingList;
  onUpdate: () => void;
  isFocusMode?: boolean;
  toggleFocusMode?: (id: string | null) => void;
}

export function ListCard({ list, onUpdate, isFocusMode = false, toggleFocusMode }: ListCardProps) {
  const [items, setItems] = useState<Item[]>(list.items);
  const [newItemText, setNewItemText] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string, name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const completedCount = items.filter((item) => item.done).length;
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0;

  // Sync state when props change
  useEffect(() => {
    setItems(list.items);
  }, [list]);

  // Click outside to hide suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);


  const handleTitleChange = async (newTitle: string) => {
    if (newTitle === list.title) return;
    const updatedList = { ...list, title: newTitle };
    await listService.save(updatedList);
    onUpdate();
  };

  const handleDeleteList = async () => {
    if (confirm("Are you sure you want to delete this list?")) {
      await listService.delete(list.id);
      if (isFocusMode && toggleFocusMode) toggleFocusMode(null);
      onUpdate();
    }
  };

  const handleShare = () => {
    const minified = {
        t: list.title,
        i: list.items.map(item => ({ t: item.text, d: item.done ? 1 : 0 }))
      };
    const json = JSON.stringify(minified);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("share", encoded);
    const url = shareUrl.toString();

    navigator.clipboard.writeText(url).then(() => {
        // Clipboard write is the confirmation; keep the shopping flow uninterrupted.
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy link to clipboard.');
    });
  };

  const handleToggleItem = async (itemId: string, checked: boolean) => {
    const updatedItems = items.map((item) =>
      item.id === itemId
        ? { ...item, done: checked, doneDate: checked ? new Date().toISOString() : null }
        : item
    );
    setItems(updatedItems);
    await listService.save({ ...list, items: updatedItems });
    // No need for full re-fetch on simple toggle if local state is optimistic, but to keep consistent:
    onUpdate();
  };

  const handleUpdateItemText = async (itemId: string, newText: string) => {
      const updatedItems = items.map((item) =>
          item.id === itemId ? { ...item, text: newText } : item
      );
      setItems(updatedItems);
      await listService.save({ ...list, items: updatedItems });
      onUpdate();
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Delete this item?")) return;
    const updatedItems = items.filter((item) => item.id !== itemId);
    setItems(updatedItems);
    await listService.save({ ...list, items: updatedItems });
    onUpdate();
  };

  const handleAddItemInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewItemText(val);

    if (val.trim()) {
        const results = await itemService.search(val);
        setSuggestions(results);
        setShowSuggestions(true);
    } else {
        setSuggestions([]);
        setShowSuggestions(false);
    }
  };

  const addItem = async (text: string) => {
      if (!text.trim()) return;
      const newItem: Item = {
          id: crypto.randomUUID(),
          text: text.trim(),
          done: false,
          doneDate: null
      };
      const updatedItems = [...items, newItem];
      setItems(updatedItems);
      setNewItemText("");
      setShowSuggestions(false);

      await listService.save({ ...list, items: updatedItems });
      await itemService.save(text.trim());
      onUpdate();
  };

  const handleAddItemSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      addItem(newItemText);
  };

  return (
    <Card className={cn("w-full overflow-hidden rounded-3xl border-border/70 shadow-sm transition-all duration-300", isFocusMode ? "fixed inset-0 z-50 h-dvh w-screen overflow-auto rounded-none border-0" : "") }>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b bg-card px-5 pb-5 pt-5 sm:px-7 sm:pt-7">
        <div className="min-w-0 flex-1 pr-2">
          <Input
            aria-label="List title"
            className="h-auto border-none bg-transparent p-0 text-xl font-bold tracking-tight shadow-none focus-visible:ring-1 sm:text-2xl"
            defaultValue={list.title}
            maxLength={MAX_LIST_TITLE_LENGTH}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (!title) e.target.value = list.title;
              else handleTitleChange(title);
            }}
            onKeyDown={(e) => {
                if(e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <p className="mt-1.5 text-sm text-muted-foreground">
            {completedCount} of {items.length} items · {new Date(list.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {toggleFocusMode && (
              <Button aria-label={isFocusMode ? "Exit focus mode" : "Open focus mode"} variant="ghost" size="icon" onClick={() => toggleFocusMode(isFocusMode ? null : list.id)}>
                {isFocusMode ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
              </Button>
          )}
          <Button aria-label="Copy share link" variant="ghost" size="icon" onClick={handleShare}>
            <Copy className="size-4" />
          </Button>
          <Button aria-label="Delete list" variant="ghost" size="icon" onClick={handleDeleteList} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} /></div>
      <CardContent className="px-3 py-4 sm:px-5 sm:py-5">
        <div className="mb-5 space-y-1">
            {items.map((item) => (
                <div key={item.id} className={cn("group flex min-h-13 items-center gap-3 rounded-2xl px-3 transition-colors hover:bg-muted/70", item.done && "bg-muted/40")}>
                    <Checkbox
                        aria-label={`Mark ${item.text} as ${item.done ? "not purchased" : "purchased"}`}
                        className="size-6 rounded-lg data-[state=checked]:bg-primary"
                        checked={item.done}
                        onCheckedChange={(c) => handleToggleItem(item.id, c === true)}
                    />
                    <Input
                        className={cn(
                            "h-10 flex-1 border-none bg-transparent px-0 text-base shadow-none focus-visible:ring-1",
                            item.done && "line-through text-muted-foreground"
                        )}
                        defaultValue={item.text}
                        maxLength={MAX_ITEM_TEXT_LENGTH}
                        onBlur={(e) => {
                          const text = e.target.value.trim();
                          if (!text) e.target.value = item.text;
                          else handleUpdateItemText(item.id, text);
                        }}
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') e.currentTarget.blur();
                        }}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${item.text}`}
                        className="size-10 text-muted-foreground opacity-60 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                        onClick={() => handleDeleteItem(item.id)}
                    >
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            ))}
        </div>

        <div className="relative" ref={wrapperRef}>
            <form onSubmit={handleAddItemSubmit} className="flex gap-2 rounded-2xl bg-muted/70 p-1.5">
                <Input
                    aria-label="New item"
                    placeholder="Add another item"
                    value={newItemText}
                    maxLength={MAX_ITEM_TEXT_LENGTH}
                    onChange={handleAddItemInput}
                    className="h-11 flex-1 border-0 bg-transparent shadow-none"
                />
                <Button type="submit" size="icon" className="size-11 rounded-xl" aria-label="Add item">
                    <Plus className="size-5" />
                </Button>
            </form>
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-popover border rounded-md shadow-md mt-1 overflow-hidden">
                    {suggestions.map(s => (
                        <li
                            key={s.id}
                            className="cursor-pointer px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={() => addItem(s.name)}
                        >
                            {s.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
