'use client';

import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
  ArrowUpCircle,
  BookOpenText,
  Check,
  CircleUserRound,
  Command,
  Grid2x2,
  Info,
  LayoutTemplate,
  ListChecks,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Settings,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { AboutDialog } from '@/components/layout/AboutDialog';
import {
  type AppearancePanelData,
  AppearanceQuickPanel,
} from '@/components/layout/AppearanceQuickPanel';
import {
  BATCH_DELETE_MODE_EVENT,
  CARD_SIMPLE_MODE_EVENT,
} from '@/components/layout/card-view-events';
import { EDIT_MODE_CHANGE_EVENT } from '@/components/layout/edit-mode-event';
import {
  UPDATE_DISMISS_KEY,
  UpdateNotification,
} from '@/components/layout/UpdateNotification';
import { CmdKModal } from '@/components/search/CmdKModal';
import { useTheme } from '@/hooks/useTheme';
import { useWidgetBarVisibility } from '@/hooks/useWidgetBarVisibility';
import { ICON_SIZE } from '@/lib/design-tokens';
import { GUEST_PREF_KEYS } from '@/lib/guest-preferences';
import {
  isNetworkMode,
  NETWORK_MODE_CHANGE_EVENT,
  NETWORK_MODE_META,
  NETWORK_MODE_ORDER,
  NETWORK_MODE_STORAGE_KEY,
} from '@/lib/network-mode';
import { ADMIN_GUIDE_URL, MANUAL_URL, REPO_URL } from '@/lib/version';
import { preferencesApi, versionApi } from '@/services';
import type { NetworkMode, ThemeMode, VersionUpdateInfo } from '@/types';

interface FloatingToolbarProps {
  networkMode: NetworkMode;
  /** 卡片简洁模式（SSR 初始值） */
  cardSimpleMode: boolean;
  /** 页面有整体最大宽度框架时，相对框架绝对定位而非视口固定。 */
  withinFrame?: boolean;
  /** 远端仓库主页地址（支持外部透传，回落至 REPO_URL） */
  repoUrl?: string;
  /** 用户指南文档地址（支持外部透传，回落至 MANUAL_URL） */
  manualUrl?: string;
  /** 管理指南文档地址（支持外部透传，回落至 ADMIN_GUIDE_URL） */
  adminGuideUrl?: string;
  /** 当前用户是否已登录，默认 true */
  isAuthed?: boolean;
  /** 外观快捷面板数据包（首页 SSR 取好传入；缺省时菜单不显示外观入口） */
  appearance?: AppearancePanelData;
}

/**
 * 右上角浮动工具栏（floating pill）
 *
 * - 默认 position: fixed，脱离居中容器；withinFrame 时相对页面框架定位
 * - 贴近视口右上角（top-6 right-6）
 * - 胶囊容器：毛玻璃 + 圆角 999 + hairline 边框 + 阴影
 *
 * 分区逻辑：环境（网络/主题）｜ 视图（⌘/Widget/简洁）｜ 模式（编辑/批量）｜ 账户
 * 高频操作直达，低频配置在设置页，账户菜单只做导航。
 */
