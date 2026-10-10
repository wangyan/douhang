# 斗法领航架构文档

本文档详细描述斗法领航（DouHang）的系统构成、分层设计、核心运行机制与数据模型，面向系统维护者与二次开发者。

- **前台使用与访问**：请参阅[用户指南](./USER_GUIDE.md)
- **后台管理与配置**：请参阅[管理指南](./ADMIN_GUIDE.md)
- **安装部署与运维**：请参阅[部署指南](./DEPLOYMENT.md)
- **代码贡献与发版**：请参阅[贡献指南](./CONTRIBUTING.md)

---

## 1. 技术栈

本项目依赖以 `package.json` 为单一事实源，核心技术选型如下：

| 分层 | 技术选型 | 说明 |
|---|---|---|
| **运行环境** | Node.js 22 | 容器基础镜像基于 `node:22-alpine`，支持 `.nvmrc` 对齐 |
| **应用框架** | Next.js 16 (App Router) | 开启 Turbopack 与 `output: 'standalone'` 独立生产打包 |
| **视图层** | React 19 / TypeScript 5.x | 基于 React Server Components (RSC) 与客户端组件分层协同 |
| **组件库** | Astryx Design System | `@astryxdesign/core` 与主题包，提供无缝设计质感 |
| **样式体系** | Tailwind CSS v4 + StyleX | 基础实用类结合 StyleX 承重样式隔离 |
| **数据库** | SQLite + Prisma 7 | 采用 `@prisma/adapter-libsql` Driver Adapter 模式 |
| **会话认证** | NextAuth v5 + bcryptjs | Credentials 凭据校验与无状态 JWT 加密会话 |
| **拖拽交互** | `@dnd-kit` + `react-grid-layout` | 卡片排序与 Widget 画布响应式网格布局 |
| **数据流与表单** | SWR + React Hook Form + Zod | 声明式数据缓存、Schema 模式校验与响应式表单 |
| **容器监控** | Docker Engine API 直连 | 基于 Node.js 原生 `node:http` 通过 UNIX 套接字直接采集指标，无第三方 SDK 运行时负担 |
| **质量工具** | Biome + react-doctor | Biome 统一格式化与静态检查；react-doctor 扫描 React 反模式 |

---

## 2. 代码组织与规模

源码集中于 `src/` 目录，整体代码量约为 2.4 万行，各模块规模分布如下：

| 模块目录 | 预估规模 | 核心职责 |
|---|---|---|
| `src/components/` | 约 1.3 万行 | UI 视图组件：卡片、分类、小组件、布局结构、搜索与设置面板 |
| `src/lib/` | 约 4,000 行 | 服务端领域逻辑、工具函数、Docker 交互、认证守卫与设计 Token |
| `src/app/` | 约 4,000 行 | 路由页面、API Route Handlers、全局样式与应用元数据 |
| `src/hooks/` | 约 1,500 行 | 自定义 React Hooks：主题侦测、快捷键监听、网络状态感知等 |
| `src/services/` | < 1,000 行 | 客户端面向后端的 HTTP 接口统一封装 |
| `src/types/` | < 1,000 行 | 全局共享 TypeScript 类型定义与数据契约 |

---

## 3. 目录结构

```
src/app/          页面与接口：page / layout / error / loading / manifest / providers / globals.css
  api/            REST 接口层，覆盖 cards、categories、widgets、icons、wallpapers、backup 等
  settings/       后台管理设置页（通用、外观、搜索、分类、素材）
  login/          管理员登录页
src/components/   前端组件族：cards、categories、common、icons、layout、search、widgets
src/hooks/        React 状态与交互 Hooks
src/lib/          领域逻辑与服务端工具：api/、request/、widgets/、docker.ts、db.ts 等
src/services/     客户端 API 请求封装与 SWR Fetcher
src/types/        数据实体与前后端通信类型定义
src/proxy.ts      Next.js 16 认证拦截代理中间件（框架规范入口）
prisma/           schema.prisma 与数据库迁移基线
public/           静态资源：内置图标库、预设壁纸、字体与品牌 Mark
scripts/          辅助脚本：种子写入、更新日志生成、发版流水线
docs/             技术与使用文档集合
```

---

## 4. 分层架构与依赖边界

系统的典型数据流动链路如下：

