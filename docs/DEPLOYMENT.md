# 斗航部署指南

本文档面向部署运维人员与二次开发者，涵盖容器部署、源码构建、本地开发环境搭建、环境变量配置、容器镜像分发、版本发布与升级、反向代理、数据备份与故障排查。

- **前台使用与访问**：请参阅[用户指南](./USER_GUIDE.md)
- **后台管理与配置**：请参阅[管理指南](./ADMIN_GUIDE.md)
- **系统架构与机制**：请参阅[架构文档](./ARCHITECTURE.md)
- **代码贡献与发版**：请参阅[贡献指南](./CONTRIBUTING.md)

---

## 1. 容器部署（推荐）

官方预构建容器镜像托管于 GitHub Packages：`ghcr.io/wangyan/douhang`，多架构支持 `linux/amd64` 与 `linux/arm64`。

**前置条件**：主机已安装 Docker 与 Docker Compose（v2.0+），且具备访问外网拉取镜像的网络环境。

### 1.1 方式一：Docker Compose 编排（推荐）

通过 Docker Compose 能够统一管理服务端口、数据卷挂载以及环境变量，是最稳健的部署方式。

1. **准备工作目录与编排配置**：
   ```bash
   mkdir douhang && cd douhang
   curl -O https://raw.githubusercontent.com/wangyan/douhang/main/docker-compose.prod.yml
   ```

2. **创建环境配置文件（`.env`）**：
   在工作目录下创建 `.env` 文件。`AUTH_SECRET` 须为强随机字符串（不少于 32 字符），`AUTH_PASSWORD` 为管理员初始口令（必须不少于 8 位）：
   ```bash
   cat <<EOF > .env
   AUTH_SECRET=$(openssl rand -base64 32)
   AUTH_USERNAME=admin
   AUTH_PASSWORD=$(openssl rand -base64 18)
   EOF
   ```
   > **注意**：命令已自动生成高强度初始口令，可执行 `cat .env` 查看并妥善保存。请勿在每次启动时重复生成密钥，否则会导致既有登录会话失效。

3. **启动容器**：
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

4. **管理服务**：
   - 查看运行日志：`docker compose -f docker-compose.prod.yml logs -f douhang`
   - 停止服务：`docker compose -f docker-compose.prod.yml down`
   - 重启服务：`docker compose -f docker-compose.prod.yml restart`

### 1.2 方式二：Docker Run 单命令运行

若无需编写编排文件，亦可直接使用 `docker run` 命令启动：

```bash
mkdir -p data

docker run -d \
  --name douhang \
  -p 3000:3000 \
  -v "$(pwd)/data:/app/data" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e AUTH_USERNAME=admin \
  -e AUTH_PASSWORD="$(openssl rand -base64 18)" \
  --restart unless-stopped \
  ghcr.io/wangyan/douhang:latest
```

### 1.3 首次访问与内网运行说明

- 服务启动后，在浏览器访问 `http://<主机IP>:3000`，使用配置的管理员账号与口令登录。
- **首次登录后，建议前往「设置 → 通用」修改管理员密码**。修改后系统会重置会话，需重新登录。
- **离线与内网环境**：系统自带字体、图标与内置壁纸，默认不依赖任何外部 CDN。系统运行期间唯一的出站网络请求为版本检测（每 24 小时检查一次官方 Release）。纯内网或离线部署时，可在系统「设置 → 通用」中关闭版本更新检测，关闭后系统将不再发起任何外部网络请求。

### 1.4 浏览器要求与离线安装包配置

- **建议内核**：Chromium 123+ · Safari 17.5+ · Firefox 128+。未达到要求的访问会被重定向至 `/outdated.html` 引导页。
- **拉取离线安装包**：在联网环境执行以下脚本，将主流浏览器离线安装包下载至 `public/browsers`：
  ```bash
  bash scripts/download-browsers.sh
  ```
- **离线部署挂载**：安装包合计约 1 GB，既不进代码仓库也不打进镜像（见 `.dockerignore`），**必须将目录挂载进容器**，引导页的下载入口才可用；未挂载时访问 `/browsers/*` 会返回 404。
  - 使用 `docker-compose.yml` 或 `docker-compose.prod.yml` 部署：编排文件中已预置该挂载，只需确认宿主机 `./public/browsers` 内已放置安装包。
  - 使用 `docker run` 部署：在启动命令中追加一行挂载参数：
    ```bash
    -v $(pwd)/public/browsers:/app/public/browsers
    ```
  - 宿主机目录为空时 Docker 仅创建空目录，页面下载入口依旧不可用，请先放好安装包再启动容器。安装包更新后无需重建镜像。

