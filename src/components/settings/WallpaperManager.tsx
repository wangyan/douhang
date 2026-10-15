'use client';

import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Slider } from '@astryxdesign/core/Slider';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { EmptyPlaceholder } from '@/components/common/EmptyPlaceholder';
import { OptionTile } from '@/components/settings/OptionTile';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useSaveFeedback } from '@/components/settings/useSaveFeedback';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useTheme } from '@/hooks/useTheme';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  GUEST_CUSTOM_WALLPAPER_ID,
  GUEST_PREF_KEYS,
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
  initialScrim: number;
  isAuthed?: boolean;
  compact?: boolean;
}

const clampScrim = (value: number) =>
  Number.isFinite(value)
    ? Math.min(WALLPAPER_SCRIM_MAX, Math.max(WALLPAPER_SCRIM_MIN, value))
    : WALLPAPER_SCRIM_DEFAULT;

function restoreLocal(key: string, previous: string | null) {
  if (previous === null) localStorage.removeItem(key);
  else localStorage.setItem(key, previous);
}

async function persistCustomWallpaper(dataUrl: string | null) {
  if (dataUrl === null) await deleteGuestCustomWallpaper();
  else await saveGuestCustomWallpaper(dataUrl);
  if ((await getGuestCustomWallpaper()) !== dataUrl) {
    throw new Error('本机壁纸保存失败');
  }
}

