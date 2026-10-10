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
  [版本号]        可选。若未指定，默认读取 package.json 中的当前版本（如 1.2.0）

选项:
  -a, --async     后台异步运行同步任务（即刻释放终端，避免网络或构建阻塞）
  -s, --status    查看当前后台异步同步任务的运行状态与最新日志
  -c, --cancel    中止当前正在运行的后台同步任务
  -b, --build     本地从源码完整构建镜像（默认优先从官方源直接同步清单，无需本地编译）
  -f, --force     强制同步或覆盖目标仓库已存在的同名镜像标签
  --check         只读检查各平台远端镜像存在性与一致性，不执行实际上传
  -h, --help      显示本帮助信息

示例:
  # 1. 检查各镜像平台是否已同步当前版本（只读）
  npm run image:check

  # 2. 默认模式：从官方 GHCR 快速流转多架构镜像至私有镜像库与 Docker Hub
  npm run image:sync

  # 3. 异步后台执行（不阻塞终端，可随时通过 --status 查看进度）
  npm run image:sync -- --async

  # 4. 显式指定版本并指定在本地交叉编译后推送
  bash scripts/image-sync.sh 1.1.0 --build
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
target_version=""
run_async=0
is_worker=0
do_build=0
force_push=0
readonly_check=0
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
        target_version="${arg#v}"
        forward_args+=("$target_version")
      else
        fail "无法识别的多余参数：$arg（请运行 $0 --help 查看用法）"
      fi
      ;;
  esac
done

# 推导版本号
if [[ -z "$target_version" ]]; then
  if [[ ! -f "package.json" ]]; then
    fail "当前目录下未找到 package.json，无法自动推导版本号，请显式传入版本号。"
  fi
  target_version=$(node -p "require('./package.json').version" 2>/dev/null || echo "")
  if [[ -z "$target_version" ]]; then
    fail "未能从 package.json 中解析出 version 字段。"
  fi
fi

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
  log_file="${LOGS_DIR}/image-sync-${target_version}.log"

  # 启动后台守护任务并脱离终端会话
  nohup bash "$0" "${forward_args[@]}" --internal-worker > "$log_file" 2>&1 &
  worker_pid=$!
  echo "$worker_pid" > "$PID_FILE"

  echo ""
  log_ok "镜像同步任务已成功转入后台异步运行！"
  echo "    • 任务 PID: ${worker_pid}"
  echo "    • 目标版本: v${target_version}"
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

log_info "目标同步版本：v${target_version}（标签 :${target_version}、:v${target_version} 与 :latest）"
if [[ $readonly_check -eq 1 ]]; then
  log_warn "已启用 --check 只读检查模式，不发起任何写操作"
elif [[ $do_build -eq 1 ]]; then
  log_warn "已启用 --build 本地源码构建模式"
else
  log_info "执行模式：高速清单流转同步（默认优先以 GHCR 多架构为源直接同步）"
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
source_full_tag="${source_repo}:${target_version}"

# --- 目标 1: 私有镜像库 (Forgejo / Harbor / 自建 Registry) ---
mirror_registry="$MIRROR_REGISTRY"
mirror_token="$MIRROR_REGISTRY_TOKEN"
mirror_repo_name="$MIRROR_REPO_NAME"
mirror_user="$MIRROR_REGISTRY_USER"

if [[ -n "$mirror_registry" && -n "$mirror_token" ]]; then
  mirror_repo=$(echo "${mirror_registry}/${mirror_repo_name}" | tr '[:upper:]' '[:lower:]')
  target_platform_names+=("私有镜像库 (${mirror_registry})")
  target_hosts+=("$mirror_registry")
  target_users+=("$mirror_user")
  target_passes+=("$mirror_token")
  target_repos+=("$mirror_repo")
else
  log_skip "未完整配置 MIRROR_REGISTRY（或通过 MIRROR_REPO_URL 推导）与 MIRROR_REGISTRY_TOKEN，跳过私有镜像库"
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
  target_platform_names+=("Docker Hub (docker.io)")
  target_hosts+=("docker.io")
  target_users+=("$dockerhub_user")
  target_passes+=("$dockerhub_token")
  target_repos+=("$dockerhub_target")
else
  log_skip "未配置 DOCKERHUB_USERNAME 与 DOCKERHUB_TOKEN，跳过 Docker Hub 平台"
fi

# 如果是在本地执行 --build 构建模式，GHCR 也作为目标推送平台之一（若有凭据）
if [[ $do_build -eq 1 && -n "$MAIN_REGISTRY_TOKEN" ]]; then
  target_platform_names+=("GHCR (GitHub Packages)")
  target_hosts+=("$MAIN_REGISTRY")
  target_users+=("$MAIN_REGISTRY_USER")
  target_passes+=("$MAIN_REGISTRY_TOKEN")
  target_repos+=("$source_repo")
fi

