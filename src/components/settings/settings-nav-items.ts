import {
  DatabaseBackup,
  FolderTree,
  Image as ImageIcon,
  Info,
  Palette,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

interface SettingsNavItem {
  href: string;
  label: string;
  description: string;
  group: '站点' | '内容' | '系统';
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const SETTINGS_NAV_GROUPS = ['站点', '内容', '系统'] as const;

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    href: '/settings/general',
    label: '通用',
    description: '站点名称、品牌标识与默认网络模式',
    group: '站点',
    icon: Settings,
  },
  {
    href: '/settings/appearance',
    label: '外观',
    description: '主题、字号、卡片显示与壁纸',
    group: '站点',
    icon: Palette,
  },
  {
    href: '/settings/categories',
    label: '分类',
    description: '首页卡片分组与排列顺序',
    group: '内容',
    icon: FolderTree,
  },
  {
    href: '/settings/search',
    label: '搜索',
    description: '搜索框可用的搜索引擎',
    group: '内容',
    icon: Search,
  },
  {
    href: '/settings/assets',
    label: '素材',
    description: '上传的卡片图标与壁纸文件',
    group: '内容',
    icon: ImageIcon,
  },
  {
    href: '/settings/account',
    label: '账号与安全',
    description: '登录用户名与密码',
    group: '系统',
    icon: ShieldCheck,
  },
  {
    href: '/settings/data',
    label: '数据与备份',
    description: '导出与恢复全部站点数据',
    group: '系统',
    icon: DatabaseBackup,
  },
  {
    href: '/settings/about',
    label: '关于',
    description: '版本更新、更新日志与运行环境',
    group: '系统',
    icon: Info,
  },
];

export function getActiveSettingsNavItem(pathname: string) {
  return SETTINGS_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
