'use client';

import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import {
  CARD_DENSITY_EVENT,
  CARD_SIMPLE_MODE_EVENT,
} from '@/components/layout/card-view-events';
import { SwitchSettingRow } from '@/components/settings/SwitchSettingRow';
import { useWidgetBarVisibility } from '@/hooks/useWidgetBarVisibility';
import {
  GUEST_PREF_KEYS,
  getGuestPreference,
  setGuestPreference,
} from '@/lib/guest-preferences';
import { preferencesApi } from '@/services';
import type { CardDensity } from '@/types';

interface ViewDisplaySettingProps {
  /** 卡片简洁模式（SSR 初始值，与工具栏同源） */
  initialCardSimpleMode: boolean;
  /** 卡片显示密度（SSR 初始值） */
  initialCardDensity?: CardDensity;
  /** 是否已登录（未登录游客隐藏 Widget 横条开关且不调服务端接口） */
  isAuthed?: boolean;
}

const DENSITY_OPTIONS: {
  value: CardDensity;
  label: string;
  desc: string;
}[] = [
  { value: 'auto', label: '自动', desc: '智能匹配屏幕' },
  { value: 'compact', label: '紧凑', desc: '精致小巧' },
  { value: 'normal', label: '标准', desc: '默认适中' },
  { value: 'cozy', label: '宽松', desc: '宽大舒展' },
];

/**
 * 视图显示开关（外观快捷面板与设置页「显示」分区）
 *
 * - 显示密度：四档切换（自动 / 紧凑 / 标准 / 宽松），事件同步主页即时重排
 * - 卡片简洁模式：管理员即时落库；游客双层偏好仅写入本地 localStorage
 * - Widget 横条显隐：仅管理员可见与控制；未登录游客彻底隐藏开关行
 */
export function ViewDisplaySetting({
  initialCardSimpleMode,
  initialCardDensity = 'auto',
  isAuthed = true,
}: ViewDisplaySettingProps) {
  const showToast = useToast();
  const [simpleMode, setSimpleMode] = useState(initialCardSimpleMode);
  const [density, setDensity] = useState<CardDensity>(initialCardDensity);
  const { visible: widgetBarVisible, setVisible: setWidgetBarVisible } =
    useWidgetBarVisibility();

  // 挂载后若本地有游客密度偏好则采信
  useEffect(() => {
    if (!isAuthed) {
      const guestDensity = getGuestPreference<CardDensity | null>(
        GUEST_PREF_KEYS.CARD_DENSITY,
        null,
      );
      if (guestDensity) {
        setDensity(guestDensity);
      }
    }
  }, [isAuthed]);

  // 外部（如工具栏按钮）切换后保持开关同步：与 HomeContent/工具栏共用同一事件总线
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setSimpleMode(detail);
    };
    window.addEventListener(CARD_SIMPLE_MODE_EVENT, handler);
    return () => window.removeEventListener(CARD_SIMPLE_MODE_EVENT, handler);
  }, []);

  // 外部切换后保持卡片大小同步
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CardDensity>).detail;
      if (
        detail &&
        (detail === 'auto' ||
          detail === 'compact' ||
          detail === 'normal' ||
          detail === 'cozy')
      ) {
        setDensity(detail);
      }
    };
    window.addEventListener(CARD_DENSITY_EVENT, handler);
    return () => window.removeEventListener(CARD_DENSITY_EVENT, handler);
  }, []);

  const handleSimpleModeChange = async (checked: boolean) => {
    setSimpleMode(checked);
    setGuestPreference(GUEST_PREF_KEYS.CARD_SIMPLE_MODE, checked);
    window.dispatchEvent(
      new CustomEvent(CARD_SIMPLE_MODE_EVENT, { detail: checked }),
    );

    if (!isAuthed) return;

    try {
      await preferencesApi.update('cardSimpleMode', checked);
    } catch {
      // 回滚到本次请求的严格反值：prev 可能已被后续请求覆盖
      setSimpleMode(!checked);
      setGuestPreference(GUEST_PREF_KEYS.CARD_SIMPLE_MODE, !checked);
      window.dispatchEvent(
        new CustomEvent(CARD_SIMPLE_MODE_EVENT, { detail: !checked }),
      );
      showToast({ body: '简洁模式未保存到服务端', type: 'error' });
    }
  };

  const handleDensityChange = async (next: CardDensity) => {
    const prev = density;
    setDensity(next);
    setGuestPreference(GUEST_PREF_KEYS.CARD_DENSITY, next);
    window.dispatchEvent(new CustomEvent(CARD_DENSITY_EVENT, { detail: next }));

    if (!isAuthed) return;

    try {
      await preferencesApi.update('cardDensity', next);
    } catch {
      setDensity(prev);
      setGuestPreference(GUEST_PREF_KEYS.CARD_DENSITY, prev);
      window.dispatchEvent(
        new CustomEvent(CARD_DENSITY_EVENT, { detail: prev }),
      );
      showToast({ body: '显示密度未保存到服务端', type: 'error' });
    }
  };

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <div className="flex flex-col gap-0.5">
          <Text size="sm" weight="medium">
            显示密度
          </Text>
          <span className="text-xs text-secondary">
            时钟、搜索栏与卡片协同缩放（自动模式按分辨率匹配）
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="显示密度"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {DENSITY_OPTIONS.map((opt) => {
            const isSelected = density === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-control border transition-[border-color,background-color] cursor-pointer text-center focus-within:ring-2 focus-within:ring-accent ${
                  isSelected
                    ? 'border-accent bg-accent/10 font-medium text-accent'
                    : 'border-border hover:border-accent/40 text-secondary'
                }`}
              >
                <Text size="sm" weight={isSelected ? 'medium' : 'normal'}>
                  {opt.label}
                </Text>
                <span className="text-[11px] text-tertiary">{opt.desc}</span>
                <input
                  type="radio"
                  name="card-density-setting"
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => handleDensityChange(opt.value)}
                  className="sr-only"
                  aria-label={opt.label}
                />
              </label>
            );
          })}
        </div>
      </VStack>
      <SwitchSettingRow
        label="卡片简洁模式"
        description="卡片仅显示图标，隐藏名称"
        switchLabel="切换卡片简洁模式"
        checked={simpleMode}
        onChange={handleSimpleModeChange}
      />
      {/* Widget 横条仅管理员可开启与控制；游客端彻底隐藏 */}
      {isAuthed && (
        <SwitchSettingRow
          label="Widget 横条"
          description="显示时钟下方的 widget 状态横条"
          switchLabel="显示 Widget 横条"
          checked={widgetBarVisible}
          onChange={setWidgetBarVisible}
        />
      )}
    </VStack>
  );
}
