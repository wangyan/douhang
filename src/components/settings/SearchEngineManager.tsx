'use client';

import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack } from '@astryxdesign/core/HStack';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { VStack } from '@astryxdesign/core/VStack';
import { closestCenter, DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import {
  IconPicker,
  type IconUploadSelection,
} from '@/components/cards/IconPicker';
import { EngineIcon } from '@/components/icons/EngineIcon';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SortableRow } from '@/components/settings/SortableRow';
import { useSortableReorder } from '@/components/settings/use-sortable-reorder';
import { DIALOG_WIDTH, ICON_SIZE } from '@/lib/design-tokens';
import { ApiError } from '@/lib/request/ApiError';
import { iconsApi, preferencesApi } from '@/services';
import { searchEnginesApi } from '@/services/search-engines';
import type { SearchEngineConfig } from '@/types';

interface SearchEngineManagerProps {
  /** SSR 时从服务端取的引擎列表 */
  initialEngines: SearchEngineConfig[];
}

interface EngineFormState {
  name: string;
  urlTemplate: string;
  iconPath: string;
}

const EMPTY_ENGINE_FORM: EngineFormState = {
  name: '',
  urlTemplate: '',
  iconPath: '',
};

/**
 * 搜索引擎管理
 *
 * - 引擎统一管理（内置 6 个已由迁移落库）：拖拽排序、增删改
 * - 服务端保证至少保留一个引擎（最后一行的删除按钮隐藏 + 服务端校验）
 * - 图标复用卡片 IconPicker（图标库 + 上传）
 * - 默认引擎来自独立偏好；删除后服务端回退到剩余列表的首项
 */
