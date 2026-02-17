'use client'

import * as React from 'react'

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className = '', value, defaultValue, onValueChange, children, ...props }, ref) => {
    // Internal state for uncontrolled mode
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    
    // Determine if we are controlled or uncontrolled
    const isControlled = value !== undefined;
    const activeTab = isControlled ? value : uncontrolledValue;

    const setActiveTab = (newValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(newValue);
      }
      onValueChange?.(newValue);
    };

    const cloneWithProps = (child: React.ReactNode): React.ReactNode => {
      if (!React.isValidElement(child)) return child;

      // Cast to any or a specific shape to satisfy TS for the property checks
      const childProps = child.props as { children?: React.ReactNode; [key: string]: any };
      const childType = child.type as any;
      const displayName = childType.displayName;

      // Inject props into the specific Tab components
      if (displayName === 'TabsList' || displayName === 'TabsContent') {
        return React.cloneElement(child, { activeTab, setActiveTab } as any);
      }

      // Recursively process children if they exist
      if (childProps.children) {
        return React.cloneElement(child, {
          ...childProps,
          children: React.Children.map(childProps.children, cloneWithProps),
        } as any);
      }

      return child;
    };

    return (
      <div ref={ref} className={className} {...props}>
        {React.Children.map(children, cloneWithProps)}
      </div>
    );
  }
);
Tabs.displayName = 'Tabs';

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
