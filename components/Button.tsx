import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  asChild?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-700 disabled:bg-neutral-100 disabled:text-neutral-300',
  secondary: 'border-2 border-primary-600 text-primary-600 hover:bg-primary-100 active:bg-primary-200 disabled:border-neutral-100 disabled:text-neutral-300',
  ghost: 'text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200 disabled:text-neutral-300',
  icon: 'p-2 text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200 disabled:text-neutral-300 rounded-base',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm rounded-base h-8',
  md: 'px-4 py-2 text-base rounded-base h-10',
  lg: 'px-6 py-3 text-base rounded-base h-12',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  asChild = false,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles = 'font-medium transition-colors inline-flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:cursor-not-allowed';
  const classes = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      className: `${classes} ${(children as React.ReactElement<Record<string, unknown>>).props.className || ''}`,
      disabled,
      ...props,
    });
  }

  return (
    <button
      className={classes}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
