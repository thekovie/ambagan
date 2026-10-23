# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide React. Fixed by the owner's brief.

## Users
An admin (the owner, who holds the shared Spotify plan) and roughly 3–6 close friends who split it. Members mostly open the app on their phones, usually from an email link, to see what they owe and pay via GCash, Maya or MariBank QR. Admin verifies payments against the receiving account.

## Product Purpose
Ambagan is friends chipping in for something they share. Two kinds of bill: the monthly share of a shared subscription, and one-off **ambag** the admin fronted (dinner, the internet, a gift) split equally, by shares, by percent, by exact amounts or by receipt items. Friends without an account get a private link to view and pay their share. For each bill: track the share: issue a Statement of Account (SOA) per member, show how to pay, let members report a payment (optionally by scanning a receipt in the browser), and let the admin verify it. Success: everyone knows what they owe and by when, the admin never chases payments by chat, and history stays accurate.

## Positioning
A tiny private billing portal for a friend group, not a SaaS product. Real statements, references and due dates with the warmth of a group chat. Receipt screenshots never leave the phone.

## Operating Context
Philippine peso (PHP), Asia/Manila time. Statements issue on the 1st, due the 10th. Payments happen outside the app. Member journey: view SOA, pay, scan receipt, submit, wait for verification, get confirmation email. Self-hosted on a small VPS.

## Capabilities and Constraints
Invitation-only magic-link login. Statuses: Unpaid, Under verification, Paid, Overdue, Cancelled. Payment methods: added by the admin (GCash, Maya, a bank…). Browser-only OCR; no screenshots or raw OCR text stored. Terms: SOA, statement reference (e.g. SPOT-202610-A1B2C3), payment destination vs sending app. Interface and email language: English, friendly-casual.

## Brand Commitments
Display name "ambagan" (lowercase wordmark; Filipino for pooling money to split a shared cost). Tagline direction: split it, settle it. Owner wants a standout, expressive look, not a generic tracker or neutral SaaS dashboard. Direction after the owner's first review: cute but restrained ("a hint", no mascot, no confetti), a soft round typeface rather than a strong one, and no sidebar menus: navigation is a floating dock.

## Evidence on Hand
No logo, photography, testimonials or user data yet. Do not fabricate any.

## Product Principles
1. The next action is always obvious: what do I owe, by when, how do I pay.
2. Money states are unambiguous: statuses are worded and iconed, never color alone.
3. Trust through restraint with data: honest about verification (no receipt evidence retained), never implies a payment is confirmed before the admin approves.
4. Phone first, thumb reachable, fast on a weak connection.
5. Friendly among friends, exact about money.

## Accessibility & Inclusion
WCAG 2.2 AA: keyboard, labels, contrast, reduced motion, light and dark themes.
