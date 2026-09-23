'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { Check, Plus } from 'lucide-react';
import { ICON_SIZE } from '@/lib/design-tokens';

/** 预设色板：低饱和、适合分类标识 */
const PRESET_COLORS = [
  '#EF4444', // 红
  '#F97316', // 橙
  '#EAB308', // 黄
  '#22C55E', // 绿
  '#06B6D4', // 青
  '#3B82F6', // 蓝
  '#8B5CF6', // 紫
  '#EC4899', // 粉
  '#64748B', // 灰
];

interface CategoryColorPickerProps {
  /** 当前颜色（hex 字符串，空字符串表示未选） */
  value: string;
  onChange: (value: string) => void;
}

/**
 * 分类颜色选择器（扁平色板版）
 *
 * 设计：
 * - 9 个预设色直接展示，无需点击弹窗
 * - 选中态：圆点内嵌白色 ✓
 * - 末尾「+」入口：原生 color input，自定义颜色
 * - 自定义色选中时：[+] 按钮显示当前色 + ✓
 * - 清除逻辑由父组件处理（避免色板宽度跳动）
 */
export function CategoryColorPicker({
  value,
  onChange,
}: CategoryColorPickerProps) {
  const isPreset = PRESET_COLORS.some(
    (c) => c.toLowerCase() === (value || '').toLowerCase(),
  );

  return (
    <HStack
      gap={1.5}
      align="center"
      role="radiogroup"
      aria-label="选择分类颜色"
    >
      {PRESET_COLORS.map((color) => {
        const selected = value.toLowerCase() === color.toLowerCase();
        return (
          // biome-ignore lint/a11y/useSemanticElements: 扁平色块单选按钮
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(color)}
            title={color}
            aria-label={`颜色 ${color}`}
            className="size-6 rounded-full transition-transform hover:scale-110 active:scale-95 flex items-center justify-center shrink-0 focus-ring"
            style={{ backgroundColor: color }}
          >
            {selected && (
              <Check size={ICON_SIZE.xs} color="#FFFFFF" strokeWidth={3} />
            )}
          </button>
        );
      })}

      {/* 自定义颜色入口：label 包裹原生 color input */}
      <label
        className="size-6 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 shrink-0 bg-surface focus-within:outline-2 focus-within:outline-accent focus-within:outline-offset-2"
        title="自定义颜色"
      >
        {!isPreset && value ? (
          <span
            className="size-full rounded-full flex items-center justify-center"
            style={{ backgroundColor: value }}
          >
            <Check size={ICON_SIZE.xs} color="#FFFFFF" strokeWidth={3} />
          </span>
        ) : (
          <Plus size={ICON_SIZE.xs} className="text-secondary" />
        )}
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="sr-only"
          aria-label="自定义颜色"
        />
      </label>
    </HStack>
  );
}