---

## 2. 源码构建与容器化部署

适用于需要根据业务需求二次开发、修改源码或自行构建私有镜像的场景。

1. **克隆代码仓库**：
   ```bash
   git clone https://github.com/wangyan/douhang.git douhang
   cd douhang
   ```

2. **配置运行参数**：
   ```bash
   cp .env.example .env
   ```
   编辑 `.env` 文件，确保填入不少于 32 字符的 `AUTH_SECRET` 以及不少于 8 位的 `AUTH_PASSWORD`。

3. **构建镜像并启动服务**：
   ```bash
   docker compose up -d --build
   ```

> **编排配置差异**：
> - `docker-compose.prod.yml`（生产部署）：直接拉取官方预构建镜像，轻量纯净。
> - `docker-compose.yml`（开发构建）：包含 `build: .` 多阶段构建指令，适用于从源码实时生成容器。

---

## 3. 本地开发环境搭建

针对参与项目功能开发、组件编写或调试的开发者，推荐在宿主机直接搭建开发环境。

### 3.1 环境依赖

- **Node.js**：22+（参考项目根目录 `.nvmrc`）
- **包管理器**：npm 10+
- **构建工具**：支持 Turbopack（内置）

### 3.2 初始化与启动

1. **安装依赖**：
   ```bash
   git clone https://github.com/wangyan/douhang.git douhang
   cd douhang
   npm ci
   ```

2. **配置开发环境变量**：
   ```bash
   cp .env.example .env
   ```
   开发环境下 `DATABASE_URL` 保持默认的 `file:./data/sqlite.db` 即可。

3. **初始化数据库**：
   ```bash
   npm run db:generate      # 生成 Prisma 客户端代码
   npm run db:migrate:dev   # 应用开发数据库迁移
   npm run db:seed          # 写入初始管理员账号与预设搜索引擎
   ```

4. **启动开发服务器**：
   ```bash
   npm run dev              # 启动基于 Turbopack 的热重载开发服务器
   ```
   启动后访问 `http://localhost:3000` 即可开始调试。

### 3.3 代码规范与质量检查

在提交代码前，请执行以下命令校验格式与类型：
```bash
npm run check       # 执行 Biome 代码风格与静态分析检查
npm run typecheck   # 执行 TypeScript 严格类型检查
```

### 3.4 生产构建验证

若需验证生产打包产物：
```bash
npm run build       # 生成 standalone 生产构建产物
npm run start       # 启动生产服务器
```
> **注意**：生产构建阶段需读取用户偏好设置，因此必须先完成数据库迁移后方可执行 `npm run build`。

---

## 4. 环境变量参考

### 4.1 核心运行环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `DATABASE_URL` | 否 | `file:./data/sqlite.db` | SQLite 数据库文件路径。容器内已固定内置，容器部署无需配置；源码部署可自定义 |
| `AUTH_SECRET` | **是** | - | NextAuth 会话加解密密钥，长度须 ≥ 32 字符（可用 `openssl rand -base64 32` 生成）。更换会导致已有会话失效 |
| `AUTH_USERNAME` | 否 | `admin` | 管理员用户名。仅在数据库首次初始化建号时生效 |
| `AUTH_PASSWORD` | **是** | - | 管理员初始口令，长度须 ≥ 8 位，禁止使用出厂弱口令。仅在首次初始化时写入数据库 |
| `AUTH_URL` | 否 | - | 反向代理或域名访问时的完整外部地址（如 `https://douhang.example.com`），用于登录跳转与回调 |
| `DOCKER_HOST` | 否 | `unix:///var/run/docker.sock` | Docker Engine API 监控连接源。支持本地 socket 或远程 TCP 地址（如 `tcp://host:2375`） |
| `DOCKER_GID` | 否 | 自动探测 | 宿主机 `docker.sock` 的所属组 GID。自动探测失败时可显式覆盖（详见故障排查） |
| `PUID` | 否 | `1001` | 容器内进程运行用户的 UID，用于对齐宿主机文件权限 |
| `PGID` | 否 | `1001` | 容器内进程运行用户的 GID，同上 |

