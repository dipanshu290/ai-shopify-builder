import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: boolean;
}

export default function Input({
  label,
  helperText,
  error = false,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-neutral-900">
          {label}
        </label>
      )}
      <input
        className={`px-4 py-2 border-2 rounded-base text-base font-normal transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:bg-neutral-50 disabled:text-neutral-300 ${
          error
            ? 'border-error text-error'
            : 'border-neutral-200 text-neutral-900 hover:border-neutral-300'
        } ${className}`}
        {...props}
      />
      {helperText && (
        <span className={`text-xs ${error ? 'text-error' : 'text-neutral-500'}`}>
          {helperText}
        </span>
      )}
    </div>
  );
}
