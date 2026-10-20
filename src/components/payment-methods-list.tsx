import { Download } from "lucide-react";
import Image from "next/image";
import { CopyField } from "@/components/copy-field";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/server/payments/methods";

/** What a method card needs: no secrets, no admin fields. */
export interface MethodCard {
  id: string;
  label: string;
  accountName: string | null;
  accountNumber: string | null;
  instructions: string | null;
  hasQr: boolean;
}

export const methodCard = (m: PaymentMethod): MethodCard => ({
  id: m.id,
  label: m.label,
  accountName: m.accountName,
  accountNumber: m.accountNumber,
  instructions: m.instructions,
  hasQr: Boolean(m.qrFile),
});

const memberQrPath = (id: string) => `/api/payment-methods/${id}/qr`;

/** Where to send money, with the QR to scan or save. Only active methods are ever passed in. */
export function PaymentMethodsList({ methods, qrPath = memberQrPath }: { methods: MethodCard[]; qrPath?: (id: string) => string }) {
  if (methods.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {methods.map((method) => (
        <li key={method.id} className="flex flex-col gap-4 py-6 first:pt-0">
          <div>
            <h3 className="font-display text-xl">{method.label}</h3>
            {method.accountName ? <p className="mt-1 font-semibold">{method.accountName}</p> : null}
          </div>

          {method.accountNumber ? <CopyField value={method.accountNumber} label={`${method.label} account number`} /> : null}
          {method.instructions ? <p className="whitespace-pre-line text-muted-foreground">{method.instructions}</p> : null}

          {method.hasQr ? (
            <div className="flex flex-col items-start gap-3">
              {/* White backing keeps the code scannable in dark mode. */}
              <Image
                src={qrPath(method.id)}
                alt={`${method.label} payment QR code`}
                width={288}
                height={288}
                unoptimized
                className="size-72 max-w-full rounded-xl border border-border bg-white object-contain p-3"
              />
              <a href={`${qrPath(method.id)}?download=1`} download className={cn(buttonVariants({ variant: "outline" }))}>
                <Download data-icon="inline-start" /> Save QR image
              </a>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
