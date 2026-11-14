import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface HailSelectOption<T extends string = string> {
  value: T;
  label: string;
  meta?: string;
  disabled?: boolean;
}

export interface HailSelectProps<T extends string = string> {
  label?: string;
  value: T;
  options: ReadonlyArray<HailSelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

export function HailSelect<T extends string = string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  size = 'md',
  className = '',
  id,
}: HailSelectProps<T>) {
  const generatedId = useId();
  const buttonId = id ?? `hail-select-${generatedId}`;
  const labelId = `${buttonId}-label`;
  const listboxId = `${buttonId}-listbox`;

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, options.findIndex((opt) => opt.value === value && !opt.disabled))
  );

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${listboxId}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, listboxId]);

  const computePlacement = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const estimatedMenuHeight = Math.min(240, options.length * 38 + 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    return spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow;
  };

  const syncSelectedIndex = () => {
    const currentIdx = options.findIndex((opt) => opt.value === value && !opt.disabled);
    const firstEnabled = options.findIndex((opt) => !opt.disabled);
    setActiveIndex(currentIdx >= 0 ? currentIdx : Math.max(0, firstEnabled));
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (!open) {
      setOpenUpward(computePlacement());
      syncSelectedIndex();
    }
    setOpen((prev) => !prev);
  };

  const moveActive = (direction: 1 | -1) => {
    if (options.length === 0) return;
    let next = activeIndex;
    for (let i = 0; i < options.length; i++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const selectOption = (opt: HailSelectOption<T>) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpenUpward(computePlacement());
          syncSelectedIndex();
          setOpen(true);
        } else {
          moveActive(1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) {
          setOpenUpward(computePlacement());
          syncSelectedIndex();
          setOpen(true);
        } else {
          moveActive(-1);
        }
        break;
      case 'Enter':
      case ' ':
        if (open) {
          event.preventDefault();
          const active = options[activeIndex];
          if (active && !active.disabled) {
            selectOption(active);
          }
        }
        break;
      case 'Home': {
        event.preventDefault();
        const first = options.findIndex((opt) => !opt.disabled);
        if (!open) {
          setOpenUpward(computePlacement());
          setOpen(true);
        }
        if (first >= 0) setActiveIndex(first);
        break;
      }
      case 'End': {
        event.preventDefault();
        if (!open) {
          setOpenUpward(computePlacement());
          setOpen(true);
        }
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i]?.disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      }
      case 'Tab':
        if (open) {
          setOpen(false);
        }
        break;
      default:
        break;
    }
  };

  const activeDescendantId = open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <div
      ref={containerRef}
      className={`hail-select-field ${size === 'sm' ? 'is-sm' : ''} ${className}`.trim()}
    >
      {label && (
        <label id={labelId} htmlFor={buttonId} className="hail-select-label">
          {label}
        </label>
      )}
      <div className="hail-select-control">
        <button
          ref={triggerRef}
          id={buttonId}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-activedescendant={activeDescendantId}
          aria-labelledby={label ? `${labelId} ${buttonId}` : undefined}
          onClick={toggleOpen}
          onKeyDown={handleTriggerKeyDown}
          className={`hail-select-trigger ${open ? 'is-open' : ''}`}
        >
          <span className="hail-select-value">
            <span className="hail-select-value-main">
              {selectedOption?.label ?? '—'}
            </span>
            {selectedOption?.meta && (
              <span className="hail-select-value-meta">{selectedOption.meta}</span>
            )}
          </span>
          <ChevronDown
            className={`hail-select-chevron ${open ? 'is-open' : ''}`}
            aria-hidden="true"
          />
        </button>

        {open && (
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            className={`hail-select-menu custom-parsecs-scroll ${openUpward ? 'is-top' : 'is-bottom'}`}
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === value;
              const isHighlighted = index === activeIndex;
              return (
                <li
                  key={opt.value}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => {
                    if (!opt.disabled) setActiveIndex(index);
                  }}
                  onClick={() => selectOption(opt)}
                  className={[
                    'hail-select-option',
                    isSelected ? 'is-selected' : '',
                    isHighlighted ? 'is-highlighted' : '',
                    opt.disabled ? 'is-disabled' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="hail-select-option-text">
                    <span className="hail-select-option-label">{opt.label}</span>
                    {opt.meta && (
                      <span className="hail-select-option-meta">{opt.meta}</span>
                    )}
                  </span>
                  <span className="hail-select-option-check" aria-hidden="true">
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
