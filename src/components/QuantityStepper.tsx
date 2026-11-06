import React, { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { round4, parseDecimalNullable } from '../utils/numberUtils.ts';

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max: number;
  step?: number;
  isFractionable?: boolean;
  disabled?: boolean;
  onChange: (newValue: number) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
  * Componente robusto de incremento/decremento numérico para computadores e dispositivos móveis.
  * - Suporta digitação direta com vírgula ou ponto e arredondamento comercial em até 4 casas decimais.
  * - Suporta uso das setas do teclado (ArrowUp / ArrowDown) e botões [-] / [+].
  * - Evita erros de ponto flutuante e respeita o limite mínimo e máximo (saldo disponível).
  */
export function QuantityStepper({
  value,
  min = 0,
  max,
  step = 1,
  isFractionable = false,
  disabled = false,
  onChange,
  className = '',
  size = 'md',
}: QuantityStepperProps) {
  const [textValue, setTextValue] = useState<string>(String(round4(value ?? 0)));

  useEffect(() => {
    setTextValue(String(round4(value ?? 0)));
  }, [value]);

  const effectiveStep = isFractionable ? (step < 1 ? step : 0.1) : (step || 1);

  const clampAndFormat = (val: number): number => {
    const safeMin = round4(min);
    const safeMax = round4(max);
    let clamped = Math.max(safeMin, Math.min(safeMax, round4(val)));
    if (!isFractionable && Number.isInteger(safeMax) && Number.isInteger(val)) {
      clamped = Math.round(clamped);
    } else {
      clamped = round4(clamped);
    }
    return clamped;
  };

  const applyChange = (num: number) => {
    const clamped = clampAndFormat(num);
    setTextValue(String(clamped));
    onChange(clamped);
  };

  const handleIncrement = () => {
    if (disabled || round4(value) >= round4(max)) return;
    const next = clampAndFormat(round4(value + effectiveStep));
    applyChange(next);
  };

  const handleDecrement = () => {
    if (disabled || round4(value) <= round4(min)) return;
    const prev = clampAndFormat(round4(value - effectiveStep));
    applyChange(prev);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextValue(raw);

    if (raw === '' || raw === '-' || raw.endsWith(',') || raw.endsWith('.')) {
      return;
    }

    const parsed = parseDecimalNullable(raw);
    if (parsed !== null) {
      const clamped = clampAndFormat(parsed);
      onChange(clamped);
    }
  };

  const handleBlur = () => {
    const parsed = parseDecimalNullable(textValue);
    if (parsed === null) {
      applyChange(min);
    } else {
      applyChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  const isSm = size === 'sm';
  const btnSizeClasses = isSm ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';
  const inputSizeClasses = isSm ? 'w-16 h-7 text-xs' : 'w-20 h-8 text-xs';

  return (
    <div
      className={`inline-flex items-center rounded-md border border-slate-300 bg-white shadow-xs overflow-hidden ${
        disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''
      } ${className}`}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || round4(value) <= round4(min)}
        title={`Diminuir quantidade (${-effectiveStep})`}
        aria-label="Diminuir quantidade"
        className={`${btnSizeClasses} flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border-r border-slate-200 select-none touch-manipulation`}
      >
        <Minus className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>

      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={textValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`${inputSizeClasses} text-center font-bold font-mono text-slate-800 bg-transparent focus:outline-none focus:bg-teal-50/60`}
      />

      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || round4(value) >= round4(max)}
        title={`Aumentar quantidade (+${effectiveStep})`}
        aria-label="Aumentar quantidade"
        className={`${btnSizeClasses} flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border-l border-slate-200 select-none touch-manipulation`}
      >
        <Plus className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>
    </div>
  );
}
