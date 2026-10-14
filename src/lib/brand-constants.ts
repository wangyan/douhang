import type { BrandConfig } from '@/types';

/**
 * 默认品牌配置（未自定义时使用内置标识）
 *
 * 单独成文件是刻意的边界：客户端组件（BrandForm、FloatingLogo）只需要这个常量，
 * 若从 `@/lib/brand` 取值会顺着 brand → preferences → db 把服务端的
 * Prisma / libsql 依赖拖进浏览器包。
 */
export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  title: 'DouHang',
  logo: '',
  showLogo: true,
  showTitle: true,
};
