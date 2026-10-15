import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  layout?: 'content' | 'rows';
  variant?: 'default' | 'danger';
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
  layout = 'content',
  variant = 'default',
}: SettingsSectionProps) {
  return (
    <section className="settings-group" data-variant={variant}>
      <header className="settings-group-heading">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Text
            as="h2"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              lineHeight: '1.5rem',
            }}
          >
            {title}
          </Text>
          {description && (
            <Text size="sm" color="secondary" textWrap="pretty">
              {description}
            </Text>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <Card
        padding={0}
        elevation="none"
        className="settings-group-card"
        style={
          variant === 'danger'
            ? { borderColor: 'var(--color-error)' }
            : undefined
        }
      >
        <div className={`settings-group-body settings-group-body-${layout}`}>
          {children}
        </div>
      </Card>
    </section>
  );
}