/** ESC 逐层退出画布模式：批量删除 → 编辑模式（由本 hook 统一监听） */
function useEscapeExitModes(
  editMode: boolean,
  batchMode: boolean,
  dispatchEditModeChange: (value: boolean) => void,
  dispatchBatchModeChange: (value: boolean) => void,
) {
  useEffect(() => {
    if (!editMode && !batchMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 打开中的原生 dialog / 命令面板消费 ESC 时不退出画布模式
        if (e.defaultPrevented || document.querySelector('dialog[open]')) {
          return;
        }
        // 逐层退出：优先退出批量选择模式，其次退出编辑模式
        if (batchMode) {
          dispatchBatchModeChange(false);
        } else if (editMode) {
          dispatchEditModeChange(false);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editMode, batchMode, dispatchEditModeChange, dispatchBatchModeChange]);
}
/** 环境区按钮：网络模式 + 主题循环（高频，各自循环/切换） */
function ToolbarEnvCluster({
  netMode,
  onCycleNetwork,
  mode,
  resolved,
  onCycleTheme,
}: {
  netMode: NetworkMode;
  onCycleNetwork: () => Promise<void>;
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  onCycleTheme: () => void;
}) {
  const network = NETWORK_MODE_META[netMode];
  const NetworkIcon = network.Icon;
  // 跟随系统时图标展示当前生效明暗，标签标注「跟随系统」
  const themeLabel =
    mode === 'system' ? '跟随系统' : mode === 'dark' ? '暗黑' : '明亮';
  const ThemeIcon =
    mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;

  return (
    <>
      <IconButton
        label={`网络模式：${network.label}`}
        icon={<NetworkIcon size={ICON_SIZE.md} />}
        variant="ghost"
        tooltip={`网络模式：${network.label}（点击切换）`}
        onClick={() => {
          void onCycleNetwork();
        }}
      />
      <IconButton
        label={`主题：${themeLabel}`}
        icon={<ThemeIcon size={ICON_SIZE.md} />}
        variant="ghost"
        tooltip={`主题：${themeLabel}（点击循环切换）`}
        onClick={onCycleTheme}
      />

      {/* hairline 分隔 */}
      <span className="mx-2 h-5 w-px bg-border" aria-hidden />
    </>
  );
}
/** 视图区按钮：快捷启动器 + 卡片简洁模式 */
function ToolbarViewCluster({
  onOpenCmdK,
  simpleMode,
  onToggleSimpleMode,
}: {
  onOpenCmdK: () => void;
  simpleMode: boolean;
  onToggleSimpleMode: () => void;
}) {
  return (
    <>
      <IconButton
        label="快捷启动器"
        icon={<Command size={ICON_SIZE.md} />}
        variant="ghost"
        tooltip="Cmd+K"
        onClick={onOpenCmdK}
      />
      <IconButton
        label={simpleMode ? '退出简洁模式' : '卡片简洁模式'}
        icon={<LayoutTemplate size={ICON_SIZE.md} />}
        variant={simpleMode ? 'secondary' : 'ghost'}
        tooltip={simpleMode ? '退出简洁模式' : '卡片简洁模式（仅图标）'}
        aria-pressed={simpleMode}
        onClick={onToggleSimpleMode}
      />
    </>
  );
}
/** 模式区按钮：Widget 显隐 + 编辑模式 + 批量删除（编辑的二级操作，仅登录态展示） */
function ToolbarModeCluster({
  widgetBarVisible,
  onToggleWidgetBar,
  editMode,
  batchMode,
  dispatchEditModeChange,
  dispatchBatchModeChange,
}: {
  widgetBarVisible: boolean;
  onToggleWidgetBar: () => void;
  editMode: boolean;
  batchMode: boolean;
  dispatchEditModeChange: (value: boolean) => void;
  dispatchBatchModeChange: (value: boolean) => void;
}) {
  return (
    <>
      {/* hairline 分隔：视图区 | 模式区 */}
      <span className="mx-2 h-5 w-px bg-border" aria-hidden />

      <IconButton
        label={widgetBarVisible ? '隐藏 Widget' : '显示 Widget'}
        icon={<Grid2x2 size={ICON_SIZE.md} />}
        variant={widgetBarVisible ? 'secondary' : 'ghost'}
        tooltip={widgetBarVisible ? '隐藏 Widget 横条' : '显示 Widget 横条'}
        aria-pressed={widgetBarVisible}
        onClick={onToggleWidgetBar}
      />
      <IconButton
        label={editMode ? '完成' : '编辑'}
        icon={
          editMode ? (
            <Check size={ICON_SIZE.md} />
          ) : (
            <Pencil size={ICON_SIZE.md} />
          )
        }
        variant={editMode ? 'primary' : 'ghost'}
        tooltip={editMode ? '完成编辑（ESC）' : '编辑模式'}
        onClick={() => {
          // 关闭编辑模式时连带退出批量删除（批量删除是编辑态的二级模式）
          if (editMode && batchMode) dispatchBatchModeChange(false);
          dispatchEditModeChange(!editMode);
        }}
      />
      <IconButton
        label={batchMode ? '退出批量删除' : '批量删除卡片'}
        icon={<ListChecks size={ICON_SIZE.md} />}
        variant={batchMode ? 'secondary' : 'ghost'}
        tooltip={batchMode ? '退出批量删除（ESC）' : '批量删除卡片'}
        aria-pressed={batchMode}
        onClick={() => dispatchBatchModeChange(!batchMode)}
      />
    </>
  );
}

export function FloatingToolbar({
  networkMode,
  cardSimpleMode,
  withinFrame = false,
  repoUrl = REPO_URL,
  manualUrl = MANUAL_URL,
  adminGuideUrl = ADMIN_GUIDE_URL,
  isAuthed = true,
  appearance,
}: FloatingToolbarProps) {
  const [cmdKOpen, setCmdKOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [simpleMode, setSimpleMode] = useState(cardSimpleMode);
  const [netMode, setNetMode] = useState<NetworkMode>(networkMode);
  const { mode, resolved, setMode } = useTheme();
  const { visible: widgetBarVisible, setVisible: setWidgetBarVisible } =
    useWidgetBarVisibility();
  /** 有新版本时的展示状态：update + 是否已被用户关闭（一次 setState 原子落定，无闪烁） */
  const [updateState, setUpdateState] = useState<{
    update: VersionUpdateInfo;
    dismissed: boolean;
  } | null>(null);

  // 挂载时检查更新（仅登录态）：服务端 24h 节流，命中缓存无额外开销；失败静默
  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    versionApi
      .check()
      .then((result) => {
        if (!cancelled && result.updateAvailable && result.update) {
          const tag = result.update.tag;
          const dismissed =
            window.localStorage.getItem(UPDATE_DISMISS_KEY) === tag;
          setUpdateState({ update: result.update, dismissed });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthed]);

  // 提示状态机：浮层（强提醒）与工具栏图标（常驻入口）互斥
  const activeUpdate =
    updateState !== null && !updateState.dismissed ? updateState.update : null;
  const dismissedUpdate = updateState?.dismissed ? updateState.update : null;

  const handleUpdateDismiss = (tag: string) => {
    window.localStorage.setItem(UPDATE_DISMISS_KEY, tag);
    setUpdateState((previous) =>
      previous && previous.update.tag === tag
        ? { ...previous, dismissed: true }
        : previous,
    );
  };

  // dispatch 编辑模式变更（同时通知 HomeContent + WidgetBar）
  const dispatchEditModeChange = useCallback((value: boolean) => {
    setEditMode(value);
    window.dispatchEvent(
      new CustomEvent(EDIT_MODE_CHANGE_EVENT, { detail: value }),
    );
  }, []);

  // dispatch 批量删除模式变更（通知 HomeContent 进入卡片多选态）
  const dispatchBatchModeChange = useCallback((value: boolean) => {
    setBatchMode(value);
    window.dispatchEvent(
      new CustomEvent(BATCH_DELETE_MODE_EVENT, { detail: value }),
    );
  }, []);

  // 监听外部触发的编辑模式变更（如 WidgetBar 添加 widget 后自动进入编辑态）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setEditMode(detail);
    };
    window.addEventListener(EDIT_MODE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(EDIT_MODE_CHANGE_EVENT, handler);
  }, []);

  // 监听外部触发的批量删除模式变更（如 HomeContent 底部操作条「取消」）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setBatchMode(detail);
    };
    window.addEventListener(BATCH_DELETE_MODE_EVENT, handler);
    return () => window.removeEventListener(BATCH_DELETE_MODE_EVENT, handler);
  }, []);

  // 监听外部触发的简洁模式变更（如外观快捷面板切换），保持工具栏按钮同步
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setSimpleMode(detail);
    };
    window.addEventListener(CARD_SIMPLE_MODE_EVENT, handler);
    return () => window.removeEventListener(CARD_SIMPLE_MODE_EVENT, handler);
  }, []);

  // ESC 逐层退出画布模式：批量删除 → 编辑模式（由 useEscapeExitModes 统一监听）
  useEscapeExitModes(
    editMode,
    batchMode,
    dispatchEditModeChange,
    dispatchBatchModeChange,
  );

  // 监听页面内或跨标签页触发的网络模式变更，保持工具栏同步
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NetworkMode>).detail;
      if (isNetworkMode(detail)) setNetMode(detail);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === NETWORK_MODE_STORAGE_KEY && isNetworkMode(e.newValue)) {
        setNetMode(e.newValue);
        window.dispatchEvent(
          new CustomEvent(NETWORK_MODE_CHANGE_EVENT, { detail: e.newValue }),
        );
      }
    };
    window.addEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // 挂载后同步浏览器本地持久化的网络模式偏好（游客与未登录状态优先采信本地）
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NETWORK_MODE_STORAGE_KEY);
      if (isNetworkMode(stored)) {
        setNetMode(stored);
        window.dispatchEvent(
          new CustomEvent(NETWORK_MODE_CHANGE_EVENT, { detail: stored }),
        );
      }
    } catch {}
  }, []);

  // 挂载后同步浏览器本地持久化的简洁模式偏好
  useEffect(() => {
    try {
      const stored = localStorage.getItem(GUEST_PREF_KEYS.CARD_SIMPLE_MODE);
      if (stored !== null) {
        const val = stored === 'true';
        setSimpleMode(val);
        window.dispatchEvent(
          new CustomEvent(CARD_SIMPLE_MODE_EVENT, { detail: val }),
        );
      }
    } catch {}
  }, []);

  // 切换卡片简洁模式：本地缓存 + 服务端持久化（已登录态）+ 通知 HomeContent 即时生效
  const handleToggleSimpleMode = () => {
    const next = !simpleMode;
    setSimpleMode(next);
    try {
      localStorage.setItem(GUEST_PREF_KEYS.CARD_SIMPLE_MODE, String(next));
    } catch {}
    if (isAuthed) {
      void preferencesApi.update('cardSimpleMode', next).catch((e) => {
        console.error('保存简洁模式失败', e);
      });
    }
    window.dispatchEvent(
      new CustomEvent(CARD_SIMPLE_MODE_EVENT, { detail: next }),
    );
  };

  // 全局 Cmd+K / Ctrl+K 快捷键监听
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdKOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 网络模式循环切换：auto → internal → external
  const handleCycleNetworkMode = async () => {
    const idx = NETWORK_MODE_ORDER.indexOf(netMode);
    const next = NETWORK_MODE_ORDER[(idx + 1) % NETWORK_MODE_ORDER.length];
    setNetMode(next);
    try {
      localStorage.setItem(NETWORK_MODE_STORAGE_KEY, next);
    } catch {}
    // 乐观立即向全页面广播事件，使得卡片跳转 URL 和状态探测立即更新，无需等待接口返回
    window.dispatchEvent(
      new CustomEvent(NETWORK_MODE_CHANGE_EVENT, { detail: next }),
    );
    if (isAuthed) {
      try {
        await preferencesApi.update('networkMode', next);
      } catch (e) {
        console.error('保存网络模式失败', e);
      }
    }
  };

  // 主题三态循环：明亮 → 暗黑 → 跟随系统（已登录同步服务端，未登录仅本地存储）
  const handleCycleTheme = () => {
    const next: ThemeMode =
      mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    setMode(next);
    if (isAuthed) {
      void preferencesApi.update('theme', next).catch((e) => {
        console.error('保存主题失败', e);
      });
    }
  };

  return (
    <>
      <HStack
        gap={1}
        align="center"
        className={`floating-toolbar ${withinFrame ? 'absolute' : 'fixed'} top-6 right-4 md:right-6 z-chrome rounded-full bg-surface/80 backdrop-blur-md border border-border shadow-float px-1.5 py-1 sm:px-2 md:px-3`}
      >
        {/* 折叠区：默认收起（悬停或聚焦展开），末尾用户菜单单独常驻 */}
        <div className="floating-toolbar-main">
          {/* 环境区：网络模式 + 主题（高频，各自循环/切换） */}
          <ToolbarEnvCluster
            netMode={netMode}
            onCycleNetwork={handleCycleNetworkMode}
            mode={mode}
            resolved={resolved}
            onCycleTheme={handleCycleTheme}
          />

          {/* 视图区：显示开关 */}
          <ToolbarViewCluster
            onOpenCmdK={() => setCmdKOpen(true)}
            simpleMode={simpleMode}
            onToggleSimpleMode={handleToggleSimpleMode}
          />

          {/* 模式区：仅登录用户可见（Widget 显隐、编辑模式、批量删除） */}
          {isAuthed && (
            <ToolbarModeCluster
              widgetBarVisible={widgetBarVisible}
              onToggleWidgetBar={() => setWidgetBarVisible(!widgetBarVisible)}
              editMode={editMode}
              batchMode={batchMode}
              dispatchEditModeChange={dispatchEditModeChange}
              dispatchBatchModeChange={dispatchBatchModeChange}
            />
          )}

          {/* 更新提醒：仅登录态检查与展示，浮层关闭后才出现的常驻入口，直达关于弹窗 */}
          {isAuthed && dismissedUpdate && (
            <>
              <span className="mx-2 h-5 w-px bg-border" aria-hidden />
              <IconButton
                label={`新版本 ${dismissedUpdate.tag} 可用`}
                icon={<ArrowUpCircle size={ICON_SIZE.md} />}
                variant="secondary"
                tooltip={`新版本 ${dismissedUpdate.tag} 可用，点击查看更新日志`}
                onClick={() => setAboutOpen(true)}
              />
            </>
          )}
        </div>

        {/* 用户菜单：纯导航（设置 / 退出登录 / 登录后台 / 关于），常驻末尾 */}
        <ToolbarUserMenu
          isAuthed={isAuthed}
          onOpenAbout={() => setAboutOpen(true)}
          onOpenAppearance={
            appearance ? () => setAppearanceOpen(true) : undefined
          }
          manualUrl={manualUrl}
          adminGuideUrl={adminGuideUrl}
        />
      </HStack>

      <CmdKModal
        isOpen={cmdKOpen}
        onOpenChange={setCmdKOpen}
        networkMode={netMode}
      />
      <AboutDialog
        isOpen={aboutOpen}
        onOpenChange={setAboutOpen}
        update={updateState?.update ?? null}
        repoUrl={repoUrl}
      />
      {appearance && (
        <AppearanceQuickPanel
          isOpen={appearanceOpen}
          onOpenChange={setAppearanceOpen}
          data={appearance}
          cardSimpleMode={simpleMode}
          isAuthed={isAuthed}
        />
      )}
      {isAuthed && activeUpdate && (
        <UpdateNotification
          update={activeUpdate}
          repoUrl={repoUrl}
          onDismiss={handleUpdateDismiss}
        />
      )}
    </>
  );
}

