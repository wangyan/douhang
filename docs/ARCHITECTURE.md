# 斗法领航架构文档

本文档描述系统由什么构成、如何运转，面向接手维护者。硬约束内联于对应章节：依赖边界见第 4 节，设计 token 档位与使用规则见 5.4 节，质量命令见第 7 节。部署与运维见[部署文档](./DEPLOYMENT.md)。

## 1. 技术栈

以 `package.json` 为准。

| 层 | 选型 |
|---|---|
| 运行时 | Node.js 22（`.nvmrc`、Dockerfile 使用 `node:22-alpine`） |
| 框架 | Next.js `^16.3.1`（App Router + Turbopack，`output: 'standalone'`） |
| UI | React / react-dom `19.2.4`；TypeScript 5.x |
| 组件库 | Astryx `@astryxdesign/core` 与 `@astryxdesign/theme-neutral` `^0.6.2`（164 组件） |
| 样式 | Tailwind CSS v4（`@tailwindcss/postcss`）与 StyleX（`@stylexjs/stylex` `^0.19.0`，承重） |
| 数据库 | SQLite，Prisma（CLI `^7.9.0`、client `^7.10.0`）配合 `@prisma/adapter-libsql` `^7.10.0` 与 `@libsql/client` `^0.17.4`（driver adapter 模式） |
| 认证 | NextAuth `^5.0.0-beta.32`（Credentials + JWT）与 `bcryptjs` `^3.0.3` |
| 拖拽 | `@dnd-kit/core` `^6.3.1`、`@dnd-kit/sortable` `^10.0.0`、`@dnd-kit/utilities` `^3.2.2`；Widget 栏使用 `react-grid-layout` `^2.2.4` |
| 表单与取数 | `react-hook-form` `^7.83.0`、`zod` `^4.4.3`、`@hookform/resolvers` `^5.5.7`；`swr` `^2.4.2` |
| 容器监控 | 直连 Docker Engine API（`node:http`，无第三方 SDK） |
| 其它 | `pinyin-pro`（搜索）、`parse5`（favicon 抓取时解析 HTML）、`adm-zip`（备份打包）、`date-fns`、`lucide-react`、`tsx`、`dotenv` |
| 代码质量 | Biome `2.5.5`（单引号、行宽 80、缩进 2 空格）与 react-doctor（React 反模式扫描，不装进依赖、按需 `npx` 调取） |

## 2. 代码规模

口径：`src/` 下源码文件（含 CSS），不含生成代码。以下数字随版本演进会变化，用于把握规模量级。

- 合计约 2.4 万行。
- 目录量级：`components` 约 1.3 万行（占比最高）· `lib` 约 4 千行 · `app` 约 4 千行（含 `api/` 下数十个 `route.ts` 与 `globals.css`）· `hooks` 约 1.5 千行 · `services` 与 `types` 合计不足千行；另有 `scripts/` 下数个入口脚本。
- 最大的单文件是 `app/globals.css`，其余大文件集中在 `components`（数百行量级）。

## 3. 目录结构

```
src/app/        页面与接口：page / layout / error / loading / not-found / manifest / providers / globals.css
  api/          35 个 route.ts，覆盖 cards、categories、widgets、icons、wallpapers、search、
                search-engines、backup、account、preferences、version、health、auth
  settings/     5 个子页（general、appearance、search、categories、assets）+ layout + page
  login/        登录页
src/components/ cards、categories、common、icons、layout、search、settings、widgets
src/hooks/      React 自定义 Hook
src/lib/        服务端与工具逻辑（api/、request/、widgets/ 等子目录与各领域模块）
src/services/   客户端接口封装
src/types/      共享类型定义
src/proxy.ts    Next.js 16 的路由中间件入口
prisma.config.ts  Prisma 配置
prisma/         schema.prisma 与迁移（初始基线 0001_init）
public/         图标库、壁纸、字体、品牌资源
scripts/        seed、变更日志生成、构建清理、发布脚本
docs/           使用手册、部署文档、架构文档、贡献指南
```

