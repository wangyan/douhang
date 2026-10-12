'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getCardUrl } from '@/components/cards/card-url';
import { EngineSwitcher } from '@/components/search/EngineSwitcher';
import { useEffectiveDensity } from '@/hooks/useEffectiveDensity';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  isNetworkMode,
  NETWORK_MODE_CHANGE_EVENT,
  NETWORK_MODE_STORAGE_KEY,
} from '@/lib/network-mode';
import { preferencesApi, searchApi } from '@/services';
import type {
  CardDensity,
  NetworkMode,
  SearchEngine,
  SearchEngineConfig,
} from '@/types';

interface SearchBoxProps {
  /** 初始引擎（SSR 时从 UserPreference 读取） */
  initialEngine?: SearchEngine;
  /** 合并引擎列表（内置 + 自定义，SSR 传入） */
  engines: SearchEngineConfig[];
  /** 显示密度 */
  density?: CardDensity;
}

/**
 * 独立居中搜索框（主流导航站风格）
 *
 * 设计要点：
 * - 响应全局显示密度：紧凑 (42px) / 标准 (52px) / 宽松 (58px)
 * - 双层阴影：低高度 base + focus 时强化
 * - 用 CSS focus-within 实现 focus 反馈（避免 React state 时序问题）
 * - 左侧 EngineSwitcher（icon-only 引擎 logo）+ 分隔线 + 输入框 + 右侧 Cmd+K 提示
 *
 * 引擎 logo 由 EngineSwitcher 内部 button 承载（不在搜索框中间再放一次），
 * 切换引擎时 logo 跟随 state 变化，tooltip 提供引擎名 fallback。
 *
 * 行为：
 * - 输入关键词回车后在新标签页跳转当前引擎
 * - 引擎持久化到 UserPreference 表
 * - Cmd+K 由 FloatingToolbar 全局监听并唤起 CmdKModal
 * - 页面加载自动聚焦输入框；按 / 快速聚焦（弹窗或已聚焦输入框时跳过）
 */
export function SearchBox({
  initialEngine = 'google',
  engines,
  density: initialDensity = 'auto',
}: SearchBoxProps) {
  const [keyword, setKeyword] = useState('');
  const [engine, setEngine] = useState<SearchEngine>(initialEngine);
  const density = useEffectiveDensity(initialDensity);
  // 当前网络模式：卡片直达 URL 与 CardItem 点击保持同一选择口径
  const [networkMode, setNetworkMode] = useState<NetworkMode>('auto');
  const inputRef = useRef<HTMLInputElement>(null);
  // ⌘K 提示按平台显示；SSR 首帧默认 Ctrl，挂载后按 UA 修正
  const [modKey, setModKey] = useState<'Ctrl' | '⌘'>('Ctrl');

  // 页面加载自动聚焦（仅精确指针设备；触屏交给 / 快捷键）
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform)) setModKey('⌘');
  }, []);

  // 网络模式：挂载时优先读取本地持久化，无本地记录时回退服务端偏好，并监听切换事件
  useEffect(() => {
    let cancelled = false;
    try {
      const stored = localStorage.getItem(NETWORK_MODE_STORAGE_KEY);
      if (isNetworkMode(stored)) {
        setNetworkMode(stored);
      } else {
        preferencesApi
          .get()
          .then((prefs) => {
            if (!cancelled) setNetworkMode(prefs.networkMode);
          })
          .catch(() => {});
      }
    } catch {
      preferencesApi
        .get()
        .then((prefs) => {
          if (!cancelled) setNetworkMode(prefs.networkMode);
        })
        .catch(() => {});
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NetworkMode>).detail;
      if (isNetworkMode(detail)) setNetworkMode(detail);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === NETWORK_MODE_STORAGE_KEY && isNetworkMode(e.newValue)) {
        setNetworkMode(e.newValue);
      }
    };
    window.addEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      cancelled = true;
      window.removeEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // / 快捷键聚焦（焦点已在输入框/弹窗内时跳过，避免误触）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = keyword.trim();
    if (!query) return;

    // 卡片名完全命中时直达卡片（URL 与 CardItem 点击同口径），否则回退当前引擎搜索
    try {
      const { items } = await searchApi.search(query);
      const matched = items.find(
        (item) => item.card.name.trim().toLowerCase() === query.toLowerCase(),
      );
      const url = matched ? getCardUrl(matched.card, networkMode) : '';
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        setKeyword('');
        return;
      }
    } catch {
      // 搜索服务不可用时照常走引擎
    }

    const config = engines.find((c) => c.key === engine) ?? engines[0];
    window.open(
      config.urlTemplate + encodeURIComponent(query),
      '_blank',
      'noopener,noreferrer',
    );
  };

  const isCompact = density === 'compact';
  const isCozy = density === 'cozy';
  const containerMaxWidth = isCompact
    ? 'max-w-[540px]'
    : isCozy
      ? 'max-w-[720px]'
      : 'max-w-[640px]';
  const boxHeight = isCompact ? 'h-[42px]' : isCozy ? 'h-[58px]' : 'h-[52px]';
  const dividerClass = isCompact
    ? 'h-4 w-px bg-border mx-1.5'
    : isCozy
      ? 'h-7 w-px bg-border mx-2.5'
      : 'h-6 w-px bg-border mx-2';
  const inputClass = isCompact ? 'text-sm' : isCozy ? 'text-lg' : 'text-base';
  const rightPad = isCompact ? 'pr-3' : isCozy ? 'pr-5' : 'pr-4';
  const clearIconSize = isCompact
    ? ICON_SIZE.sm
    : isCozy
      ? ICON_SIZE.lg
      : ICON_SIZE.md;
  const kbdClass = isCompact
    ? 'px-1.5 py-0.5 text-[11px]'
    : isCozy
      ? 'px-2.5 py-1 text-xs'
      : 'px-2 py-0.5 text-xs';

  return (
    <search
      className={`mx-auto w-full transition-[max-width] duration-200 ${containerMaxWidth}`}
    >
      <form onSubmit={handleSubmit}>
        <div
          className={`group flex items-center rounded-full bg-surface border border-border shadow-md shadow-foreground/5 transition-[box-shadow,border-color,height] duration-200 hover:shadow-lg hover:border-accent/60 focus-within:border-accent focus-within:shadow-lg focus-within:ring-4 focus-within:ring-accent/20 ${boxHeight}`}
        >
          {/* 左侧引擎切换器（icon-only：当前引擎 logo，点击切换） */}
          <div className="pl-2 flex items-center">
            <EngineSwitcher
              initialEngine={engine}
              engines={engines}
              density={density}
              onChange={setEngine}
            />
          </div>

          {/* 分隔线 */}
          <div className={dividerClass} />

          {/* 输入框 */}
          <input
            type="text"
            ref={inputRef}
            aria-label="搜索"
            placeholder="输入卡片名直达，或关键词跳转搜索引擎…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className={`search-input flex-1 h-full bg-transparent outline-none text-primary placeholder:text-secondary text-ellipsis min-w-0 ${inputClass}`}
          />

          {/* 右侧 Cmd+K 提示 */}
          <div className={`${rightPad} flex items-center gap-2 shrink-0`}>
            <kbd
              className={`hidden sm:inline-flex items-center gap-1 rounded-control bg-surface-hover border border-border text-secondary font-mono ${kbdClass}`}
            >
              <span>{modKey}</span>
              <span>K</span>
            </kbd>
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                aria-label="清除"
                className="text-secondary hover:text-primary focus-ring"
              >
                <X size={clearIconSize} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
    </search>
  );
}
