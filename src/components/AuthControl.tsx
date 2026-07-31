import { FormEvent, useState } from "react";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { Check, Cloud, CloudOff, LoaderCircle, LogOut } from "lucide-react";
import { useAuth } from "./auth-context";
import { firebaseAuth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function authErrorMessage(error: unknown) {
  if (!(error instanceof FirebaseError)) return "Sign-in failed. Please try again.";
  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "You appear to be offline. Your local lists are still available.";
    case "auth/operation-not-allowed":
      return "Email sign-in has not been enabled for this Firebase project.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export function AuthControl() {
  const { user, syncStatus } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      setPassword("");
      setOpen(false);
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setMessage("Enter your email first, then request a reset link.");
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setMessage("If that account exists, Firebase has sent a password reset email.");
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (user) {
    const syncing = syncStatus === "syncing";
    const failed = syncStatus === "offline" || syncStatus === "error";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="max-w-52 rounded-xl" aria-label={`Sync account ${user.email ?? ""}`}>
            {syncing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : failed ? (
              <CloudOff className="size-4" />
            ) : (
              <Check className="size-4" />
            )}
            <span className="hidden max-w-36 truncate lg:inline">{user.email}</span>
            <span className="lg:hidden">Sync</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <div className={cn("px-2 pb-2 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
            {syncing && "Syncing changes…"}
            {syncStatus === "synced" && "Lists are synced across your devices."}
            {syncStatus === "offline" && "Offline. Changes remain saved locally."}
            {syncStatus === "error" && "Sync needs attention. Local data is safe."}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut(firebaseAuth)}>
            <LogOut className="mr-2 size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="rounded-xl">
        <Cloud className="size-4" /> <span className="hidden sm:inline">Sync</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Sync your lists</DialogTitle>
            <DialogDescription>
              Sign in with an account created by the app administrator. There is no public registration.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSignIn} className="grid gap-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
            <Button type="submit" disabled={submitting} className="rounded-xl">
              {submitting && <LoaderCircle className="size-4 animate-spin" />}
              Sign in
            </Button>
            <Button type="button" variant="ghost" disabled={submitting} onClick={handlePasswordReset}>
              Forgot password?
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