total_targets=${#target_platform_names[@]}
if [[ $total_targets -eq 0 && $readonly_check -eq 0 ]]; then
  fail "未检测到任何需要同步的远端平台配置，请在 .env 中配置私有平台凭据或 Docker Hub 凭据。"
fi

# 6. 鉴权登录
log_info "正在检验镜像平台身份鉴权..."

# 官方源鉴权
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

# 7. 只读检查模式处理（输出完整的结构化诊断报告）
if [[ $readonly_check -eq 1 ]]; then
  echo ""
  echo "======================================================"
  echo "斗法领航 容器镜像版本发布状态检查 (只读模式)"
  echo "======================================================"
  echo "目标检测版本：v${target_version}（标签 :${target_version}、:v${target_version} 与 :latest）"
  echo ""

  all_synced=1

  # ---------------- 检查目标 1: 官方镜像库 ----------------
  echo "------------------------------------------------------"
  echo "检查目标：官方镜像库 (${source_host}) -> 仓库：${source_repo}"
  echo "------------------------------------------------------"
  if ghcr_inspect=$(docker buildx imagetools inspect "$source_full_tag" 2>/dev/null); then
    ghcr_platforms=$(echo "$ghcr_inspect" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
    printf "  ${C_GREEN}✓${C_RESET} 镜像版本 :${target_version} 已发布 (架构: %s)\n" "${ghcr_platforms:-未知}"
    if docker buildx imagetools inspect "${source_repo}:v${target_version}" >/dev/null 2>&1; then
      printf "  ${C_GREEN}✓${C_RESET} 标签 :v${target_version} 已就绪\n"
    else
      printf "  ${C_YELLOW}!${C_RESET} 标签 :v${target_version} 缺失\n"
      all_synced=0
    fi
    if docker buildx imagetools inspect "${source_repo}:latest" >/dev/null 2>&1; then
      printf "  ${C_GREEN}✓${C_RESET} 标签 :latest 已就绪\n"
    else
      printf "  ${C_YELLOW}!${C_RESET} 标签 :latest 缺失\n"
      all_synced=0
    fi
  else
    printf "  ${C_RED}✗${C_RESET} 官方镜像库尚未发布版本 :${target_version}\n"
    all_synced=0
  fi
  echo ""

  # ---------------- 检查目标 2: 私有镜像库 ----------------
  echo "------------------------------------------------------"
  echo "检查目标：私有镜像库 (${mirror_registry:-未配置}) -> 仓库：${mirror_repo:-未配置}"
  echo "------------------------------------------------------"
  if [[ -n "$mirror_registry" && -n "$mirror_token" ]]; then
    if mirror_inspect=$(docker buildx imagetools inspect "${mirror_repo}:${target_version}" 2>/dev/null); then
      mirror_platforms=$(echo "$mirror_inspect" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
      printf "  ${C_GREEN}✓${C_RESET} 镜像版本 :${target_version} 已同步 (架构: %s)\n" "${mirror_platforms:-未知}"
      if docker buildx imagetools inspect "${mirror_repo}:v${target_version}" >/dev/null 2>&1; then
        printf "  ${C_GREEN}✓${C_RESET} 标签 :v${target_version} 已就绪\n"
      else
        printf "  ${C_YELLOW}!${C_RESET} 标签 :v${target_version} 缺失\n"
        all_synced=0
      fi
      if docker buildx imagetools inspect "${mirror_repo}:latest" >/dev/null 2>&1; then
        printf "  ${C_GREEN}✓${C_RESET} 标签 :latest 已就绪\n"
      else
        printf "  ${C_YELLOW}!${C_RESET} 标签 :latest 缺失\n"
        all_synced=0
      fi
    else
      printf "  ${C_YELLOW}!${C_RESET} 私有镜像库尚未同步版本 :${target_version}（可执行 npm run image:sync 补齐）\n"
      all_synced=0
    fi
  else
    echo "  - 未在 .env 中完整配置私有镜像库凭据，已跳过"
  fi
  echo ""

  # ---------------- 检查目标 3: Docker Hub ----------------
  echo "------------------------------------------------------"
  echo "检查目标：Docker Hub (docker.io) -> 仓库：${dockerhub_target:-未配置}"
  echo "------------------------------------------------------"
  if [[ -n "$dockerhub_user" && -n "$dockerhub_token" ]]; then
    if hub_inspect=$(docker buildx imagetools inspect "${dockerhub_target}:${target_version}" 2>/dev/null); then
      hub_platforms=$(echo "$hub_inspect" | grep -E "Platform:" | awk '{print $2}' | paste -sd, -)
      printf "  ${C_GREEN}✓${C_RESET} 镜像版本 :${target_version} 已同步 (架构: %s)\n" "${hub_platforms:-未知}"
      if docker buildx imagetools inspect "${dockerhub_target}:v${target_version}" >/dev/null 2>&1; then
        printf "  ${C_GREEN}✓${C_RESET} 标签 :v${target_version} 已就绪\n"
      fi
      if docker buildx imagetools inspect "${dockerhub_target}:latest" >/dev/null 2>&1; then
        printf "  ${C_GREEN}✓${C_RESET} 标签 :latest 已就绪\n"
      fi
    else
      printf "  ${C_YELLOW}!${C_RESET} Docker Hub 尚未同步版本 :${target_version}（可执行 npm run image:sync 补齐）\n"
      all_synced=0
    fi
  else
    echo "  - 未在 .env 中配置 DOCKERHUB_USERNAME 与 DOCKERHUB_TOKEN，已跳过"
  fi

  echo ""
  echo "======================================================"
  if [[ $all_synced -eq 1 ]]; then
    log_ok "所有已配置平台的容器镜像与版本标签均已 100% 同步就绪。"
  else
    log_warn "检测到部分平台尚未同步或标签不完整，可执行 npm run image:sync 进行对齐。"
  fi
  echo "======================================================"
  exit 0
fi

# 8. 同步执行前的存在性检测与任务队列收集
log_info "正在检测各平台镜像存在性..."

source_ready=0
if docker buildx imagetools inspect "$source_full_tag" >/dev/null 2>&1; then
  source_ready=1
  log_ok "官方源镜像已就绪: ${source_full_tag}"
else
  log_warn "官方源镜像尚未就绪: ${source_full_tag}"
fi

declare -a sync_needed_indices=()

for ((i=0; i<total_targets; i++)); do
  repo="${target_repos[$i]}"
  pname="${target_platform_names[$i]}"
  tag_check="${repo}:${target_version}"

  if docker buildx imagetools inspect "$tag_check" >/dev/null 2>&1; then
    if [[ $force_push -eq 1 ]]; then
      log_warn "[覆盖] ${pname}: 远端已存在 ${tag_check}，已指定 --force，加入队列"
      sync_needed_indices+=("$i")
    else
      log_skip "${pname}: 远端已存在 ${tag_check}，无需同步"
    fi
  else
    log_ok "[待同步] ${pname}: 尚未发布该版本，加入同步队列"
    sync_needed_indices+=("$i")
  fi
done

# 无需同步时的熔断
if [[ ${#sync_needed_indices[@]} -eq 0 ]]; then
  echo ""
  log_ok "所有已配置的镜像平台均已存在版本 :${target_version}，无需重复同步！"
  echo "提示：若需要强制重新同步覆盖，请附加 --force 参数执行。"
  exit 0
fi

# 8. 执行同步或本地构建
if [[ $do_build -eq 1 ]]; then
  # ---------------- 本地构建模式 ----------------
  echo ""
  log_info "正在启动本地多架构 Docker 镜像交叉编译与分发..."
  declare -a build_tags=()
  for idx in "${sync_needed_indices[@]}"; do
    repo="${target_repos[$idx]}"
    build_tags+=("-t" "${repo}:${target_version}" "-t" "${repo}:v${target_version}" "-t" "${repo}:latest")
  done

  docker buildx build \
    ${BUILDX_BUILDER:+--builder "$BUILDX_BUILDER"} \
    --platform linux/amd64,linux/arm64 \
    --provenance=false \
    --build-arg REPO_URL="$repo_url" \
    "${build_tags[@]}" \
    --push \
    .

  echo ""
  log_ok "本地多架构镜像构建与推送完成！"
else
  # ---------------- 高速清单流转模式 ----------------
  if [[ $source_ready -eq 0 ]]; then
    fail "源镜像 ${source_full_tag} 在 GHCR 尚未就绪，无法直接执行清单同步。\n请等待 GitHub Actions 构建完成，或使用 --build 参数在本地从源码构建。"
  fi

  echo ""
  log_info "正在通过 buildx imagetools 高速同步多架构镜像清单与层..."

  for idx in "${sync_needed_indices[@]}"; do
    repo="${target_repos[$idx]}"
    pname="${target_platform_names[$idx]}"

    echo "==> 正在同步至 ${pname} (${repo})..."
    
    # 尝试同步（带最多 3 次指数退避重试，防偶发网络抖动）
    success=0
    for attempt in 1 2 3; do
      if docker buildx imagetools create \
        --tag "${repo}:${target_version}" \
        --tag "${repo}:v${target_version}" \
        --tag "${repo}:latest" \
        "$source_full_tag"; then
        success=1
        break
      else
        log_warn "第 ${attempt} 次同步到 ${pname} 失败，将在 5 秒后重试..."
        sleep 5
      fi
    done

    if [[ $success -eq 1 ]]; then
      log_ok "${pname} 同步完成！"
    else
      fail "${pname} 镜像同步失败，请检查网络连接或权限。"
    fi
  done

  echo ""
  log_ok "所有目标镜像平台多架构版本同步全部完成！"
  log_info "同步完成的版本：v${target_version}、:${target_version} 与 :latest"
fi
