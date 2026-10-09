#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
用法：
  scripts/release.sh patch      # 补丁版本：1.0.0 -> 1.0.1
  scripts/release.sh minor      # 特性版本：1.0.0 -> 1.1.0
  scripts/release.sh major      # 主版本：1.0.0 -> 2.0.0
  scripts/release.sh 1.2.3      # 显式指定版本号（须大于当前版本）
  scripts/release.sh 1.0.0      # 首次发布：显式版本号等于当前版本，且尚无同名 tag

# 流程：校验工作区与凭据 -> 定版本 -> 质量检查 -> 生产构建 -> 提交/tag -> 构建并推送镜像 -> 推送 Git 与创建 Release。
EOF
}

fail() {
  echo "release: $*" >&2
  exit 1
}

[[ $# -eq 1 ]] || { usage; exit 1; }

release_mode=$1
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

[[ $(git branch --show-current) == "main" ]] || fail "必须在 main 分支执行"
[[ -z $(git status --porcelain) ]] || fail "工作区有未提交改动，请先提交或清理"

if [ -f .env ]; then
  [ -z "${CODE_HOST:-}" ] && CODE_HOST=$(grep -E '^[[:space:]]*CODE_HOST=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${REPO_NAME:-}" ] && REPO_NAME=$(grep -E '^[[:space:]]*REPO_NAME=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${CONTAINER_REGISTRY:-}" ] && CONTAINER_REGISTRY=$(grep -E '^[[:space:]]*CONTAINER_REGISTRY=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${DOCKER_USER:-}" ] && DOCKER_USER=$(grep -E '^[[:space:]]*DOCKER_USER=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${REPO_TOKEN:-}" ] && REPO_TOKEN=$(grep -E '^[[:space:]]*REPO_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${PACKAGE_TOKEN:-}" ] && PACKAGE_TOKEN=$(grep -E '^[[:space:]]*PACKAGE_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
fi

CODE_HOST="${CODE_HOST:-code.bg7pbp.com}"
REPO_NAME="${REPO_NAME:-wangyan/douhang}"

is_github=0
if [[ "$CODE_HOST" == "github.com" || "$CODE_HOST" == *.github.com ]]; then
  is_github=1
fi

if [ -z "${CONTAINER_REGISTRY:-}" ]; then
  if [[ $is_github -eq 1 ]]; then
    CONTAINER_REGISTRY="ghcr.io"
  else
    CONTAINER_REGISTRY="$CODE_HOST"
  fi
fi

DOCKER_USER="${DOCKER_USER:-${REPO_NAME%%/*}}"
image="$CONTAINER_REGISTRY/$REPO_NAME"
repo_url="https://$CODE_HOST/$REPO_NAME"

[[ -n "${REPO_TOKEN:-}" ]] || fail "未在环境变量或 .env 中找到 REPO_TOKEN（需具备仓库 Release/推送权限）"
[[ -n "${PACKAGE_TOKEN:-}" ]] || fail "未在环境变量或 .env 中找到 PACKAGE_TOKEN（需具备容器镜像库推送权限）"

current_version=$(node -p "require('./package.json').version")
if [[ $release_mode =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  next_version=$release_mode
else
  IFS='.' read -r major minor patch <<<"$current_version"
  case "$release_mode" in
    patch) next_version="$major.$minor.$((patch + 1))" ;;
    minor) next_version="$major.$((minor + 1)).0" ;;
    major) next_version="$((major + 1)).0.0" ;;
    *) fail "无效版本参数：$release_mode" ;;
  esac
fi

tag="v$next_version"
release_committed=0

cleanup() {
  # 版本文件在提交前由脚本统一生成；发布提交建立后不要动它
  if [[ $release_committed -eq 0 ]] && [[ -n $(git status --porcelain) ]]; then
    git restore -- package.json package-lock.json docker-compose.prod.yml CHANGELOG.md src/lib/changelog.generated.json
  fi
}
trap cleanup EXIT

# 逐段数值比较版本号；要求 next_version 严格大于 current_version
version_gt() {
  local IFS=.
  local -a next=($1) cur=($2)
  for i in 0 1 2; do
    if ((${next[i]:-0} > ${cur[i]:-0})); then return 0; fi
    if ((${next[i]:-0} < ${cur[i]:-0})); then return 1; fi
  done
  return 1
}

# current_version 来自 package.json，先确认是可比较的 X.Y.Z：
# 算术求值会把非数字段当作变量名（如 1.0.0-beta 中的 beta）而得出错误的比较结果
[[ $current_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "package.json 的版本号不是 X.Y.Z 形式：$current_version"

# 首次发布：显式版本号等于当前版本时放行——此时版本号已是目标值，无需升档，
# 重复发布由下面的 tag 存在性检查拦下
first_release=0
if [[ "$next_version" == "$current_version" ]]; then
  first_release=1
else
  version_gt "$next_version" "$current_version" ||
    fail "新版本 $next_version 必须大于当前版本 $current_version"
fi

git fetch origin main --tags
git merge-base --is-ancestor origin/main HEAD || fail "本地 main 已和远端分叉，请先同步"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  fail "本地 tag 已存在：$tag"
fi
if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  fail "远端 tag 已存在：$tag"
fi

# 首次发布时版本号已是目标值，npm version 会以「Version not changed」失败
if [[ $first_release -eq 0 ]]; then
  npm version "$next_version" --no-git-tag-version
fi

node - "$next_version" <<'NODE'
const fs = require('node:fs');
const file = 'docker-compose.prod.yml';
const content = fs.readFileSync(file, 'utf8');
if (!/image:\s+.*?latest/.test(content)) {
  throw new Error('未找到生产 compose 镜像行');
}
if (!/如 :[^）]+）/.test(content)) {
  throw new Error('未找到生产 compose 版本示例');
}
fs.writeFileSync(file, content.replace(/如 :[^）]+）/, `如 :${process.argv[2]}）`));
NODE

npx tsx scripts/generate-changelog.ts

# CHANGELOG.md 缺少当前版本段落时，从上个 tag 以来的提交自动生成
if ! grep -q "^## $tag" CHANGELOG.md; then
  prev_tag=$(git describe --tags --abbrev=0 --exclude="$tag" 2>/dev/null || echo "")
  range="${prev_tag:+$prev_tag..}HEAD"
  {
    echo "## $tag - $(date +%F)"
    echo ""
    echo "### 变更"
    echo ""
    git log $range --pretty=format:"- %s"
    echo ""
    echo ""
    cat CHANGELOG.md
  } > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
  npx tsx scripts/generate-changelog.ts
fi

# 提取当前版本段落作为 Release 说明
release_notes=$(mktemp)
awk -v ver="$tag" '$0 == "## " ver || index($0, "## " ver " ") == 1 {flag=1; next} /^## / {flag=0} flag' CHANGELOG.md > "$release_notes"

printf '==> 发布 %s：质量检查\n' "$tag"
npm run check
npm run typecheck

printf '==> 发布 %s：生产构建\n' "$tag"
npm run build

printf '==> 发布 %s：提交版本\n' "$tag"
git add package.json package-lock.json docker-compose.prod.yml CHANGELOG.md src/lib/changelog.generated.json
# 首次发布时版本号与 compose 版本示例通常已是目标值，此时没有可提交的变化
if git diff --cached --quiet; then
  echo "release: 版本文件无变化，跳过版本提交（tag 指向当前 HEAD）"
else
  git commit -m "chore(release): 发布 v$next_version"
fi
release_committed=1
git tag -a "$tag" -m "Release $tag"

printf '==> 发布 %s：多架构 Docker 构建并推送\n' "$tag"
docker info >/dev/null
echo "$PACKAGE_TOKEN" | docker login "$CONTAINER_REGISTRY" -u "$DOCKER_USER" --password-stdin >/dev/null
# --load 无法装载多平台 manifest，双架构需直接 --push 到镜像仓库。
# arm64 在 x86 主机走 QEMU 模拟（Docker Desktop VM 需已注册 binfmt：
# docker run --privileged --rm tonistiigi/binfmt --install arm64）。
# 可用 BUILDX_BUILDER 覆盖构建器（默认走 buildx 当前所选 builder）。
docker buildx build \
  ${BUILDX_BUILDER:+--builder "$BUILDX_BUILDER"} \
  --platform linux/amd64,linux/arm64 \
  --build-arg REPO_URL="$repo_url" \
  -t "$image:$next_version" \
  -t "$image:latest" \
  --push \
  .

printf '==> 发布 %s：推送 Git\n' "$tag"
git push origin main "$tag"

printf '==> 发布 %s：创建 Release\n' "$tag"
if [[ $is_github -eq 1 ]]; then
  api_url="https://api.github.com/repos/$REPO_NAME/releases"
else
  api_url="https://$CODE_HOST/api/v1/repos/$REPO_NAME/releases"
fi
payload=$(node -e 'const fs=require("node:fs");process.stdout.write(JSON.stringify({tag_name:process.argv[1],name:process.argv[1],body:fs.readFileSync(process.argv[2],"utf8").trimEnd(),target_commitish:"main",draft:false,prerelease:false}))' "$tag" "$release_notes")
resp_file=$(mktemp)
http_code=$(curl --silent --show-error -o "$resp_file" -w '%{http_code}' \
  -X POST \
  -H "Authorization: token $REPO_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  "$api_url" \
  --data-binary "$payload") || true

if [[ $http_code != 200 && $http_code != 201 ]]; then
  cat "$resp_file" >&2 || true
  rm -f "$resp_file"
  rm -f "$release_notes"
  fail "Release 创建失败（HTTP $http_code），请手动创建：https://$CODE_HOST/$REPO_NAME/releases/new?tag=$tag"
fi
rm -f "$resp_file"
echo "Release 已创建：https://$CODE_HOST/$REPO_NAME/releases/tag/$tag"
rm -f "$release_notes"

printf '==> %s 发布完成\n' "$tag"
