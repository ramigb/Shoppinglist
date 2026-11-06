import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { Button } from "@/components/ui/button";
import { sharingErrorMessage, sharingService } from "@/lib/sync";
import { ListInvite } from "@/types";

export function InvitationsBanner() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<ListInvite[]>([]);
  const [busyListId, setBusyListId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const email = user?.email;

  useEffect(() => {
    if (!email) return;
    const unsubscribe = sharingService.subscribeToMyInvites(email, setInvites);
    return () => {
      unsubscribe();
      setInvites([]);
    };
  }, [email]);

  if (!email || (!invites.length && !message)) return null;

  const respond = async (invite: ListInvite, accept: boolean) => {
    setBusyListId(invite.listId);
    setMessage(null);
    try {
      if (accept) await sharingService.accept(invite);
      else await sharingService.removeInvite(invite);
    } catch (error) {
      setMessage(sharingErrorMessage(error));
    } finally {
      setBusyListId(null);
    }
  };

  return (
    <section aria-label="List invitations" className="mx-auto mb-6 max-w-3xl space-y-2">
      {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
      {invites.map((invite) => (
        <div key={invite.listId} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
          <Users className="hidden size-5 shrink-0 text-primary sm:block" />
          <p className="flex-1 text-sm">
            <span className="font-semibold">{invite.fromEmail}</span> invited you to{" "}
            <span className="font-semibold">“{invite.listTitle}”</span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl" disabled={busyListId === invite.listId} onClick={() => void respond(invite, true)}>
              Accept
            </Button>
            <Button size="sm" variant="ghost" disabled={busyListId === invite.listId} onClick={() => void respond(invite, false)}>
              Decline
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
