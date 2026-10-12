'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Slider } from '@astryxdesign/core/Slider';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useToast } from '@astryxdesign/core/Toast';
import { VStack } from '@astryxdesign/core/VStack';
import { Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmptyPlaceholder } from '@/components/common/EmptyPlaceholder';
import {
  type FormMessage,
  FormSaveBar,
} from '@/components/settings/FormSaveBar';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useTheme } from '@/hooks/useTheme';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  GUEST_CUSTOM_WALLPAPER_ID,
  GUEST_PREF_KEYS,
  getGuestPreference,
  setGuestPreference,
  WALLPAPER_CHANGE_EVENT,
  WALLPAPER_SCRIM_EVENT,
} from '@/lib/guest-preferences';
import {
  deleteGuestCustomWallpaper,
  getGuestCustomWallpaper,
  saveGuestCustomWallpaper,
} from '@/lib/guest-wallpaper-storage';
import { preferencesApi, wallpapersApi } from '@/services';
import {
  WALLPAPER_SCRIM_DEFAULT,
  WALLPAPER_SCRIM_MAX,
  WALLPAPER_SCRIM_MIN,
  WALLPAPER_SCRIM_STEP,
  type Wallpaper,
  type WallpaperPreferences,
} from '@/types';

interface WallpaperManagerProps {
  wallpapers: Wallpaper[];
  preferences: WallpaperPreferences;
  /** 遮罩强度 0-80（SSR 读取偏好） */
  initialScrim: number;
  /** 是否已登录（未登录游客仅可选择预置壁纸与本机壁纸，无服务端保存栏） */
  isAuthed?: boolean;
}

/**
 * 壁纸管理（使用入口）
 *
 * - 管理员：点击缩略图更新 selectedId，底部「撤销 + 应用」落库，支持上传新壁纸
 * - 游客（双层偏好模式）：支持选用预设壁纸与本机壁纸（存入 IndexedDB），纯本地生效
 */
