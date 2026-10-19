/**
 * SYNTHETIC receipt text, as OCR might return it. Names, numbers and references are invented.
 * They mimic the *shape* of each app's receipt; real receipts will differ, so the parsers are
 * built to fail safe (ask the member to check) rather than to match these exactly.
 */

export const GCASH = `GCash
Express Send
Sent via GCash
Amount 75.50
Total Amount Sent PHP 75.50
Ref No. 7034 512 840193
Oct 10, 2026 4:25 PM
Sent to
KO*** D.
+63 917 *** 4567`;

/** Same receipt after a poor scan: O for 0, stray symbols, a balance line that is not the payment. */
export const GCASH_NOISY = `GCash
Express Send   |
Sent via GCash
Amount 75.5O
Total Amount Sent PHP 75.50
Available Balance PHP 1,234.56
Ref No. 7O34 512 84O193
Oct 1O, 2O26 4:25 PM`;

export const MAYA = `Maya
Transfer successful
You sent
₱75.50
to Kovie D.
Reference ID 4f9a1c2e8b7d
Oct 10, 2026, 04:25 PM
Fee ₱0.00`;

export const MARIBANK = `MariBank
Transfer Successful
Amount
PHP 75.50
Recipient
KOVIE D.
Reference Number
MB2610104125987
Transaction Date
10 Oct 2026 16:25:08`;

/** Fee plus total: the total is what the recipient is owed to have received. */
export const MAYA_WITH_FEE = `Maya
Transfer successful
Amount ₱75.00
Fee ₱0.50
Total ₱75.50
Reference ID 9b8c7d6e5f4a
Oct 10, 2026, 04:25 PM`;

/** No label next to any amount, and two different ones. */
export const AMBIGUOUS_AMOUNTS = `Maya
Transfer successful
₱75.50
₱100.00
Reference ID 9b8c7d6e5f4a
Oct 10, 2026, 04:25 PM`;

export const GCASH_NO_REFERENCE = `GCash
Express Send
Sent via GCash
Total Amount Sent PHP 75.50
Oct 10, 2026 4:25 PM`;

export const UNRELATED_TEXT = `Grocery receipt
Rice 5kg  250.00
Eggs 12    96.00
Total      346.00
Thank you!`;

export const THOUSANDS = `GCash
Express Send
Total Amount Sent PHP 1,250.00
Ref No. 7034 512 840193
Oct 10, 2026 4:25 PM`;
