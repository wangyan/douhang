#!/usr/bin/env bash
# ==============================================================================
# DouHang 多架构容器镜像同步与分发脚本
#
# 核心特性：
# 1. 极速清单同步（默认）：以官方 GHCR 产物为权威源，直接通过 buildx imagetools
#    流转多架构清单与层数据，免去本地二次交叉编译，耗时由数十分钟缩减至数十秒；
# 2. 本地构建后备（--build）：支持显式从源码构建多架构镜像（linux/amd64,linux/arm64）；
# 3. 异步后台守护（--async）：支持后台解绑异步运行，即刻释放终端，避免长耗时网络阻塞；
# 4. 生命周期管理：提供 --status（查状态）与 --cancel（取消任务）配套工具；
# 5. 多平台自适应：自动适配私有镜像平台、Docker Hub 与 GHCR，未配置平台静默跳过；
# 6. 断点与存在性防呆：推送前通过 imagetools inspect 探测，已存在则自动秒级跳过；
# 7. 最高兼容性：同步与构建均保证 --provenance=false，适配各类自建私有 Registry；
# 8. 终端自适应：彩色终端格式化输出，管道重定向时自动纯净化。
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

# 运行时目录与 PID/日志路径
LOGS_DIR="data/logs"
PID_FILE="${LOGS_DIR}/image-sync.pid"

# 辅助输出函数
log_info()  { printf "${C_BLUE}==>${C_RESET} %s\n" "$*"; }
log_ok()    { printf "${C_GREEN}==> [成功]${C_RESET} %s\n" "$*"; }
log_warn()  { printf "${C_YELLOW}==> [注意]${C_RESET} %s\n" "$*"; }
log_skip()  { printf "${C_CYAN}==> [跳过]${C_RESET} %s\n" "$*"; }
log_err()   { printf "${C_RED}==> [错误]${C_RESET} %s\n" "$*" >&2; }
fail()      { log_err "$*"; exit 1; }

# 打印帮助信息
show_help() {
  cat <<'EOF'
用法:
  scripts/image-sync.sh [版本号] [选项]

参数:
  [版本号]        可选。若未指定，默认针对远程主仓库最新 Release 执行操作

选项:
  full, --full, --all
                  检查或同步远程主仓库所有 Releases 对应的容器镜像
  -a, --async     后台异步运行同步任务（即刻释放终端，避免网络或构建阻塞）
  -s, --status    查看当前后台异步同步任务的运行状态与最新日志
  -c, --cancel    中止当前正在运行的后台同步任务
  -b, --build     本地从源码完整构建镜像（默认优先从官方源直接同步清单，无需本地编译）
  -f, --force     强制同步或覆盖目标仓库已存在的同名镜像
  --check         只读检查各镜像平台 Release 镜像包存在性与同步状态（默认仅检查最新 Release）
  -h, --help      显示本帮助信息

示例:
  # 1. 检查最新 Release 在各平台的镜像包发布/同步状态
  npm run image:check

  # 2. 全量检查所有 Releases 在各平台的镜像包完整性
  npm run image:check full

  # 3. 仅检查指定版本的镜像包状态
  npm run image:check 1.1.0

  # 4. 同步最新 Release 镜像包至私有镜像库与 Docker Hub
  npm run image:sync

  # 5. 全量同步所有 Releases 镜像包至私有镜像库
  npm run image:sync -- --all
  # 或
  npm run image:sync full

  # 6. 异步后台执行（不阻塞终端，可随时通过 --status 查看进度）
  npm run image:sync -- --async
EOF
}

# 检查后台任务状态
check_status() {
  if [[ ! -f "$PID_FILE" ]]; then
    log_info "当前没有处于活动状态的后台同步任务。"
    exit 0
  fi

  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log_info "后台同步任务正在运行中（PID: ${pid}）"
    # 查找最近的日志文件
    local latest_log
    latest_log=$(ls -t "${LOGS_DIR}"/image-sync-*.log 2>/dev/null | head -n 1 || true)
    if [[ -n "$latest_log" && -f "$latest_log" ]]; then
      echo "---------------- 最新执行日志（${latest_log}） ----------------"
      tail -n 15 "$latest_log"
      echo "------------------------------------------------------------------"
      printf "\n提示：可执行 tail -f %s 查看实时日志，或通过 --cancel 中止任务。\n" "$latest_log"
    fi
  else
    log_warn "未检测到存活的后台进程（残留 PID: ${pid:-未知}）。前次任务已结束或已退出。"
    rm -f "$PID_FILE"
  fi
  exit 0
}

