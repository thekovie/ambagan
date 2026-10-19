import { Download } from "lucide-react";
import Image from "next/image";
import { CopyField } from "@/components/copy-field";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/server/payments/methods";

/** Where to send money, with the QR to scan or save. Members see only active methods. */
export function PaymentMethodsList({ methods }: { methods: PaymentMethod[] }) {
  if (methods.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {methods.map((method) => (
        <li key={method.id} className="flex flex-col gap-4 py-6 first:pt-0">
          <div>
            <h3 className="font-display text-3xl">{method.label}</h3>
            {method.accountName ? <p className="mt-1 font-semibold">{method.accountName}</p> : null}
          </div>

          {method.accountNumber ? <CopyField value={method.accountNumber} label={`${method.label} account number`} /> : null}
          {method.instructions ? <p className="whitespace-pre-line text-muted-foreground">{method.instructions}</p> : null}

          {method.qrFile ? (
            <div className="flex flex-col items-start gap-3">
              {/* White backing keeps the code scannable in dark mode. */}
              <Image
                src={`/api/payment-methods/${method.id}/qr`}
                alt={`${method.label} payment QR code`}
                width={288}
                height={288}
                unoptimized
                className="size-72 max-w-full rounded-xl border border-border bg-white object-contain p-3"
              />
              <a href={`/api/payment-methods/${method.id}/qr?download=1`} download className={cn(buttonVariants({ variant: "outline" }))}>
                <Download data-icon="inline-start" /> Save QR image
              </a>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
