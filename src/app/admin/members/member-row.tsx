"use client";

import { Ban, Check, MailPlus, RotateCcw, UserCheck } from "lucide-react";
import { useActionState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyField } from "@/components/copy-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avatarClass } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { resendInviteAction, setActiveAction, setGuestEmailAction, type MemberActionState } from "./actions";

export interface MemberView {
  id: string;
  name: string | null;
  email: string;
  role: "MEMBER" | "ADMIN";
  isActive: boolean;
  /** A friend with no account who pays through a private link. */
  isGuest: boolean;
  /** False for a guest with only a placeholder address (nobody to email). */
  hasRealEmail: boolean;
  hasSignedIn: boolean;
  plans: string[];
  invite: "none" | "pending" | "expired" | "accepted";
  isSelf: boolean;
}

function inviteLabel(member: MemberView): string {
  if (member.hasSignedIn) return "Signed in";
  if (member.invite === "pending") return "Invite pending";
  if (member.invite === "expired") return "Invite expired";
  if (member.invite === "accepted") return "Accepted, not signed in yet";
  return "Not invited yet";
}

interface MemberRowProps {
  member: MemberView;
  /** For guests: "Invite to join", owned by the guests section so its result survives the row moving to Members. */
  promote?: { action: (formData: FormData) => void; pending: boolean };
}

export function MemberRow({ member, promote }: MemberRowProps) {
  const [resend, resendAction, resending] = useActionState<MemberActionState, FormData>(resendInviteAction, {});
  const [toggle, toggleAction] = useActionState<MemberActionState, FormData>(setActiveAction, {});
  const [emailState, saveEmailAction] = useActionState<MemberActionState, FormData>(setGuestEmailAction, {});
  const display = member.name || member.email;
  const needsInvite = member.isActive && !member.hasSignedIn && !member.isGuest;
  const error = resend.error ?? toggle.error ?? emailState.error;
  const invite = resend.invite;

  return (
    <li className={cn("sheet flex flex-col gap-3 p-4 sm:p-5", !member.isActive && "opacity-80")}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className={cn("font-display grid size-12 shrink-0 place-items-center rounded-full text-2xl", avatarClass(display))}
        >
          {display.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
            <span className="truncate">{display}</span>
            {member.role === "ADMIN" ? (
              <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-bold text-background">Admin</span>
            ) : null}
            {member.isGuest ? <span className="rounded-full bg-st-butter px-2 py-0.5 text-xs font-bold text-st-ink">Guest</span> : null}
            {member.isActive ? null : (
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2 py-0.5 text-xs font-bold text-muted-foreground">
                <Ban className="size-3" aria-hidden="true" /> Deactivated
              </span>
            )}
          </p>
          <p className="truncate text-sm text-muted-foreground">{member.hasRealEmail ? member.email : "No email"}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {member.isGuest ? (
              <span className="font-semibold">Pays through a private link, no account</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 font-semibold">
                  {member.hasSignedIn ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {inviteLabel(member)}
                </span>
                <span className="text-muted-foreground">{member.plans.length > 0 ? member.plans.join(", ") : "No plan"}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 empty:hidden sm:pl-16">
        {needsInvite ? (
          <form action={resendAction}>
            <input type="hidden" name="userId" value={member.id} />
            <Button type="submit" variant="secondary" size="sm" disabled={resending}>
              <MailPlus data-icon="inline-start" />
              {resending ? "Sending…" : member.invite === "none" ? "Send invite" : "Resend invite"}
              <span className="sr-only"> to {display}</span>
            </Button>
          </form>
        ) : null}

        {member.isGuest && member.isActive && promote ? (
          <form action={promote.action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="userId" value={member.id} />
            {member.hasRealEmail ? null : (
              <Input name="email" type="email" inputMode="email" autoComplete="off" required placeholder="Their email" aria-label={`Email for ${display}`} className="h-10 w-56" />
            )}
            {member.hasRealEmail ? null : (
              <Button type="submit" formAction={saveEmailAction} variant="outline" size="sm">
                Save email only
                <span className="sr-only"> for {display}</span>
              </Button>
            )}
            <Button type="submit" variant="secondary" size="sm" disabled={promote.pending}>
              <UserCheck data-icon="inline-start" />
              {promote.pending ? "Sending…" : "Invite to join"}
              <span className="sr-only"> {display}</span>
            </Button>
          </form>
        ) : null}

        {member.isSelf ? null : (
          <form action={toggleAction}>
            <input type="hidden" name="userId" value={member.id} />
            <input type="hidden" name="active" value={member.isActive ? "false" : "true"} />
            {member.isActive ? (
              <ConfirmButton
                variant="ghost"
                size="sm"
                confirmLabel={
                  <>
                    Sure? Deactivate<span className="sr-only"> {display}</span>
                  </>
                }
              >
                Deactivate<span className="sr-only"> {display}</span>
              </ConfirmButton>
            ) : (
              <Button type="submit" variant="ghost" size="sm">
                <RotateCcw data-icon="inline-start" /> Reactivate
                <span className="sr-only"> {display}</span>
              </Button>
            )}
          </form>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive sm:pl-16">
          {error}
        </p>
      ) : null}
      {/* Always mounted so the result is announced when it appears. */}
      <div role="status" aria-live="polite" className="sm:ml-16">
        {invite ? (
          <div className="flex flex-col gap-2 rounded-xl bg-secondary p-4">
            <p className="text-sm font-bold">
              {invite.emailSent
                ? `Invitation emailed to ${invite.email}.`
                : "Couldn't send the email. Share this link instead:"}
            </p>
            <CopyField value={invite.url} label={`Invitation link for ${display}`} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
