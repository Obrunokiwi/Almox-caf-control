import React, { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';

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
 * - Suporta digitação direta no campo e uso das setas do teclado (ArrowUp / ArrowDown).
 * - Suporta botões de stepper [-] e [+] com alvo de toque adequado para mobile (touch-manipulation).
 * - Suporta passo inteiro ou decimal conforme a unidade do material.
 * - Valida e limita automaticamente entre o mínimo (0) e o máximo (saldo disponível do lote/estoque).
 * - Mantém sincronizado o estado da tela de dispensação ponderada.
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
  const [textValue, setTextValue] = useState<string>(String(value ?? 0));

  // Sincroniza valor recebido de props
  useEffect(() => {
    setTextValue(String(value ?? 0));
  }, [value]);

  const effectiveStep = isFractionable ? (step < 1 ? step : 0.1) : (step || 1);

  const clampAndFormat = (val: number): number => {
    let clamped = Math.max(min, Math.min(max, val));
    if (!isFractionable) {
      clamped = Math.round(clamped);
    } else {
      clamped = Math.round(clamped * 100) / 100;
    }
    return clamped;
  };

  const applyChange = (num: number) => {
    const clamped = clampAndFormat(num);
    setTextValue(String(clamped));
    onChange(clamped);
  };

  const handleIncrement = () => {
    if (disabled || value >= max) return;
    const next = clampAndFormat(value + effectiveStep);
    applyChange(next);
  };

  const handleDecrement = () => {
    if (disabled || value <= min) return;
    const prev = clampAndFormat(value - effectiveStep);
    applyChange(prev);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextValue(raw);

    if (raw === '' || raw === '-') {
      // Permite o usuário apagar temporariamente para redigitar
      return;
    }

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const clamped = clampAndFormat(parsed);
      onChange(clamped);
    }
  };

  const handleBlur = () => {
    if (textValue === '' || textValue === '-' || isNaN(parseFloat(textValue))) {
      applyChange(min);
    } else {
      applyChange(parseFloat(textValue));
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
  const inputSizeClasses = isSm ? 'w-14 h-7 text-xs' : 'w-16 h-8 text-xs';

  return (
    <div
      className={`inline-flex items-center rounded-md border border-slate-300 bg-white shadow-xs overflow-hidden ${
        disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''
      } ${className}`}
    >
      {/* Botão Decrementar (-) para Mobile e Computador */}
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        title={`Diminuir quantidade (${-effectiveStep})`}
        aria-label="Diminuir quantidade"
        className={`${btnSizeClasses} flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border-r border-slate-200 select-none touch-manipulation`}
      >
        <Minus className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>

      {/* Campo Numérico com suporte a digitação direta e setas */}
      <input
        type="number"
        min={min}
        max={max}
        step={effectiveStep}
        inputMode={isFractionable ? 'decimal' : 'numeric'}
        disabled={disabled}
        value={textValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`${inputSizeClasses} text-center font-bold font-mono text-slate-800 bg-transparent focus:outline-none focus:bg-teal-50/60 [appearance:textfield] [&::-webkit-outer-spin-button]:opacity-100 [&::-webkit-inner-spin-button]:opacity-100`}
      />

      {/* Botão Incrementar (+) para Mobile e Computador */}
      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        title={`Aumentar quantidade (+${effectiveStep})`}
        aria-label="Aumentar quantidade"
        className={`${btnSizeClasses} flex items-center justify-center text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors border-l border-slate-200 select-none touch-manipulation`}
      >
        <Plus className={isSm ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      </button>
    </div>
  );
}
