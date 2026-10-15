import { SearchEngineManager } from '@/components/settings/SearchEngineManager';
import { listSearchEngines } from '@/lib/search-engines';

export const dynamic = 'force-dynamic';

/**
 * 搜索设置页
 *
 * 内置与自定义引擎统一管理：拖拽排序、增删改（至少保留一个引擎）。
 */
export default async function SearchSettingsPage() {
  const engines = await listSearchEngines();

  return (
    <div className="settings-groups">
      <SearchEngineManager initialEngines={engines} />
    </div>
  );
}
