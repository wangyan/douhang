'use client';

import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

interface OptionTileProps {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  children?: ReactNode;
}

export function OptionTile({
  name,
  value,
  label,
  checked,
  onChange,
  disabled = false,
  children,
}: OptionTileProps) {
  return (
    <label
      className="settings-option-tile"
      title={label}
      data-selected={checked}
      data-disabled={disabled}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
        aria-label={label}
      />
      {children}
      <Text
        as="div"
        size="sm"
        weight={checked ? 'semibold' : 'normal'}
        className="truncate"
      >
        {label}
      </Text>
    </label>
  );
}
