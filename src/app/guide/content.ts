/**
 * The words of the onboarding guide, kept as plain data so what it says can be checked against the app (the labels,
 * links and pages named here are the real ones). Members read the member sections; admins read their own first, then
 * what their friends see.
 */
export interface GuideStep {
  title: string;
  body: string;
  /** A page to open for this step. */
  link?: { href: string; label: string };
}

export interface GuideSection {
  id: string;
  title: string;
  intro?: string;
  steps: GuideStep[];
}

export const MEMBER_GUIDE: GuideSection[] = [
  {
    id: "first-minute",
    title: "Your first minute",
    intro: "Home shows what needs you right now. Everything else is one tap away in the bar at the bottom.",
    steps: [
      { title: "Read the big sticker", body: "The sticker at the top of Home is the next thing to pay: the amount, when it's due, and a Pay now button." },
      { title: "Check what else is waiting", body: "\"Also waiting on you\" lists any other bills. \"Coming up\" shows what will be issued next, so nothing surprises you." },
      {
        title: "Know the bottom bar",
        body: "Home is where you act. Statements has every bill you've had. History shows the payments you've reported and what became of them. Me is your name, your email and Sign out.",
      },
    ],
  },
  {
    id: "paying",
    title: "Paying",
    intro: "You pay the admin in your own banking or e-wallet app. ambagan never moves money; it keeps track.",
    steps: [
      { title: "Send the money", body: "Open Pay now to see where to pay: the account name and number, or a QR code you can save and scan." },
      {
        title: "Report your payment",
        body: "Back in ambagan, enter the reference number from your receipt, the amount, when you paid, and which app you paid from. Tap Send for checking.",
      },
      {
        title: "Or scan the receipt",
        body: "Under \"Scan your receipt\", tap Choose screenshot and pick one. It's read on your phone, nothing is uploaded, and it fills in what it can. Always check each field before you send.",
      },
    ],
  },
  {
    id: "after",
    title: "What happens next",
    steps: [
      {
        title: "Under verification",
        body: "The admin looks for your reference in their account. Your bill shows Under verification (and History says Waiting for check), and you can't be charged late fees for the wait.",
      },
      { title: "Paid", body: "Once it's confirmed, the bill turns green and you get an email. Nothing more to do." },
      { title: "Not confirmed", body: "If the admin couldn't match it, you'll see why. Fix the details and report it again from the same bill." },
    ],
  },
  {
    id: "late-fees",
    title: "Late fees",
    steps: [
      {
        title: "If a plan has them",
        body: "Some plans add a small fee for every few days a bill is late. You'll see a note on the bill while it builds up; paying or reporting your payment stops it. What has built up is added to your next monthly bill, shown as its own line.",
      },
    ],
  },
  {
    id: "yours",
    title: "Your information",
    steps: [
      {
        title: "It's yours to ask about",
        body: "ambagan keeps your name, email, bills and the payments you report, only to run the group's shared bills. You can ask for a copy, a correction or removal at any time.",
        link: { href: "/privacy", label: "Read the privacy policy" },
      },
    ],
  },
];

