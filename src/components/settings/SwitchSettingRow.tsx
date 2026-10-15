'use client';

import { Switch } from '@astryxdesign/core/Switch';
import { SettingRow } from '@/components/settings/SettingRow';

interface SwitchSettingRowProps {
  label: string;
  description: string;
  switchLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SwitchSettingRow({
  label,
  description,
  switchLabel,
  checked,
  onChange,
  disabled = false,
}: SwitchSettingRowProps) {
  return (
    <SettingRow label={label} description={description} isSwitch>
      <Switch
        label={switchLabel ?? label}
        isLabelHidden
        value={checked}
        onChange={onChange}
        isDisabled={disabled}
      />
    </SettingRow>
  );
}
