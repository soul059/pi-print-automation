import { AlertCircle, RefreshCw, WifiOff, ServerOff } from 'lucide-react';
import { ApiError } from '../services/api';

interface ErrorDisplayProps {
  error: Error | ApiError | string | null;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorDisplay({ error, onRetry, compact = false }: ErrorDisplayProps) {
  if (!error) return null;

  const isApiError = error instanceof ApiError;
  const isNetworkError = isApiError && error.isNetworkError;
  const message = typeof error === 'string' ? error : error.message;

  const Icon = isNetworkError ? (navigator.onLine ? ServerOff : WifiOff) : AlertCircle;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
        <Icon size={16} className="shrink-0" />
        <span className="truncate">{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto flex items-center gap-1 text-primary-600 hover:text-primary-700 text-xs font-medium"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
          <Icon size={20} className="text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-red-800 dark:text-red-300">
            {isNetworkError ? 'Connection Error' : 'Something went wrong'}
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
            >
              <RefreshCw size={14} />
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Loading skeleton components
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-2 mt-4">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b dark:border-gray-700 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b dark:border-gray-700 flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Empty state component
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-md">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
