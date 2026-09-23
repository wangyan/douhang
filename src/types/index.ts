// 全局共享类型定义

/** 网络模式（内外网切换） */
export type NetworkMode = 'auto' | 'internal' | 'external';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** 内置 5 个引擎的 key（由初始迁移落库，可编辑/删除） */
type BuiltinSearchEngine =
  | 'google'
  | 'bing'
  | 'baidu'
  | 'github'
  | 'stackoverflow';

/** 搜索引擎 key：内置 key 或自定义引擎的 cuid（DB search_engines.id） */
export type SearchEngine = BuiltinSearchEngine | (string & {});

/** Widget 尺寸档位：S=紧凑 / M=标准（默认）/ L=详细（横条中占 2 列） */
export type WidgetSize = 'S' | 'M' | 'L';

/** 全局字体大小范围（百分比） */
export const FONT_SIZE_MIN = 90;
export const FONT_SIZE_MAX = 150;
export const FONT_SIZE_STEP = 5;
export const FONT_SIZE_DEFAULT = 100;

/** 壁纸遮罩强度（百分比，0 为无遮罩） */
export const WALLPAPER_SCRIM_MIN = 0;
export const WALLPAPER_SCRIM_MAX = 80;
export const WALLPAPER_SCRIM_STEP = 5;
export const WALLPAPER_SCRIM_DEFAULT = 50;
export const FONT_SIZE_LEGACY_SCALES: Record<string, number> = {
  small: 90,
  medium: 100,
  large: 110,
  'x-large': 125,
};
export type FontSizePreference = number;

/** Widget key（单一来源：src/lib/widgets/registry.ts 的 WIDGET_REGISTRY） */
import type { DateItemWidgetKey, WidgetKey } from '@/lib/widgets/registry';

export type { DateItemWidgetKey, WidgetKey };

/** 卡片状态灯三态 */
export type CardStatus = 'online' | 'offline' | 'unknown';

/** 搜索引擎配置 */
export interface SearchEngineConfig {
  key: SearchEngine;
  name: string;
  /** 搜索 URL 模板，关键词会被 encodeURIComponent 处理后拼接 */
  urlTemplate: string;
  /** 引擎 logo URL；可为 null（前端回退地球图标） */
  logo: string | null;
}

/** 自定义搜索引擎（DB search_engines 行） */
export interface CustomSearchEngine {
  id: string;
  name: string;
  urlTemplate: string;
  iconPath: string | null;
  order: number;
}

/** Docker 容器状态聚合（NasStatus widget 数据） */
export interface DockerStatusSummary {
  /** 运行中容器数 */
  running: number;
  /** 总容器数 */
  total: number;
  /** 已停止容器数 */
  stopped: number;
  /** 运行中容器名 */
  runningNames: string[];
}

/** Docker 资源水位（ResourceGauge widget 数据） */
export interface DockerResourceSummary {
  /** 容器聚合 CPU 使用率（0-100） */
  cpuPercent: number;
  /** 容器聚合内存使用率（0-100） */
  memoryPercent: number;
  /** 容器聚合磁盘 IO 读速率（bytes/s） */
  diskReadBytesPerSec: number;
  /** 容器聚合磁盘 IO 写速率（bytes/s） */
  diskWriteBytesPerSec: number;
}

/** Docker widget 数据（/api/widgets/docker 响应体） */
export interface DockerStats {
  available: boolean;
  status: DockerStatusSummary;
  resource: DockerResourceSummary;
  engine: DockerEngineInfo;
}

/** Docker 引擎信息 */
export interface DockerEngineInfo {
  /** 镜像总数 */
  images: number;
  /** Docker 版本号 */
  serverVersion: string;
  /** 宿主机 CPU 核数 */
  cpus: number;
  /** 宿主机内存总量（bytes） */
  memTotalBytes: number;
}

/** qBittorrent 连接配置（存 UserPreference key="qbittorrent"） */
export interface QbittorrentConfig {
  /** qB WebUI 地址（如 http://192.168.1.10:8080） */
  url: string;
  username: string;
  password: string;
}

/** qBittorrent 速度与任务数汇总 */
export interface QbittorrentSummary {
  /** 总下载速度（bytes/s） */
  downloadSpeed: number;
  /** 总上传速度（bytes/s） */
  uploadSpeed: number;
  /** 下载中任务数 */
  downloading: number;
  /** 做种中任务数 */
  seeding: number;
  /** 暂停 / 停止任务数 */
  paused: number;
}

/** qB 全生命周期累计统计（聚合自全部种子的 uploaded / downloaded） */
export interface QbLifetimeStats {
  /** 累计上传（bytes） */
  uploaded: number;
  /** 累计下载（bytes） */
  downloaded: number;
  /** 任务总数 */
  total: number;
}

