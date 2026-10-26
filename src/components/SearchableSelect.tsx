import React from 'react';
import {
  AutocompleteSelect,
  type AutocompleteOption,
  type AutocompleteSelectProps,
  normalizeSearchText
} from './AutocompleteSelect.tsx';

export type SearchableOption = AutocompleteOption;

export interface SearchableSelectProps extends AutocompleteSelectProps {}

export interface NativeSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface NativeSelectProps {
  options: NativeSelectOption[];
  value: string | number;
  onChange: (value: any) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  size?: 'sm' | 'md';
}

export const normalizeText = normalizeSearchText;

export const NativeSelect: React.FC<NativeSelectProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder,
  required = false,
  size = 'md',
}) => {
  const isSmall = size === 'sm';
  return (
    <select
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        const matched = options.find((o) => String(o.value) === val);
        onChange(matched ? matched.value : val);
      }}
      required={required}
      className={`w-full min-w-0 bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all ${
        isSmall ? 'px-2 py-1 text-xs min-h-[34px]' : 'px-2.5 py-1.5 text-xs min-h-[40px]'
      } ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''} ${className}`}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt, i) => (
        <option key={`${opt.value}-${i}`} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const SearchableSelect: React.FC<SearchableSelectProps> = (props) => {
  return <AutocompleteSelect {...props} />;
};

export { AutocompleteSelect };