## 4. 分层与数据流

```
src/app/api/*   route handler：以 src/lib/api/index.ts 的 withAuth / requireAuth / validateBody 完成服务端鉴权与校验
      ↓
src/services/*  客户端接口封装：统一走 src/lib/request/request.ts 的 request() 与 swrFetcher
      ↓
组件            通过 SWR 取数，通过事件模块同步界面状态
```

`src/lib/api/`（服务端鉴权工具）与 `src/lib/request/`（客户端请求与 SWR 错误中间件）名称相近、职责相反，不可混用。项目为单用户场景，通常无需 `session.user.id`，但接口签名保留该参数。

分层同时是一条依赖边界：客户端组件只能依赖叶子模块，服务端依赖（Prisma、libsql）不得进入浏览器包。`src/lib/brand-constants.ts` 与 `src/lib/time.ts` 单独成文件即是为此——一旦并入携带服务端依赖的模块，客户端引用会把 Prisma 与 libsql 拖进浏览器包，构建直接失败。判断两个模块能否合并，看是否被客户端组件引用、以及被引用一侧是否引入服务端依赖，不能只看行数。

## 5. 核心机制

### 5.1 Widget 双层注册表

Widget 的元数据与渲染分发分离，二者共同构成单一事实来源。

| 文件 | 职责 |
|---|---|
| `src/lib/widgets/registry.ts` | 元数据（label、description、hasDateItems），派生 `WidgetKey` 与 `DateItemWidgetKey` 类型及 `DATE_ITEM_WIDGET_KEYS` 常量；被 `types/index.ts`、`api/widgets/library`、`lib/validation.ts`、`layout/WidgetBar`、`widgets/` 下多个组件直接消费 |
| `src/components/widgets/registry.tsx` | `WIDGET_RENDERERS`，负责渲染分发 |

新增一个 Widget 需要改动的位置：① 两张注册表；② Widget 组件本身；③ `components/widgets/AddWidgetDialog.tsx` 中的 `LIBRARY_META` 与 `PREVIEW_META` 两张穷举映射（TypeScript 会要求补全条目）；④ 日期类 Widget 还需同步 `components/layout/WidgetBar.tsx` 的 `countdown` / `countup` 分支、`components/widgets/DateItemForm.tsx` 与 `DateItemConfigPanel.tsx` 中的 `DateWidgetKey` 联合类型、`lib/validation.ts` 的 countup 特例，以及 `api/widgets/instances/[id]/items/` 下两处 countup 守卫。

### 5.2 主题与首屏呈现

根 `<html>` 携带内联 `colorScheme` 与 `backgroundColor`；`app/layout.tsx` 在 `<head>` 中内联 `hooks/useTheme.ts` 导出的 `THEME_SCRIPT_CODE`，在 hydration 之前同步 `data-theme`（按 `localStorage` 与系统偏好解析）。Astryx 的 `<Theme>` 会以 `color-scheme: light dark` 覆盖 html，因此 `globals.css` 使用 `html[data-theme] [data-astryx-theme]` 强制覆盖。主题的权威来源是数据库中的用户偏好，`providers.tsx` 在首次取得数据库值时对账一次，`localStorage` 仅作为 hydration 之前的缓存。

### 5.3 路由中间件

Next.js 16 以 `src/proxy.ts` 取代 `middleware.ts`，它是认证拦截的入口。

### 5.4 设计 token 体系

常量与工具类的唯一来源是 `src/app/globals.css`（CSS 侧）与 `src/lib/design-tokens.ts`（TypeScript 侧）。这套体系将原本散落在各组件中的色值、圆角、层级与阴影收敛为可枚举的档位。档位取值与使用规则是硬约束：

