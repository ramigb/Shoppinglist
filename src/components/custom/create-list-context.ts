import { createContext, useContext } from "react";

type CreateListContextValue = {
  openCreateList: () => void;
};

export const CreateListContext = createContext<CreateListContextValue | undefined>(undefined);

export function useCreateList() {
  const context = useContext(CreateListContext);
  if (!context) throw new Error("useCreateList must be used within CreateListProvider");
  return context;
}
