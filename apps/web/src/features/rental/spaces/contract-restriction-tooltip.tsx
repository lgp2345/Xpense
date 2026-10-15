import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function ContractRestrictionTooltip({
  label,
  message,
  ...buttonProps
}: ComponentProps<typeof Button> & {
  label: string
  message: string | null
}) {
  if (!message) return <Button aria-label={label} {...buttonProps} />
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button aria-label={label} {...buttonProps} focusableWhenDisabled />
        }
      />
      <TooltipContent sideOffset={4}>{message}</TooltipContent>
    </Tooltip>
  )
}