```
客户端组件 / SWR 数据请求
      ↓
src/services/*      客户端请求封装：基于 request.ts 与错误处理中间件
      ↓
src/app/api/*       Route Handler：通过 withAuth / requireAuth / validateBody 鉴权校验
      ↓
src/lib/db.ts       数据库操作：Prisma Client + LibSQL Adapter 读写 SQLite
```

### 依赖隔离边界（核心规范）

在 Next.js 全栈项目中，**服务端依赖绝不能被客户端代码间接引用**：
- `src/lib/brand-constants.ts` 与 `src/lib/time.ts` 必须独立建文件，不可合并进服务端模块；
- 若将常量并入包含 `db.ts` 或 Prisma 调用的模块，会导致客户端组件顺着引用链将底层原生二进制包引入浏览器构建包，从而引发构建崩溃；
- 评判模块是否可以合并的标准在于**是否横跨客户端与服务端引用边界**，而非仅仅考量代码行数。

---

## 5. 核心运行机制

### 5.1 Widget 小组件双层注册表

小组件的元数据定义与视图渲染分发严格解耦，共同形成唯一事实源：

1. **元数据注册表**（[`src/lib/widgets/registry.ts`](file:///Users/wangyan/projects.localized/douhang/src/lib/widgets/registry.ts)）：
   负责组件键名、名称描述、是否具备日期实体属性等元数据，派生 TypeScript 强类型约束；
2. **渲染分发注册表**（[`src/components/widgets/registry.tsx`](file:///Users/wangyan/projects.localized/douhang/src/components/widgets/registry.tsx)）：
   负责根据实例类型动态分发具体的 React 渲染组件。

### 5.2 主题初始化与首屏防闪跳机制

为避免页面在首屏呈现时因深浅主题异步读取而产生瞬态视觉闪跳（FOUC，无样式内容闪烁），系统在 HTML `<head>` 中内联了同步阻塞执行的轻量预加载脚本 `THEME_SCRIPT_CODE`：

1. **DOM 解析期提取**：在浏览器解析 HTML 结构阶段，脚本同步读取 `localStorage` 本地偏好或系统媒体查询（`prefers-color-scheme`）；
2. **根节点同步注入**：在前端框架运行时加载与执行之前，立即将目标模式写入根节点 `<html>` 的 `data-theme` 属性与 `color-scheme` 样式，确保首帧绘制即呈现正确主题；
3. **端云偏好对齐**：以数据库持久化的用户配置为单一事实源，在前端应用初始化挂载后与本地缓存状态比对并自动同步。

### 5.3 路由安全拦截代理

Next.js 16 采用根目录下的 [`src/proxy.ts`](file:///Users/wangyan/projects.localized/douhang/src/proxy.ts) 作为请求代理与鉴权拦截器。对管理后台路由（`/settings/*`）与敏感写操作接口进行会话有效性拦截，未授权请求将被重定向至登录页。

### 5.4 设计 Token 约束体系

设计规范的唯一事实源为 [`src/app/globals.css`](file:///Users/wangyan/projects.localized/douhang/src/app/globals.css) 与 [`src/lib/design-tokens.ts`](file:///Users/wangyan/projects.localized/douhang/src/lib/design-tokens.ts)：

- **语义色彩**：危险操作统一使用 `--color-error`（`text-error` / `bg-error`）；
- **统一圆角**：控件统一 `rounded-control`(8px)，面板统一 `rounded-panel`(12px)，小组件统一 `rounded-widget`(18px)；
- **层级规范**：严格限定为 `z-raised`(10)、`z-selected`(20)、`z-chrome`(50)；
- **阴影与边框**：悬浮工具栏与弹层统一采用 `shadow-float`，Widget 统一收敛于 `.widget-surface`；
- **标准尺寸档位**：图标尺寸收敛于 `ICON_SIZE`（`xs`:12 / `sm`:14 / `md`:16 / `lg`:18），弹窗宽度收敛于 `DIALOG_WIDTH`（`sm`:320 / `md`:440 / `lg`:560）。

### 5.5 Docker Engine API 直连监控

为避免引入臃肿庞大的第三方 Docker SDK 导致依赖膨胀，[`src/lib/docker.ts`](file:///Users/wangyan/projects.localized/douhang/src/lib/docker.ts) 直接通过 Node 原生 `node:http` 与宿主机 Docker 套接字通信：
- 仅使用四个精简只读接口：`/_ping`、`/containers/json`、`/info` 以及 `/containers/{id}/stats`；
- 资源占用率采用增量算法：结合容器 CPU 增量与系统总 CPU 增量计算真实利用率；
- 全流程具备降级容错机制：连接超时或权限缺失时自动返回降级占位数据，不阻塞其他业务。

### 5.6 版本检测与更新日志解析

[`src/lib/version-check.ts`](file:///Users/wangyan/projects.localized/douhang/src/lib/version-check.ts) 负责向远端 Releases 接口查询最新发布版本，并与本地 `package.json` 中的 `APP_VERSION` 做语义化对比：
- 查询结果本地缓存 24 小时，避免频繁请求远端 API；离线环境下可完全关闭检测；
- 前端更新弹窗与提醒浮层共享 [`src/lib/changelog.ts`](file:///Users/wangyan/projects.localized/douhang/src/lib/changelog.ts) 解析引擎，且**仅提取面向使用者的「亮点」段落**展示，技术细节仅留存文档。

---

## 6. 数据模型设计

采用 SQLite 数据库，由 Prisma 7 结合 LibSQL Driver Adapter 驱动管理：

| 数据模型 | 核心功能与字段 | 关联关系 |
|---|---|---|
| `User` | 管理员账号实体，保存密码哈希与认证盐值 | 唯一单用户模型 |
| `Category` | 导航分类，包含展示名称、排序权重与图标标识 | 一对多关联 `Card` |
| `Card` | 核心服务卡片，包含内/外网地址、图标、描述与嵌入配置 | 多对一关联 `Category` |
| `WidgetInstance` | 小组件实例，包含类型键名、尺寸档位（S/M/L）与布局坐标 | 一对多关联 `DateItem` |
| `DateItem` | 日期条目，倒数日与正数日实体，记录基准时间与周期规则 | 多对一关联 `WidgetInstance` |
| `UserPreference` | 全局持久化键值配置（主题、网络策略、壁纸偏好、更新缓存） | 键名主键唯一 |
| `Wallpaper` | 壁纸资产，记录内置预设与用户本地上传的高清图 | 记录存储路径与缩略图 |
| `SearchEngine` | 搜索引擎实体，内置预设引擎与自定义引擎同表统一管理 | 按展示权重排序 |

---

## 7. 代码质量与工程规范

### 7.1 工具链
- **Biome**：全站唯一的静态分析与代码格式化工具，规则集中于 `biome.json`；
- **TypeScript**：执行严格的无编译产物类型检查（`tsc --noEmit`）；
- **react-doctor**：通过按需 `npx` 调取，专项扫描 React 19 渲染反模式。

### 7.2 核心开发命令

| 命令 | 用途说明 |
|---|---|
| `npm run dev` | 清理本地构建缓存后启动 Turbopack 开发服务器 |
| `npm run build` | 预先生成变更日志 JSON 并执行 standalone 生产打包 |
| `npm run start` | 启动本地生产构建服务器 |
| `npm run check` | 执行 Biome 完整质量检查（包含 Lint 与 Format 校验） |
| `npm run typecheck` | 执行 TypeScript 全局强类型检查 |
| `npm run doctor` | 调用 react-doctor 扫描最近变更的 React 代码反模式 |
| `npm run release:sync` | 检查并全量同步主仓与镜像仓库 Release 记录（自动补齐缺失并对齐更新差异） |
| `npm run release:check` | 检查主仓与镜像仓库 Release 一致性并预览差异（只读模式） |
| `npm run db:migrate:dev` | 开发环境下执行并应用数据库迁移 |
| `npm run db:seed` | 写入初始管理员账号与预设搜索引擎 |

---

## 8. 系统权威来源对照表

| 领域信息 | 单一事实权威来源 (Source of Truth) |
|---|---|
| **版本号与发布说明** | `package.json`（版本号）与 `CHANGELOG.md`（版本说明） |
| **技术栈清单** | 根目录 `package.json` |
| **设计 Token 体系** | `src/app/globals.css` 与 `src/lib/design-tokens.ts` |
| **数据库模型定义** | `prisma/schema.prisma` |
| **数据库历史演进** | `prisma/migrations/`（已发布迁移严禁修改，结构变更必须追加新迁移） |
| **功能使用说明** | [用户指南](./USER_GUIDE.md) 与 [管理指南](./ADMIN_GUIDE.md) |
| **安装部署指南** | [部署指南](./DEPLOYMENT.md) |
| **架构与约束规则** | 本架构文档与项目基线规范 |