- **危险色**：只用 `--color-error`（`text-error` / `bg-error` / `border-error`）；Astryx 未定义 `--color-danger`。
- **圆角**：只用 `rounded-control`(8px)、`rounded-panel`(12px)、`rounded-widget`(18px)。
- **层级**：只用 `z-raised`(10)、`z-selected`(20)、`z-chrome`(50)。
- **浮层阴影**：提示、通知、横幅、悬浮工具栏统一 `shadow-float`；Widget 家族收敛在 `.widget-surface`。
- **键盘焦点**：自写的可聚焦元素统一追加 `focus-ring`。
- **高亮色**：中性强调使用 `bg-highlight`，不用警告色承担高亮语义。
- **图标尺寸**：`ICON_SIZE` 的 `xs`(12) / `sm`(14) / `md`(16) / `lg`(18)。
- **弹窗宽度**：`DIALOG_WIDTH` 的 `sm`(320) / `md`(440) / `lg`(560)。

少数位置保留了与体系不同的取值（如 logo 预览块的 `rounded-[18px]`、素材页小勾选框的 `rounded-sm`、背景层的 `-z-10`），原因是按档位改写会使这些固定尺寸的元素比例失衡。

### 5.5 容器监控取数

`src/lib/docker.ts` 直接访问 Docker Engine API，只使用四个只读接口：`/_ping`（探活）、`/containers/json`（容器列表）、`/info`（引擎信息）、`/containers/{id}/stats`（单容器资源快照）。连接目标读 `DOCKER_HOST`，支持 `unix:///path/to.sock` 与 `tcp://host:port`（含 https），未设置时使用 `/var/run/docker.sock`；单次请求超时 5 秒。

资源水位的计算基于 Docker 返回的**累计计数**，因此需要跨请求保存上次快照做差值：CPU 用各容器 `cpu_usage.total_usage` 与宿主机 `system_cpu_usage` 的增量之比求和（分母全局共享），磁盘 IO 用累计字节增量除以时间间隔折算速率；内存直接聚合各容器的 `usage / limit`。首次采样没有基线，速率记为 0。

任何一步失败都不会抛给调用方：函数返回降级数据，接口层以 `available: false` 呈现，Widget 只显示降级状态，不影响其它功能。

### 5.6 版本更新检测

`src/lib/version-check.ts` 请求 Releases 的 `latest` 接口取远端最新版本，私有仓库场景下通过环境变量（`REPO_TOKEN` / `UPDATE_CHECK_TOKEN`）或设置项自定义令牌，以 `Authorization: token` 头鉴权；与 `package.json` 的 `version`（导出为 `APP_VERSION`）做语义化版本比较（比较与解析在 `src/lib/version.ts`，检测源常量为 `RELEASES_LATEST_URL`）。结果缓存于 `UserPreference` 的 `versionCheckCache`：距上次成功检查不足 24 小时直接复用缓存，设置页「立即检查」以 `?force=1` 跳过节流；开关 `versionCheckEnabled` 关闭后不发起任何请求。

这是应用持续运行期间唯一的自动出站请求。请求失败不抛错，回落上次缓存并向调用方返回错误文案。

界面侧由工具栏挂载时读取检测结果：有新版本则展示右下角提醒浮层，浮层关闭后（记忆存 localStorage）降级为工具栏常驻入口，点击进入「关于」弹窗的新版区块。「关于」弹窗展示本地 `CHANGELOG.md` 的版本亮点，底部「查看完整更新记录」通往发布页；弹窗与浮层共用 `src/lib/changelog.ts` 的解析链路，且**只渲染版本「亮点」**——`parseChangelog` 把 `### 亮点` 单独解析为 `highlights`（未写时回退 `summary`），其余分类只进 Release 说明与仓库文档。

## 6. 数据模型

SQLite，由 Prisma 7 管理并使用 driver adapter。schema 中的 generator 声明如下：

```prisma
generator client {
  provider = "prisma-client"        // 不是 prisma-client-js
  output   = "../src/generated/prisma"
}
datasource db { provider = "sqlite" }
```