# 取消后台任务
cancel_task() {
  if [[ ! -f "$PID_FILE" ]]; then
    log_info "当前没有正在运行的后台同步任务。"
    exit 0
  fi

  local pid
  pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log_warn "正在终止后台同步任务（PID: ${pid}）..."
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    log_ok "后台同步任务已成功终止。"
  else
    rm -f "$PID_FILE"
    log_info "任务进程（PID: ${pid}）已不在运行，已清理状态文件。"
  fi
  exit 0
}

# 1. 解析初始参数
initial_target_version=""
target_version=""
run_async=0
is_worker=0
do_build=0
force_push=0
readonly_check=0
sync_all=0
check_full=0
forward_args=()

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      show_help
      exit 0
      ;;
    -s|--status)
      check_status
      ;;
    -c|--cancel)
      cancel_task
      ;;
    -a|--async|-d|--detach)
      run_async=1
      ;;
    --internal-worker)
      is_worker=1
      ;;
    full|--full)
      check_full=1
      sync_all=1
      forward_args+=("$arg")
      ;;
    --all)
      check_full=1
      sync_all=1
      forward_args+=("$arg")
      ;;
    -b|--build)
      do_build=1
      forward_args+=("$arg")
      ;;
    -f|--force|--froce)
      force_push=1
      forward_args+=("$arg")
      ;;
    --check)
      readonly_check=1
      forward_args+=("$arg")
      ;;
    *)
      if [[ -z "$target_version" ]]; then
        initial_target_version="${arg#v}"
        target_version="${arg#v}"
        forward_args+=("$target_version")
      else
        fail "无法识别的多余参数：$arg（请运行 $0 --help 查看用法）"
      fi
      ;;
  esac
done

# 2. 读取本地 .env 配置（若存在）
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

# 解析 Git URL 提取主机名与仓库名（兼容 ssh://, git@, https:// 等格式）
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

# 基础主平台变量
MAIN_REPO_NAME="${MAIN_REPO_NAME:-wangyan/douhang}"
MAIN_GIT_HOST="${MAIN_GIT_HOST:-github.com}"
MAIN_REGISTRY="${MAIN_REGISTRY:-ghcr.io}"
MAIN_REGISTRY_USER="${MAIN_REGISTRY_USER:-${MAIN_REPO_NAME%%/*}}"
MAIN_REGISTRY_TOKEN="${MAIN_REGISTRY_TOKEN:-}"
repo_url="https://${MAIN_GIT_HOST}/${MAIN_REPO_NAME}"

