"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

/**
 * A payment QR. If the image can't be loaded (the admin removed it, or the file is gone) the person is told to use the
 * account number instead of being left looking at an empty, broken box in the middle of paying.
 */
export function QrImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p role="note" className="flex max-w-72 items-start gap-2 rounded-xl border border-dashed border-input p-3 text-sm text-muted-foreground">
        <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        The QR code isn&apos;t available right now. Use the account number above instead.
      </p>
    );
  }
  return (
    // White backing keeps the code scannable in dark mode.
    <Image src={src} alt={alt} width={288} height={288} unoptimized onError={() => setFailed(true)} className="size-72 max-w-full rounded-xl border border-border bg-white object-contain p-3" />
  );
}
