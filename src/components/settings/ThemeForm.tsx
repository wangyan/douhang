'use client';

import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Slider } from '@astryxdesign/core/Slider';
import { useEffect, useId, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { OptionTile } from '@/components/settings/OptionTile';
import { SettingRow } from '@/components/settings/SettingRow';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { useTheme } from '@/hooks/useTheme';
import { GUEST_PREF_KEYS } from '@/lib/guest-preferences';
import { ApiError } from '@/lib/request/ApiError';
import { preferencesApi } from '@/services';
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  type FontSizePreference,
  type ThemeMode,
} from '@/types';

interface ThemeFormProps {
  title?: string;
  initialFontSize: FontSizePreference;
  isAuthed?: boolean;
}

const FONT_SIZE_MARKS = [
  { value: FONT_SIZE_MIN },
  { value: 100 },
  { value: 125 },
  { value: FONT_SIZE_MAX },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '明亮' },
  { value: 'dark', label: '暗黑' },
  { value: 'system', label: '跟随系统' },
];

/** 主题即时保存，字号在预览结束后保存。 */
export function ThemeForm({
  title = '主题与字体',
  initialFontSize,
  isAuthed = true,
}: ThemeFormProps) {
  const { mode, setMode } = useTheme();
  const feedback = useSaveFeedback();
  const radioName = useId();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const savedFontSizeRef = useRef(initialFontSize);
  const { mutate } = useSWRConfig();

  useEffect(() => {
    if (isAuthed) return;
    try {
      const raw = localStorage.getItem(GUEST_PREF_KEYS.FONT_SIZE);
      if (raw === null) return;
      const value = Number(raw);
      if (
        Number.isFinite(value) &&
        value >= FONT_SIZE_MIN &&
        value <= FONT_SIZE_MAX
      ) {
        setFontSize(value);
        savedFontSizeRef.current = value;
        document.documentElement.style.fontSize = `${value}%`;
      }
    } catch {}
  }, [isAuthed]);

  const restoreLocal = (key: string, previous: string | null) => {
    try {
      if (previous === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous);
    } catch {}
  };

  const reportError = (error: unknown) => {
    feedback.error(
      error instanceof ApiError && error.isNetworkError
        ? '网络错误，设置未保存'
        : '保存失败，已恢复原设置',
    );
  };

  const handleThemeChange = async (next: ThemeMode) => {
    if (savingRef.current || next === mode) return;
    savingRef.current = true;
    setSaving(true);
    const previous = mode;
    let previousLocal: string | null = null;
    let localWritten = false;
    try {
      previousLocal = localStorage.getItem(GUEST_PREF_KEYS.THEME);
      localStorage.setItem(GUEST_PREF_KEYS.THEME, next);
      localWritten = true;
      setMode(next);
      if (isAuthed) await preferencesApi.update('theme', next);
      feedback.success(isAuthed ? '主题已保存' : '主题已保存在本机');
    } catch (error) {
      if (localWritten) {
        restoreLocal(GUEST_PREF_KEYS.THEME, previousLocal);
        setMode(previous);
      }
      reportError(error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const applyFontSize = (value: number) => {
    setFontSize(value);
    document.documentElement.style.fontSize = `${value}%`;
  };

  const handleFontSizePreview = (value: number | [number, number]) => {
    if (!savingRef.current && typeof value === 'number') applyFontSize(value);
  };

  const handleFontSizeCommit = async (value: number) => {
    if (savingRef.current) return;
    const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, value));
    const previous = savedFontSizeRef.current;
    if (next === previous) {
      applyFontSize(next);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    let previousLocal: string | null = null;
    let localWritten = false;
    try {
      previousLocal = localStorage.getItem(GUEST_PREF_KEYS.FONT_SIZE);
      localStorage.setItem(GUEST_PREF_KEYS.FONT_SIZE, String(next));
      localWritten = true;
      applyFontSize(next);
      if (isAuthed) await preferencesApi.update('fontSize', next);
      savedFontSizeRef.current = next;
      if (isAuthed) void mutate(preferencesApi.getKey).catch(() => {});
      feedback.success(isAuthed ? '字号已保存' : '字号已保存在本机');
    } catch (error) {
      applyFontSize(previous);
      if (localWritten) restoreLocal(GUEST_PREF_KEYS.FONT_SIZE, previousLocal);
      reportError(error);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title={title}
      description="设置主题模式与界面字体大小"
      layout="rows"
    >
      <SettingRow
        label="外观模式"
        description="选择明亮、暗黑或跟随系统"
        stacked
      >
        <div
          role="radiogroup"
          aria-label="外观模式"
          className="grid w-full grid-cols-3 gap-2"
        >
          {THEME_OPTIONS.map((option) => (
            <OptionTile
              key={option.value}
              name={radioName}
              value={option.value}
              label={option.label}
              checked={mode === option.value}
              disabled={saving}
              onChange={() => void handleThemeChange(option.value)}
            >
              <span className="flex h-12 w-full overflow-hidden rounded-control border border-border">
                {(option.value === 'light' || option.value === 'system') && (
                  <MiniWindowScheme dark={false} />
                )}
                {(option.value === 'dark' || option.value === 'system') && (
                  <MiniWindowScheme dark={true} />
                )}
              </span>
            </OptionTile>
          ))}
        </div>
      </SettingRow>
      <SettingRow
        label="字体大小"
        description="拖动预览或输入百分比，范围 90%–150%"
      >
        <div className="flex w-full min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <Slider
              label="字体大小"
              isLabelHidden
              value={fontSize}
              onChange={handleFontSizePreview}
              onChangeEnd={(value: number) => void handleFontSizeCommit(value)}
              isDisabled={saving}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              marks={FONT_SIZE_MARKS}
              formatValue={(value) => `${value}%`}
              valueDisplay="none"
              width="100%"
            />
          </div>
          <NumberInput
            label="字体大小百分比"
            isLabelHidden
            value={fontSize}
            onChange={(value) => void handleFontSizeCommit(value)}
            isDisabled={saving}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={FONT_SIZE_STEP}
            units="%"
            isIntegerOnly
            isWheelEnabled={false}
            size="md"
            width={104}
          />
        </div>
      </SettingRow>
    </SettingsSection>
  );
}

/** 固定明暗色用于主题预览，不随当前主题变化。 */
function MiniWindowScheme({ dark }: { dark: boolean }) {
  const bg = dark ? 'bg-neutral-800' : 'bg-neutral-100';
  const bar = dark ? 'bg-neutral-700' : 'bg-neutral-300';
  const line = dark ? 'bg-neutral-600' : 'bg-neutral-400';
  return (
    <span className={`flex-1 ${bg} p-1.5 flex flex-col gap-1`} aria-hidden>
      <span className={`h-1 w-1/3 rounded-control ${bar}`} />
      <span className={`h-1 w-2/3 rounded-control ${line}`} />
      <span className={`h-1 w-1/2 rounded-control ${line}`} />
    </span>
  );
}
