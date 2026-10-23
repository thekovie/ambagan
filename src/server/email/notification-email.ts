import { renderEmail, type Tone } from "./email-frame";
import { copyFor, type NotificationPayload, type NotificationType } from "./notification-copy";

/** Each kind of message gets its own colour and sticker, so a glance at the inbox says what it is. */
const MOOD: Record<NotificationType, { tone: Tone; badge: string }> = {
  SOA_GENERATED: { tone: "sky", badge: "🧾 New statement" },
  DUE_TOMORROW: { tone: "butter", badge: "⏰ Due tomorrow" },
  DUE_TODAY: { tone: "butter", badge: "🔔 Due today" },
  OVERDUE: { tone: "rose", badge: "🙈 Overdue" },
  PAYMENT_RECEIVED: { tone: "lilac", badge: "📨 Report received" },
  ADMIN_VERIFY_REQUEST: { tone: "lilac", badge: "🔍 Needs a check" },
  PAYMENT_APPROVED: { tone: "mint", badge: "✅ Paid" },
  PAYMENT_DECLINED: { tone: "peach", badge: "🤔 Not confirmed" },
  ADMIN_DUPLICATE_ATTEMPT: { tone: "rose", badge: "👀 Same reference twice" },
  PAYMENT_DETAILS_CHANGED: { tone: "peach", badge: "💳 Details changed" },
  TEST: { tone: "mint", badge: "🎉 It works" },
};

export interface RenderedNotification {
  html: string;
  text: string;
}

/** Renders one queued notification. The frame escapes every interpolated value, so member-supplied text can't inject markup. */
export async function renderNotification(
  type: NotificationType,
  payload: NotificationPayload,
  appUrl: string,
): Promise<RenderedNotification> {
  const copy = copyFor(type, payload);
  return renderEmail({
    preview: copy.body[0],
    ...MOOD[type],
    heading: copy.heading,
    greeting: `Hi ${payload.name.trim() || "there"},`,
    paragraphs: copy.body,
    facts: copy.facts,
    cta: copy.cta ? { label: copy.cta.label, url: `${appUrl}${copy.cta.path}` } : undefined,
    footnote: "You're getting this because you're part of the ambagan group.",
  });
}
