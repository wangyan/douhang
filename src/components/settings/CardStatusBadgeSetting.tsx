'use client';

import { useEffect, useState } from 'react';
import { CARD_STATUS_BADGE_EVENT } from '@/components/layout/card-view-events';
import { SwitchSettingRow } from '@/components/settings/SwitchSettingRow';
import {
  GUEST_PREF_KEYS,
  getGuestPreference,
  setGuestPreference,
} from '@/lib/guest-preferences';
import { preferencesApi } from '@/services';

interface CardStatusBadgeSettingProps {
  initialEnabled: boolean;
  isAuthed?: boolean;
}

/**
 * 可达状态设置行（嵌入外观 Card 内）
 *
 * - 左侧标签说明，右侧 Switch，管理员即时落库；游客双层偏好保存在本地
 * - 派发事件让已挂载的主页即时生效
 */
export function CardStatusBadgeSetting({
  initialEnabled,
  isAuthed = true,
}: CardStatusBadgeSettingProps) {
  const [enabled, setEnabled] = useState(initialEnabled);

  useEffect(() => {
    if (!isAuthed) {
      const guestBadge = getGuestPreference<boolean | null>(
        GUEST_PREF_KEYS.CARD_STATUS_BADGE,
        null,
      );
      if (guestBadge !== null) {
        setEnabled(guestBadge);
      }
      const storageHandler = (e: StorageEvent) => {
        if (
          e.key === GUEST_PREF_KEYS.CARD_STATUS_BADGE &&
          e.newValue !== null
        ) {
          setEnabled(e.newValue === 'true');
        }
      };
      window.addEventListener('storage', storageHandler);
      return () => window.removeEventListener('storage', storageHandler);
    }
  }, [isAuthed]);

  const handleChange = async (checked: boolean) => {
    const prev = enabled;
    setEnabled(checked);
    setGuestPreference(GUEST_PREF_KEYS.CARD_STATUS_BADGE, checked);
    window.dispatchEvent(
      new CustomEvent(CARD_STATUS_BADGE_EVENT, { detail: checked }),
    );

    if (!isAuthed) return;

    try {
      await preferencesApi.update('cardStatusBadge', checked);
    } catch {
      setEnabled(prev);
      setGuestPreference(GUEST_PREF_KEYS.CARD_STATUS_BADGE, prev);
      window.dispatchEvent(
        new CustomEvent(CARD_STATUS_BADGE_EVENT, { detail: prev }),
      );
    }
  };

  return (
    <SwitchSettingRow
      label="可达状态"
      description="卡片右上角的服务探测状态点（在线 / 离线）"
      switchLabel="显示卡片可达状态点"
      checked={enabled}
      onChange={handleChange}
    />
  );
}
