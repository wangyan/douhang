'use client';

import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { useToast } from '@astryxdesign/core/Toast';
import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  DragOverlay,
  pointerWithin,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useState } from 'react';
import { CardEditModal } from '@/components/cards/CardEditModal';
import { CardItem } from '@/components/cards/CardItem';
import { getCardUrl } from '@/components/cards/card-url';
import { CategorySection } from '@/components/categories/CategorySection';
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog';
import { BatchDeleteBar } from '@/components/layout/BatchDeleteBar';
import {
  CARD_SIMPLE_MODE_EVENT,
  CARD_STATUS_BADGE_EVENT,
} from '@/components/layout/card-view-events';
import { EDIT_MODE_CHANGE_EVENT } from '@/components/layout/edit-mode-event';
import { useBatchDeleteCards } from '@/hooks/useBatchDeleteCards';
import { useCardReorder } from '@/hooks/useCardReorder';
import { useCardStatuses } from '@/hooks/useCardStatuses';
import { useCategoryDelete } from '@/hooks/useCategoryDelete';
import { useEffectiveDensity } from '@/hooks/useEffectiveDensity';
import { useExternalDrop } from '@/hooks/useExternalDrop';
import { useExternalPaste } from '@/hooks/useExternalPaste';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
import { isCategoryDroppableId } from '@/lib/category-droppable';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  isNetworkMode,
  NETWORK_MODE_CHANGE_EVENT,
  NETWORK_MODE_STORAGE_KEY,
} from '@/lib/network-mode';
import { cardsApi } from '@/services/cards';
import type { Card, CardDensity, Category, NetworkMode } from '@/types';

/**
 * 卡片拖拽碰撞检测：指针命中优先
 *
 * 默认 closestCorners 用「碰撞矩形与 droppable 四角的平均距离」排序，
 * 分类分区这类宽容器远角距离占主导，指针悬在分类空白区（含空分类）时
 * over 永远轮不到分类容器 → 空白区无法作为跨分类落点。
 * 改为：指针下的卡片优先（精确插入位置），否则取指针命中的分类容器
 * （空白区落到分类末尾），都不命中再回退 closestCorners。
 */
const cardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    const cardCollisions = pointerCollisions.filter(
      (c) => !isCategoryDroppableId(c.id),
    );
    return cardCollisions.length > 0 ? cardCollisions : pointerCollisions;
  }
  return closestCorners(args);
};

/** 卡片编辑弹窗状态：关闭 / 新建（可预填分类与 URL）/ 编辑既有卡片 */
type EditModalState =
  | { mode: 'closed' }
  | { mode: 'create'; categoryId: string | null | undefined; url?: string }
  | { mode: 'edit'; card: Card };

type EditModalAction =
  | { type: 'open-drop'; url: string }
  | { type: 'open-new'; categoryId: string | null }
  | { type: 'open-edit'; card: Card }
  | { type: 'close' };

function editModalReducer(
  _state: EditModalState,
  action: EditModalAction,
): EditModalState {
  switch (action.type) {
    case 'open-drop':
      return { mode: 'create', categoryId: undefined, url: action.url };
    case 'open-new':
      return { mode: 'create', categoryId: action.categoryId };
    case 'open-edit':
      return { mode: 'edit', card: action.card };
    case 'close':
      return { mode: 'closed' };
  }
}

interface HomeContentProps {
  categories: Category[];
  unclassifiedCards: Card[];
  networkMode: NetworkMode;
  /** 卡片简洁模式（SSR 初始值） */
  cardSimpleMode: boolean;
  /** 卡片状态徽章显隐（SSR 初始值） */
  cardStatusBadge: boolean;
  /** 卡片显示密度（SSR 初始值） */
  cardDensity?: CardDensity;
  /** 当前用户是否已登录，默认 true */
  isAuthed?: boolean;
}

/**
 * 主页内容区
 *
 * - 有卡片时：分类分区纵向铺开 + 未分类排最后 + DndContext 跨分类拖拽
 * - 空状态：EmptyState 引导
 * - 批量删除的状态与动作在 useBatchDeleteCards，操作条在 BatchDeleteBar
 */
