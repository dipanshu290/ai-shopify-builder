import React from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  helperText?: string;
  error?: boolean;
}

export default function Select({
  label,
  options,
  helperText,
  error = false,
  className = '',
  ...props
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-neutral-900">
          {label}
        </label>
      )}
      <select
        className={`px-4 py-2 border-2 rounded-base text-base font-normal bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:bg-neutral-50 disabled:text-neutral-300 ${
          error
            ? 'border-error text-error'
            : 'border-neutral-200 text-neutral-900 hover:border-neutral-300'
        } ${className}`}
        {...props}
      >
        <option value="">Select an option</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && (
        <span className={`text-xs ${error ? 'text-error' : 'text-neutral-500'}`}>
          {helperText}
        </span>
      )}
    </div>
  );
}