/** qBittorrent widget 数据（/api/widgets/qbittorrent 响应体） */
export interface QbittorrentStats {
  available: boolean;
  /** available=false 时的原因（未配置 / 连接失败），widget 直接展示 */
  error: string | null;
  summary: QbittorrentSummary;
  /** 全生命周期累计统计（空闲状态下的填充内容） */
  lifetime: QbLifetimeStats;
}

/** 卡片探测结果 */
export interface CardStatusResult {
  id: string;
  status: CardStatus;
}

/** 卡片拖拽重排项 */
export interface CardReorderItem {
  id: string;
  order: number;
  /** 跨分类拖拽时的新分类 id，null 表示归到未分类 */
  categoryId: string | null;
}

/** 分类拖拽重排项 */
export interface CategoryReorderItem {
  id: string;
  order: number;
}

/** 日期项（widget 内部数据） */
export interface DateItemInput {
  name: string;
  date: string; // ISO 日期字符串
  /** 循环粒度（仅倒数日）：'week' 每周 | 'month' 每月 | 'year' 每年；null/缺省 = 不循环 */
  recurUnit?: 'week' | 'month' | 'year' | null;
}

/** 日期项（持久化记录，含 id 和 widgetKey） */
export interface DateItem extends DateItemInput {
  id: string;
  /** 所属 widget 实例 id（多实例下每个实例独立管理日期项） */
  instanceId: string;
  widgetKey: DateItemWidgetKey;
  /** 创建时间（ISO 字符串），用于倒数日进度计算 */
  createdAt: string;
}

/** Widget 实例（多实例，参考手机桌面 widget） */
export interface WidgetInstance {
  id: string;
  widgetKey: WidgetKey;
  order: number;
  size: WidgetSize;
}

/** Widget 库条目（可添加的 widget 类型元信息） */
export interface WidgetLibraryItem {
  key: WidgetKey;
  label: string;
  description: string;
}

/** 内外网判断后的最终跳转 URL */
export interface ResolvedUrl {
  /** 实际跳转的 URL */
  url: string;
  /** 来源：internalUrl 或 externalUrl */
  source: 'internal' | 'external';
}

/** 卡片（前端使用的结构，对应 Prisma Card model） */
export interface Card {
  id: string;
  name: string;
  internalUrl: string;
  externalUrl: string;
  icon: string;
  description: string | null;
  categoryId: string | null;
  /** 点击是否用弹框 iframe 打开 */
  openInDialog: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  /** 关联分类（仅 GET 请求时返回） */
  category?: Category | null;
}

/** 品牌配置（存 UserPreference key="brand"） */
export interface BrandConfig {
  /** 站点标题 */
  title: string;
  /** 自定义 Logo URL；空字符串表示使用内置品牌标识 */
  logo: string;
  /** 是否显示 Logo */
  showLogo: boolean;
  /** 是否显示标题 */
  showTitle: boolean;
}

/** 分类（前端使用的结构，对应 Prisma Category model） */
export interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  /** 关联卡片（仅 GET 请求时返回） */
  cards?: Card[];
}

/** 壁纸来源 */
type WallpaperSource = 'preset' | 'upload';

/** 壁纸（前端使用的结构，对应 Prisma Wallpaper model）
 *
 *  一张图适配两种主题（light/dark 共用，靠遮罩调整可读性），
 *  因此不区分 theme 字段。
 */
export interface Wallpaper {
  id: string;
  name: string;
  source: WallpaperSource;
  /** 预设为 /wallpapers/xxx.jpg，上传为 /api/wallpapers/file?path=xxx.jpg */
  path: string;
  /** 缩略图路径（可选） */
  thumbnail: string | null;
  /** 文件大小（仅上传文件提供，预设不读磁盘） */
  size?: number;
  createdAt: string;
}

/** 壁纸偏好（指向单个 Wallpaper.id，light/dark 共用） */
export interface WallpaperPreferences {
  /** 当前使用的壁纸 id（null = 不使用壁纸，回退到主题默认背景色） */
  wallpaper: string | null;
}

// ============ 版本更新检测 ============

/** 远端最新 Release 信息（GitHub Releases 或 Forgejo/Gitea API） */
export interface VersionUpdateInfo {
  /** 版本 tag，如 v1.1.0 */
  tag: string;
  /** Release 说明（Keep a Changelog 段落，缺 ## vX.Y.Z 标题行） */
  notes: string;
  /** Release 页面链接 */
  url: string;
  /** 检查时间（ISO 字符串） */
  checkedAt: string;
}

/** /api/version/check 响应 */
export interface VersionCheckResult {
  /** 版本检测开关是否开启 */
  enabled: boolean;
  /** 当前运行版本（v 前缀） */
  currentVersion: string;
  /** 远端是否有比当前更新的版本 */
  updateAvailable: boolean;
  /** 最新 Release 信息（检查成功时返回，含已是最新场景） */
  update?: VersionUpdateInfo;
  /** 检查失败原因（此时 update 为上次缓存，可能缺省） */
  error?: string;
}
