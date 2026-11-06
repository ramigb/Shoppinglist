import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sharingErrorMessage, sharingService } from "@/lib/sync";
import { ListInvite, ShoppingList } from "@/types";

interface ShareListDialogProps {
  list: ShoppingList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareListDialog({ list, open, onOpenChange }: ShareListDialogProps) {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<ListInvite[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const members = Object.entries(list.members ?? {});

  const loadInvites = () =>
    sharingService
      .pendingInvites(list.id)
      .then(setInvites)
      .catch((error) => setMessage(sharingErrorMessage(error)));

  useEffect(() => {
    if (open) void loadInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list.id]);

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(sharingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await sharingService.invite(list, email);
      setEmail("");
      await loadInvites();
    }, "Invitation sent. They'll see it next time they open the app.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Share “{list.title}”</DialogTitle>
          <DialogDescription>
            Invite someone with an account on this app. Everyone on the list can add, check off, and edit items.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInvite} className="grid gap-2 pt-2">
          <Label htmlFor="share-email">Email</Label>
          <div className="flex gap-2">
            <Input
              id="share-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" disabled={busy} className="rounded-xl">
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              Invite
            </Button>
          </div>
        </form>

        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}

        {members.length > 0 && (
          <section aria-labelledby="share-members">
            <h3 id="share-members" className="mb-2 text-sm font-semibold">People with access</h3>
            <ul className="space-y-1">
              {members.map(([uid, memberEmail]) => (
                <li key={uid} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-2 text-sm">
                  <span className="truncate">{memberEmail}</span>
                  {uid === list.ownerId ? (
                    <span className="text-xs text-muted-foreground">Owner</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Remove ${memberEmail} from this list?`)) {
                          void run(() => sharingService.removeMember(list.id, uid));
                        }
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {invites.length > 0 && (
          <section aria-labelledby="share-pending">
            <h3 id="share-pending" className="mb-2 text-sm font-semibold">Pending invitations</h3>
            <ul className="space-y-1">
              {invites.map((invite) => (
                <li key={invite.toEmail} className="flex min-h-10 items-center justify-between gap-2 rounded-xl px-2 text-sm">
                  <span className="truncate text-muted-foreground">{invite.toEmail}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Cancel invitation for ${invite.toEmail}`}
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await sharingService.removeInvite(invite);
                      await loadInvites();
                    })}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