生成的客户端入口为 `src/generated/prisma/client.ts`。数据库共 8 个模型：

| 模型 | 职责 | 关系 |
|---|---|---|
| `User` | 单用户账号，保存 `username` 与 `passwordHash`（bcrypt） | `username` 唯一 |
| `Category` | 分类，单层扁平结构，`order` 支持拖拽排序 | 一对多 `cards`，删除时置空 |
| `Card` | 服务卡片，含内外网地址、图标、描述与 `openInDialog` | 多对一 `category` |
| `WidgetInstance` | Widget 实例，含 `widgetKey`、`order`、`size`（S/M/L）、自由坐标 `x`/`y` | 一对多 `dateItems`，级联删除 |
| `DateItem` | 日期项，倒数日与正数日共用，含 `instanceId`、`date`、`recurUnit` | 多对一 `instance` |
| `UserPreference` | 全局键值配置 | `key` 唯一 |
| `Wallpaper` | 壁纸，区分预设与上传 | `source`、`path`、`thumbnail` |
| `SearchEngine` | 搜索引擎，内置 5 个与自定义项同表管理（`id` 即引擎标识） | 按 `order` 排序 |

内置的 5 个搜索引擎由初始迁移 `0001_init` 写入数据库，与自定义引擎共用同一套增删改排序逻辑，服务端保证至少保留一个。图标库（275 条清单，源 `homarr-labs/dashboard-icons`）是静态资源，不进入数据库。

## 7. 质量工具

- **Biome**：项目唯一的静态检查与格式化工具，负责 lint 与 format 两项，配置集中在 `biome.json`。
- **react-doctor**：扫描 React 反模式，规则开关见 `doctor.config.json`。不装进项目依赖，由 `npm run doctor` 经 `npx` 按需调取。
- **TypeScript**：`tsc --noEmit` 做类型检查，不产出文件。

提交前依次执行 `npm run check` 与 `npm run typecheck`。常用命令（项目根目录执行，需先 `npm ci` 并配置 `.env`）：

| 命令 | 作用 |
|---|---|
| `npm run dev` | 清理构建缓存后启动开发服务器（Turbopack） |
| `npm run build` | 生成变更日志后执行生产构建 |
| `npm run start` | 运行生产构建 |
| `npm run lint` / `lint:fix` | Biome 检查 / 自动修复 |
| `npm run format` / `format:check` | Biome 格式化 / 校验格式 |
| `npm run check` | Biome 完整检查（lint 与 format） |
| `npm run typecheck` | `tsc --noEmit` 类型检查 |
| `npm run doctor` / `doctor:full` | react-doctor 扫描（按需联网调取） |
| `npm run gen:changelog` | 由 `CHANGELOG.md` 生成应用内展示用 JSON |
| `npm run db:generate` / `db:migrate` / `db:migrate:dev` / `db:studio` / `db:seed` | Prisma 生成 / 部署迁移 / 开发迁移 / Studio / 种子 |

## 8. 权威来源

| 信息 | 权威来源 |
|---|---|
| 版本号与发布说明 | `package.json`（版本）与 `CHANGELOG.md`（说明；构建时经 `scripts/generate-changelog.ts` 生成 `src/lib/changelog.generated.json` 供应用内展示） |
| 技术栈 | `package.json`（第 1 节为快照） |
| 设计 token | `globals.css` 与 `src/lib/design-tokens.ts` |
| 数据模型 | `prisma/schema.prisma` |
| 数据库结构 | `prisma/migrations/`（当前仅初始迁移 `0001_init`，历史迁移不可修改） |
| 使用说明 | `README.md` 与 `docs/MANUAL.md` |
| 部署与运维 | `docs/DEPLOYMENT.md` |
| 实现约束与硬规则 | 本文第 4 节（依赖边界）、5.4 节（设计 token 档位）与第 7 节（质量命令） |
