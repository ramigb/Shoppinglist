import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ShoppingList, Item } from "@/types";
import { Trash2, Share2, Maximize2, Minimize2, Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { listService, itemService } from "@/lib/db";
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
    const url = `${window.location.origin}?share=${encoded}`;

    navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard!');
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
    <Card className={cn("w-full transition-all duration-300", isFocusMode ? "fixed inset-0 z-50 h-screen w-screen overflow-auto rounded-none m-0" : "mb-4")}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 mr-4">
          <Input
            className="text-lg font-semibold border-none focus-visible:ring-1 p-0 h-auto"
            defaultValue={list.title}
            onBlur={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => {
                if(e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Created {new Date(list.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {toggleFocusMode && (
              <Button variant="ghost" size="icon" onClick={() => toggleFocusMode(isFocusMode ? null : list.id)}>
                {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDeleteList} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 mb-4">
            {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                    <Checkbox
                        checked={item.done}
                        onCheckedChange={(c) => handleToggleItem(item.id, c === true)}
                    />
                    <Input
                        className={cn(
                            "flex-1 border-none focus-visible:ring-1 h-8 p-1",
                            item.done && "line-through text-muted-foreground"
                        )}
                        defaultValue={item.text}
                        onBlur={(e) => handleUpdateItemText(item.id, e.target.value)}
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') e.currentTarget.blur();
                        }}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-8 w-8 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={() => handleDeleteItem(item.id)}
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
            ))}
        </div>

        <div className="relative" ref={wrapperRef}>
            <form onSubmit={handleAddItemSubmit} className="flex gap-2">
                <Input
                    placeholder="Add item..."
                    value={newItemText}
                    onChange={handleAddItemInput}
                    className="flex-1"
                />
                <Button type="submit" size="icon">
                    <Plus className="h-4 w-4" />
                </Button>
            </form>
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-popover border rounded-md shadow-md mt-1 overflow-hidden">
                    {suggestions.map(s => (
                        <li
                            key={s.id}
                            className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm"
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
