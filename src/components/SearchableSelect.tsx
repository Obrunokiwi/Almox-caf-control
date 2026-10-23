import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

export interface SearchableOption {
  value: string | number;
  label: string;
  secondaryLabel?: string;
  badge?: string;
  badgeVariant?: 'regular' | 'warning' | 'danger' | 'info';
  keywords?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | number;
  onChange: (value: any, option?: SearchableOption) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSelectCallback?: () => void;
  required?: boolean;
  emptyMessage?: string;
  allowClear?: boolean;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
}

export interface NativeSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface NativeSelectProps {
  options: NativeSelectOption[];
  value: string | number;
  onChange: (value: any) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  size?: 'sm' | 'md';
}

export function normalizeText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

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

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  className = '',
  inputRef,
  onSelectCallback,
  emptyMessage = 'Nenhum resultado.',
  allowClear = true,
  autoFocus = false,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const activeInputRef = inputRef || internalInputRef;

  const selectedOption = useMemo(() => {
    return options.find((opt) => String(opt.value) === String(value));
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) {
      return options;
    }
    const queryTokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const searchableHaystack = normalizeText(
        `${opt.label} ${opt.secondaryLabel || ''} ${opt.keywords || ''} ${opt.value}`
      );
      return queryTokens.every((token) => searchableHaystack.includes(token));
    });
  }, [options, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(0);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelectOption = (option: SearchableOption) => {
    if (option.disabled) return;
    onChange(option.value, option);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(0);

    if (onSelectCallback) {
      setTimeout(onSelectCallback, 50);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(typeof value === 'number' ? 0 : '', undefined);
    setSearchTerm('');
    setIsOpen(true);
    activeInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setSearchTerm('');
        setHighlightedIndex(0);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelectOption(filteredOptions[highlightedIndex]);
      } else if (filteredOptions.length === 1) {
        handleSelectOption(filteredOptions[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(0);
    }
  };

  const isSmall = size === 'sm';

  const inputPlaceholder = isOpen && !searchTerm
    ? (selectedOption ? selectedOption.label : (placeholder || 'Selecione...'))
    : (placeholder || 'Selecione...');

  return (
    <div ref={containerRef} className={`relative w-full min-w-0 ${className}`}>
      <div
        className={`relative flex items-center w-full min-w-0 ${
          isSmall ? 'px-2 py-1 min-h-[34px]' : 'px-2.5 py-1.5 min-h-[40px]'
        } bg-white border rounded text-xs transition-all ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'border-teal-500 ring-2 ring-teal-500/20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
        onClick={() => {
          if (!disabled && !isOpen) {
            setIsOpen(true);
            setSearchTerm('');
            activeInputRef.current?.focus();
          }
        }}
      >
        <Search className={`w-3.5 h-3.5 mr-2 shrink-0 ${disabled ? 'text-slate-300' : 'text-slate-400'}`} />

        <div className="flex-1 min-w-0 flex items-center">
          <input
            ref={activeInputRef}
            type="text"
            disabled={disabled}
            autoFocus={autoFocus}
            value={isOpen ? searchTerm : (selectedOption ? selectedOption.label : '')}
            placeholder={inputPlaceholder}
            onFocus={() => {
              if (!disabled) {
                setIsOpen(true);
                setSearchTerm('');
                setHighlightedIndex(0);
              }
            }}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full min-w-0 bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs leading-normal"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-haspopup="listbox"
          />
        </div>

        <div className="flex items-center gap-1 ml-1.5 shrink-0">
          {!disabled && allowClear && selectedOption && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
              title="Limpar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 cursor-pointer ${
              isOpen ? 'rotate-180 text-teal-600' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                const nextOpen = !isOpen;
                setIsOpen(nextOpen);
                if (nextOpen) {
                  setSearchTerm('');
                  activeInputRef.current?.focus();
                } else {
                  setSearchTerm('');
                }
              }
            }}
          />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="w-full mt-1 bg-white border border-slate-300 rounded shadow-md z-10 overflow-hidden text-slate-800 flex flex-col">
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            className="max-h-[260px] overflow-y-auto divide-y divide-slate-100 py-1 min-w-0"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, index) => {
                const isSelected = selectedOption && String(selectedOption.value) === String(opt.value);
                const isHighlighted = highlightedIndex === index;

                return (
                  <li
                    key={`${opt.value}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectOption(opt);
                    }}
                    onClick={() => handleSelectOption(opt)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2.5 min-h-[44px] text-xs flex items-start justify-between gap-3 cursor-pointer transition-colors min-w-0 ${
                      opt.disabled
                        ? 'opacity-50 cursor-not-allowed bg-slate-50'
                        : isHighlighted
                        ? 'bg-teal-50 text-teal-950 font-medium'
                        : isSelected
                        ? 'bg-teal-50/60 text-slate-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 break-words whitespace-normal text-xs leading-snug min-w-0">
                        {opt.label}
                      </div>

                      {(opt.secondaryLabel || opt.badge) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-normal min-w-0">
                          {opt.secondaryLabel && (
                            <span className="break-words whitespace-normal min-w-0">
                              {opt.secondaryLabel}
                            </span>
                          )}
                          {opt.badge && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 bg-slate-100 text-slate-700 border-slate-200">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-4 text-center text-xs text-slate-400">
                {emptyMessage}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
