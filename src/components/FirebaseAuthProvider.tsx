import { useEffect, useMemo, useState } from "react";
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  type User,
} from "firebase/auth";
import { AuthContext } from "./auth-context";
import { firebaseAuth } from "@/lib/firebase";
import { setActiveListUser } from "@/lib/db";
import { syncService, type SyncStatus } from "@/lib/sync";

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");

  useEffect(() => syncService.subscribe(setSyncStatus), []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};

    void setPersistence(firebaseAuth, browserLocalPersistence)
      .then(() => {
        if (disposed) return;
        unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
          setReady(false);
          syncService.stop();
          await setActiveListUser(nextUser?.uid ?? null);
          if (disposed) return;
          setUser(nextUser);
          setReady(true);
          if (nextUser) void syncService.start(nextUser.uid);
        });
      })
      .catch((error) => {
        console.error("Firebase Auth could not initialize", error);
        if (!disposed) setReady(true);
      });

    return () => {
      disposed = true;
      unsubscribe();
      syncService.stop();
    };
  }, []);

  const value = useMemo(() => ({ user, syncStatus }), [user, syncStatus]);

  if (!ready) {
    return <div className="m-4 h-16 animate-pulse rounded-2xl bg-muted" aria-label="Loading account" />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
