import React from 'react';

type TagVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';

interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  onRemove?: () => void;
  children: React.ReactNode;
}

const variantStyles: Record<TagVariant, { bg: string; text: string; border: string }> = {
  default: {
    bg: 'bg-neutral-100',
    text: 'text-neutral-700',
    border: 'border-neutral-200',
  },
  success: {
    bg: 'bg-green-50',
    text: 'text-success',
    border: 'border-green-200',
  },
  warning: {
    bg: 'bg-yellow-50',
    text: 'text-warning',
    border: 'border-yellow-200',
  },
  error: {
    bg: 'bg-red-50',
    text: 'text-error',
    border: 'border-red-200',
  },
  info: {
    bg: 'bg-blue-50',
    text: 'text-info',
    border: 'border-blue-200',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple',
    border: 'border-purple-200',
  },
};

export default function Tag({
  variant = 'default',
  onRemove,
  children,
  className = '',
  ...props
}: TagProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium border ${styles.bg} ${styles.text} ${styles.border} ${className}`}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 hover:opacity-70 transition-opacity"
          aria-label="Remove tag"
        >
          ✕
        </button>
      )}
    </span>
  );
}
