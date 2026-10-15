'use client';

import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { useEffect, useState } from 'react';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  isNetworkMode,
  NETWORK_MODE_CHANGE_EVENT,
  NETWORK_MODE_META,
  NETWORK_MODE_ORDER,
  NETWORK_MODE_STORAGE_KEY,
} from '@/lib/network-mode';
import { preferencesApi } from '@/services';
import type { NetworkMode } from '@/types';

export function NetworkForm({ initialMode }: { initialMode: NetworkMode }) {
  const [mode, setMode] = useState(initialMode);
  const [saving, setSaving] = useState(false);
  const feedback = useSaveFeedback();

  const handleChange = async (value: string) => {
    if (saving || !isNetworkMode(value) || value === mode) return;
    const previous = mode;
    setMode(value);
    setSaving(true);
    try {
      await preferencesApi.update('networkMode', value);
      try {
        localStorage.setItem(NETWORK_MODE_STORAGE_KEY, value);
      } catch {}
      window.dispatchEvent(
        new CustomEvent(NETWORK_MODE_CHANGE_EVENT, { detail: value }),
      );
      feedback.success('网络模式已保存');
    } catch {
      setMode(previous);
      feedback.error('网络模式保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NETWORK_MODE_STORAGE_KEY);
      if (isNetworkMode(stored)) setMode(stored);
    } catch {}
    const handler = (event: Event) => {
      const value = (event as CustomEvent<NetworkMode>).detail;
      if (isNetworkMode(value)) setMode(value);
    };
    const storage = (event: StorageEvent) => {
      if (
        event.key === NETWORK_MODE_STORAGE_KEY &&
        isNetworkMode(event.newValue)
      )
        setMode(event.newValue);
    };
    window.addEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
      window.removeEventListener('storage', storage);
    };
  }, []);

  return (
    <SettingsSection title="网络" layout="rows">
      <SettingRow
        label="网络模式"
        description={NETWORK_MODE_META[mode].description}
      >
        <SegmentedControl
          label="网络模式"
          value={mode}
          onChange={handleChange}
          layout="fill"
          isDisabled={saving}
        >
          {NETWORK_MODE_ORDER.map((value) => {
            const item = NETWORK_MODE_META[value];
            return (
              <SegmentedControlItem
                key={value}
                value={value}
                label={item.label}
                icon={<item.Icon size={ICON_SIZE.sm} />}
              />
            );
          })}
        </SegmentedControl>
      </SettingRow>
    </SettingsSection>
  );
}
