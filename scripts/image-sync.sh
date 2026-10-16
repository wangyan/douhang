#!/usr/bin/env bash
# ==============================================================================
# DouHang 多架构容器镜像同步与检查工具
#
# 以官方 GHCR (ghcr.io/wangyan/douhang) 产物为权威源，直接通过 buildx imagetools
# 快速流转分发至官方 Docker Hub 与国内 HamGit 镜像平台，无需本地重新编译。
# ==============================================================================

set -euo pipefail

# 终端颜色自适应
if [[ -t 1 ]]; then
  C_BLUE='\033[1;34m'
  C_GREEN='\033[1;32m'
  C_YELLOW='\033[1;33m'
  C_CYAN='\033[1;36m'
  C_RED='\033[1;31m'
  C_RESET='\033[0m'
else
  C_BLUE=''
  C_GREEN=''
  C_YELLOW=''
  C_CYAN=''
  C_RED=''
  C_RESET=''
fi

log_info() { printf "${C_BLUE}==>${C_RESET} %s\n" "$*"; }
log_ok()   { printf "${C_GREEN}==> [成功]${C_RESET} %s\n" "$*"; }
log_warn() { printf "${C_YELLOW}==> [注意]${C_RESET} %s\n" "$*"; }
log_skip() { printf "${C_CYAN}==> [跳过]${C_RESET} %s\n" "$*"; }
log_err()  { printf "${C_RED}==> [错误]${C_RESET} %s\n" "$*" >&2; }
fail()     { log_err "$*"; exit 1; }

show_help() {
  cat <<'EOF'
用法:
  scripts/image-sync.sh [版本标签|full] [选项]

参数:
  [版本标签]      可选。指定待检查或同步的版本标签（如 v1.0.0）；默认针对远程主仓库最新 Release
  full            全量模式：检查或同步远程主仓库所有已发布的 Releases 镜像包

选项:
  --check         只读检查各镜像平台的发布与同步状态（不进行任何网络推送）
  -f, --force     强制同步：目标仓库若已存在同名镜像依然同步覆盖
  -h, --help      显示本帮助信息

常用命令:
  npm run image:check         # 检查最新版本镜像在各平台的发布状态
  npm run image:check full    # 检查所有版本镜像在各平台的发布状态
  npm run image:sync          # 同步最新版本镜像至 Docker Hub 与 HamGit 镜像库
  npm run image:sync full     # 全量同步所有版本镜像至 Docker Hub 与 HamGit 镜像库
EOF
}