> **口令生效说明**：初始账号一经写入数据库，后续验证均以数据库中存储的凭据为准，修改口令请在「设置 → 通用」中操作。环境变量中的 `AUTH_PASSWORD` 仅用于首次初始化与启动时的安全合规校验。

### 4.2 维护者凭据配置（可选）

> [!NOTE]
> **日常使用者部署服务时，无需配置本节任何变量**。系统默认指向官方开源主仓 `github.com/wangyan/douhang`，版本更新检测开箱即用。本节仅供代码维护者执行版本发布（`scripts/release.sh`）或多仓同步时使用。

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `GITHUB_TOKEN` | 否 | - | 官方 GitHub 发版令牌（PAT，需具备 `Contents: Read and write` 权限），供维护者运行发版脚本打 Tag 与创建 Release |
| `MIRROR_REPO_URL` | 否 | - | （可选）私有 Git 仓库完整地址（如 `ssh://git@mirror.example.com/owner/douhang.git`）。脚本自动提取主机名与仓库路径，发版时同步推送 Git 标签与分支 |
| `MIRROR_REPO_TOKEN` | 否 | - | （可选）私有代码平台 API 访问令牌，用于发版与 Release 同步脚本调用 API 同步创建 Release |

```dotenv
# 维护者发版配置示例（.env 片段，按需配置）
GITHUB_TOKEN="github_pat_xxxx"

# 私有镜像仓库同步（按需可选）
# MIRROR_REPO_URL="ssh://git@mirror.example.com/owner/douhang.git"
# MIRROR_REPO_TOKEN="your-mirror-repo-token"
```

---

## 5. 容器镜像渠道与多端分发

### 5.1 官方公开镜像双源

DouHang 官方默认提供两个公开镜像下载渠道，使用者可按需自由选用：

- **主选渠道（文档默认）**：`ghcr.io/wangyan/douhang:latest`（GitHub Packages，多架构由 GitHub Actions 云端自动构建交付）
- **备选渠道（通用/网络友好）**：`wangyan/douhang:latest`（Docker Hub，同为官方公开维护，当拉取 GHCR 受限时可直接替换使用）

### 5.2 维护者镜像多端分发配置

> [!NOTE]
> 如果您直接拉取上述官方镜像部署服务，**无需配置本节变量**。本节参数专供维护者运行 `npm run image:sync` 将官方镜像分发至 Docker Hub 与私有镜像仓库。

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `DOCKERHUB_USERNAME` | 否 | - | 官方 Docker Hub 登录用户名，用于同步流转官方镜像至 `hub.docker.com` |
| `DOCKERHUB_TOKEN` | 否 | - | Docker Hub Personal Access Token（需具备 Read & Write 权限） |
| `MIRROR_REGISTRY_TOKEN` | 否 | - | 私有容器镜像库访问令牌，用于同步镜像至自建私有 Registry（自动复用 `MIRROR_REPO_URL` 域名与仓库路径） |
| `BUILD_IMAGE_LOCAL` | 否 | `0` | 本地镜像构建后备开关：默认 `0` 委托云端构建；设为 `1` 在本地直接交叉编译多架构镜像 |
| `GHCR_TOKEN` | 否 | - | 官方 GHCR 镜像库推送令牌（需具备 `write:packages` 权限，仅当 `BUILD_IMAGE_LOCAL=1` 在本地直推 GHCR 时必填） |

```dotenv
# Docker Hub 官方镜像分发配置（.env 片段）
DOCKERHUB_USERNAME="wangyan"
DOCKERHUB_TOKEN="dckr_pat_xxxx"

# 私有镜像库同步配置（.env 片段，按需配置）
# MIRROR_REGISTRY_TOKEN="your-mirror-registry-token"
```

### 5.3 镜像状态检查与同步命令

项目提供了专用的独立多架构容器镜像同步工具（`scripts/image-sync.sh`）：

```bash
# 1. 检查各镜像平台 Release 镜像包状态（默认查最新 Release，加 full 查所有 Releases）
npm run image:check
npm run image:check full

# 2. 高速清单同步：将官方 GHCR 镜像分发至 Docker Hub 与私有镜像库（默认同步最新 Release）
npm run image:sync

# 3. 全量同步所有已发布的 Releases 镜像包
npm run image:sync full
```

---

## 6. 正式版本发布流程