export function SearchEngineManager({
  initialEngines,
}: SearchEngineManagerProps) {
  const [engines, setEngines] = useState(initialEngines);
  const [editing, setEditing] = useState<SearchEngineConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIconUpload, setPendingIconUpload] =
    useState<IconUploadSelection | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SearchEngineConfig | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const showToast = useToast();
  const { data: preferences, mutate: refreshPreferences } = useSWR(
    preferencesApi.getKey,
    preferencesApi.get,
  );
  const defaultEngineKey = preferences
    ? (engines.find((engine) => engine.key === preferences.searchEngine)?.key ??
      engines[0]?.key)
    : null;

  const handleNew = () => {
    setEditing(null);
    setError(null);
    setModalOpen(true);
  };

  const handleEdit = (engine: SearchEngineConfig) => {
    setEditing(engine);
    setError(null);
    setModalOpen(true);
  };

  const handleModalOpenChange = (open: boolean) => {
    if (!open) setPendingIconUpload(null);
    setModalOpen(open);
  };

  const { sensors, handleDragEnd } = useSortableReorder<SearchEngineConfig>({
    items: engines,
    getId: (engine) => engine.key,
    setItems: setEngines,
    reorder: (items) => searchEnginesApi.reorderItems(items),
    onError: () => showToast({ body: '排序保存失败', type: 'error' }),
  });

  const handleDelete = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await searchEnginesApi.remove(pendingDelete.key);
      setEngines((prev) => prev.filter((e) => e.key !== pendingDelete.key));
      setPendingDelete(null);
      void refreshPreferences();
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        showToast({ body: '网络错误', type: 'error' });
      } else {
        showToast({ body: '删除失败', type: 'error' });
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (form: EngineFormState) => {
    setError(null);
    setSaving(true);
    try {
      // 上传本地图标文件并保存返回的资源路径
      let iconValue = form.iconPath;
      if (pendingIconUpload && form.iconPath === pendingIconUpload.previewUrl) {
        const uploaded = await iconsApi.upload(
          pendingIconUpload.file,
          'library',
        );
        iconValue = uploaded.path;
      }

      const body = {
        name: form.name,
        urlTemplate: form.urlTemplate,
        iconPath: iconValue || null,
      };
      const saved = editing
        ? await searchEnginesApi.update(editing.key, body)
        : await searchEnginesApi.create(body);

      if (editing) {
        setEngines((prev) =>
          prev.map((e) => (e.key === saved.key ? saved : e)),
        );
      } else {
        setEngines((prev) => [...prev, saved]);
      }
      setPendingIconUpload(null);
      setModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        setError('网络错误');
      } else if (err instanceof ApiError) {
        const data = err.data as { error?: string } | undefined;
        setError(data?.error ?? '保存失败');
      } else {
        setError('保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="搜索引擎"
      description="拖拽调整显示顺序；默认引擎在首页切换，至少保留一个引擎"
      layout="rows"
      actions={
        <Button
          label="添加引擎"
          variant="primary"
          size="sm"
          icon={<Plus size={ICON_SIZE.sm} />}
          onClick={handleNew}
        />
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={engines.map((e) => e.key)}
          strategy={verticalListSortingStrategy}
        >
          <VStack gap={0}>
            {engines.map((engine) => (
              <EngineRow
                key={engine.key}
                engine={engine}
                isDefault={engine.key === defaultEngineKey}
                isLastEngine={engines.length <= 1}
                onEdit={() => handleEdit(engine)}
                onDelete={() => setPendingDelete(engine)}
              />
            ))}
          </VStack>
        </SortableContext>
      </DndContext>

      <EngineEditModal
        key={editing?.key ?? 'new'}
        isOpen={modalOpen}
        onOpenChange={handleModalOpenChange}
        engine={editing}
        error={error}
        saving={saving}
        pendingIconUpload={pendingIconUpload}
        onUploadSelectionChange={setPendingIconUpload}
        onSubmit={(form) => void handleSubmit(form)}
      />

      <AlertDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        title="删除引擎"
        description={`确认删除「${pendingDelete?.name ?? ''}」吗？若它是当前默认引擎，会自动使用剩余列表的第一个引擎。`}
        cancelLabel="取消"
        actionLabel="删除"
        isActionLoading={deleting}
        onAction={() => void handleDelete()}
        width={DIALOG_WIDTH.md}
      />
    </SettingsSection>
  );
}

interface EngineRowProps {
  engine: SearchEngineConfig;
  isDefault: boolean;
  isLastEngine: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/** 单行引擎：拖拽手柄、引擎信息与操作。 */
function EngineRow({
  engine,
  isDefault,
  isLastEngine,
  onEdit,
  onDelete,
}: EngineRowProps) {
  return (
    <SortableRow id={engine.key}>
      <EngineIcon engine={engine} size={ICON_SIZE.lg} />
      <VStack gap={0.5} className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Text size="sm" className="min-w-0 truncate">
            {engine.name}
          </Text>
          {isDefault && <Badge label="默认" variant="neutral" />}
        </div>
        <Text size="sm" color="secondary" className="font-mono truncate">
          {engine.urlTemplate}
        </Text>
      </VStack>

      <HStack gap={0.5} className="shrink-0">
        <IconButton
          label="编辑"
          icon={<Pencil size={ICON_SIZE.sm} />}
          variant="ghost"
          size="sm"
          onClick={onEdit}
        />
        {!isLastEngine && (
          <IconButton
            label="删除"
            icon={<Trash2 size={ICON_SIZE.sm} />}
            variant="ghost"
            size="sm"
            onClick={onDelete}
          />
        )}
      </HStack>
    </SortableRow>
  );
}

interface EngineEditModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  engine: SearchEngineConfig | null;
  error: string | null;
  saving: boolean;
  pendingIconUpload: IconUploadSelection | null;
  onUploadSelectionChange: (selection: IconUploadSelection | null) => void;
  onSubmit: (form: EngineFormState) => void;
}

/** 新建/编辑自定义引擎 Modal */
function EngineEditModal({
  isOpen,
  onOpenChange,
  engine,
  error,
  saving,
  pendingIconUpload,
  onUploadSelectionChange,
  onSubmit,
}: EngineEditModalProps) {
  const [form, setForm] = useState<EngineFormState>(() =>
    engine
      ? {
          name: engine.name,
          urlTemplate: engine.urlTemplate,
          iconPath: engine.logo ?? '',
        }
      : EMPTY_ENGINE_FORM,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width={DIALOG_WIDTH.md}
    >
      <form onSubmit={handleSubmit} className="contents">
        <Layout
          header={
            <DialogHeader
              title={engine ? `编辑引擎：${engine.name}` : '添加引擎'}
              onOpenChange={onOpenChange}
            />
          }
          content={
            <LayoutContent>
              <FormLayout direction="vertical">
                <VStack gap={1.5} width="100%" align="center">
                  <IconPicker
                    value={form.iconPath}
                    cardName={form.name}
                    onChange={(v) => setForm({ ...form, iconPath: v })}
                    uploadSelection={pendingIconUpload}
                    onUploadSelectionChange={onUploadSelectionChange}
                    disabled={saving}
                  />
                  <Text size="sm" color="secondary">
                    从图标库选择或上传，留空显示地球图标
                  </Text>
                </VStack>

                <TextInput
                  label="名称"
                  placeholder="如：DuckDuckGo"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v })}
                  isRequired
                  width="100%"
                />

                <TextInput
                  label="搜索 URL"
                  placeholder="https://duckduckgo.com/?q="
                  value={form.urlTemplate}
                  onChange={(v) => setForm({ ...form, urlTemplate: v })}
                  isRequired
                  width="100%"
                />
                <Text size="sm" color="secondary">
                  搜索词会经 URL 编码后拼接在该地址末尾
                </Text>

                {error && (
                  <Text size="sm" className="text-error">
                    {error}
                  </Text>
                )}
              </FormLayout>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} justify="end">
                <Button
                  label="取消"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                />
                <Button
                  label={engine ? '保存' : '添加'}
                  variant="primary"
                  size="sm"
                  type="submit"
                  isDisabled={saving}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </form>
    </Dialog>
  );
}
