import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { listService, itemService } from "@/lib/db";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateListDialog({ open, onOpenChange }: CreateListDialogProps) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState("");
  const navigate = useNavigate();

  const handleCreate = async () => {
    const rawItems = items.split(/\n|,/).map((t) => t.trim()).filter(Boolean);

    if (rawItems.length === 0) {
      alert("Please add at least one item.");
      return;
    }

    const createdAt = new Date().toISOString();
    const listTitle = title.trim() || format(new Date(), "MMM d, yyyy, h:mm a");

    const newList = {
      id: crypto.randomUUID(),
      title: listTitle,
      createdAt,
      items: rawItems.map((text) => ({
        id: crypto.randomUUID(),
        text,
        done: false,
        doneDate: null,
      })),
    };

    await listService.save(newList);

    // Save items to global autocomplete store
    for (const text of rawItems) {
      await itemService.save(text);
    }

    onOpenChange(false);
    setTitle("");
    setItems("");
    navigate("/"); // Go to home to see the new list (or trigger re-fetch)
    window.dispatchEvent(new Event("list-created")); // Simple event for now to trigger updates
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
          <DialogDescription>
            Enter a title and your items below. Separate items with commas or new lines.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">List Title</Label>
            <Input
              id="title"
              placeholder="Groceries..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="items">Items</Label>
            <Textarea
              id="items"
              placeholder="Milk, Eggs, Bread..."
              className="min-h-[100px]"
              value={items}
              onChange={(e) => setItems(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
            <div className="flex justify-between w-full">
                <Button variant="outline" onClick={() => {
                    setItems("");
                    setTitle("");
                }}>Clear</Button>
                <Button onClick={handleCreate}>Create List</Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