执行 `bash scripts/release.sh <type>` 发布新版本时，全链路采用「主线标准发版 + 按需多端同步」的协作模型：

### 6.1 主线流程（必经，全自动完成）

1. **代码质检与版本发布（本地秒级完成）**：
   - 本地自动执行代码风格校验（Biome）、TypeScript 类型检查与生产构建产物验证；
   - 自动递增版本号并更新 `CHANGELOG.md`；
   - 自动提交 Git 标签并推送到 GitHub 主仓；
   - 调用 API 在 GitHub 创建带有格式化更新日志的正式 Release。
2. **云端多架构构建（GitHub Actions 全自动）**：
   - GitHub Actions 严格监听已发布的 `v*` 版本标签后，在云端 Runner 自动编译 `linux/amd64` 与 `linux/arm64` 镜像（仅为已发布标签产出 `:vX.Y.Z` 与 `:latest`，不支持分支构建），并交付至 `ghcr.io`（约 5~8 分钟完成）。亦支持在 Actions 页面通过 `Run workflow` 手动选择已发布标签按需重新构建。至此，官方正式版本发布全部完成！

### 6.2 扩展流程（可选，面向私有备份）

3. **多端镜像流转分发（本地/运维机按需触发）**：
   - 若配置了 `MIRROR_*` 参数，发版脚本在第一阶段已自动将 Git 标签与 Release 同步推送至私有平台；
   - 待官方 GHCR 镜像构建就绪后，在本地或运维节点运行 `npm run image:sync`，秒级将镜像高速同步至 Docker Hub 与私有镜像库；
   - 随时通过 `npm run image:check` 查看全网镜像就绪状态。

---

## 7. 数据持久化与存储结构

### 7.1 目录映射关系

容器采用卷挂载保证数据在升级或重建过程中持久保留：

| 宿主机路径 | 容器内路径 | 用途说明 |
|---|---|---|
| `./data` | `/app/data` | 数据持久化根目录：包含 SQLite 数据库文件（`sqlite.db`）及上传素材（`uploads/`） |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker Engine API 套接字，用于卡片与 Widget 读取容器监控指标 |

### 7.2 权限控制机制

为防止非 root 用户写入宿主机挂载目录失败，容器启动脚本会在初始化阶段执行权限对齐：
1. 以 root 权限读取传入的 `PUID` / `PGID`，将容器内 `nextjs` 用户的 UID/GID 修正为目标数值；
2. 自动修正 `./data` 挂载目录的所有权为目标用户；
3. 执行安全降权后以普通用户身份启动 Node.js 进程。

### 7.3 数据物理冷备份

