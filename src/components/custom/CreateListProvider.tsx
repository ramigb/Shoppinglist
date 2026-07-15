import { useCallback, useMemo, useState } from "react";
import { CreateListContext } from "./create-list-context";
import { CreateListDialog } from "./CreateListDialog";

export function CreateListProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openCreateList = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openCreateList }), [openCreateList]);

  return (
    <CreateListContext.Provider value={value}>
      {children}
      <CreateListDialog open={open} onOpenChange={setOpen} />
    </CreateListContext.Provider>
  );
}
