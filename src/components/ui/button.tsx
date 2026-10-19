import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Capsule controls with 44px touch targets. `foil` (magenta) is reserved for the one
// action that needs doing right now (pay / submit); everything else stays ink or quiet.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-bold tracking-[0.01em] whitespace-nowrap outline-none select-none transition-[transform,background-color,box-shadow] duration-200 ease-out-expo focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        foil: "bg-foil-magenta text-on-foil-magenta shadow-[0_8px_16px_-6px_oklch(0.3_0.17_5/0.65)] hover:brightness-110 active:shadow-[0_3px_8px_-4px_oklch(0.3_0.17_5/0.65)]",
        // For use on a coloured sachet: swaps the sachet's own foreground/background so the action stays visible on any foil.
        inverse:
          "bg-[var(--sachet-fg)] text-[var(--sachet-bg)] shadow-[0_8px_16px_-6px_oklch(0_0_0/0.4)] hover:opacity-90",
        outline:
          "border-input bg-transparent text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost: "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40",
        link: "rounded-sm text-foreground underline underline-offset-4 hover:text-foil-magenta",
      },
      size: {
        default:
          "h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-8 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-14 gap-2.5 px-7 text-base has-data-[icon=inline-end]:pr-6",
        icon: "size-11",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
