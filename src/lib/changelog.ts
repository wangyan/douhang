/**
 * CHANGELOG.md 解析（发布更新日志的唯一事实源）
 *
 * 结构约定（Keep a Changelog 中文变体）：
 *
 *   # 更新日志
 *
 *   ## v1.0.0 - 2026-09-21
 *   版本简介（可省略，一行散文）
 *   ### 亮点
 *   - 面向使用者的能力描述
 *   ### 修复
 *   - 修复 xxx
 *
 * 「亮点」分类单独解析为 highlights，供应用内「关于」弹窗与更新提醒展示；
 * 其余分类只进 Release 说明与仓库文档。
 *
 * 被 scripts/generate-changelog.ts 在构建期转成 JSON 供前端展示；
 * release.sh 提取对应版本段落作为 Release 说明（含全部分类）。
 */

/** 应用内展示用的分类名（写入 CHANGELOG 的约定，见贡献指南） */
const HIGHLIGHT_CATEGORY = '亮点';

interface ChangelogCategory {
  /** 分类名：修复 / 变更 / 部署与运维 等 */
  name: string;
  items: string[];
}

export interface ChangelogRelease {
  /** 版本号，如 v1.0.0 */
  version: string;
  /** 发布日期（YYYY-MM-DD），缺省 undefined */
  date?: string;
  /** 版本简介：标题与首个分类之间的散文（连续行合并为一段） */
  summary?: string;
  /** 亮点条目，应用内只展示它（取自「亮点」分类） */
  highlights: string[];
  /** 其余分类，只进 Release 说明与仓库文档 */
  categories: ChangelogCategory[];
}

/** 解析 Keep a Changelog 格式的更新日志 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let category: ChangelogCategory | null = null;
  let collectingHighlights = false;
  let introLines: string[] = [];
  let introOpen = false;

  /** 简介在首个分类 / 条目 / 下一个版本处结束 */
  const closeIntro = () => {
    if (release && introOpen && introLines.length > 0) {
      release.summary = introLines.join(' ');
    }
    introLines = [];
    introOpen = false;
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();

    const heading =
      /^## (v\d+\.\d+\.\d+)(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(line);
    if (heading) {
      closeIntro();
      release = {
        version: heading[1],
        ...(heading[2] ? { date: heading[2] } : {}),
        highlights: [],
        categories: [],
      };
      releases.push(release);
      category = null;
      collectingHighlights = false;
      introOpen = true;
      continue;
    }
    if (!release) continue;

    const categoryMatch = /^###\s+(.+?)\s*$/.exec(line);
    if (categoryMatch) {
      closeIntro();
      if (categoryMatch[1] === HIGHLIGHT_CATEGORY) {
        collectingHighlights = true;
        category = null;
      } else {
        collectingHighlights = false;
        category = { name: categoryMatch[1], items: [] };
        release.categories.push(category);
      }
      continue;
    }

    const item = /^[-*]\s+(.+?)\s*$/.exec(line);
    if (item) {
      closeIntro();
      if (collectingHighlights) {
        release.highlights.push(item[1]);
      } else if (category) {
        category.items.push(item[1]);
      }
      continue;
    }

    // 既非标题也非条目：在首个分类之前累积为版本简介
    if (introOpen && line !== '') introLines.push(line);
  }

  return releases;
}

/**
 * 应用内展示的条目
 *
 * 优先「亮点」；未写亮点时回退为版本简介；两者皆无返回空数组，
 * 由调用方决定是否渲染空态。
 */
export function changelogDisplayItems(release: ChangelogRelease): string[] {
  if (release.highlights.length > 0) return release.highlights;
  return release.summary ? [release.summary] : [];
}
