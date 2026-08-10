import React from 'react';

type AlertVariant = 'success' | 'warning' | 'error' | 'info';

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  onDismiss?: () => void;
  children: React.ReactNode;
}

const variantStyles: Record<AlertVariant, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-l-4 border-success',
    icon: '✓',
    text: 'text-success',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-l-4 border-warning',
    icon: '!',
    text: 'text-warning',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-l-4 border-error',
    icon: '✕',
    text: 'text-error',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-l-4 border-info',
    icon: 'ⓘ',
    text: 'text-info',
  },
};

export default function Alert({
  variant = 'info',
  title,
  onDismiss,
  children,
  className = '',
  ...props
}: AlertProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={`${styles.bg} ${styles.border} rounded-base p-4 flex gap-3 ${className}`}
      {...props}
    >
      <div className={`${styles.text} font-bold text-lg flex-shrink-0`}>
        {styles.icon}
      </div>
      <div className="flex-1">
        {title && (
          <h3 className={`${styles.text} font-semibold text-sm mb-1`}>
            {title}
          </h3>
        )}
        <p className={`${styles.text} text-sm`}>
          {children}
        </p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`${styles.text} hover:opacity-70 transition-opacity flex-shrink-0`}
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      )}
    </div>
  );
}
