# 斗法领航（DouHang）

自托管的容器导航起始页，面向 NAS 场景，单用户使用。把 qBittorrent、Jellyfin、Alist 等自托管服务做成卡片，配合容器状态监控、内外网地址自动切换与全局搜索，打开浏览器即可直达。

## 核心功能

- **卡片化服务导航**：按分类组织服务卡片，支持分类与卡片拖拽排序、批量删除、在线状态灯
- **内外网双地址自动切换**：按网络策略（自动探测 / 固定内网 / 固定外网）跳转到可达地址
- **Widget 栏**：NAS 状态、资源水位、qBittorrent、倒数日 / 正数日，同类可重复添加，每个实例独立配置尺寸
- **全局搜索**：`⌘ / Ctrl + K` 唤起，支持子串、全拼与拼音首字母缩写匹配
- **壁纸与图标**：内置壁纸与图标库，支持上传自定义壁纸与图标、favicon 自动抓取
- **备份与恢复**：一键导出配置数据与上传文件，支持导入恢复到任意实例
- **新版本提醒**：检测到新版本时右下角提示，可关闭自动检测或随时手动检查
- **单用户认证**：Credentials + JWT，30 天有效期

## 快速部署

推荐使用镜像方式部署，无需克隆源码。完整部署方式（源码构建、环境变量、反向代理、升级、备份与故障排查）见[部署文档](./docs/DEPLOYMENT.md)。

**前置条件**：已安装 Docker 与 Docker Compose v2，且主机可访问互联网以下载镜像。

```bash
mkdir douhang && cd douhang

# 1. 获取生产编排文件（私有仓库需携带访问令牌；默认自建平台，亦可替换为私有 GitHub 仓库地址）
curl -H "Authorization: token <REPO_TOKEN>" -O https://${CODE_HOST:-code.idiswy.cn}/${REPO_NAME:-zhdmcourt/douhang}/raw/branch/main/docker-compose.prod.yml
# 若为 GitHub 私有仓库，执行：
# curl -H "Authorization: token <REPO_TOKEN>" -O https://raw.githubusercontent.com/<owner>/<repo>/main/docker-compose.prod.yml

# 2. 生成 .env（仅在 .env 不存在时创建）：AUTH_SECRET 至少 32 字符；
#    AUTH_PASSWORD 必填且不少于 8 位，禁止空值 / changeme / 请修改默认密码，
#    可用 openssl rand -base64 18 生成随机口令。重新生成 AUTH_SECRET
#    会使所有已登录会话失效，务必固定保存；私有仓库更新检测填入 REPO_TOKEN
if [ ! -f .env ]; then
  {
    echo "AUTH_SECRET=$(openssl rand -base64 32)"
    echo "AUTH_USERNAME=admin"
    echo "AUTH_PASSWORD=$(openssl rand -base64 18)"
    echo "REPO_TOKEN=your-repo-token"
  } > .env
  echo "已生成随机登录口令，见 .env 中的 AUTH_PASSWORD，请妥善保存"
fi

# 3. 启动
docker compose -f docker-compose.prod.yml up -d
```

打开 `http://<主机IP>:3000`，使用 `.env` 中的账号登录。**登录后请立即前往「设置 → 通用」修改密码**；修改密码后所有既有会话立即失效，需要重新登录。

数据持久化在 `./data` 目录，容器启动时会自动完成数据库迁移与种子写入。

## 文档

| 文档 | 面向 | 内容 |
|---|---|---|
| [使用手册](./docs/MANUAL.md) | 使用者 | 登录与基本操作、主页、卡片与分类、搜索、Widget、外观、设置、备份 |
| [部署文档](./docs/DEPLOYMENT.md) | 部署者 | 镜像与源码部署、环境变量、数据持久化、启动流程、反向代理、升级、备份、故障排查 |
| [架构文档](./docs/ARCHITECTURE.md) | 维护者 | 技术栈、目录结构与分层、核心机制、数据模型、质量工具与权威来源 |
| [贡献指南](./docs/CONTRIBUTING.md) | 贡献者 | 提交信息写法、变更日志规范、发布流程 |

技术栈：Next.js 16（App Router）+ React 19 + Prisma 7 / SQLite + Astryx 组件库 + Tailwind CSS v4。完整选型与版本见架构文档。

## License

[MIT](./LICENSE)
