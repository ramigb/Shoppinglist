import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ShoppingList, Item } from "@/types";
import { Copy, Expand, GripVertical, LogOut, Minimize2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { listService, itemService, MAX_ITEM_TEXT_LENGTH, MAX_LIST_TITLE_LENGTH } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-context";
import { ShareListDialog } from "./ShareListDialog";

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { user } = useAuth();
  const isOwner = !list.ownerId || list.ownerId === user?.uid;
  const sharedWithCount = Object.keys(list.members ?? {}).length - 1;
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
    let question = "Are you sure you want to delete this list?";
    if (!isOwner) question = "Leave this shared list? It will be removed from your devices.";
    else if (sharedWithCount > 0) question = "Delete this list for everyone it's shared with?";
    if (confirm(question)) {
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

  const moveItem = (itemId: string, toIndex: number) => {
    const fromIndex = items.findIndex((item) => item.id === itemId);
    if (toIndex < 0 || toIndex >= items.length || toIndex === fromIndex) return items;
    const reordered = [...items];
    reordered.splice(toIndex, 0, ...reordered.splice(fromIndex, 1));
    return reordered;
  };

  const saveOrder = async (orderedItems: Item[]) => {
    const orderChanged = orderedItems.some((item, index) => item.id !== list.items[index]?.id);
    if (!orderChanged) return;
    await listService.save({ ...list, items: orderedItems });
    onUpdate();
  };

  // Pointer events (not HTML5 drag-and-drop) so dragging also works on touch screens.
  const handleDragMove = (e: React.PointerEvent, itemId: string) => {
    if (draggingId !== itemId) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-item-id]");
    const targetIndex = items.findIndex((item) => item.id === row?.dataset.itemId);
    if (targetIndex !== -1) setItems(moveItem(itemId, targetIndex));
  };

  const handleDragEnd = () => {
    if (!draggingId) return;
    setDraggingId(null);
    saveOrder(items);
  };

  const handleHandleKeyDown = (e: React.KeyboardEvent, itemId: string, index: number) => {
    const offsets: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 };
    const offset = offsets[e.key];
    if (!offset) return;
    e.preventDefault();
    const reordered = moveItem(itemId, index + offset);
    setItems(reordered);
    saveOrder(reordered);
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
            key={list.title}
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
          {sharedWithCount > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {isOwner
                ? `Shared with ${sharedWithCount} ${sharedWithCount === 1 ? "person" : "people"}`
                : `Shared by ${list.members?.[list.ownerId ?? ""] ?? "another user"}`}
            </p>
          )}
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
          {user && isOwner && (
            <Button aria-label="Share with people" variant="ghost" size="icon" onClick={() => setShareOpen(true)}>
              <UserPlus className="size-4" />
            </Button>
          )}
          <Button aria-label={isOwner ? "Delete list" : "Leave list"} variant="ghost" size="icon" onClick={handleDeleteList} className="text-muted-foreground hover:text-destructive">
            {isOwner ? <Trash2 className="size-4" /> : <LogOut className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} /></div>
      <CardContent className="px-3 py-4 sm:px-5 sm:py-5">
        <div className="mb-5 space-y-1">
            {items.map((item, index) => (
                <div key={item.id} data-item-id={item.id} className={cn("group flex min-h-13 items-center gap-3 rounded-2xl pl-1 pr-3 transition-colors hover:bg-muted/70", item.done && "bg-muted/40", draggingId === item.id && "bg-muted shadow-md")}>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Reorder ${item.text}, use arrow keys to move`}
                        className="size-10 shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setDraggingId(item.id);
                        }}
                        onPointerMove={(e) => handleDragMove(e, item.id)}
                        onPointerUp={handleDragEnd}
                        onPointerCancel={handleDragEnd}
                        onKeyDown={(e) => handleHandleKeyDown(e, item.id, index)}
                    >
                        <GripVertical className="size-4" />
                    </Button>
                    <Checkbox
                        aria-label={`Mark ${item.text} as ${item.done ? "not purchased" : "purchased"}`}
                        className="size-6 rounded-lg data-[state=checked]:bg-primary"
                        checked={item.done}
                        onCheckedChange={(c) => handleToggleItem(item.id, c === true)}
                    />
                    <Input
                        key={item.text}
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
      {user && isOwner && <ShareListDialog list={list} open={shareOpen} onOpenChange={setShareOpen} />}
    </Card>
  );
}
