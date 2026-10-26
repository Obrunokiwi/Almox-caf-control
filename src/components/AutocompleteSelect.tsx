import React, { useState, useRef, useEffect, useMemo, useId, useCallback } from 'react';
import { Search, ChevronDown, X, Check, Loader2, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';

export interface AutocompleteOption {
  value: string | number;
  label: string;
  secondaryLabel?: string;
  badge?: string;
  badgeVariant?: 'regular' | 'warning' | 'danger' | 'info' | 'success';
  keywords?: string;
  disabled?: boolean;
  metadata?: any;
}

export interface AutocompleteSelectProps {
  options: AutocompleteOption[];
  value: string | number | null | undefined;
  onChange: (value: any, option?: AutocompleteOption) => void;
  label?: string;
  placeholder?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  renderOption?: (option: AutocompleteOption, isSelected: boolean, isHighlighted: boolean) => React.ReactNode;
  emptyMessage?: string;
  emptyCatalogMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  allowClear?: boolean;
  autoFocus?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSelectCallback?: (option?: AutocompleteOption) => void;
  name?: string;
  id?: string;
}

export function normalizeSearchText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const AutocompleteSelect: React.FC<AutocompleteSelectProps> = ({
  options = [],
  value,
  onChange,
  label,
  placeholder = 'Selecione uma opção...',
  loading = false,
  error = null,
  onRetry,
  disabled = false,
  renderOption,
  emptyMessage = 'Nenhum resultado encontrado para o termo digitado.',
  emptyCatalogMessage = 'Nenhum registro cadastrado nesta área.',
  emptyActionLabel,
  onEmptyAction,
  allowClear = true,
  autoFocus = false,
  className = '',
  size = 'md',
  required = false,
  inputRef,
  onSelectCallback,
  name,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [alignRight, setAlignRight] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeInputRef = inputRef || internalInputRef;
  const listboxId = useId();

  // Localiza a opção selecionada de forma resiliente a tipos (string vs number)
  const selectedOption = useMemo(() => {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const strVal = String(value);
    return options.find((opt) => String(opt.value) === strVal);
  }, [options, value]);

  // Filtra opções em tempo real (multi-token, acentuação normalizada, substrings em qualquer ordem)
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) {
      return options;
    }
    const tokens = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const searchTarget = normalizeSearchText(
        `${opt.value} ${opt.label} ${opt.secondaryLabel || ''} ${opt.badge || ''} ${opt.keywords || ''}`
      );
      return tokens.every((token) => searchTarget.includes(token));
    });
  }, [options, searchTerm]);

  // Limita a exibição inicial a 50 itens para máxima performance
  const displayedOptions = useMemo(() => {
    return filteredOptions.slice(0, 50);
  }, [filteredOptions]);

  // Recalcula direção de abertura (cima/baixo e esquerda/direita) para evitar estourar a viewport
  const updateDropdownDirection = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 320 && spaceAbove > spaceBelow) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }
      const isNearRightEdge = rect.left + 380 > window.innerWidth;
      setAlignRight(isNearRightEdge);
    }
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setHighlightedIndex(0);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
  }, []);

  // Ajusta direção e scroll do item destacado
  useEffect(() => {
    if (isOpen) {
      updateDropdownDirection();
    }
  }, [isOpen, updateDropdownDirection]);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Selecionar opção definitivamente
  const handleSelect = (option: AutocompleteOption) => {
    if (option.disabled) return;
    onChange(option.value, option);
    setSearchTerm('');
    setIsOpen(false);
    setHighlightedIndex(0);

    if (onSelectCallback) {
      onSelectCallback(option);
    }
  };

  // Limpar valor
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(typeof value === 'number' ? (0 as any) : '', undefined);
    setSearchTerm('');
    setIsOpen(true);
    setHighlightedIndex(0);
    activeInputRef.current?.focus();
    if (onSelectCallback) {
      onSelectCallback(undefined);
    }
  };

  // Navegação por teclado conforme critérios de acessibilidade WAI-ARIA
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
      setHighlightedIndex((prev) => (prev < displayedOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : displayedOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayedOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < displayedOptions.length) {
        handleSelect(displayedOptions[highlightedIndex]);
      }
    } else if (e.key === 'Tab') {
      if (isOpen && displayedOptions.length > 0 && highlightedIndex >= 0 && highlightedIndex < displayedOptions.length) {
        handleSelect(displayedOptions[highlightedIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(0);
    }
  };

  const isSmall = size === 'sm';
  const hasValue = selectedOption !== undefined && selectedOption.value !== '' && selectedOption.value !== 0;

  // Texto a exibir no campo quando aberto vs fechado
  const displayedInputValue = isOpen ? searchTerm : (selectedOption ? selectedOption.label : '');

  return (
    <div className={`w-full min-w-0 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 min-w-0"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div ref={containerRef} className="relative w-full min-w-0">
        <div
          className={`relative flex items-center w-full min-w-0 ${
            isSmall ? 'px-2 py-1 min-h-[34px]' : 'px-3 py-2 min-h-[42px]'
          } bg-white border rounded-lg text-xs transition-all ${
            disabled
              ? 'bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : error
              ? 'border-rose-400 ring-2 ring-rose-500/10'
              : isOpen
              ? 'border-teal-600 ring-2 ring-teal-500/20 shadow-xs'
              : 'border-slate-300 hover:border-slate-400 shadow-2xs'
          }`}
          onClick={() => {
            if (!disabled) {
              if (!isOpen) {
                setIsOpen(true);
                setSearchTerm('');
                setHighlightedIndex(0);
              }
              activeInputRef.current?.focus();
            }
          }}
        >
          {/* Ícone de Busca ou Loading */}
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 text-teal-600 animate-spin shrink-0" />
          ) : (
            <Search className={`w-3.5 h-3.5 mr-2 shrink-0 ${disabled ? 'text-slate-300' : 'text-slate-400'}`} />
          )}

          {/* Input controlável com autocompletar */}
          <div className="flex-1 min-w-0 flex items-center">
            <input
              ref={activeInputRef}
              id={id}
              name={name}
              type="text"
              disabled={disabled}
              autoFocus={autoFocus}
              required={required && !hasValue}
              value={displayedInputValue}
              placeholder={isOpen && selectedOption ? selectedOption.label : placeholder}
              title={selectedOption ? `${selectedOption.label} ${selectedOption.secondaryLabel ? `(${selectedOption.secondaryLabel})` : ''}` : ''}
              onFocus={() => {
                if (!disabled && !isOpen) {
                  setIsOpen(true);
                  setSearchTerm('');
                  setHighlightedIndex(0);
                }
              }}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!isOpen) setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="w-full min-w-0 bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs font-normal leading-relaxed truncate"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-activedescendant={
                isOpen && displayedOptions[highlightedIndex]
                  ? `${listboxId}-opt-${highlightedIndex}`
                  : undefined
              }
            />
          </div>

          {/* Botão de Limpar e Chevron */}
          <div className="flex items-center gap-1 ml-1.5 shrink-0">
            {!disabled && allowClear && hasValue && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                title="Limpar seleção"
                aria-label="Limpar campo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  const nextState = !isOpen;
                  setIsOpen(nextState);
                  if (nextState) {
                    setSearchTerm('');
                    setHighlightedIndex(0);
                    activeInputRef.current?.focus();
                  }
                }
              }}
              className="p-0.5 text-slate-400 hover:text-slate-600 transition-transform cursor-pointer"
              aria-label="Alternar lista"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-teal-600' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Dropdown Painel Absoluto Ancorado */}
        {isOpen && !disabled && (
          <div
            className={`absolute z-50 ${alignRight ? 'right-0' : 'left-0'} min-w-full w-max max-w-[92vw] sm:max-w-[620px] bg-white border border-slate-300 rounded-xl shadow-2xl overflow-hidden text-slate-800 flex flex-col animate-fadeIn ${
              openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
            style={{ maxHeight: '340px' }}
          >
            {/* Cabeçalho do painel se houver busca ativa */}
            {searchTerm && (
              <div className="px-3.5 py-1.5 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold text-slate-500 flex items-center justify-between">
                <span>Buscando por &ldquo;{searchTerm}&rdquo;</span>
                <span>{filteredOptions.length} resultado(s)</span>
              </div>
            )}

            <ul
              id={listboxId}
              ref={listRef}
              role="listbox"
              className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 py-1 min-w-0"
            >
              {/* ESTADO 1: CARREGANDO */}
              {loading && (
                <li className="px-4 py-6 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                  <span>Carregando opções da área ativa...</span>
                </li>
              )}

              {/* ESTADO 2: ERRO AO CARREGAR */}
              {!loading && error && (
                <li className="px-4 py-4 text-center text-xs text-rose-600 bg-rose-50/50 flex flex-col items-center justify-center gap-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Erro ao carregar lista</span>
                  </div>
                  <p className="text-[11px] text-rose-500 max-w-sm">{error}</p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-1 px-3 py-1 bg-white border border-rose-300 hover:bg-rose-100 text-rose-700 font-bold text-[11px] rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Tentar novamente</span>
                    </button>
                  )}
                </li>
              )}

              {/* ESTADO 3: CATÁLOGO VAZIO (NENHUM REGISTRO CADASTRADO) */}
              {!loading && !error && options.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2.5">
                  <span className="font-medium text-slate-600">{emptyCatalogMessage}</span>
                  {onEmptyAction && emptyActionLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onEmptyAction();
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>{emptyActionLabel}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-teal-600" />
                    </button>
                  )}
                </li>
              )}

              {/* ESTADO 4: BUSCA SEM RESULTADOS */}
              {!loading && !error && options.length > 0 && displayedOptions.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-1">
                  <span className="font-semibold text-slate-600">{emptyMessage}</span>
                  <span className="text-[11px] text-slate-400">Verifique a grafia ou utilize outras palavras-chave.</span>
                </li>
              )}

              {/* ESTADO 5: RENDERIZAÇÃO DAS OPÇÕES */}
              {!loading &&
                !error &&
                displayedOptions.map((opt, index) => {
                  const isSelected = selectedOption && String(selectedOption.value) === String(opt.value);
                  const isHighlighted = highlightedIndex === index;

                  if (renderOption) {
                    return (
                      <li
                        key={`${opt.value}-${index}`}
                        id={`${listboxId}-opt-${index}`}
                        role="option"
                        aria-selected={Boolean(isSelected)}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          handleSelect(opt);
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className="cursor-pointer"
                      >
                        {renderOption(opt, Boolean(isSelected), isHighlighted)}
                      </li>
                    );
                  }

                  const getBadgeClass = (variant?: string) => {
                    switch (variant) {
                      case 'danger':
                        return 'bg-rose-100 text-rose-800 border-rose-200';
                      case 'warning':
                        return 'bg-amber-100 text-amber-800 border-amber-200';
                      case 'success':
                        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
                      case 'info':
                        return 'bg-blue-100 text-blue-800 border-blue-200';
                      default:
                        return 'bg-slate-100 text-slate-700 border-slate-200';
                    }
                  };

                  return (
                    <li
                      key={`${opt.value}-${index}`}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={Boolean(isSelected)}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handleSelect(opt);
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`px-3.5 py-2.5 min-h-[46px] text-xs flex items-start justify-between gap-3 cursor-pointer transition-colors min-w-0 ${
                        opt.disabled
                          ? 'opacity-50 cursor-not-allowed bg-slate-50'
                          : isHighlighted
                          ? 'bg-teal-50/90 text-teal-950 font-medium'
                          : isSelected
                          ? 'bg-teal-50/50 text-slate-900 font-medium'
                          : 'hover:bg-slate-50/80 text-slate-700'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        {/* Descrição completa com quebra de linha sem reticências */}
                        <div className="font-semibold text-slate-900 break-words whitespace-normal text-xs leading-snug min-w-0">
                          {opt.label}
                        </div>

                        {/* Linha secundária (UND, saldo, detalhe) */}
                        {(opt.secondaryLabel || opt.badge) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-normal min-w-0">
                            {opt.secondaryLabel && (
                              <span className="break-words whitespace-normal text-slate-500 min-w-0">
                                {opt.secondaryLabel}
                              </span>
                            )}
                            {opt.badge && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${getBadgeClass(
                                  opt.badgeVariant
                                )}`}
                              >
                                {opt.badge}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        {isSelected && <Check className="w-4 h-4 text-teal-600 stroke-[2.5] shrink-0" />}
                      </div>
                    </li>
                  );
                })}

              {/* Indicador se há mais opções não exibidas */}
              {!loading && !error && filteredOptions.length > 50 && (
                <li className="px-3 py-2 text-center text-[10px] font-semibold text-slate-400 bg-slate-50">
                  Mostrando as primeiras 50 de {filteredOptions.length} opções encontradas. Digite para refinar a busca.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {error && <p className="mt-1 text-[11px] text-rose-500 font-medium">{error}</p>}
    </div>
  );
};