/**
 * 用户下拉菜单
 * - 登录用户：设置 / 使用帮助 / 退出登录 / 关于
 * - 未登录用户：登录后台 / 使用帮助 / 关于
 */
function ToolbarUserMenu({
  isAuthed,
  onOpenAbout,
  onOpenAppearance,
  manualUrl,
  adminGuideUrl,
}: {
  isAuthed: boolean;
  onOpenAbout: () => void;
  onOpenAppearance?: () => void;
  manualUrl: string;
  adminGuideUrl: string;
}) {
  const router = useRouter();

  return (
    <DropdownMenu
      hasChevron={false}
      alignment="end"
      menuWidth={200}
      button={{
        label: '用户菜单',
        variant: 'ghost',
        isIconOnly: true,
        icon: <CircleUserRound size={ICON_SIZE.md} />,
      }}
    >
      {isAuthed ? (
        <>
          {onOpenAppearance && (
            <DropdownMenuItem
              icon={<Palette size={ICON_SIZE.md} />}
              label="外观"
              style={{ paddingInline: 12 }}
              onClick={onOpenAppearance}
            />
          )}
          <DropdownMenuItem
            icon={<Settings size={ICON_SIZE.md} />}
            label="设置"
            style={{ paddingInline: 12 }}
            onClick={() => router.push('/settings')}
          />
          <DropdownMenuItem
            icon={<BookOpenText size={ICON_SIZE.md} />}
            label="用户指南"
            style={{ paddingInline: 12 }}
            onClick={() => window.open(manualUrl, '_blank', 'noopener')}
          />
          <DropdownMenuItem
            icon={<ShieldCheck size={ICON_SIZE.md} />}
            label="管理指南"
            style={{ paddingInline: 12 }}
            onClick={() => window.open(adminGuideUrl, '_blank', 'noopener')}
          />
          <DropdownMenuItem
            icon={<LogOut size={ICON_SIZE.md} />}
            label="退出登录"
            style={{ paddingInline: 12 }}
            onClick={() => {
              void signOut({ redirect: false }).then(() => {
                router.replace('/');
                router.refresh();
              });
            }}
          />
        </>
      ) : (
        <>
          {onOpenAppearance && (
            <DropdownMenuItem
              icon={<Palette size={ICON_SIZE.md} />}
              label="外观"
              style={{ paddingInline: 12 }}
              onClick={onOpenAppearance}
            />
          )}
          <DropdownMenuItem
            icon={<LogIn size={ICON_SIZE.md} />}
            label="登录后台"
            style={{ paddingInline: 12 }}
            onClick={() => router.push('/login?callbackUrl=/settings')}
          />
          <DropdownMenuItem
            icon={<BookOpenText size={ICON_SIZE.md} />}
            label="用户指南"
            style={{ paddingInline: 12 }}
            onClick={() => window.open(manualUrl, '_blank', 'noopener')}
          />
        </>
      )}
      <DropdownMenuDivider />
      <DropdownMenuItem
        icon={<Info size={ICON_SIZE.md} />}
        label="关于"
        style={{ paddingInline: 12 }}
        onClick={onOpenAbout}
      />
    </DropdownMenu>
  );
}
