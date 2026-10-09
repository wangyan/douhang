# 部署文档

本文档面向部署者，覆盖镜像与源码部署、环境变量、数据持久化、启动流程、反向代理、升级、备份与故障排查。使用说明见[使用手册](./MANUAL.md)，系统结构见[架构文档](./ARCHITECTURE.md)。

## 1. 镜像方式部署（推荐）

容器镜像地址由平台环境配置决定（默认自建平台为 `code.bg7pbp.com/wangyan/douhang`；切换 GitHub 时为 `ghcr.io/wangyan/douhang`，建议锁定具体版本号而非 `latest`）。

**前置条件**：已安装 Docker 与 Docker Compose v2，且主机可访问互联网以下载镜像。

```bash
mkdir douhang && cd douhang

# 1. 获取生产编排文件
curl -O https://raw.githubusercontent.com/wangyan/douhang/main/docker-compose.prod.yml

# 2. 生成 .env（仅在文件不存在时创建）：
#    AUTH_SECRET 至少 32 字符；AUTH_PASSWORD 必填且不少于 8 位，
#    禁止空值 / changeme / 请修改默认密码，可用 openssl rand -base64 18 生成随机口令。
#    注意一：密钥与口令须由命令真实生成后写入，带引号 heredoc 中的 $(openssl …) 不会展开
#    注意二：更换密钥会使所有已登录会话失效（浏览器需清除本站 Cookie 后重新登录），
#            因此不要每次启动都重新生成
if [ ! -f .env ]; then
  {
    echo "AUTH_SECRET=$(openssl rand -base64 32)"
    echo "AUTH_USERNAME=admin"
    echo "AUTH_PASSWORD=$(openssl rand -base64 18)"
  } > .env
  echo "已生成随机登录口令，见 .env 中的 AUTH_PASSWORD，请妥善保存"
fi

# 3. 启动
docker compose -f docker-compose.prod.yml up -d
```

- 访问 `http://<主机IP>:3000`，使用 `.env` 中的账号登录。
- **登录后请立即前往「设置 → 通用」修改密码**；修改密码后所有既有会话立即失效，需要重新登录。
- 查看日志：`docker compose -f docker-compose.prod.yml logs -f douhang`；停止：`docker compose -f docker-compose.prod.yml down`。

镜像已内置默认值 `DATABASE_URL=file:./data/sqlite.db`，生产编排挂载 docker.sock，常规场景无需额外配置。

持续运行期间的唯一自动出站请求是版本更新检测（每 24 小时查询一次 Releases）。作为公开项目，默认无需配置令牌即可自动检查更新（若为私有镜像库或受 GitHub API 速率限制，可在 `.env` 中提供 `REPO_TOKEN` 或在「设置 → 通用 → 版本更新」中输入令牌）。纯内网或离线环境可在设置页关闭检测，关闭后不再发起该请求。

## 2. 源码构建部署

适合需要自行构建镜像或进行二次开发的场景。前置条件同上，并需克隆仓库源码。

```bash
git clone https://github.com/wangyan/douhang.git douhang
cd douhang
cp .env.example .env          # 设置 AUTH_SECRET 与不少于 8 位的真实口令 AUTH_PASSWORD
docker compose up -d --build  # 基于仓库根目录 Dockerfile 多阶段构建
```

`docker-compose.yml`（开发/自构建版）会执行 `build: .`。与生产 compose 的差异：开发版带 `group_add` 与显式 `DATABASE_URL`；生产版改用镜像，注入平台与令牌变量（`CODE_HOST` / `REPO_NAME` / `REPO_TOKEN` / `UPDATE_CHECK_TOKEN`），在 `environment` 透传 `DOCKER_GID` / `PUID` / `PGID`，并设置 `container_name: douhang`。

