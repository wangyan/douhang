import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { validateBody, withAuth } from '@/lib/api';
import { DEFAULT_BRAND_CONFIG, getBrandConfig } from '@/lib/brand';
import { normalizeFontSize } from '@/lib/font-size';
import { getUserPreference, setUserPreference } from '@/lib/preferences';
import {
  preferencesUpdateSchema,
  validatePreferenceValue,
} from '@/lib/validation';
import type { CardDensity, NetworkMode } from '@/types';
import {
  CARD_DENSITY_DEFAULT,
  FONT_SIZE_DEFAULT,
  FULL_WIDTH_DEFAULT,
  WALLPAPER_SCRIM_DEFAULT,
} from '@/types';

export const dynamic = 'force-dynamic';

/**
 * 用户首选项 API
 *
 * - GET: 读取全部首选项（networkMode / theme / fontSize / searchEngine / brand / cardDensity / cardSimpleMode / cardStatusBadge / wallpaperScrim）
 * - PATCH: 更新单个首选项（body: { key, value })
 */
export const GET = async () => {
  const [
    networkMode,
    theme,
    rawFontSize,
    searchEngine,
    brand,
    cardDensity,
    cardSimpleMode,
    cardStatusBadge,
    wallpaperScrim,
    fullWidth,
  ] = await Promise.all([
    getUserPreference<NetworkMode>('networkMode', 'auto'),
    getUserPreference<'light' | 'dark' | 'system'>('theme', 'system'),
    getUserPreference<unknown>('fontSize', FONT_SIZE_DEFAULT),
    getUserPreference<string>('searchEngine', 'google'),
    getBrandConfig(),
    getUserPreference<CardDensity>('cardDensity', CARD_DENSITY_DEFAULT),
    getUserPreference<boolean>('cardSimpleMode', false),
    getUserPreference<boolean>('cardStatusBadge', true),
    getUserPreference<unknown>('wallpaperScrim', WALLPAPER_SCRIM_DEFAULT),
    getUserPreference<boolean>('fullWidth', FULL_WIDTH_DEFAULT),
  ]);

  return NextResponse.json({
    networkMode,
    theme,
    fontSize: normalizeFontSize(rawFontSize),
    searchEngine,
    brand: brand ?? DEFAULT_BRAND_CONFIG,
    cardDensity: cardDensity ?? CARD_DENSITY_DEFAULT,
    cardSimpleMode,
    cardStatusBadge,
    fullWidth,
    wallpaperScrim:
      typeof wallpaperScrim === 'number'
        ? wallpaperScrim
        : WALLPAPER_SCRIM_DEFAULT,
  });
};

export const PATCH = withAuth(async (_session, req) => {
  const body = await req.json();
  const parsed = validateBody(preferencesUpdateSchema, body);
  if (!parsed.ok) return parsed.response;
  const { key, value } = parsed.data;

  // 已知 key 的值校验（未注册的 key 直接通过）
  if (!validatePreferenceValue(key, value)) {
    return NextResponse.json({ error: '偏好值不合法' }, { status: 400 });
  }

  await setUserPreference(key, value);
  if (key === 'brand') revalidatePath('/', 'layout');
  if (key === 'fullWidth') revalidatePath('/settings', 'layout');
  return NextResponse.json({ success: true });
});
