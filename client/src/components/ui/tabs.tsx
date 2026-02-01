'use client'

import * as React from 'react'

const Tabs = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {defaultValue?: string}> (({ className = '', defaultValue, children, ...props }, ref) => {
  const [activeTab, setActiveTab] = React.useState(defaultValue)

  // Recursively clone children and inject activeTab/setActiveTab
  const cloneWithProps = (child: React.ReactNode): React.ReactNode => {
    if (!React.isValidElement(child)) return child

    // Check if this is a TabsList or TabsContent component
    if (typeof child.type !== 'string') {
      const displayName = (child.type as any).displayName
      if (displayName === 'TabsList' || displayName === 'TabsContent') {
        return React.cloneElement(child, { activeTab, setActiveTab} as any)
      }
    }

    // For other elements (like divs), recursively process their children
    if ((child.props as any)?.children) {
      return React.cloneElement(child, {...(child.props as any),
        children: React.Children.map((child.props as any).children, cloneWithProps),
      } as any)
    }
    return child
  }

  return (
    <div ref={ref} className={className} {...props}>
      {React.Children.map(children, cloneWithProps)}
    </div>
  )
})
Tabs.displayName = 'Tabs'

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & {activeTab?: string; setActiveTab?: (value: string) => void}>(({ className = '', activeTab, setActiveTab, children, ...props }, ref) => (
  <div ref={ref} role="tablist" className={`${className}`} {...props}>
    {React.Children.map(children, (child) => {
      if (React.isValidElement(child)) {
        return React.cloneElement(child, {activeTab, setActiveTab} as any)
      }
      return child
    })}
  </div>
))
TabsList.displayName = 'TabsList'

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value?: string
  activeTab?: string
  setActiveTab?: (value: string) => void
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className = '', value = '', activeTab, setActiveTab, ...props }, ref) => (
    <button ref={ref} role="tab" type="button" onClick={() => setActiveTab?.(value)}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        activeTab === value
          ? 'bg-accent text-white shadow-sm'
          : 'text-muted hover:text-primary'
      } ${className}`}
      data-state={activeTab === value ? 'active' : 'inactive'}
      {...props}
    />
  )
)
TabsTrigger.displayName = 'TabsTrigger'

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  activeTab?: string
  setActiveTab?: (value: string) => void
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps> (({ className = '', value = '', activeTab, setActiveTab, ...props }, ref) => (
    <div ref={ref} role="tabpanel" className={`mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`}
      hidden={activeTab !== value}
      {...props}
    />
  )
)
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