## 3. 常用环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DATABASE_URL` | 否 | `file:./data/sqlite.db` | SQLite 路径（相对于容器内 `/app`）。镜像已内置该默认值，镜像部署无需手动设置；源码部署在 `.env` 中配置 |
| `AUTH_SECRET` | 是 | - | NextAuth JWT 加密密钥，至少 32 字符，可用 `openssl rand -base64 32` 生成；**更换后所有已登录会话失效** |
| `AUTH_USERNAME` | 否 | `admin` | 管理员用户名，仅在数据库为空时由 seed 写入 |
| `AUTH_PASSWORD` | 是 | - | 管理员初始密码，不少于 8 位，禁止空值 / `changeme` / `请修改默认密码`，启动时校验不通过即失败。仅在数据库为空时写入；修改密码在「设置 → 通用」操作 |
| `AUTH_URL` | 否 | - | 反代 / 域名部署的公开地址（如 `https://douhang.example.com`），用于 NextAuth 回调与登出跳转 |
| `DOCKER_HOST` | 否 | unix socket | Docker 监控数据源：`unix:///var/run/docker.sock` 或 `tcp://host:2375` |
| `DOCKER_GID` | 否 | 自动探测 | 宿主机 docker.sock 属组 GID；探测失败时 `0`。部分 Linux 主机或存储系统上常需覆盖，在 `.env` 设置即可生效（见排错） |
| `PUID` | 否 | `1001` | 容器内运行用户 uid，用于对齐宿主机文件属主，在 `.env` 设置即可生效 |
| `PGID` | 否 | `1001` | 容器内运行用户 gid，同上，在 `.env` 设置即可生效 |
| `CODE_HOST` | 否 | `code.bg7pbp.com` | 远端托管平台域名（如 `code.bg7pbp.com` 或 `github.com`） |
| `REPO_NAME` | 否 | `wangyan/douhang` | 远端仓库全名（如 `owner/repo`） |
| `CONTAINER_REGISTRY` | 否 | 同 Host / `ghcr.io` | 容器镜像库域名（若 Host 为 `github.com` 默认 `ghcr.io`，其他默认同 `CODE_HOST`） |
| `REPO_TOKEN` | 否 | - | 仓库访问令牌，用于私有仓库版本检测与发版 |
| `PACKAGE_TOKEN` | 否 | - | 容器镜像库读写令牌，用于发版推送 Docker 镜像 |
| `UPDATE_CHECK_TOKEN` | 否 | - | 版本更新检测专用令牌（可选，未填时自动回落 REPO_TOKEN） |
| `DOCKER_USER` | 否 | `REPO_NAME` 的 owner | 镜像库登录用户名，仅发版推送镜像时使用 |
| `BUILDX_BUILDER` | 否 | buildx 当前构建器 | 发版时指定 `docker buildx` 构建器 |
| `NEXT_PUBLIC_CODE_HOST` | 否 | 同 `CODE_HOST` | 界面链接使用的托管平台域名（仓库主页、使用手册等） |
| `NEXT_PUBLIC_REPO_NAME` | 否 | 同 `REPO_NAME` | 界面链接使用的仓库路径 |

> 数据库为空时，seed 脚本以 `AUTH_USERNAME` / `AUTH_PASSWORD` 初始化账号；`AUTH_PASSWORD` 未设置时生成随机口令并打印一次。账号一经写入即以数据库为准，环境变量不再事后覆盖；修改密码在「设置 → 通用」操作，修改后所有既有会话立即失效，需要重新登录。

## 4. 数据持久化与目录结构

容器通过卷挂载保证数据在升级 / 重建时保留：

| 宿主机路径 | 容器内路径 | 内容 |
|-----------|-----------|------|
| `./data` | `/app/data` | SQLite 数据库 `sqlite.db` 及上传素材目录 `uploads/` |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker socket，Widget 读取容器状态的数据源 |

`.gitignore` 已忽略 `/data` 与 `/src/generated`，切勿提交。

## 5. 容器启动流程与健康检查

`docker-entrypoint.sh` 启动顺序（root → 降权 → 迁移 → 种子 → 启动）：

1. **root 阶段**：按 `PUID`/`PGID`（默认 `1001`）调整容器内 `nextjs`/`nodejs` 用户 uid/gid；自动探测 docker.sock 属组 `SOCK_GID`（可用 `DOCKER_GID` 覆盖），并更正 `./data` 目录属主为目标用户。执行 `setpriv --reuid --regid --groups $SOCK_GID` 降权并重入脚本。
2. **`prisma migrate deploy`**：生产模式部署迁移（仅应用已生成的迁移，不新建）。
3. **`tsx scripts/seed.ts`**：幂等，仅当数据库为空时写入默认账号与种子数据。
4. **`node server.js`**：启动 Next.js standalone server（`output: 'standalone'`，监听 `0.0.0.0:3000`）。

**健康检查**：`/api/health` 为无鉴权探活路由（校验应用可达 + 数据库连通）。Dockerfile 的 `HEALTHCHECK` 参数为 `interval=30s`、`timeout=5s`、`start-period=60s`、`retries=3`，`start-period` 宽限首启迁移 + 种子的耗时。可用 `docker inspect --format '{{.State.Health.Status}}' douhang` 查看状态。

## 6. 反代 / 域名部署

通过 Nginx / Caddy 等暴露到域名时：

- 在 `.env` 设置 `AUTH_URL=https://你的域名`：NextAuth 据此生成正确的回调与登出地址，否则登录后续跳转可能异常。
- 反向代理需透传原始 Host（NextAuth 依赖 `Host` 头），并将 `/api/` 路径完整转发（qBittorrent Widget 走 `/api/widgets/qbittorrent`，代理拦截会导致数据拉取失败）。
- 建议启用 HTTPS；`AUTH_SECRET` 务必使用强随机值。

## 7. 升级

- **镜像部署**：修改 `docker-compose.prod.yml` 中的 tag（或保持 `latest`），执行 `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`。entrypoint 会在启动时自动 `migrate deploy`，数据结构随迁移演进，数据不丢：新增迁移按顺序应用，SQLite 下的删列操作由 Prisma 生成「重建表 + 拷贝数据」方案，已有卡片与分类数据保持不变。
- **源码部署**：`git pull` 后 `docker compose up -d --build`。
- **升级前先在 `.env` 中补上 `AUTH_PASSWORD`**：`docker-compose.prod.yml` 以 `${AUTH_PASSWORD:?…}` 取值，缺失会让 `up -d` 直接中止，entrypoint 也会在启动时校验长度与弱口令。该变量的唯一用途是首次初始化账号，但校验每次都执行；账号已存在时它不会覆盖库中口令，忘记密码请按第 9 节的「忘记密码」处理。
- 升级前建议执行数据备份（见下）。