# 获取远程主仓库已发布的 Releases 列表（作为版本检查与镜像同步的唯一权威依据）
get_remote_releases() {
  MAIN_GIT_HOST="$MAIN_GIT_HOST" \
  MAIN_REPO_NAME="$MAIN_REPO_NAME" \
  MAIN_REPO_TOKEN="$MAIN_REPO_TOKEN" \
  node -e '
const host = (process.env.MAIN_GIT_HOST || "github.com").trim();
const repo = (process.env.MAIN_REPO_NAME || "wangyan/douhang").trim();
const token = process.env.MAIN_REPO_TOKEN?.trim();
const isGitHub = host === "github.com" || host.endsWith(".github.com");

const apiUrl = isGitHub
  ? `https://api.github.com/repos/${repo}/releases`
  : `https://${host}/api/v1/repos/${repo}/releases`;

const headers = {
  "Accept": isGitHub ? "application/vnd.github.v3+json" : "application/json",
  "User-Agent": "DouHang-Image-Sync",
};
if (token) {
  headers["Authorization"] = isGitHub ? `Bearer ${token}` : `token ${token}`;
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
    .map(r => r.tag_name.replace(/^v/, ""));
  
  tags.sort((a, b) => {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
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
while IFS= read -r v || [[ -n "$v" ]]; do
  [[ -n "$v" ]] && remote_releases+=("$v")
done < <(get_remote_releases)

if [[ ${#remote_releases[@]} -eq 0 ]]; then
  fail "远程主仓库（${repo_url}）未检测到任何已发布的 Release 记录。请先在主仓库发布 Release。"
fi

latest_release="${remote_releases[0]}"
latest_version="${latest_release}"

# 确定本次操作的目标版本列表
declare -a target_versions=()
if [[ -n "$initial_target_version" ]]; then
  found=0
  for r in "${remote_releases[@]}"; do
    if [[ "$r" == "$initial_target_version" ]]; then
      found=1
      break
    fi
  done
  if [[ $found -eq 0 ]]; then
    fail "远程主仓库未找到版本 v${initial_target_version} 的 Release 记录（可用版本: ${remote_releases[*]}）"
  fi
  target_versions=("$initial_target_version")
  target_version="$initial_target_version"
elif [[ $check_full -eq 1 || $sync_all -eq 1 ]]; then
  target_versions=("${remote_releases[@]}")
  target_version="${latest_release}"
else
  # 默认模式（不带 full）：只针对最新 Release
  target_versions=("${latest_release}")
  target_version="${latest_release}"
fi

# 镜像平台变量智能提取与默认值
MIRROR_REPO_URL="${MIRROR_REPO_URL:-}"
mirror_url_host=""
mirror_url_repo=""
if [[ -n "$MIRROR_REPO_URL" ]]; then
  read -r mirror_url_host mirror_url_repo <<<"$(parse_git_url "$MIRROR_REPO_URL")"
fi

MIRROR_GIT_HOST="${MIRROR_GIT_HOST:-$mirror_url_host}"
MIRROR_REPO_NAME="${MIRROR_REPO_NAME:-${mirror_url_repo:-$MAIN_REPO_NAME}}"
MIRROR_REGISTRY="${MIRROR_REGISTRY:-$MIRROR_GIT_HOST}"
MIRROR_REGISTRY_USER="${MIRROR_REGISTRY_USER:-${MIRROR_REPO_NAME%%/*}}"
MIRROR_REGISTRY_TOKEN="${MIRROR_REGISTRY_TOKEN:-}"

# 3. 依赖与快速前置校验（主进程前台快速完成，避免后台盲盒失败）
command -v docker >/dev/null 2>&1 || fail "未找到 docker 命令，请先安装 Docker。"
docker info >/dev/null 2>&1 || fail "Docker 守护进程未运行，请先启动 Docker 服务。"
docker buildx version >/dev/null 2>&1 || fail "未检测到 Docker Buildx，请升级 Docker 至支持 buildx 的版本。"

# 4. 若启用了 --async 且当前不是后台 worker，派生后台进程
if [[ $run_async -eq 1 && $is_worker -eq 0 ]]; then
  # 检查是否已有活跃任务
  if [[ -f "$PID_FILE" ]]; then
    existing_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      fail "已有后台同步任务正在运行中（PID: ${existing_pid}）。如需重新启动，请先执行 $0 --cancel。"
    fi
  fi

  mkdir -p "$LOGS_DIR"
  log_label="${target_version}"
  if [[ ${#target_versions[@]} -gt 1 ]]; then
    log_label="all"
  fi
  log_file="${LOGS_DIR}/image-sync-${log_label}.log"

  # 启动后台守护任务并脱离终端会话
  nohup bash "$0" "${forward_args[@]}" --internal-worker > "$log_file" 2>&1 &
  worker_pid=$!
  echo "$worker_pid" > "$PID_FILE"

  echo ""
  log_ok "镜像同步任务已成功转入后台异步运行！"
  echo "    • 任务 PID: ${worker_pid}"
  if [[ ${#target_versions[@]} -gt 1 ]]; then
    echo "    • 目标版本: 全部已定义版本 (${target_versions[*]})"
  else
    echo "    • 目标版本: v${target_versions[0]}"
  fi
  echo "    • 日志文件: ${log_file}"
  echo ""
  log_info "常用跟踪命令："
  echo "    • 实时查看日志: tail -f ${log_file}"
  echo "    • 检查执行状态: npm run image:sync -- --status"
  echo "    • 中止后台任务: npm run image:sync -- --cancel"
  echo ""
  exit 0
fi

# 若为 worker 进程，确保退出时清理 PID
if [[ $is_worker -eq 1 ]]; then
  trap 'rm -f "$PID_FILE"' EXIT
fi

# ==============================================================================
# 5. 同步/构建核心逻辑（前台直接运行 或 后台 Worker 执行）
# ==============================================================================

ver_summary=""
for v in "${target_versions[@]}"; do
  ver_summary+="${ver_summary:+, }v${v}"
done

if [[ $readonly_check -eq 0 ]]; then
  log_info "目标版本：${ver_summary}"
  if [[ $do_build -eq 1 ]]; then
    log_warn "已启用 --build 本地源码构建模式"
  else
    log_info "执行模式：高速清单流转同步（以 GHCR 多架构为源直接同步）"
  fi
fi

# 收集镜像平台
declare -a target_platform_names=()
declare -a target_hosts=()
declare -a target_users=()
declare -a target_passes=()
declare -a target_repos=()

# 官方源定义 (GHCR)
source_host="$MAIN_REGISTRY"
source_repo=$(echo "${source_host}/${MAIN_REPO_NAME}" | tr '[:upper:]' '[:lower:]')

# --- 目标 1: 私有镜像库 (Forgejo / Harbor / 自建 Registry) ---
mirror_registry="$MIRROR_REGISTRY"
mirror_token="$MIRROR_REGISTRY_TOKEN"
mirror_repo_name="$MIRROR_REPO_NAME"
mirror_user="$MIRROR_REGISTRY_USER"

if [[ -n "$mirror_registry" && -n "$mirror_token" ]]; then
  mirror_repo=$(echo "${mirror_registry}/${mirror_repo_name}" | tr '[:upper:]' '[:lower:]')
  target_platform_names+=("私有镜像库")
  target_hosts+=("$mirror_registry")
  target_users+=("$mirror_user")
  target_passes+=("$mirror_token")
  target_repos+=("$mirror_repo")
fi

# --- 目标 2: Docker Hub (docker.io) ---
dockerhub_user="${DOCKERHUB_USERNAME:-${HUB_USERNAME:-}}"
dockerhub_token="${DOCKERHUB_TOKEN:-${HUB_TOKEN:-}}"
dockerhub_repo="${DOCKERHUB_REPO:-${HUB_REPO:-}}"

if [[ -n "$dockerhub_user" && -n "$dockerhub_token" ]]; then
  if [[ -z "$dockerhub_repo" ]]; then
    dockerhub_repo="${dockerhub_user}/${MAIN_REPO_NAME##*/}"
  fi
  dockerhub_target=$(echo "docker.io/${dockerhub_repo}" | tr '[:upper:]' '[:lower:]')
  target_platform_names+=("Docker Hub")
  target_hosts+=("docker.io")
  target_users+=("$dockerhub_user")
  target_passes+=("$dockerhub_token")
  target_repos+=("$dockerhub_target")
fi

# 如果是在本地执行 --build 构建模式，GHCR 也作为目标推送平台之一（若有凭据）
if [[ $do_build -eq 1 && -n "$MAIN_REGISTRY_TOKEN" ]]; then
  target_platform_names+=("官方镜像库")
  target_hosts+=("$MAIN_REGISTRY")
  target_users+=("$MAIN_REGISTRY_USER")
  target_passes+=("$MAIN_REGISTRY_TOKEN")
  target_repos+=("$source_repo")
fi

total_targets=${#target_platform_names[@]}
if [[ $total_targets -eq 0 && $readonly_check -eq 0 ]]; then
  fail "未检测到任何需要同步的远端平台配置，请在 .env 中配置私有平台凭据或 Docker Hub 凭据。"
fi

# 6. 镜像发布状态检查报告
if [[ $readonly_check -eq 1 ]]; then
  # 静默完成各已配置平台鉴权（失败则终止）
  if [[ -n "$MAIN_REGISTRY_TOKEN" ]]; then
    if ! echo "$MAIN_REGISTRY_TOKEN" | docker login "$source_host" -u "$MAIN_REGISTRY_USER" --password-stdin >/dev/null 2>&1; then
      fail "官方镜像库 (${source_host}) 登录失败，请检查 MAIN_REGISTRY_TOKEN 配置。"
    fi
  fi

  for ((i=0; i<total_targets; i++)); do
    host="${target_hosts[$i]}"
    user="${target_users[$i]}"
    pass="${target_passes[$i]}"
    pname="${target_platform_names[$i]}"
    if ! echo "$pass" | docker login "$host" -u "$user" --password-stdin >/dev/null 2>&1; then
      fail "平台 ${pname} (${host}) 登录失败，请检查用户与令牌配置。"
    fi
  done

  echo ""
  if [[ $check_full -eq 1 ]]; then
    printf "${C_BLUE}==>${C_RESET} 镜像发布状态检查 (全部版本: %s)\n\n" "${ver_summary}"
  elif [[ -n "$initial_target_version" ]]; then
    printf "${C_BLUE}==>${C_RESET} 镜像发布状态检查 (版本: v%s)\n\n" "${initial_target_version}"
  else
    printf "${C_BLUE}==>${C_RESET} 镜像发布状态检查 (版本: v%s)\n\n" "${latest_release}"
  fi

  diff_count=0

  # 官方镜像库
  echo "官方镜像库 (${source_repo})"
  for ver in "${target_versions[@]}"; do
    tag_name="v${ver}"
    img="${source_repo}:${tag_name}"
    if inspect_out=$(docker buildx imagetools inspect "$img" 2>/dev/null); then
      platforms=$(echo "$inspect_out" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
      printf "  ${C_GREEN}✓${C_RESET} %-10s 已发布 (架构: %s)\n" "$tag_name" "${platforms:-未知}"
    else
      printf "  ${C_RED}✗${C_RESET} %-10s 未发布\n" "$tag_name"
      ((diff_count++))
    fi
  done
  echo ""

  # 私有镜像库
  if [[ -n "$mirror_registry" && -n "$mirror_token" ]]; then
    echo "私有镜像库 (${mirror_repo})"
    for ver in "${target_versions[@]}"; do
      tag_name="v${ver}"
      img="${mirror_repo}:${tag_name}"
      if inspect_out=$(docker buildx imagetools inspect "$img" 2>/dev/null); then
        platforms=$(echo "$inspect_out" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
        printf "  ${C_GREEN}✓${C_RESET} %-10s 已同步 (架构: %s)\n" "$tag_name" "${platforms:-未知}"
      else
        printf "  ${C_YELLOW}!${C_RESET} %-10s 未同步\n" "$tag_name"
        ((diff_count++))
      fi
    done
    echo ""
  fi

  # Docker Hub
  if [[ -n "$dockerhub_user" && -n "$dockerhub_token" ]]; then
    echo "Docker Hub (${dockerhub_target})"
    for ver in "${target_versions[@]}"; do
      tag_name="v${ver}"
      img="${dockerhub_target}:${tag_name}"
      if inspect_out=$(docker buildx imagetools inspect "$img" 2>/dev/null); then
        platforms=$(echo "$inspect_out" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
        printf "  ${C_GREEN}✓${C_RESET} %-10s 已同步 (架构: %s)\n" "$tag_name" "${platforms:-未知}"
      else
        printf "  ${C_YELLOW}!${C_RESET} %-10s 未同步\n" "$tag_name"
        ((diff_count++))
      fi
    done
    echo ""
  fi

  exit 0
else
  # 普通同步模式：输出标准登录日志
  log_info "正在检验镜像平台身份鉴权..."
  printf '  ==> 正在登录 官方镜像库 (%s)... ' "$source_host"
  if [[ -n "$MAIN_REGISTRY_TOKEN" ]]; then
    if echo "$MAIN_REGISTRY_TOKEN" | docker login "$source_host" -u "$MAIN_REGISTRY_USER" --password-stdin >/dev/null 2>&1; then
      printf "${C_GREEN}认证成功${C_RESET}\n"
    else
      printf "${C_RED}认证失败${C_RESET}\n"
      fail "平台 官方镜像库 (${source_host}) 登录认证失败，请检查 .env 中的 MAIN_REGISTRY_TOKEN 配置。"
    fi
  else
    printf "${C_CYAN}公开只读访问（未配置 MAIN_REGISTRY_TOKEN）${C_RESET}\n"
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
      fail "平台 ${pname} 登录认证失败，请检查 .env 中的用户与令牌配置。"
    fi
  done
fi

# 8. 执行同步或本地构建
sync_one_version() {
  local ver="$1"
  local src_tag="${source_repo}:v${ver}"
  local is_latest=0
  [[ "$ver" == "$latest_version" ]] && is_latest=1

  echo ""
  log_info "------------------------------------------------------"
  log_info "正在处理版本：v${ver} (权威源: ${src_tag})"
  log_info "------------------------------------------------------"

  # 目标平台存在性检测与任务队列收集
  local -a sync_needed_indices=()
  for ((i=0; i<total_targets; i++)); do
    local repo="${target_repos[$i]}"
    local pname="${target_platform_names[$i]}"
    local tag_check="${repo}:v${ver}"

    if docker buildx imagetools inspect "$tag_check" >/dev/null 2>&1; then
      if [[ $force_push -eq 1 ]]; then
        log_warn "[覆盖] ${pname}: 远端已存在 ${tag_check}，已指定 --force，加入同步队列"
        sync_needed_indices+=("$i")
      else
        log_skip "${pname}: 远端已存在 ${tag_check}，无需同步"
      fi
    else
      log_ok "[待同步] ${pname}: 尚未发布该版本，加入同步队列"
      sync_needed_indices+=("$i")
    fi
  done

  if [[ ${#sync_needed_indices[@]} -eq 0 ]]; then
    log_ok "版本 v${ver} 在所有目标平台均已就绪，无需同步。"
    return 0
  fi

  if [[ $do_build -eq 1 ]]; then
    # 本地构建模式
    log_info "正在启动本地多架构 Docker 镜像交叉编译与分发（版本: v${ver}）..."
    local -a build_tags=()
    for idx in "${sync_needed_indices[@]}"; do
      local repo="${target_repos[$idx]}"
      build_tags+=("-t" "${repo}:v${ver}")
      if [[ $is_latest -eq 1 ]]; then
        build_tags+=("-t" "${repo}:latest")
      fi
    done

    docker buildx build \
      ${BUILDX_BUILDER:+--builder "$BUILDX_BUILDER"} \
      --platform linux/amd64,linux/arm64 \
      --provenance=false \
      --build-arg REPO_URL="$repo_url" \
      "${build_tags[@]}" \
      --push \
      .
    log_ok "版本 v${ver} 本地多架构镜像构建与推送完成！"
  else
    # 高速清单流转模式
    if ! docker buildx imagetools inspect "$src_tag" >/dev/null 2>&1; then
      fail "官方源镜像 ${src_tag} 在 GHCR 尚未就绪，无法直接执行清单同步。\n请等待云端构建完成，或附加 --build 参数在本地交叉编译。"
    fi

    log_info "正在通过 buildx imagetools 高速同步多架构镜像清单与层（版本: v${ver}）..."
    for idx in "${sync_needed_indices[@]}"; do
      local repo="${target_repos[$idx]}"
      local pname="${target_platform_names[$idx]}"

      echo "==> 正在同步至 ${pname} (${repo})..."
      local -a create_tags=("--tag" "${repo}:v${ver}")
      if [[ $is_latest -eq 1 ]]; then
        create_tags+=("--tag" "${repo}:latest")
      fi

      local success=0
      for attempt in 1 2 3; do
        if docker buildx imagetools create "${create_tags[@]}" "$src_tag"; then
          success=1
          break
        else
          log_warn "第 ${attempt} 次同步到 ${pname} 失败，将在 5 秒后重试..."
          sleep 5
        fi
      done

      if [[ $success -eq 1 ]]; then
        log_ok "${pname} (v${ver}) 同步完成！"
      else
        fail "${pname} 镜像同步失败，请检查网络连接或权限。"
      fi
    done
  fi
}

for v in "${target_versions[@]}"; do
  sync_one_version "$v"
done

echo ""
log_ok "所有目标镜像版本处理全部完成！"
