import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

interface SettingRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  stacked?: boolean;
  isSwitch?: boolean;
}

export function SettingRow({
  label,
  description,
  children,
  stacked = false,
  isSwitch = false,
}: SettingRowProps) {
  return (
    <div className="setting-row" data-stacked={stacked} data-switch={isSwitch}>
      <div className="setting-row-label">
        <Text size="sm" weight="medium">
          {label}
        </Text>
        {description && (
          <Text size="sm" color="secondary" textWrap="pretty">
            {description}
          </Text>
        )}
      </div>
      <div className="setting-row-control">{children}</div>
    </div>
  );
}