export const ADMIN_GUIDE: GuideSection[] = [
  {
    id: "set-up",
    title: "Set up in three steps",
    intro: "Do these once, in this order. The checklist on Overview walks you through the same three.",
    steps: [
      {
        title: "Add how friends pay you",
        body: "In Settings, type a name under \"Add a payment method\" (GCash, a bank, anything), then open it and add the account holder, the number or a QR image, and switch on \"Show this to members\". Friends only see methods that are switched on.",
        link: { href: "/admin/settings", label: "Open Settings" },
      },
      {
        title: "Make a plan",
        body: "A plan is one shared subscription, like Spotify: the monthly fee, the day statements are issued and the day they're due. You can also add an optional late penalty.",
        link: { href: "/admin/subscriptions", label: "Open Plans" },
      },
      {
        title: "Add your friends",
        body: "In Members, add a friend with their name and email and they're sent an invitation. Forgot to pick a plan? Use \"Add to a plan\" on their card any time. Someone who doesn't need to sign in can be added with just a name (see Guests below).",
        link: { href: "/admin/members", label: "Open Members" },
      },
    ],
  },
  {
    id: "monthly",
    title: "Every month",
    intro: "ambagan does the routine; you only step in to check payments.",
    steps: [
      {
        title: "Statements and reminders go out by themselves",
        body: "Every day at 8:00 Manila time it issues statements that are due, marks late ones overdue and emails reminders: the day before, on the due day, and weekly once overdue. People who've paid or are waiting on a check aren't nagged.",
        link: { href: "/admin/statements", label: "Open Statements" },
      },
      {
        title: "Verify payments",
        body: "When a friend reports a payment you're emailed, and Verify shows a count. Open it, look for the reference in your own bank or wallet, then approve it or decline it with a reason. No receipt is kept, so your account is the proof.",
        link: { href: "/admin/payments", label: "Open Verify" },
      },
      {
        title: "Read Overview",
        body: "Overview shows how much of this month has been collected, who's overdue and what's still owed, with one sticker per person.",
        link: { href: "/admin/dashboard", label: "Open Overview" },
      },
    ],
  },
  {
    id: "ambag",
    title: "Splitting a one-off bill (ambag)",
    steps: [
      {
        title: "Start a new ambag",
        body: "Pick who's in, enter the bill, and choose how to split it: equally, by shares, by percent, exact amounts, or item by item. You can scan the receipt on your phone to fill in the items.",
        link: { href: "/admin/ambag/new", label: "New ambag" },
      },
      {
        title: "Everyone gets their share",
        body: "Members see it on Home. A friend without an account gets a private link you can copy and send by chat, or you can email them a payment request.",
      },
    ],
  },
  {
    id: "penalties",
    title: "Late penalties",
    steps: [
      {
        title: "Set the rule on the plan",
        body: "On Plans, add an amount and how often it applies (daily, every 2 days, weekly...), with an optional cap. It only applies to statements due after you switch it on.",
        link: { href: "/admin/subscriptions", label: "Open Plans" },
      },
      {
        title: "Waive what you'd rather let go",
        body: "Fees that are building up are listed on Statements, each with Waive. Once they've landed on the next statement you can remove them from it while it's unpaid.",
        link: { href: "/admin/statements", label: "Open Statements" },
      },
    ],
  },
  {
    id: "guests",
    title: "Friends without an account (guests)",
    steps: [
      {
        title: "Just a name and a link",
        body: "A guest doesn't sign in. They pay through a private link for each ambag. Add their email if you want them to get reminders and payment requests, and invite them to join whenever they're ready to have an account.",
        link: { href: "/admin/members#guests", label: "Open Guests" },
      },
    ],
  },
  {
    id: "leaving",
    title: "When someone leaves",
    steps: [
      {
        title: "Stop their bills",
        body: "Remove them from a plan, or deactivate them: they're signed out and no new statements come. Their history stays.",
        link: { href: "/admin/members", label: "Open Members" },
      },
      {
        title: "If they ask for their data to be deleted",
        body: "On a deactivated person's card, \"Remove personal data\" erases their name, email and sign-in details. Their payments stay in your records, shown as \"Former member\".",
      },
    ],
  },
  {
    id: "safety",
    title: "Keeping it safe",
    steps: [
      {
        title: "Backups",
        body: "A backup is taken every day. In Settings you can take one now. Copy them off the server now and then, because a backup on the same machine won't help if the machine is lost.",
        link: { href: "/admin/settings", label: "Open Settings" },
      },
      { title: "Emails", body: "Every message ambagan sends is listed with whether it was delivered, so you can see if a friend's reminder went out.", link: { href: "/admin/notifications", label: "Open Emails" } },
    ],
  },
];

export interface GuideFor {
  /** The sections written for this person's role. */
  yours: GuideSection[];
  /** For an admin: what their friends see, so they know what they're being sent. */
  theirs: GuideSection[];
}

export function guideFor(role: "MEMBER" | "ADMIN"): GuideFor {
  return role === "ADMIN" ? { yours: ADMIN_GUIDE, theirs: MEMBER_GUIDE } : { yours: MEMBER_GUIDE, theirs: [] };
}