## 8. 备份与恢复

- **应用内备份（推荐）**：「设置 → 通用 → 备份」一键导出 zip，含全部配置数据（`backup.json`）+ `./data/uploads` 上传文件；导入支持 zip 或裸 JSON，可恢复到任意实例。
- **文件系统级备份**：直接归档宿主机 `./data` 目录即可（数据库 + 上传文件）。恢复时停止容器，覆盖 `./data` 目录后重新启动。
- 建议在修改配置或迁移服务器前导出备份。

## 9. 常见问题排查

- **Docker 监控 Widget 显示无数据或降级**：通常由 docker.sock 权限不足导致。Linux 系统上 socket 常属 `docker` 组，需在 `.env` 设 `DOCKER_GID=<gid>`（取 `stat -c %g /var/run/docker.sock`），设置后 entrypoint 会把运行用户加入该组。若编排文件未在 `environment` 透传该变量，可在 `environment` 补传，或为服务添加 `group_add: ${DOCKER_GID:-0}`（开发编排默认带此配置）；Docker Desktop 一般为 root(0) 组，默认即可。Widget 不可用时仅降级显示，不影响其他功能。
- **数据库写入失败 / 权限拒绝**：宿主机 `./data` 目录若由 Docker 以 root 创建，非 root 运行用户（`PUID`/`PGID`）无法写入。可通过 `PUID`/`PGID` 对齐宿主机实际用户，entrypoint 会自动 `chown` 挂载目录与 `node_modules`。
- **忘记密码**：无命令行重置入口；最快方式是停止容器、删除 `./data/sqlite.db`、重新 `up -d`，seed 会按 `.env` 中的 `AUTH_USERNAME` / `AUTH_PASSWORD` 重建账号（口令未设置时生成随机口令并打印一次）。此操作**将清除全部配置与卡片数据，操作前务必备份**。
- **登录后报 `[auth][error] JWTSessionError … no matching decryption secret`**：会话 Cookie 是用**旧的** `AUTH_SECRET` 加密的，容器换了密钥后无法解密。处理：清除浏览器中本站的 Cookie（或换隐身窗口）后重新登录；并检查 `AUTH_SECRET` 是否在多次部署间保持一致——重新生成密钥必然使已登录会话失效。
- **升级后页面异常**：确认 entrypoint 已执行 `migrate deploy`（`docker compose logs` 看启动日志），必要时手动 `docker compose exec douhang npx prisma migrate deploy`。

## 10. 本地开发环境

```bash
# 环境要求：Node.js 22+（见 .nvmrc）、npm 10+
git clone https://github.com/wangyan/douhang.git douhang
cd douhang
npm ci
cp .env.example .env        # 设置 AUTH_SECRET 与不少于 8 位的真实口令 AUTH_PASSWORD
npm run db:migrate:dev      # 开发迁移
npm run db:seed             # 写入默认账号
npm run dev                 # 启动 dev server（Turbopack）
```

打开 `http://localhost:3000`，用 `.env` 中的账号登录。

生产构建依赖可用 `DATABASE_URL` 并已部署迁移（根布局预渲染需读取用户偏好）。Dockerfile 构建流程为部署迁移后执行生产构建（`prisma migrate deploy` 后接入 `next build`）。

## 11. 版本发布（维护者）

发布流程见[贡献指南](./CONTRIBUTING.md)。

## 12. 代码平台切换（自建平台 ↔ GitHub）

系统所有平台相关的路由与地址均支持由 `.env` 环境变量自适应推导，只需修改 `.env` 即可完成切换：

### 切换至 GitHub（公开仓库：https://github.com/wangyan/douhang.git）
```dotenv
CODE_HOST="github.com"
REPO_NAME="wangyan/douhang"
CONTAINER_REGISTRY="ghcr.io"
# 公开仓库检测更新无需 REPO_TOKEN；若需发版或解除 API 频限可填入 PAT：
# REPO_TOKEN="<具备 repo 权限的 GitHub PAT>"
# PACKAGE_TOKEN="<具备 write:packages 权限的 GitHub PAT>"
```

### 切换至自建平台（默认）
```dotenv
CODE_HOST="code.bg7pbp.com"
REPO_NAME="wangyan/douhang"
CONTAINER_REGISTRY="code.bg7pbp.com"
REPO_TOKEN="<自建平台 Repository Token>"
PACKAGE_TOKEN="<自建平台 Package Token>"
```

- **生产部署生效**：运行 `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`，Compose 将自动解析并拉取目标镜像，应用内更新检测与帮助文档链接即刻跟随生效。
- **发版流水线生效**：运行 `bash scripts/release.sh <type>`，脚本自动识别平台类型，并自动完成登录、多架构构建推送、Git 推送与 Release 创建。