# 1. 参数解析
target_tag=""
readonly_check=0
force_push=0
check_full=0

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      show_help
      exit 0
      ;;
    full|--full)
      check_full=1
      ;;
    --check)
      readonly_check=1
      ;;
    -f|--force)
      force_push=1
      ;;
    *)
      if [[ -z "$target_tag" ]]; then
        if [[ ! "$arg" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
          fail "版本标签格式错误：$arg（版本标签必须形如 v1.0.0）"
        fi
        target_tag="$arg"
      else
        fail "无法识别的多余参数：$arg（请运行 $0 --help 查看用法）"
      fi
      ;;
  esac
done

# 2. 读取本地 .env 配置
if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      if [[ -z "${!key:-}" ]]; then
        export "$key=$val"
      fi
    fi
  done < .env
fi

# 3. 运行环境依赖检测
command -v docker >/dev/null 2>&1 || fail "未找到 docker 命令，请先安装 Docker。"
docker info >/dev/null 2>&1 || fail "Docker 守护进程未运行，请先启动 Docker 服务。"
docker buildx version >/dev/null 2>&1 || fail "未检测到 Docker Buildx，请升级 Docker 至支持 buildx 的版本。"

# 解析 Git URL
parse_git_url() {
  local url="$1"
  local host=""
  local repo=""
  if [[ "$url" =~ ^[a-zA-Z0-9_-]+:// ]]; then
    local no_proto="${url#*://}"
    local no_user="${no_proto#*@}"
    host="${no_user%%[:/]*}"
    local path="${no_user#*/}"
    repo="${path%.git}"
  elif [[ "$url" =~ ^([a-zA-Z0-9_-]+@)?([^:]+):(.+)$ ]]; then
    host="${BASH_REMATCH[2]}"
    local path="${BASH_REMATCH[3]}"
    repo="${path%.git}"
  fi
  echo "$host $repo"
}

# 4. 官方权威源常量与凭据
REPO_NAME="wangyan/douhang"
REPO_HOST="github.com"
repo_url="https://${REPO_HOST}/${REPO_NAME}"
source_host="ghcr.io"
source_repo="ghcr.io/${REPO_NAME}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"

# 获取远程 GitHub 主仓库已发布的 Releases 列表
get_remote_releases() {
  GITHUB_TOKEN="$GITHUB_TOKEN" \
  node -e '
const repo = "wangyan/douhang";
const token = process.env.GITHUB_TOKEN?.trim();
const apiUrl = `https://api.github.com/repos/${repo}/releases`;

const headers = {
  "Accept": "application/vnd.github.v3+json",
  "User-Agent": "DouHang-Image-Sync",
};
if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}

async function fetchReleases() {
  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  const tags = data
    .filter(r => !r.draft && !r.prerelease && r.tag_name)
    .map(r => r.tag_name);
  
  tags.sort((a, b) => {
    const pa = a.replace(/^v/, "").split(".").map(Number);
    const pb = b.replace(/^v/, "").split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
    }
    return 0;
  });
  return tags;
}

fetchReleases()
  .then(tags => console.log(tags.join("\n")))
  .catch(err => {
    console.error(`无法获取远程主仓库 Release 发行版列表 (${err.message})`);
    process.exit(1);
  });
'
}

declare -a remote_releases=()
while IFS= read -r tag || [[ -n "$tag" ]]; do
  [[ -n "$tag" ]] && remote_releases+=("$tag")
done < <(get_remote_releases)

if [[ ${#remote_releases[@]} -eq 0 ]]; then
  fail "远程主仓库（${repo_url}）未检测到任何已发布的 Release 记录。"
fi

latest_release="${remote_releases[0]}"

# 确定本次操作的目标版本标签列表
declare -a target_tags=()
if [[ $check_full -eq 1 ]]; then
  target_tags=("${remote_releases[@]}")
elif [[ -n "$target_tag" ]]; then
  target_tags=("$target_tag")
else
  target_tags=("$latest_release")
fi

# 5. 收集待同步的目标平台
declare -a target_platform_names=()
declare -a target_hosts=()
declare -a target_users=()
declare -a target_passes=()
declare -a target_repos=()

# 目标 1: 官方 Docker Hub (hub.docker.com)
dockerhub_user="${DOCKERHUB_USERNAME:-}"
dockerhub_token="${DOCKERHUB_TOKEN:-}"
if [[ -n "$dockerhub_user" && -n "$dockerhub_token" ]]; then
  dockerhub_target=$(echo "docker.io/${dockerhub_user}/douhang" | tr '[:upper:]' '[:lower:]')
  target_platform_names+=("Docker Hub")
  target_hosts+=("docker.io")
  target_users+=("$dockerhub_user")
  target_passes+=("$dockerhub_token")
  target_repos+=("$dockerhub_target")
fi

# 目标 2: 国内 HamGit 镜像库 (HAMGIT)
HAMGIT_REPO_URL="${HAMGIT_REPO_URL:-}"
if [[ -n "$HAMGIT_REPO_URL" && -n "${HAMGIT_REGISTRY_TOKEN:-}" ]]; then
  read -r hamgit_host hamgit_repo_path <<<"$(parse_git_url "$HAMGIT_REPO_URL")"
  hamgit_repo=$(echo "${hamgit_host}/${hamgit_repo_path}" | tr '[:upper:]' '[:lower:]')
  target_platform_names+=("HamGit 镜像库")
  target_hosts+=("$hamgit_host")
  target_users+=("${hamgit_repo_path%%/*}")
  target_passes+=("$HAMGIT_REGISTRY_TOKEN")
  target_repos+=("$hamgit_repo")
fi

total_targets=${#target_platform_names[@]}

# 6. 只读检查模式
if [[ $readonly_check -eq 1 ]]; then
  echo ""
  if [[ $check_full -eq 1 ]]; then
    printf "${C_BLUE}==>${C_RESET} 镜像发布状态检查 (全部版本: %s)\n\n" "$(printf "%s, " "${target_tags[@]}" | sed 's/, $//')"
  else
    printf "${C_BLUE}==>${C_RESET} 镜像发布状态检查 (版本: %s)\n\n" "${target_tags[0]}"
  fi

  # 官方镜像库
  echo "官方镜像库 (${source_repo})"
  for tag in "${target_tags[@]}"; do
    img="${source_repo}:${tag}"
    if inspect_out=$(docker buildx imagetools inspect "$img" 2>/dev/null); then
      platforms=$(echo "$inspect_out" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
      printf "  ${C_GREEN}✓${C_RESET} %-10s 已发布 (架构: %s)\n" "$tag" "${platforms:-未知}"
    else
      printf "  ${C_RED}✗${C_RESET} %-10s 未发布\n" "$tag"
    fi
  done
  echo ""

  # HamGit 镜像库
  if [[ -n "${hamgit_repo:-}" ]]; then
    echo "HamGit 镜像库 (${hamgit_repo})"
    for tag in "${target_tags[@]}"; do
      img="${hamgit_repo}:${tag}"
      if inspect_out=$(docker buildx imagetools inspect "$img" 2>/dev/null); then
        platforms=$(echo "$inspect_out" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
        printf "  ${C_GREEN}✓${C_RESET} %-10s 已同步 (架构: %s)\n" "$tag" "${platforms:-未知}"
      else
        printf "  ${C_YELLOW}!${C_RESET} %-10s 未同步\n" "$tag"
      fi
    done
    echo ""
  fi

  # Docker Hub
  if [[ -n "${dockerhub_target:-}" ]]; then
    echo "Docker Hub (${dockerhub_target})"
    for tag in "${target_tags[@]}"; do
      img="${dockerhub_target}:${tag}"
      if inspect_out=$(docker buildx imagetools inspect "$img" 2>/dev/null); then
        platforms=$(echo "$inspect_out" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
        printf "  ${C_GREEN}✓${C_RESET} %-10s 已同步 (架构: %s)\n" "$tag" "${platforms:-未知}"
      else
        printf "  ${C_YELLOW}!${C_RESET} %-10s 未同步\n" "$tag"
      fi
    done
    echo ""
  fi

  exit 0
fi

# 7. 同步模式
if [[ $total_targets -eq 0 ]]; then
  fail "未检测到任何需要同步的目标平台配置，请在 .env 中配置 Docker Hub 或 HamGit 镜像库凭据。"
fi

# 目标平台身份鉴权
log_info "正在检验镜像平台身份鉴权..."
if [[ -n "${GHCR_TOKEN:-}" ]]; then
  printf '  ==> 正在登录官方镜像源 (ghcr.io)... '
  if echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-wangyan}" --password-stdin >/dev/null 2>&1; then
    printf "${C_GREEN}认证成功${C_RESET}\n"
  else
    printf "${C_YELLOW}跳过（尝试公开访问）${C_RESET}\n"
  fi
fi
for ((i=0; i<total_targets; i++)); do
  host="${target_hosts[$i]}"
  user="${target_users[$i]}"
  pass="${target_passes[$i]}"
  pname="${target_platform_names[$i]}"

  printf '  ==> 正在登录 %s (%s)... ' "$pname" "$host"
  if echo "$pass" | docker login "$host" -u "$user" --password-stdin >/dev/null 2>&1; then
    printf "${C_GREEN}认证成功${C_RESET}\n"
  else
    printf "${C_RED}认证失败${C_RESET}\n"
    fail "平台 ${pname} 登录认证失败，请检查 .env 中的用户与访问令牌配置。"
  fi
done

# 逐一同步版本
sync_one_version() {
  local tag="$1"
  local src_tag="${source_repo}:${tag}"
  local is_latest=0
  [[ "$tag" == "$latest_release" ]] && is_latest=1

  echo ""
  log_info "正在处理版本：${tag} (权威源: ${src_tag})"

  if ! docker buildx imagetools inspect "$src_tag" >/dev/null 2>&1; then
    fail "官方源镜像 ${src_tag} 在 GHCR 尚未就绪，无法执行清单同步。请等待 GitHub Actions 构建完成。"
  fi

  for ((i=0; i<total_targets; i++)); do
    local repo="${target_repos[$i]}"
    local pname="${target_platform_names[$i]}"
    local tag_check="${repo}:${tag}"

    if docker buildx imagetools inspect "$tag_check" >/dev/null 2>&1 && [[ $force_push -eq 0 ]]; then
      log_skip "${pname}: 远端已存在 ${tag_check}，跳过"
      continue
    fi

    echo "==> 正在同步至 ${pname} (${repo})..."
    local -a create_tags=("--tag" "${repo}:${tag}")
    if [[ $is_latest -eq 1 ]]; then
      create_tags+=("--tag" "${repo}:latest")
    fi

    local success=0
    for attempt in 1 2 3; do
      if docker buildx imagetools create "${create_tags[@]}" "$src_tag"; then
        success=1
        break
      else
        log_warn "第 ${attempt} 次同步到 ${pname} 失败，5 秒后重试..."
        sleep 5
      fi
    done

    if [[ $success -eq 1 ]]; then
      log_ok "${pname} (${tag}) 同步完成！"
    else
      fail "${pname} (${tag}) 镜像同步失败，请检查网络连接或权限。"
    fi
  done
}

for t in "${target_tags[@]}"; do
  sync_one_version "$t"
done

echo ""
log_ok "目标镜像版本同步全部完成！"
