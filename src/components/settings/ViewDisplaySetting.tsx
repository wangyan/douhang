'use client';

import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { useEffect, useRef, useState } from 'react';
import {
  CARD_DENSITY_EVENT,
  CARD_SIMPLE_MODE_EVENT,
} from '@/components/layout/card-view-events';
import { SettingRow } from '@/components/settings/SettingRow';
import { SwitchSettingRow } from '@/components/settings/SwitchSettingRow';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { useWidgetBarVisibility } from '@/hooks/useWidgetBarVisibility';
import { GUEST_PREF_KEYS, getGuestPreference } from '@/lib/guest-preferences';
import { preferencesApi } from '@/services';
import type { CardDensity } from '@/types';

interface ViewDisplaySettingProps {
  initialCardSimpleMode: boolean;
  initialCardDensity?: CardDensity;
  isAuthed?: boolean;
}

const DENSITY_OPTIONS: { value: CardDensity; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'compact', label: '紧凑' },
  { value: 'normal', label: '标准' },
  { value: 'cozy', label: '宽松' },
];

/** 卡片显示偏好即时保存；Widget 显隐仅供管理员在本机设置。 */
export function ViewDisplaySetting({
  initialCardSimpleMode,
  initialCardDensity = 'auto',
  isAuthed = true,
}: ViewDisplaySettingProps) {
  const feedback = useSaveFeedback();
  const [simpleMode, setSimpleMode] = useState(initialCardSimpleMode);
  const [density, setDensity] = useState<CardDensity>(initialCardDensity);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const { visible: widgetBarVisible, setVisible: setWidgetBarVisible } =
    useWidgetBarVisibility();

  useEffect(() => {
    if (isAuthed) return;
    const guestDensity = getGuestPreference<CardDensity | null>(
      GUEST_PREF_KEYS.CARD_DENSITY,
      null,
    );
    if (DENSITY_OPTIONS.some((option) => option.value === guestDensity)) {
      setDensity(guestDensity as CardDensity);
    }
    setSimpleMode(
      getGuestPreference(
        GUEST_PREF_KEYS.CARD_SIMPLE_MODE,
        initialCardSimpleMode,
      ),
    );
  }, [isAuthed, initialCardSimpleMode]);

  useEffect(() => {
    const simpleHandler = (event: Event) => {
      const value = (event as CustomEvent<boolean>).detail;
      if (typeof value === 'boolean') setSimpleMode(value);
    };
    const densityHandler = (event: Event) => {
      const value = (event as CustomEvent<CardDensity>).detail;
      if (DENSITY_OPTIONS.some((option) => option.value === value)) {
        setDensity(value);
      }
    };
    window.addEventListener(CARD_SIMPLE_MODE_EVENT, simpleHandler);
    window.addEventListener(CARD_DENSITY_EVENT, densityHandler);
    return () => {
      window.removeEventListener(CARD_SIMPLE_MODE_EVENT, simpleHandler);
      window.removeEventListener(CARD_DENSITY_EVENT, densityHandler);
    };
  }, []);

  const saveDisplay = async <T extends boolean | CardDensity>(
    key: 'cardSimpleMode' | 'cardDensity',
    storageKey: string,
    event: string,
    next: T,
    previous: T,
    apply: (value: T) => void,
    label: string,
  ) => {
    if (savingRef.current || next === previous) return;
    savingRef.current = true;
    setSaving(true);
    let previousLocal: string | null = null;
    let localWritten = false;
    const publish = (value: T) => {
      apply(value);
      window.dispatchEvent(new CustomEvent(event, { detail: value }));
    };
    try {
      previousLocal = localStorage.getItem(storageKey);
      localStorage.setItem(storageKey, String(next));
      localWritten = true;
      publish(next);
      if (isAuthed) await preferencesApi.update(key, next);
      feedback.success(`${label}${isAuthed ? '已保存' : '已保存在本机'}`);
    } catch {
      if (localWritten) {
        try {
          if (previousLocal === null) localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, previousLocal);
        } catch {}
      }
      publish(previous);
      feedback.error(`${label}保存失败，已恢复原设置`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleWidgetChange = (checked: boolean) => {
    setWidgetBarVisible(checked);
    feedback.success('Widget 显示设置已保存在本机');
  };

  return (
    <>
      <SettingRow
        label="显示密度"
        description="时钟、搜索栏与卡片协同缩放；自动模式按屏幕分辨率匹配"
      >
        <SegmentedControl
          label="显示密度"
          value={density}
          layout="fill"
          isDisabled={saving}
          onChange={(value) => {
            const option = DENSITY_OPTIONS.find((item) => item.value === value);
            if (!option) return;
            void saveDisplay(
              'cardDensity',
              GUEST_PREF_KEYS.CARD_DENSITY,
              CARD_DENSITY_EVENT,
              option.value,
              density,
              setDensity,
              '显示密度',
            );
          }}
        >
          {DENSITY_OPTIONS.map((option) => (
            <SegmentedControlItem
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </SegmentedControl>
      </SettingRow>
      <SwitchSettingRow
        label="卡片简洁模式"
        description="卡片仅显示图标，隐藏名称"
        switchLabel="切换卡片简洁模式"
        checked={simpleMode}
        disabled={saving}
        onChange={(checked) =>
          void saveDisplay(
            'cardSimpleMode',
            GUEST_PREF_KEYS.CARD_SIMPLE_MODE,
            CARD_SIMPLE_MODE_EVENT,
            checked,
            simpleMode,
            setSimpleMode,
            '卡片简洁模式',
          )
        }
      />
      {isAuthed && (
        <SwitchSettingRow
          label="Widget 横条"
          description="显示时钟下方的 Widget 状态横条，仅影响本机"
          switchLabel="显示 Widget 横条"
          checked={widgetBarVisible}
          disabled={saving}
          onChange={handleWidgetChange}
        />
      )}
    </>
  );
}