export function HomeContent({
  categories,
  unclassifiedCards,
  networkMode,
  cardSimpleMode,
  cardStatusBadge,
  cardDensity = 'normal',
  isAuthed = true,
}: HomeContentProps) {
  const [modal, dispatchModal] = useReducer(editModalReducer, {
    mode: 'closed',
  });
  const modalOpen = modal.mode !== 'closed';
  const editingCard = modal.mode === 'edit' ? modal.card : null;
  const initialCategoryId =
    modal.mode === 'create' ? modal.categoryId : undefined;
  const initialUrl = modal.mode === 'create' ? modal.url : undefined;
  const [dropKey, setDropKey] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);
  // 卡片显示密度（响应式 hook：auto 模式自适应分辨率，手动切档即时响应）
  const density = useEffectiveDensity(cardDensity);
  // 卡片简洁模式（FloatingToolbar 切换，事件同步；SSR 初始值避免闪烁）
  const [simpleMode, setSimpleMode] = useState(cardSimpleMode);
  // 卡片状态徽章显隐（FloatingToolbar 切换，事件同步；SSR 初始值避免闪烁）
  const [showStatusBadge, setShowStatusBadge] = useState(cardStatusBadge);
  // 当前网络模式（FloatingToolbar / NetworkForm 切换，事件同步；SSR 初始值避免闪烁）
  const [currentNetworkMode, setCurrentNetworkMode] =
    useState<NetworkMode>(networkMode);
  const showToast = useToast();
  const router = useRouter();

  const {
    localCategories,
    localUnclassified,
    activeCard,
    sensors,
    handleDragStart,
    handleDragEnd,
    removeCardOptimistic,
    restoreCard,
  } = useCardReorder(categories, unclassifiedCards);

  // 状态灯批量探测 + 网络模式切换重探测
  const { statuses, refreshOne } = useCardStatuses(currentNetworkMode);

  // 监听 FloatingToolbar 统一编辑模式开关（同时管控卡片排序态 + widget 编辑态）
  // ESC 退出由 FloatingToolbar 统一处理，此处只同步状态
  useEffect(() => {
    const handler = (e: Event) => {
      const value = (e as CustomEvent<boolean>).detail;
      setReorderMode(value);
    };
    window.addEventListener(EDIT_MODE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(EDIT_MODE_CHANGE_EVENT, handler);
  }, []);

  // 挂载后同步浏览器本地持久化的简洁模式偏好
  useEffect(() => {
    try {
      const stored = localStorage.getItem('douhang-card-simple-mode');
      if (stored !== null) {
        setSimpleMode(stored === 'true');
      }
    } catch {}
  }, []);

  // 挂载后同步浏览器本地持久化的可达状态徽章偏好
  useEffect(() => {
    try {
      const stored = localStorage.getItem('douhang-card-status-badge');
      if (stored !== null) {
        setShowStatusBadge(stored === 'true');
      }
    } catch {}
  }, []);

  // 卡片简洁模式开关（FloatingToolbar 切换后即时生效）
  useEffect(() => {
    const handler = (e: Event) => {
      setSimpleMode((e as CustomEvent<boolean>).detail);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'douhang-card-simple-mode' && e.newValue !== null) {
        setSimpleMode(e.newValue === 'true');
      }
    };
    window.addEventListener(CARD_SIMPLE_MODE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(CARD_SIMPLE_MODE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // 卡片状态徽章显隐开关（FloatingToolbar 切换后即时生效）
  useEffect(() => {
    const handler = (e: Event) => {
      setShowStatusBadge((e as CustomEvent<boolean>).detail);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'douhang-card-status-badge' && e.newValue !== null) {
        setShowStatusBadge(e.newValue === 'true');
      }
    };
    window.addEventListener(CARD_STATUS_BADGE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(CARD_STATUS_BADGE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  // 挂载后同步浏览器本地持久化的网络模式偏好（游客与离线优先采信本地）
  useEffect(() => {
    try {
      const stored = localStorage.getItem(NETWORK_MODE_STORAGE_KEY);
      if (isNetworkMode(stored)) {
        setCurrentNetworkMode(stored);
      }
    } catch {}
  }, []);

  // 监听 FloatingToolbar / NetworkForm / 跨标签页广播的网络模式变更，即时响应
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<NetworkMode>).detail;
      if (isNetworkMode(mode)) {
        setCurrentNetworkMode(mode);
      }
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === NETWORK_MODE_STORAGE_KEY && isNetworkMode(e.newValue)) {
        setCurrentNetworkMode(e.newValue);
      }
    };
    window.addEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener(NETWORK_MODE_CHANGE_EVENT, handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const { scheduleDelete } = useUndoableDelete();

  const hasCards =
    localCategories.some((c) => c.cards && c.cards.length > 0) ||
    localUnclassified.length > 0;

  // 全部卡片 id（批量删除「全选」用）
  const allCardIds = [
    ...localCategories.flatMap((c) => c.cards ?? []),
    ...localUnclassified,
  ].map((c) => c.id);
  const batch = useBatchDeleteCards(allCardIds);

  // 删除分类（编辑模式）：确认弹窗 + 删除后卡片归到未分类（与设置页共用流程）
  const {
    pendingCategory,
    deleting: deletingCategory,
    description: categoryDeleteDescription,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCategoryDelete({ onSuccess: () => router.refresh() });

  /** 拖入链接 → 打开新建弹框并预填 URL */
  const handleDropUrl = (url: string) => {
    dispatchModal({ type: 'open-drop', url });
    setDropKey((k) => k + 1);
  };
  const { isDragOver } = useExternalDrop({
    onDropUrl: isAuthed ? handleDropUrl : () => {},
  });
  useExternalPaste({ onPasteUrl: isAuthed ? handleDropUrl : () => {} });

  /**
   * 新建卡片入口
   *
   * 设计意图：把入口贴近它要加入的容器（分类末尾的 dashed 占位卡片），
   * 而不是孤立的全局按钮。categoryId 闭包绑定意图：
   *   - 点击某分类末尾的 "+" → 加到该分类
   *   - 点击未分类末尾的 "+" → 加到未分类
   *   - EmptyState 的"创建卡片" → 不预填（默认未分类）
   */
  const handleNewCard = (categoryId: string | null) => {
    dispatchModal({ type: 'open-new', categoryId });
  };

  /** 编辑模式：请求删除分类（弹确认框，卡片将归到未分类） */
  const handleDeleteCategory = (categoryId: string) => {
    const category = localCategories.find((c) => c.id === categoryId);
    if (category) requestDelete(category);
  };

  const handleEditCard = (card: Card) => {
    dispatchModal({ type: 'open-edit', card });
  };

  // 删除走 toast 撤销（规范 §4）：乐观移除 → 5 秒内可撤销 → 超时持久化
  const handleDeleteCard = (card: Card) => {
    const removed = removeCardOptimistic(card.id);
    if (!removed) return;

    scheduleDelete({
      label: card.name,
      onUndo: () => {
        restoreCard(card);
        router.refresh();
      },
      onConfirm: async () => {
        try {
          await cardsApi.delete(card.id);
          router.refresh();
        } catch {
          showToast({ body: '删除失败', type: 'error' });
          restoreCard(card);
        }
      },
    });
  };

  return (
    <DndContext
      // sensors 始终保持稳定引用（避免 dnd-kit useEffect 依赖数组长度变化告警）。
      // 非排序模式下，SortableCardItem 的 useSortable disabled=true 且不绑定
      // listeners，sensors 收到指针事件也不会触发拖拽。
      sensors={sensors}
      collisionDetection={cardCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {hasCards || reorderMode ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(0.5rem, 1.5vh, 1.5rem)',
          }}
        >
          {/* 分类分区纵向铺开，保持所有分区共用同一条左边界（启用拖拽）
           * 编辑模式下标题右侧 hover 显示 新建卡片 / 删除分类 操作。 */}
          {localCategories.map((category) => (
            <CategorySection
              key={category.id}
              title={category.name}
              icon={category.icon}
              color={category.color}
              categoryId={category.id}
              cards={category.cards ?? []}
              statuses={statuses}
              networkMode={currentNetworkMode}
              onCardClick={refreshOne}
              onEditCard={isAuthed ? handleEditCard : undefined}
              onDeleteCard={isAuthed ? handleDeleteCard : undefined}
              onAddCard={
                isAuthed ? () => handleNewCard(category.id) : undefined
              }
              onDeleteCategory={
                isAuthed ? () => handleDeleteCategory(category.id) : undefined
              }
              simple={simpleMode}
              density={density}
              showStatus={showStatusBadge}
              selectionMode={batch.active}
              selectedIds={batch.selectedIds}
              onToggleSelect={batch.toggle}
              sortable={isAuthed}
              reorderMode={isAuthed && reorderMode}
              activeCard={activeCard}
            />
          ))}

          {/* 未分类排在最后 */}
          {(localUnclassified.length > 0 || reorderMode) && (
            <CategorySection
              title={null}
              categoryId={null}
              cards={localUnclassified}
              statuses={statuses}
              networkMode={currentNetworkMode}
              onCardClick={refreshOne}
              onEditCard={isAuthed ? handleEditCard : undefined}
              onDeleteCard={isAuthed ? handleDeleteCard : undefined}
              onAddCard={isAuthed ? () => handleNewCard(null) : undefined}
              simple={simpleMode}
              density={density}
              showStatus={showStatusBadge}
              selectionMode={batch.active}
              selectedIds={batch.selectedIds}
              onToggleSelect={batch.toggle}
              sortable={isAuthed}
              reorderMode={isAuthed && reorderMode}
              activeCard={activeCard}
            />
          )}
        </div>
      ) : (
        <EmptyState
          title="开始搭建你的导航台"
          description="手动添加服务卡片，也可以把浏览器里的链接直接拖进页面"
          icon={<EmptyCardsIllustration />}
          actions={
            isAuthed ? (
              <Button
                label="创建卡片"
                variant="primary"
                icon={<Plus size={ICON_SIZE.md} />}
                onClick={() => handleNewCard(null)}
              />
            ) : undefined
          }
        />
      )}

      <DeleteCategoryDialog
        pending={pendingCategory !== null}
        deleting={deletingCategory}
        description={categoryDeleteDescription}
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />

      <CardEditModal
        key={dropKey}
        isOpen={modalOpen}
        onOpenChange={(open) => {
          if (!open) dispatchModal({ type: 'close' });
        }}
        card={editingCard}
        categories={categories}
        onSaved={() => {
          showToast({
            body: editingCard ? '卡片修改已保存' : '卡片已创建',
            type: 'info',
          });
          router.refresh();
        }}
        initialCategoryId={initialCategoryId}
        initialUrl={initialUrl}
      />

      {/* 拖拽预览：跟随光标移动的卡片镜像 */}
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        }}
      >
        {activeCard ? (
          <div className="pointer-events-none">
            <CardItem
              card={activeCard}
              status={statuses[activeCard.id]}
              href={getCardUrl(activeCard, currentNetworkMode)}
              simple={simpleMode}
              density={density}
              showStatus={showStatusBadge}
            />
          </div>
        ) : null}
      </DragOverlay>

      {/* 批量删除底部操作条 + 确认弹框 */}
      {batch.active && (
        <BatchDeleteBar
          selectedCount={batch.selectedIds.size}
          totalCount={allCardIds.length}
          deleting={batch.deleting}
          onToggleAll={batch.toggleAll}
          onConfirmDelete={batch.confirmDelete}
          onCancel={batch.exit}
        />
      )}

      {/* 拖入链接时的全屏放置提示层 */}
      {isAuthed && isDragOver && (
        <div
          className="fixed inset-0 z-chrome flex items-center justify-center bg-accent/10 backdrop-blur-sm"
          style={{ pointerEvents: 'none' }}
        >
          <div className="rounded-widget border-2 border-dashed border-accent bg-surface/90 px-8 py-6 shadow-float">
            <p className="text-sm font-medium text-accent">松开以添加卡片</p>
          </div>
        </div>
      )}
    </DndContext>
  );
}

/**
 * 空状态插画：三张迷你卡片虚影（状态灯 + 标题占位条），
 * 预告导航台搭好后的形态。纯装饰（aria-hidden），
 * 这里的 div 是插画内容而非布局结构，属「组件优先」约定的合理例外。
 */
function EmptyCardsIllustration() {
  // 状态灯颜色语义：在线 / 警告 / 离线（与 NasStatus 的 dot 颜色一致）
  const dots = [
    'var(--color-success)',
    'var(--color-warning)',
    'var(--color-secondary)',
  ];
  return (
    <div className="flex items-end gap-2" aria-hidden="true">
      {dots.map((color, i) => (
        <div
          key={color}
          className={`flex h-14 w-14 flex-col items-center justify-center gap-2 rounded-widget border border-border bg-surface [box-shadow:var(--shadow-low)] ${i === 1 ? 'empty-float' : 'translate-y-1'}`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="h-1 w-7 rounded-full bg-tertiary/50" />
        </div>
      ))}
    </div>
  );
}
