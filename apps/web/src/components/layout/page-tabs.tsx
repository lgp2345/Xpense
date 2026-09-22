import { X } from 'lucide-react'
import { type JSX, useLayoutEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type PageTabItem = {
  href: string
  identity: string
  title: string
}

type PageTabsProps = {
  activeIdentity: string | null
  onActivate: (identity: string) => void
  onClose: (identity: string) => void
  tabs: readonly PageTabItem[]
}

export function PageTabs({
  activeIdentity,
  onActivate,
  onClose,
  tabs,
}: PageTabsProps): JSX.Element | null {
  const navigationRef = useRef<HTMLElement>(null)
  const activeTabRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (activeIdentity === null) {
      return
    }

    const navigation = navigationRef.current
    const activeTab = activeTabRef.current

    if (!navigation || !activeTab) {
      return
    }

    const navigationRect = navigation.getBoundingClientRect()
    const activeTabRect = activeTab.getBoundingClientRect()

    if (activeTabRect.left < navigationRect.left) {
      navigation.scrollLeft -= navigationRect.left - activeTabRect.left
    } else if (activeTabRect.right > navigationRect.right) {
      navigation.scrollLeft += activeTabRect.right - navigationRect.right
    }
  }, [activeIdentity])

  if (tabs.length === 0) {
    return null
  }

  return (
    <nav
      aria-label="已打开页面"
      className="border-b border-border bg-muted/30 h-10 overflow-x-auto shrink-0"
      ref={navigationRef}
    >
      <div className="flex min-w-max h-10 px-2 pt-1 gap-1 items-end">
        {tabs.map((tab) => {
          const isActive = tab.identity === activeIdentity

          return (
            <div
              className={cn(
                'group flex h-9 max-w-56 items-center rounded-t-md border border-b-0 border-transparent text-sm text-muted-foreground',
                isActive
                  ? 'border-border bg-background text-foreground'
                  : 'hover:bg-accent/70 hover:text-foreground',
              )}
              data-active={isActive || undefined}
              key={tab.identity}
              ref={isActive ? activeTabRef : undefined}
            >
              <button
                aria-current={isActive ? 'page' : undefined}
                className="h-full outline-none flex-1 text-left min-w-0 px-3 truncate focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-2"
                onClick={() => onActivate(tab.identity)}
                title={tab.title}
                type="button"
              >
                {tab.title}
              </button>
              <Button
                aria-label={`关闭“${tab.title}”`}
                className="rounded-sm mr-1 opacity-60 size-6 hover:opacity-100"
                onClick={() => onClose(tab.identity)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
