'use client';

import { HStack } from '@astryxdesign/core/HStack';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  isNetworkMode,
  NETWORK_MODE_CHANGE_EVENT,
  NETWORK_MODE_META,
  NETWORK_MODE_ORDER,
  NETWORK_MODE_STORAGE_KEY,
} from '@/lib/network-mode';
import { ApiError } from '@/lib/request/ApiError';
import { preferencesApi } from '@/services';
import type { NetworkMode } from '@/types';

interface NetworkFormProps {
  /** SSR 时从 UserPreference 读取的初始值 */
  initialMode: NetworkMode;
}

/**
 * 网络模式设置
 *
 * SegmentedControl 即时保存（无底部保存栏）。
 * 通过 window 事件 'network-mode-change' 通知主页重新探测状态灯。
 */
export function NetworkForm({ initialMode }: NetworkFormProps) {
  const [mode, setMode] = useState<NetworkMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleChange = async (value: string) => {
    const newMode = value as NetworkMode;
    const previousMode = mode;
    setMode(newMode);
    setSaving(true);
    setMsg(null);

    try {
      localStorage.setItem(NETWORK_MODE_STORAGE_KEY, newMode);
      await preferencesApi.update('networkMode', newMode);
      setMsg({ type: 'success', text: '已保存' });

      // 通知主页重新探测状态灯
      window.dispatchEvent(
        new CustomEvent(NETWORK_MODE_CHANGE_EVENT, { detail: newMode }),
      );
    } catch (e) {
      // 保存失败时回滚为修改前的值
      setMode(previousMode);
      if (e instanceof ApiError && e.isNetworkError) {
        setMsg({ type: 'error', text: '网络错误' });
      } else {
        setMsg({ type: 'error', text: '保存失败' });
      }
    } finally {
      setSaving(false);
    }
  };

  // 挂载后同步浏览器本地持久化的网络模式
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NETWORK_MODE_STORAGE_KEY);
      if (isNetworkMode(stored)) setMode(stored);
    } catch {}
  }, []);

  // 监听右上角工具栏触发或跨标签页触发的网络模式变更，保持设置页同步
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NetworkMode>).detail;
      if (isNetworkMode(detail)) setMode(detail);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === NETWORK_MODE_STORAGE_KEY && isNetworkMode(e.newValue)) {
        setMode(e.newValue);
      }
    };
    window.addEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const meta = NETWORK_MODE_META[mode];

  return (
    <SettingsSection title="网络" description="影响卡片点击跳转使用的 URL">
      <VStack gap={2}>
        <SegmentedControl
          label="网络模式"
          value={mode}
          onChange={handleChange}
          layout="fill"
          isDisabled={saving}
        >
          {NETWORK_MODE_ORDER.map((m) => {
            const item = NETWORK_MODE_META[m];
            return (
              <SegmentedControlItem
                key={m}
                value={m}
                label={item.label}
                icon={<item.Icon size={ICON_SIZE.md} />}
              />
            );
          })}
        </SegmentedControl>
        <Text size="sm" color="secondary">
          {meta.description}
        </Text>
        <HStack gap={2} align="center">
          {saving && (
            <Text size="sm" color="secondary">
              保存中…
            </Text>
          )}
          {msg && (
            <Text
              size="sm"
              className={msg.type === 'success' ? 'text-success' : 'text-error'}
            >
              {msg.text}
            </Text>
          )}
        </HStack>
      </VStack>
    </SettingsSection>
  );
}