/** 壁纸点击即保存；游客图片仅存入 IndexedDB。 */
export function WallpaperManager({
  wallpapers,
  preferences,
  initialScrim,
  isAuthed = true,
  compact = false,
}: WallpaperManagerProps) {
  const router = useRouter();
  const feedback = useSaveFeedback();
  const { resolved } = useTheme();
  const radioName = useId();
  const serverWallpaperId = preferences.wallpaper ?? null;
  const serverScrim = clampScrim(initialScrim);
  const [localWallpaperId, setLocalWallpaperId] = useState<
    string | null | undefined
  >();
  const [localScrim, setLocalScrim] = useState<number | undefined>();
  const [wallpaperDraft, setWallpaperDraft] = useState<{
    value: string | null;
    source: WallpaperPreferences | null;
  } | null>(null);
  const [scrimDraft, setScrimDraft] = useState<{
    value: number;
    source: WallpaperPreferences | null;
  } | null>(null);
  const latestPreferencesRef = useRef(preferences);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [guestCustomDataUrl, setGuestCustomDataUrl] = useState<string | null>(
    null,
  );
  const guestCustomRef = useRef<string | null>(null);
  const customEditedRef = useRef(false);
  const [guestReady, setGuestReady] = useState(false);
  const guestFileInputRef = useRef<HTMLInputElement>(null);

  // 保存结束后的下一份服务端快照代表最终状态，届时释放临时覆盖。
  if (
    isAuthed &&
    wallpaperDraft?.source &&
    preferences !== wallpaperDraft.source
  )
    setWallpaperDraft(null);
  if (isAuthed && scrimDraft?.source && preferences !== scrimDraft.source)
    setScrimDraft(null);

  const activeId = isAuthed
    ? wallpaperDraft
      ? wallpaperDraft.value
      : serverWallpaperId
    : localWallpaperId === undefined
      ? serverWallpaperId
      : localWallpaperId;
  const scrim = isAuthed
    ? (scrimDraft?.value ?? serverScrim)
    : (localScrim ?? serverScrim);
  const activeIdRef = useRef(activeId);
  const savedScrimRef = useRef(serverScrim);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    latestPreferencesRef.current = preferences;
  }, [preferences]);
  useEffect(() => {
    if (isAuthed && !saving && !scrimDraft) {
      savedScrimRef.current = serverScrim;
    }
  }, [isAuthed, saving, serverScrim, scrimDraft]);

  useEffect(() => {
    if (isAuthed) return;
    let cancelled = false;
    try {
      const wallpaper = localStorage.getItem(GUEST_PREF_KEYS.WALLPAPER);
      if (wallpaper !== null) {
        activeIdRef.current = wallpaper === 'none' ? null : wallpaper;
        setLocalWallpaperId(activeIdRef.current);
      }
      const localScrim = localStorage.getItem(GUEST_PREF_KEYS.WALLPAPER_SCRIM);
      if (localScrim !== null) {
        savedScrimRef.current = clampScrim(Number(localScrim));
        setLocalScrim(savedScrimRef.current);
      }
    } catch {}
    void getGuestCustomWallpaper().then((url) => {
      if (cancelled) return;
      if (!customEditedRef.current) {
        guestCustomRef.current = url;
        setGuestCustomDataUrl(url);
      }
      setGuestReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  useEffect(() => {
    const input = guestFileInputRef.current;
    if (!input) return;
    const stopCancel = (event: Event) => event.stopPropagation();
    input.addEventListener('cancel', stopCancel);
    return () => input.removeEventListener('cancel', stopCancel);
  }, []);

  const beginSave = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };
  const endSave = () => {
    savingRef.current = false;
    setSaving(false);
  };
  const publishWallpaper = (id: string | null) => {
    activeIdRef.current = id;
    if (isAuthed) setWallpaperDraft({ value: id, source: null });
    else setLocalWallpaperId(id);
    window.dispatchEvent(
      new CustomEvent(WALLPAPER_CHANGE_EVENT, { detail: id }),
    );
  };
  const publishScrim = (value: number) => {
    if (isAuthed) setScrimDraft({ value, source: null });
    else setLocalScrim(value);
    window.dispatchEvent(
      new CustomEvent(WALLPAPER_SCRIM_EVENT, { detail: value }),
    );
  };
  const settleWallpaperDraft = () => {
    setWallpaperDraft((draft) =>
      draft ? { ...draft, source: latestPreferencesRef.current } : draft,
    );
  };
  const settleScrimDraft = () => {
    setScrimDraft((draft) =>
      draft ? { ...draft, source: latestPreferencesRef.current } : draft,
    );
  };

  const saveWallpaper = async (
    next: string | null,
    offerUndo = true,
    customSnapshot?: string | null,
  ) => {
    if (next === activeIdRef.current && customSnapshot === undefined)
      return true;
    if (!beginSave()) {
      feedback.error('正在保存壁纸，请稍后再试');
      return false;
    }
    const previous = activeIdRef.current;
    const previousCustom = guestCustomRef.current;
    let previousLocal: string | null = null;
    let localWritten = false;
    let customWritten = false;
    let serverAttempted = false;
    try {
      if (!isAuthed) {
        previousLocal = localStorage.getItem(GUEST_PREF_KEYS.WALLPAPER);
        if (next === GUEST_CUSTOM_WALLPAPER_ID && customSnapshot) {
          customEditedRef.current = true;
          customWritten = true;
          await persistCustomWallpaper(customSnapshot);
          guestCustomRef.current = customSnapshot;
          setGuestCustomDataUrl(customSnapshot);
        }
        if (next === GUEST_CUSTOM_WALLPAPER_ID && !guestCustomRef.current) {
          throw new Error('本机壁纸不存在');
        }
        localStorage.setItem(GUEST_PREF_KEYS.WALLPAPER, next ?? 'none');
        localWritten = true;
      }
      publishWallpaper(next);
      if (isAuthed) {
        serverAttempted = true;
        await preferencesApi.update('wallpaper', next);
        settleWallpaperDraft();
        router.refresh();
      }
      feedback.success(
        offerUndo
          ? next === null
            ? '壁纸已清除'
            : isAuthed
              ? '壁纸已保存'
              : '壁纸已保存在本机'
          : '壁纸设置已恢复',
        offerUndo
          ? () =>
              void saveWallpaper(
                previous,
                false,
                previous === GUEST_CUSTOM_WALLPAPER_ID
                  ? previousCustom
                  : undefined,
              )
          : undefined,
      );
      return true;
    } catch {
      let restored = true;
      if (customWritten) {
        try {
          if (previousCustom) await persistCustomWallpaper(previousCustom);
          else await persistCustomWallpaper(null);
        } catch {
          restored = false;
        }
        guestCustomRef.current = previousCustom;
        setGuestCustomDataUrl(previousCustom);
      }
      if (localWritten) {
        try {
          restoreLocal(GUEST_PREF_KEYS.WALLPAPER, previousLocal);
        } catch {
          restored = false;
        }
      }
      publishWallpaper(previous);
      if (serverAttempted) {
        try {
          await preferencesApi.update('wallpaper', previous);
        } catch {
          restored = false;
        }
        settleWallpaperDraft();
        router.refresh();
      }
      feedback.error(
        restored
          ? '壁纸保存失败，已恢复原设置'
          : '壁纸保存失败，请检查连接后重新保存',
      );
      return false;
    } finally {
      endSave();
    }
  };

  const upload = useFileUpload({
    accept: 'image/png,image/jpeg,image/webp',
    onFile: async (file) => {
      if (!isAuthed || !beginSave()) return;
      try {
        await wallpapersApi.upload(file);
        router.refresh();
        feedback.success('壁纸已上传，请点击图片选用');
      } catch {
        feedback.error('壁纸上传失败');
      } finally {
        endSave();
      }
    },
  });
  const disabled = saving || upload.uploading || (!isAuthed && !guestReady);
  const gridClass = compact
    ? 'grid grid-cols-2 gap-2'
    : 'grid grid-cols-2 gap-2 sm:grid-cols-4';

  const handleGuestFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !beginSave()) return;
    let dataUrl: string;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error('图片过大，最大支持 10MB');
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('请选择 PNG、JPEG 或 WebP 图片');
      }
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      });
    } catch (error) {
      feedback.error(
        error instanceof Error ? error.message : '读取本机壁纸失败',
      );
      endSave();
      return;
    }
    endSave();
    await saveWallpaper(GUEST_CUSTOM_WALLPAPER_ID, true, dataUrl);
  };

  const handleDeleteGuestCustom = async () => {
    if (!beginSave()) return;
    customEditedRef.current = true;
    const previous = activeIdRef.current;
    const previousCustom = guestCustomRef.current;
    let previousLocal: string | null = null;
    let localWritten = false;
    try {
      if (previous === GUEST_CUSTOM_WALLPAPER_ID) {
        previousLocal = localStorage.getItem(GUEST_PREF_KEYS.WALLPAPER);
        localStorage.setItem(GUEST_PREF_KEYS.WALLPAPER, 'none');
        localWritten = true;
        publishWallpaper(null);
      }
      await persistCustomWallpaper(null);
      guestCustomRef.current = null;
      setGuestCustomDataUrl(null);
      feedback.success(
        '本机壁纸已移除',
        previous === GUEST_CUSTOM_WALLPAPER_ID
          ? () => void saveWallpaper(previous, false, previousCustom)
          : undefined,
      );
    } catch {
      try {
        if (previousCustom) await persistCustomWallpaper(previousCustom);
        if (localWritten)
          restoreLocal(GUEST_PREF_KEYS.WALLPAPER, previousLocal);
      } catch {}
      guestCustomRef.current = previousCustom;
      setGuestCustomDataUrl(previousCustom);
      publishWallpaper(previous);
      feedback.error('移除本机壁纸失败，已恢复原设置');
    } finally {
      endSave();
    }
  };

  const handleScrimPreview = (value: number | [number, number]) => {
    if (savingRef.current || typeof value !== 'number') return;
    publishScrim(clampScrim(value));
  };

  const handleScrimCommit = async (value: number) => {
    if (savingRef.current) return;
    const next = clampScrim(value);
    const previous = savedScrimRef.current;
    if (next === previous) {
      if (isAuthed) setScrimDraft(null);
      else publishScrim(next);
      return;
    }
    if (!beginSave()) return;
    let previousLocal: string | null = null;
    let localWritten = false;
    let serverAttempted = false;
    try {
      if (!isAuthed) {
        previousLocal = localStorage.getItem(GUEST_PREF_KEYS.WALLPAPER_SCRIM);
        localStorage.setItem(GUEST_PREF_KEYS.WALLPAPER_SCRIM, String(next));
        localWritten = true;
      }
      publishScrim(next);
      if (isAuthed) {
        serverAttempted = true;
        await preferencesApi.update('wallpaperScrim', next);
        settleScrimDraft();
        router.refresh();
      }
      savedScrimRef.current = next;
      feedback.success(isAuthed ? '遮罩强度已保存' : '遮罩强度已保存在本机');
    } catch {
      let restored = true;
      if (localWritten) {
        try {
          restoreLocal(GUEST_PREF_KEYS.WALLPAPER_SCRIM, previousLocal);
        } catch {
          restored = false;
        }
      }
      publishScrim(previous);
      if (serverAttempted) {
        try {
          await preferencesApi.update('wallpaperScrim', previous);
        } catch {
          restored = false;
        }
        settleScrimDraft();
        router.refresh();
      }
      feedback.error(
        restored
          ? '遮罩强度保存失败，已恢复原设置'
          : '遮罩强度保存失败，请检查连接后重新保存',
      );
    } finally {
      endSave();
    }
  };

  const selected =
    !isAuthed && activeId === GUEST_CUSTOM_WALLPAPER_ID && guestCustomDataUrl
      ? {
          id: GUEST_CUSTOM_WALLPAPER_ID,
          name: '本机壁纸',
          path: guestCustomDataUrl,
        }
      : wallpapers.find((wallpaper) => wallpaper.id === activeId);
  const presets = wallpapers.filter(
    (wallpaper) => wallpaper.source === 'preset',
  );
  const uploads = wallpapers.filter(
    (wallpaper) => wallpaper.source === 'upload',
  );
  const scrimColor =
    resolved === 'dark'
      ? `rgba(0, 0, 0, ${scrim / 100})`
      : `rgba(255, 255, 255, ${scrim / 100})`;

  const renderThumb = (wallpaper: {
    id: string;
    name: string;
    path: string;
  }) => (
    <OptionTile
      key={wallpaper.id}
      name={radioName}
      value={wallpaper.id}
      label={wallpaper.name}
      checked={wallpaper.id === activeId}
      disabled={disabled}
      onChange={() => void saveWallpaper(wallpaper.id)}
    >
      <span
        className="block aspect-video w-full rounded-control bg-cover bg-center"
        style={{ backgroundImage: `url(${wallpaper.path})` }}
        aria-hidden
      />
    </OptionTile>
  );

  return (
    <SettingsSection
      title="壁纸"
      description={
        isAuthed
          ? '点击图片立即保存；图片文件可在素材页管理'
          : '选择预设或本机图片，仅保存在当前浏览器'
      }
    >
      {isAuthed && upload.input}
      <VStack gap={3}>
        <Text size="sm" weight="medium">
          当前壁纸
        </Text>
        {selected ? (
          <div className="relative h-24 overflow-hidden rounded-panel border border-border">
            <div
              className="absolute -inset-2 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${selected.path})` }}
            />
            <div
              className="absolute -inset-2"
              style={{ backgroundColor: scrimColor }}
            />
            <button
              type="button"
              onClick={() => void saveWallpaper(null)}
              disabled={disabled}
              aria-label="清除壁纸"
              className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-control bg-black/60 text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50 focus-ring"
            >
              <X size={ICON_SIZE.sm} />
            </button>
            <span className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-control bg-black/60 px-2 py-1 text-sm text-white">
              {selected.name}
            </span>
          </div>
        ) : (
          <div className="rounded-panel border border-dashed border-border px-4 py-5 text-sm text-secondary">
            未设置壁纸，使用主题默认背景色
          </div>
        )}
        {selected && (
          <>
            <Text size="sm" color="secondary" textWrap="pretty">
              遮罩强度影响壁纸明暗，拖动预览，松开保存；0% 为无遮罩。
            </Text>
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0 flex-1">
                <Slider
                  label="遮罩强度"
                  isLabelHidden
                  value={scrim}
                  onChange={handleScrimPreview}
                  onChangeEnd={(value: number) => void handleScrimCommit(value)}
                  isDisabled={disabled}
                  min={WALLPAPER_SCRIM_MIN}
                  max={WALLPAPER_SCRIM_MAX}
                  step={WALLPAPER_SCRIM_STEP}
                  formatValue={(value) => `${value}%`}
                  valueDisplay="none"
                  width="100%"
                />
              </div>
              <NumberInput
                label="遮罩强度百分比"
                isLabelHidden
                value={scrim}
                onChange={(value) => void handleScrimCommit(value)}
                isDisabled={disabled}
                min={WALLPAPER_SCRIM_MIN}
                max={WALLPAPER_SCRIM_MAX}
                step={WALLPAPER_SCRIM_STEP}
                units="%"
                isIntegerOnly
                isWheelEnabled={false}
                size="md"
                width={104}
              />
            </div>
          </>
        )}
      </VStack>
      {presets.length > 0 && (
        <VStack gap={2}>
          <Text size="sm" weight="medium">
            预设
          </Text>
          <div className={gridClass} role="radiogroup" aria-label="预设壁纸">
            {presets.map(renderThumb)}
          </div>
        </VStack>
      )}
      {!isAuthed && (
        <VStack gap={2}>
          <input
            ref={guestFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={disabled}
            onChange={(event) => void handleGuestFileSelect(event)}
          />
          <HStack justify="between" align="center">
            <Text size="sm" weight="medium">
              本机壁纸
            </Text>
            <HStack gap={1}>
              <Button
                label={guestCustomDataUrl ? '更换图片' : '选择图片'}
                variant="ghost"
                size="sm"
                icon={<Upload size={ICON_SIZE.sm} />}
                isDisabled={disabled}
                onClick={() => {
                  if (!savingRef.current) guestFileInputRef.current?.click();
                }}
              />
              {guestCustomDataUrl && (
                <Button
                  label="移除"
                  variant="ghost"
                  size="sm"
                  icon={<X size={ICON_SIZE.sm} />}
                  isDisabled={disabled}
                  onClick={() => void handleDeleteGuestCustom()}
                />
              )}
            </HStack>
          </HStack>
          {guestCustomDataUrl ? (
            <div className={gridClass} role="radiogroup" aria-label="本机壁纸">
              {renderThumb({
                id: GUEST_CUSTOM_WALLPAPER_ID,
                name: '本机自定义',
                path: guestCustomDataUrl,
              })}
            </div>
          ) : (
            <EmptyPlaceholder
              label="未选择本机壁纸"
              hint="从电脑选择图片，仅保存在当前浏览器"
              disabled={disabled}
              onClick={() => {
                if (!savingRef.current) guestFileInputRef.current?.click();
              }}
            />
          )}
        </VStack>
      )}
      {isAuthed && (
        <VStack gap={2}>
          <HStack justify="between" align="center">
            <Text size="sm" weight="medium">
              我的上传
            </Text>
            <Button
              label="上传新壁纸"
              variant="ghost"
              size="sm"
              icon={<Upload size={ICON_SIZE.sm} />}
              isDisabled={disabled}
              onClick={() => {
                if (!savingRef.current && !upload.uploading) upload.open();
              }}
            />
          </HStack>
          {uploads.length > 0 ? (
            <div
              className={gridClass}
              role="radiogroup"
              aria-label="上传的壁纸"
            >
              {uploads.map(renderThumb)}
            </div>
          ) : (
            <EmptyPlaceholder
              label="还没有上传的壁纸"
              hint="上传后点击图片选用"
              disabled={disabled}
              onClick={() => {
                if (!savingRef.current && !upload.uploading) upload.open();
              }}
            />
          )}
        </VStack>
      )}
    </SettingsSection>
  );
}
