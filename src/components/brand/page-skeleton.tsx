import { CoinLoader } from "@/components/brand/coin-loader";

/** A block that shimmers while the real content is on its way. */
function Bone({ className }: { className: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/**
 * What every page shows while the server prepares it: the coin, then the rough shape of a page (a title and a few
 * sheets), so nothing jumps when the real content arrives.
 */
export function PageSkeleton({ label = "Slicing it up…" }: { label?: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <CoinLoader label={label} className="py-4" />
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Bone className="h-10 w-2/3 max-w-sm" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Bone className="h-32" />
          <Bone className="h-32" />
        </div>
        <Bone className="h-48" />
      </div>
    </div>
  );
}
