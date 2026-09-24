'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { ChevronDown, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { type ChangelogRelease, changelogDisplayItems } from '@/lib/changelog';
import changelog from '@/lib/changelog.generated.json';
import { ICON_SIZE } from '@/lib/design-tokens';

interface ChangelogHighlightListProps {
  release: ChangelogRelease;
}

/**
 * 版本亮点列表
 *
 * 展示该版本的「亮点」条目（未写亮点时回退为版本简介）。
 * 「关于」弹窗与右下角更新提醒共用，保证两处展示口径一致。
 */
export function ChangelogHighlightList({
  release,
}: ChangelogHighlightListProps) {
  const items = changelogDisplayItems(release);
  if (items.length === 0) return null;

  return (
    <VStack gap={1}>
      {items.map((text) => (
        <HStack key={text} gap={2} align="start">
          <span className="mt-1.5 flex-none">
            <Sparkles size={ICON_SIZE.sm} className="text-accent" />
          </span>
          <Text
            size="sm"
            color="secondary"
            className="min-w-0"
            textWrap="pretty"
          >
            {text}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}

interface ChangelogTimelineProps {
  /** 覆盖展示的版本列表（缺省为全部版本） */
  releases?: ChangelogRelease[];
  /** 默认展开的版本号（缺省为第一个版本，即最新） */
  defaultExpandedVersion?: string;
}

/** 默认渲染的版本数量，更早的版本收进「查看更早版本」 */
const INITIAL_VISIBLE_COUNT = 8;

/**
 * 更新日志手风琴（自定义实现，无动画即时展开收起）
 *
 * 每个版本只展示「亮点」条目——面向使用者的能力描述，
 * 完整变更（含部署、开发等技术分类）见发布页。
 * 最新版本默认展开，历史版本折叠成单行。
 * 数据来自 CHANGELOG.md 构建期解析结果。
 */
export function ChangelogTimeline({
  releases,
  defaultExpandedVersion,
}: ChangelogTimelineProps = {}) {
  const list = releases ?? changelog.releases;
  // 版本越积越多，默认只渲染最近若干个，避免弹窗被历史版本撑长
  const [showAll, setShowAll] = useState(false);
  const visibleList = showAll ? list : list.slice(0, INITIAL_VISIBLE_COUNT);
  const hiddenCount = list.length - visibleList.length;
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        defaultExpandedVersion
          ? [defaultExpandedVersion]
          : list.length > 0
            ? [list[0].version]
            : [],
      ),
  );

  const toggle = (version: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  };

  return (
    <VStack gap={1}>
      {visibleList.map((release, index) => {
        const isLatest = index === 0;
        const isOpen = expanded.has(release.version);
        const rowId = `changelog-${release.version}`;

        return (
          <VStack
            key={release.version}
            gap={1}
            className="border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={rowId}
              onClick={() => toggle(release.version)}
              className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left hover:bg-overlay-hover focus-ring"
            >
              <ChevronDown
                size={ICON_SIZE.sm}
                className={`flex-none text-secondary transition-transform ${isOpen ? '' : '-rotate-90'}`}
              />
              <Text size="sm" weight="semibold" className="text-primary">
                {release.version}
              </Text>
              {isLatest && (
                <span className="rounded-full bg-neutral px-2 py-0.5 text-xs font-medium text-accent">
                  最新
                </span>
              )}
              {release.date && (
                <Text size="sm" color="secondary" className="ml-auto">
                  {release.date}
                </Text>
              )}
            </button>
            {isOpen && (
              <div id={rowId} className="px-4 pb-2">
                <ChangelogHighlightList release={release} />
              </div>
            )}
          </VStack>
        );
      })}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="rounded-control px-2 py-2 text-center hover:bg-overlay-hover focus-ring"
        >
          <Text size="sm" color="secondary">
            查看更早版本（{hiddenCount}）
          </Text>
        </button>
      )}
    </VStack>
  );
}
