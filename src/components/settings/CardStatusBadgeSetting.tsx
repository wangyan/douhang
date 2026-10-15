'use client';

import { useEffect, useRef, useState } from 'react';
import { CARD_STATUS_BADGE_EVENT } from '@/components/layout/card-view-events';
import { SwitchSettingRow } from '@/components/settings/SwitchSettingRow';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { GUEST_PREF_KEYS, getGuestPreference } from '@/lib/guest-preferences';
import { preferencesApi } from '@/services';

interface CardStatusBadgeSettingProps {
  initialEnabled: boolean;
  isAuthed?: boolean;
}

/** 可达状态显示偏好，游客仅保存在本机。 */
export function CardStatusBadgeSetting({
  initialEnabled,
  isAuthed = true,
}: CardStatusBadgeSettingProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const feedback = useSaveFeedback();

  useEffect(() => {
    if (!isAuthed) {
      setEnabled(
        getGuestPreference(GUEST_PREF_KEYS.CARD_STATUS_BADGE, initialEnabled),
      );
    }
    const eventHandler = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      if (typeof value === 'boolean') setEnabled(value);
    };
    const storageHandler = (event: StorageEvent) => {
      if (!isAuthed && event.key === GUEST_PREF_KEYS.CARD_STATUS_BADGE) {
        setEnabled(
          event.newValue === null ? initialEnabled : event.newValue === 'true',
        );
      }
    };
    window.addEventListener(CARD_STATUS_BADGE_EVENT, eventHandler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(CARD_STATUS_BADGE_EVENT, eventHandler);
      window.removeEventListener('storage', storageHandler);
    };
  }, [isAuthed, initialEnabled]);

  const handleChange = async (checked: boolean) => {
    if (savingRef.current || checked === enabled) return;
    savingRef.current = true;
    setSaving(true);
    const previous = enabled;
    let previousLocal: string | null = null;
    let localWritten = false;
    const publish = (value: boolean) => {
      setEnabled(value);
      window.dispatchEvent(
        new CustomEvent(CARD_STATUS_BADGE_EVENT, { detail: value }),
      );
    };
    try {
      previousLocal = localStorage.getItem(GUEST_PREF_KEYS.CARD_STATUS_BADGE);
      localStorage.setItem(GUEST_PREF_KEYS.CARD_STATUS_BADGE, String(checked));
      localWritten = true;
      publish(checked);
      if (isAuthed) await preferencesApi.update('cardStatusBadge', checked);
      feedback.success(
        isAuthed ? '可达状态设置已保存' : '可达状态设置已保存在本机',
      );
    } catch {
      if (localWritten) {
        try {
          if (previousLocal === null) {
            localStorage.removeItem(GUEST_PREF_KEYS.CARD_STATUS_BADGE);
          } else {
            localStorage.setItem(
              GUEST_PREF_KEYS.CARD_STATUS_BADGE,
              previousLocal,
            );
          }
        } catch {}
      }
      publish(previous);
      feedback.error('可达状态设置保存失败，已恢复原设置');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SwitchSettingRow
      label="可达状态"
      description="显示卡片右上角的服务探测状态点（在线 / 离线）"
      switchLabel="显示卡片可达状态点"
      checked={enabled}
      disabled={saving}
      onChange={(checked) => void handleChange(checked)}
    />
  );
}
