import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const buttonVariants = cva(
  'press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-[550] disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-light text-light-ink hover:bg-light/90',
        secondary: 'bg-raised text-ink ring-1 ring-inset ring-line hover:bg-raised-2 hover:ring-line-strong',
        ghost: 'text-ink-2 hover:bg-raised hover:text-ink',
        danger: 'text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger/10',
        live: 'bg-live text-white hover:bg-live/90'
      },
      size: {
        sm: 'h-8 px-3 text-small [&_svg]:size-4',
        md: 'h-9 px-3.5 text-body [&_svg]:size-4',
        lg: 'h-11 px-4 text-body [&_svg]:size-5',
        icon: 'size-9 [&_svg]:size-[18px]',
        'icon-sm': 'size-8 [&_svg]:size-4'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, type, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button'
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