在版本升级或系统维护前，建议对宿主机的数据挂载目录执行物理冷备份：
```bash
# 备份数据目录
tar -czvf douhang-data-backup-$(date +%F).tar.gz ./data
```
恢复时只需停止容器，解压覆盖 `./data` 目录后重新启动容器即可。若需在应用界面内导出或导入结构化数据包，请参阅[管理指南](./ADMIN_GUIDE.md#6-数据安全与备份迁移)。

---

## 8. 容器启动机制与健康检查

### 8.1 启动流程

容器启动入口由 `docker-entrypoint.sh` 统一调度，执行顺序如下：
1. **环境与权限校验**：校验 `AUTH_PASSWORD` 强度与合规性；探测 `docker.sock` 权限组并调整用户组归属；
2. **安全降权**：将运行上下文从 root 降权至非特权账号；
3. **数据库结构迁移（`prisma migrate deploy`）**：自动应用已发布的数据库迁移，保证表结构更新；
4. **数据初始化（`scripts/seed.ts`）**：若数据库为空，写入默认管理员凭据与预设搜索引擎；已有数据时自动跳过；
5. **启动应用服务（`node server.js`）**：拉起 Next.js 生产独立服务（监听 `0.0.0.0:3000`）。

### 8.2 容器健康检查

应用内置 `/api/health` 探活路由（无需认证，用于探测 HTTP 可达性与数据库连通性）。

Dockerfile 已配置健康检查探针：
- **检查周期（interval）**：`30s`
- **超时时间（timeout）**：`5s`
- **启动宽限期（start-period）**：`60s`（宽限首次启动时数据库迁移与初始化的耗时）
- **重试次数（retries）**：`3`

可通过以下命令查看容器健康状态：
```bash
docker inspect --format '{{.State.Health.Status}}' douhang
```

---

## 9. 反向代理与 HTTPS 配置

在生产环境中，建议通过 Nginx、Caddy 或 Traefik 等反向代理暴露服务并配置 SSL 证书。

### 9.1 配置要点

1. **域名与回调地址**：
   在 `.env` 中设置 `AUTH_URL=https://douhang.example.com`，NextAuth 会据此生成正确的重定向与登录回调地址。
2. **请求头透传**：
   反向代理必须透传真实的 `Host`、`X-Real-IP`、`X-Forwarded-For` 与 `X-Forwarded-Proto` 头。
3. **API 路由放行**：
   不得拦截或缓存 `/api/` 路由（例如 qBittorrent 与 Docker 监控等 Widget 依赖实时 API）。

### 9.2 Nginx 示例配置

```nginx
server {
    listen 80;
    server_name douhang.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name douhang.example.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 50M; # 支持素材上传

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 10. 版本升级

### 10.1 镜像部署升级

1. 修改 `docker-compose.prod.yml` 中的镜像标签（若使用 `latest` 则保持不变）；
2. 拉取最新镜像并重启容器：
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```
3. 容器启动时会自动执行 `prisma migrate deploy` 应用结构迁移，无需手动干预。

### 10.2 源码部署升级

1. 拉取最新代码：
   ```bash
   git pull origin main
   ```
2. 重新构建镜像并重启服务：
   ```bash
   docker compose up -d --build
   ```

### 10.3 升级注意事项

- **密码校验防护**：确保 `.env` 中的 `AUTH_PASSWORD` 处于已配置状态。升级重启时容器依然会执行格式校验。
- **数据兼容保障**：系统采用增量数据库迁移，升级不会覆盖或清除卡片、分类及个性化配置数据。为防极端意外，升级前仍建议执行数据备份。

---

## 11. 常见问题排查（FAQ）

### 11.1 Docker 监控组件显示无数据或状态降级

- **排查原因**：宿主机 `docker.sock` 套接字未授予容器内运行用户读取权限。
- **解决方案**：
  在宿主机运行 `stat -c %g /var/run/docker.sock` 获取 GID（如 `998`），在 `.env` 中设置 `DOCKER_GID=998` 并重启容器。容器启动脚本会自动将运行用户加入该权限组。

### 11.2 数据目录权限拒绝（EACCES: permission denied）

- **排查原因**：宿主机 `./data` 目录由 root 账号自动创建，容器内普通用户无权写入。
- **解决方案**：
  在 `.env` 中指定宿主机当前用户的 UID 与 GID：`PUID=$(id -u) PGID=$(id -g)`，重启容器即可自动完成权限对齐。亦可在宿主机手动授权：`chown -R 1001:1001 ./data`。

### 11.3 忘记管理员登录口令

- **解决方案**：
  由于口令经过哈希加密存储，目前无直接命令行重置指令。
  最彻底的重置方式是停止容器，移除 `./data/sqlite.db` 数据库文件后重新启动，系统会读取 `.env` 中的 `AUTH_PASSWORD` 重新建立管理员账号。
  > **警告**：该操作会清空数据库内配置与卡片信息，操作前请务必先对 `./data` 目录进行物理备份。

### 11.4 登录后提示 `JWTSessionError: no matching decryption secret`

- **排查原因**：更换过 `.env` 中的 `AUTH_SECRET`，导致浏览器 Cookie 中遗留的旧 Token 无法被新密钥解密。
- **解决方案**：
  清除浏览器对应域名的 Cookie，或使用浏览器隐私/无痕模式重新登录。生产环境部署后请固定 `AUTH_SECRET`，避免随意变更。

### 11.5 升级后页面报错或迁移异常

- **排查原因**：容器未成功完成数据库迁移。
- **解决方案**：
  查看启动日志确认状态：`docker compose logs douhang`。若需手动触发迁移，可执行：
  ```bash
  docker compose exec douhang npx prisma migrate deploy
  ```

### 11.6 访问提示「浏览器内核版本较低」

- **原因**：客户端浏览器版本低于建议标准（Chromium 123+ · Safari 17.5+ · Firefox 128+）。
- **处理方式**：
  1. 升级浏览器，或在引导页下载对应的离线安装包；
  2. 内网环境可运行 `bash scripts/download-browsers.sh` 并挂载离线包目录；
  3. 点击引导页底部的「暂不升级，继续访问」临时进入系统。
