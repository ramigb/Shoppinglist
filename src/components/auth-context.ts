import { createContext, useContext } from "react";
import { User } from "firebase/auth";
import { SyncStatus } from "@/lib/sync";

export interface AuthContextValue {
  user: User | null;
  syncStatus: SyncStatus;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within FirebaseAuthProvider");
  return context;
}
