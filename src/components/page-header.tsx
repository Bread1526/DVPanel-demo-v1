import React from 'react'; // Added React import

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

// Memoize PageHeader to prevent re-renders if props haven't changed
const PageHeaderMemoized = ({ title, description, actions }: PageHeaderProps) => {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

PageHeaderMemoized.displayName = 'PageHeader';
export const PageHeader = React.memo(PageHeaderMemoized);