export function WallpaperManager({
  wallpapers,
  preferences,
  initialScrim,
  isAuthed = true,
}: WallpaperManagerProps) {
  const router = useRouter();
  const showToast = useToast();
  const { resolved } = useTheme();
  // 本地选中态（可能是 null = 清除，string = 选中某张，undefined = 未改动）
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const clampScrim = (value: number) =>
    Math.min(WALLPAPER_SCRIM_MAX, Math.max(WALLPAPER_SCRIM_MIN, value));
  const initial = Number.isFinite(initialScrim)
    ? clampScrim(initialScrim)
    : WALLPAPER_SCRIM_DEFAULT;
  const [scrim, setScrim] = useState(initial);
  const scrimRef = useRef(initial);

  // 游客本机自定义壁纸（IndexedDB 中存储的 Data URL）
  const [guestCustomDataUrl, setGuestCustomDataUrl] = useState<string | null>(
    null,
  );
  const guestFileInputRef = useRef<HTMLInputElement>(null);

  // 文件选择取消事件阻止冒泡，避免外层 Dialog 误判为关闭请求
  useEffect(() => {
    const input = guestFileInputRef.current;
    if (!input) return;
    const stopCancel = (event: Event) => event.stopPropagation();
    input.addEventListener('cancel', stopCancel);
    return () => input.removeEventListener('cancel', stopCancel);
  }, []);

  // 挂载后若为游客且本地有偏好，读取本地选中态、遮罩及本机自定义壁纸
  useEffect(() => {
    if (!isAuthed) {
      const guestWp = getGuestPreference<string | null>(
        GUEST_PREF_KEYS.WALLPAPER,
        null,
      );
      if (guestWp !== null) {
        setSelectedId(guestWp === 'none' ? null : guestWp);
      }
      const guestScrim = getGuestPreference<number | null>(
        GUEST_PREF_KEYS.WALLPAPER_SCRIM,
        null,
      );
      if (guestScrim !== null) {
        setScrim(guestScrim);
        scrimRef.current = guestScrim;
      }
      void getGuestCustomWallpaper().then((url) => {
        setGuestCustomDataUrl(url);
      });
    }
  }, [isAuthed]);

  // 遮罩颜色：与主页一致（暗色压黑 / 亮色压白），透明度跟随滑杆
  const scrimColor =
    resolved === 'dark'
      ? `rgba(0, 0, 0, ${scrim / 100})`
      : `rgba(255, 255, 255, ${scrim / 100})`;

  const upload = useFileUpload({
    accept: 'image/png,image/jpeg,image/webp',
    onFile: async (file) => {
      await wallpapersApi.upload(file);
      // 上传成功后刷新列表，不自动选中
      router.refresh();
    },
  });

  // 当前已应用的壁纸（来自 props）
  const appliedId = preferences.wallpaper;
  // 渲染时用：本地有改动用本地，否则用已应用值
  const renderId = selectedId === undefined ? (appliedId ?? null) : selectedId;
  const isDirty = renderId !== (appliedId ?? null);

  const handleApply = async () => {
    if (!isDirty) return;
    const value = selectedId === undefined ? null : selectedId;
    setSaving(true);
    setMessage(null);
    try {
      await preferencesApi.update('wallpaper', value);
      setSelectedId(undefined);
      router.refresh();
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : '网络错误',
      });
    } finally {
      setSaving(false);
    }
  };

  const selected =
    !isAuthed && renderId === GUEST_CUSTOM_WALLPAPER_ID && guestCustomDataUrl
      ? {
          id: GUEST_CUSTOM_WALLPAPER_ID,
          name: '本机壁纸',
          source: 'local' as const,
          path: guestCustomDataUrl,
          thumbnail: null,
          createdAt: new Date().toISOString(),
        }
      : (wallpapers.find((w) => w.id === renderId) ?? null);

  const presets = wallpapers.filter((w) => w.source === 'preset');
  const uploads = wallpapers.filter((w) => w.source === 'upload');

  const handleSelectWallpaper = (id: string | null) => {
    setSelectedId(id);
    if (!isAuthed) {
      setGuestPreference(GUEST_PREF_KEYS.WALLPAPER, id ?? 'none');
      window.dispatchEvent(
        new CustomEvent(WALLPAPER_CHANGE_EVENT, { detail: id }),
      );
    }
  };

  const handleClearWallpaper = () => {
    setSelectedId(null);
    if (!isAuthed) {
      setGuestPreference(GUEST_PREF_KEYS.WALLPAPER, 'none');
      window.dispatchEvent(
        new CustomEvent(WALLPAPER_CHANGE_EVENT, { detail: null }),
      );
    }
  };

  const handleGuestFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast({ body: '图片过大，最大支持 10MB', type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await saveGuestCustomWallpaper(dataUrl);
        setGuestCustomDataUrl(dataUrl);
        handleSelectWallpaper(GUEST_CUSTOM_WALLPAPER_ID);
      } catch {
        showToast({ body: '保存本机壁纸失败', type: 'error' });
      }
    };
    reader.onerror = () => {
      showToast({ body: '读取图片失败', type: 'error' });
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteGuestCustom = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteGuestCustomWallpaper();
      setGuestCustomDataUrl(null);
      if (renderId === GUEST_CUSTOM_WALLPAPER_ID) {
        handleClearWallpaper();
      }
    } catch {
      showToast({ body: '移除本机壁纸失败', type: 'error' });
    }
  };

  const handleScrimPreview = (value: number | [number, number]) => {
    if (typeof value === 'number') {
      const clamped = clampScrim(value);
      setScrim(clamped);
      if (!isAuthed) {
        setGuestPreference(GUEST_PREF_KEYS.WALLPAPER_SCRIM, clamped);
        window.dispatchEvent(
          new CustomEvent(WALLPAPER_SCRIM_EVENT, { detail: clamped }),
        );
      }
    }
  };

  const handleScrimCommit = async (value: number) => {
    const next = clampScrim(value);
    const previous = scrimRef.current;
    if (next === previous) {
      setScrim(next);
      return;
    }
    scrimRef.current = next;
    setScrim(next);

    if (!isAuthed) {
      setGuestPreference(GUEST_PREF_KEYS.WALLPAPER_SCRIM, next);
      window.dispatchEvent(
        new CustomEvent(WALLPAPER_SCRIM_EVENT, { detail: next }),
      );
      return;
    }

    try {
      await preferencesApi.update('wallpaperScrim', next);
    } catch (e) {
      scrimRef.current = previous;
      setScrim(previous);
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : '遮罩强度保存失败',
      });
    }
  };

  return (
    <SettingsSection
      title="壁纸"
      description={
        isAuthed
          ? '选择桌面背景图；图片文件的删除统一在素材页管理'
          : '选择桌面背景图（预置壁纸）'
      }
    >
      {isAuthed && upload.input}

      <WallpaperPreviewSection
        selected={selected}
        scrim={scrim}
        scrimColor={scrimColor}
        saving={saving}
        uploading={upload.uploading}
        onClear={handleClearWallpaper}
        onScrimPreview={handleScrimPreview}
        onScrimCommit={(value) => void handleScrimCommit(value)}
      />

      {/* 预设 */}
      {presets.length > 0 && (
        <VStack gap={2}>
          <Text size="sm" weight="medium">
            预设
          </Text>
          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="预设壁纸"
          >
            {presets.map((w) => (
              <WallpaperThumb
                key={w.id}
                wallpaper={w}
                isSelected={w.id === renderId}
                disabled={saving || upload.uploading}
                onClick={() => handleSelectWallpaper(w.id)}
              />
            ))}
          </div>
        </VStack>
      )}

      {/* 游客本机壁纸：纯客户端存储，不发送至服务端 */}
      {!isAuthed && (
        <VStack gap={2}>
          <input
            ref={guestFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleGuestFileSelect}
          />
          <HStack justify="between" align="center">
            <Text size="sm" weight="medium">
              本机壁纸
            </Text>
            <HStack gap={1}>
              <Button
                label={guestCustomDataUrl ? '更换本机图片' : '选择本机图片'}
                variant="ghost"
                size="sm"
                icon={<Upload size={ICON_SIZE.sm} />}
                onClick={() => guestFileInputRef.current?.click()}
              />
              {guestCustomDataUrl && (
                <Button
                  label="移除"
                  variant="ghost"
                  size="sm"
                  icon={<X size={ICON_SIZE.sm} />}
                  onClick={handleDeleteGuestCustom}
                />
              )}
            </HStack>
          </HStack>
          {guestCustomDataUrl ? (
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="本机壁纸"
            >
              {/* biome-ignore lint/a11y/useSemanticElements: 视觉卡片与预置瓦片对齐 */}
              <div
                role="radio"
                aria-checked={renderId === GUEST_CUSTOM_WALLPAPER_ID}
                tabIndex={0}
                onClick={() => handleSelectWallpaper(GUEST_CUSTOM_WALLPAPER_ID)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectWallpaper(GUEST_CUSTOM_WALLPAPER_ID);
                  }
                }}
                aria-label="选择本机自定义壁纸"
                className={`group relative aspect-video rounded-control overflow-hidden border-2 cursor-pointer transition-[border-color,box-shadow,opacity,transform] focus-ring ${
                  renderId === GUEST_CUSTOM_WALLPAPER_ID
                    ? 'border-accent ring-2 ring-accent/30'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${guestCustomDataUrl})` }}
                />
                <div className="absolute inset-0 bg-black/20" />
                {/* 底部名称条 */}
                <div className="absolute inset-x-0 bottom-0 pt-6 pb-1 px-2 flex items-center bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                  <Text
                    size="sm"
                    weight="medium"
                    className="text-white truncate drop-shadow"
                  >
                    本机自定义
                  </Text>
                </div>
              </div>
            </div>
          ) : (
            <EmptyPlaceholder
              label="未选择本机壁纸"
              hint="点击从电脑选择图片，仅保存在当前浏览器"
              onClick={() => guestFileInputRef.current?.click()}
            />
          )}
        </VStack>
      )}

      {/* 我的上传：仅已登录管理员可见与操作 */}
      {isAuthed && (
        <VStack gap={2}>
          <HStack justify="between" align="center">
            <Text size="sm" weight="medium">
              我的上传
            </Text>
            <Button
              label={upload.uploading ? '上传中…' : '上传新壁纸'}
              variant="ghost"
              size="sm"
              icon={<Upload size={ICON_SIZE.sm} />}
              isDisabled={upload.uploading || saving}
              onClick={() => upload.open()}
            />
          </HStack>
          {uploads.length > 0 ? (
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="上传的壁纸"
            >
              {uploads.map((w) => (
                <WallpaperThumb
                  key={w.id}
                  wallpaper={w}
                  isSelected={w.id === renderId}
                  disabled={saving || upload.uploading}
                  onClick={() => handleSelectWallpaper(w.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyPlaceholder
              label="还没有上传的壁纸"
              hint="点击上传"
              onClick={() => upload.open()}
              disabled={upload.uploading || saving}
            />
          )}
        </VStack>
      )}

      {/* 管理员展示统一保存栏；游客 Local-First 即时生效无需保存栏 */}
      {isAuthed && (
        <FormSaveBar
          message={message ?? null}
          isDirty={isDirty}
          saving={saving}
          onReset={() => {
            setSelectedId(undefined);
            setMessage(null);
          }}
          onSave={() => void handleApply()}
        />
      )}
    </SettingsSection>
  );
}

interface WallpaperPreviewSectionProps {
  selected: Wallpaper | null;
  scrim: number;
  scrimColor: string;
  saving: boolean;
  uploading: boolean;
  onClear: () => void;
  onScrimPreview: (value: number | [number, number]) => void;
  onScrimCommit: (value: number) => void;
}

/** 当前壁纸预览 + 遮罩强度调节（从主组件拆出） */
function WallpaperPreviewSection({
  selected,
  scrim,
  scrimColor,
  saving,
  uploading,
  onClear,
  onScrimPreview,
  onScrimCommit,
}: WallpaperPreviewSectionProps) {
  return (
    <VStack gap={2}>
      <Text size="sm" weight="medium">
        当前壁纸
      </Text>
      {selected ? (
        <div className="relative h-32 overflow-hidden rounded-panel border border-border">
          {/* 壁纸层：向四周外扩 2px，消除高分屏亚像素取整缝隙 */}
          <div
            className="absolute -inset-2 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${selected.path})` }}
          />
          {/* 遮罩层：与壁纸同尺寸外扩，实时跟随滑杆（暗压黑 / 亮压白） */}
          <div
            className="absolute -inset-2"
            style={{ backgroundColor: scrimColor }}
          />
          {/* 右上角清除按钮 */}
          <button
            type="button"
            onClick={() => onClear()}
            disabled={saving || uploading}
            aria-label="清除壁纸"
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
          >
            <X size={ICON_SIZE.xs} />
          </button>
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between rounded-control bg-black/60 px-2 py-1">
            <Text size="sm" weight="medium" className="text-white drop-shadow">
              {selected.name}
            </Text>
            <Text size="sm" className="text-white/80 drop-shadow">
              {selected.source === 'preset'
                ? '预设'
                : selected.source === 'local'
                  ? '本机'
                  : '上传'}
            </Text>
          </div>
        </div>
      ) : (
        <EmptyPlaceholder label="未设置壁纸" hint="使用主题默认背景色" />
      )}
      {selected && (
        <>
          <Text type="supporting" textWrap="pretty">
            遮罩强度：壁纸上的明暗遮罩，保证前景文字可读；0
            为无遮罩，拖动下方滑杆实时预览并保存。
          </Text>
          <HStack gap={4} width="100%" align="center">
            <StackItem size="fill">
              <Slider
                label="遮罩强度"
                isLabelHidden
                value={scrim}
                onChange={onScrimPreview}
                onChangeEnd={onScrimCommit}
                min={WALLPAPER_SCRIM_MIN}
                max={WALLPAPER_SCRIM_MAX}
                step={WALLPAPER_SCRIM_STEP}
                formatValue={(value) => `${value}%`}
                valueDisplay="none"
                width="100%"
              />
            </StackItem>
            <StackItem size="static">
              <NumberInput
                label="遮罩强度百分比"
                isLabelHidden
                value={scrim}
                onChange={(value) => void onScrimCommit(value)}
                min={WALLPAPER_SCRIM_MIN}
                max={WALLPAPER_SCRIM_MAX}
                step={WALLPAPER_SCRIM_STEP}
                units="%"
                isIntegerOnly
                isWheelEnabled={false}
                size="md"
                width={112}
              />
            </StackItem>
          </HStack>
        </>
      )}
    </VStack>
  );
}

interface WallpaperThumbProps {
  wallpaper: Wallpaper;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}

function WallpaperThumb({
  wallpaper,
  isSelected,
  disabled,
  onClick,
}: WallpaperThumbProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 内部嵌套删除 button，HTML 不允许 button 嵌套 button
    <div
      role="radio"
      aria-checked={isSelected}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`选择壁纸：${wallpaper.name}`}
      className={`group relative aspect-video rounded-control overflow-hidden border-2 cursor-pointer transition-[border-color,box-shadow,opacity,transform] focus-ring ${
        isSelected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-border hover:border-accent/50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${wallpaper.path})` }}
      />
      <div className="absolute inset-0 bg-black/20" />

      {/* 底部名称条 */}
      <div className="absolute inset-x-0 bottom-0 pt-6 pb-1 px-2 flex items-center bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <Text
          size="sm"
          weight="medium"
          className="text-white truncate drop-shadow"
        >
          {wallpaper.name}
        </Text>
      </div>
    </div>
  );
}
