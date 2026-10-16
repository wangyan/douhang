#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
用法：
  scripts/release.sh patch      # 补丁版本：1.0.0 -> 1.0.1
  scripts/release.sh minor      # 特性版本：1.0.0 -> 1.1.0
  scripts/release.sh major      # 主版本：1.0.0 -> 2.0.0
  scripts/release.sh 1.0.0      # 显式指定版本号（如首次发版基线）

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

if [ -f .env ]; then
  # 官方 GitHub 发版凭据
  [ -z "${GITHUB_TOKEN:-}" ] && GITHUB_TOKEN=$(grep -E '^[[:space:]]*GITHUB_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true

  # 官方国内镜像仓 (AtomGit) 发版凭据
  [ -z "${ATOMGIT_TOKEN:-}" ] && ATOMGIT_TOKEN=$(grep -E '^[[:space:]]*ATOMGIT_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true

  # 官方 GHCR 镜像库推送凭据（仅本地编译直推备选模式需要）
  [ -z "${GHCR_TOKEN:-}" ] && GHCR_TOKEN=$(grep -E '^[[:space:]]*GHCR_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true

  [ -z "${BUILD_IMAGE_LOCAL:-}" ] && BUILD_IMAGE_LOCAL=$(grep -E '^[[:space:]]*BUILD_IMAGE_LOCAL=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true

  # 国内 HamGit 平台同步配置（可选：同时发布至国内 HamGit 平台）
  [ -z "${HAMGIT_REPO_URL:-}" ] && HAMGIT_REPO_URL=$(grep -E '^[[:space:]]*HAMGIT_REPO_URL=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${HAMGIT_REPO_TOKEN:-}" ] && HAMGIT_REPO_TOKEN=$(grep -E '^[[:space:]]*HAMGIT_REPO_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
  [ -z "${HAMGIT_REGISTRY_TOKEN:-}" ] && HAMGIT_REGISTRY_TOKEN=$(grep -E '^[[:space:]]*HAMGIT_REGISTRY_TOKEN=' .env | cut -d '=' -f2- | tr -d '"'\'' ') || true
fi

# 官方公开主仓库常量 (GitHub)
REPO_HOST="github.com"
REPO_NAME="wangyan/douhang"
REPO_URL="https://${REPO_HOST}/${REPO_NAME}"

# 官方公开国内镜像仓常量 (AtomGit - 内置无需额外配置 URL)
ATOMGIT_HOST="atomgit.com"
ATOMGIT_REPO="wang_yan/douhang"
ATOMGIT_URL="https://${ATOMGIT_HOST}/${ATOMGIT_REPO}"
ATOMGIT_API_URL="https://api.atomgit.com/api/v5/repos/${ATOMGIT_REPO}/releases"

# 从 HAMGIT_REPO_URL 智能提取 Host 与 Repo（若配置）
HAMGIT_GIT_HOST=""
HAMGIT_REPO_NAME=""
if [ -n "${HAMGIT_REPO_URL:-}" ]; then
  read -r hamgit_url_host hamgit_url_repo <<<"$(parse_git_url "$HAMGIT_REPO_URL")"
  HAMGIT_GIT_HOST="$hamgit_url_host"
  HAMGIT_REPO_NAME="$hamgit_url_repo"
fi

[[ -n "${GITHUB_TOKEN:-}" ]] || fail "未在环境变量或 .env 中找到 GITHUB_TOKEN（需具备 GitHub 仓库 Contents: Read & write 权限）"
if [[ "${BUILD_IMAGE_LOCAL:-0}" -eq 1 ]]; then
  [[ -n "${GHCR_TOKEN:-}" ]] || fail "启用本地镜像构建时，未在环境变量或 .env 中找到 GHCR_TOKEN（需具备 write:packages 权限）"
fi

current_version=$(node -p "require('./package.json').version")
if [[ $release_mode =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  next_version=$release_mode
else
  IFS='.' read -r major minor patch <<<"$current_version"
  case "$release_mode" in
    patch) next_version="$major.$minor.$((patch + 1))" ;;
    minor) next_version="$major.$((minor + 1)).0" ;;
    major) next_version="$((major + 1)).0.0" ;;
    *) fail "无效版本参数：$release_mode（支持 patch / minor / major 或显式版本号如 1.0.0）" ;;
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

node - "$tag" <<'NODE'
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

if [[ "${BUILD_IMAGE_LOCAL:-0}" -eq 1 ]]; then
  printf '==> 发布 %s：本地多架构镜像构建并推送到 GHCR\n' "$tag"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-wangyan}" --password-stdin
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --provenance=false \
    -t "ghcr.io/wangyan/douhang:$tag" \
    -t "ghcr.io/wangyan/douhang:latest" \
    --push .
else
  printf '==> 发布 %s：多架构容器镜像将由 GitHub Actions 自动构建并推送到 GHCR\n' "$tag"
fi

printf '==> 发布 %s：推送 Git\n' "$tag"
git push origin main "$tag"

if [ -n "${ATOMGIT_TOKEN:-}" ]; then
  printf '==> 发布 %s：推送 AtomGit 官方国内镜像仓\n' "$tag"
  GIT_TERMINAL_PROMPT=0 git \
    -c "http.extraheader=Authorization: Bearer ${ATOMGIT_TOKEN}" \
    push "https://${ATOMGIT_HOST}/${ATOMGIT_REPO}.git" main "$tag" 2>/dev/null || \
  GIT_TERMINAL_PROMPT=0 git \
    -c "http.extraheader=Authorization: Basic $(printf "oauth2:%s" "$ATOMGIT_TOKEN" | base64 | tr -d '\n')" \
    push "https://${ATOMGIT_HOST}/${ATOMGIT_REPO}.git" main "$tag" || {
    echo "警告：AtomGit Git 仓库推送失败" >&2
  }
fi

if [ -n "${HAMGIT_REPO_URL:-}" ]; then
  printf '==> 发布 %s：同步推送国内 HamGit 仓库\n' "$tag"
  git push "$HAMGIT_REPO_URL" main "$tag" || {
    echo "警告：国内 HamGit 仓库推送失败，但主仓库已推送" >&2
  }
fi

printf '==> 发布 %s：创建 GitHub Release\n' "$tag"
api_url="https://api.github.com/repos/${REPO_NAME}/releases"
auth_header="Authorization: Bearer $GITHUB_TOKEN"
payload=$(node -e 'const fs=require("node:fs");process.stdout.write(JSON.stringify({tag_name:process.argv[1],name:process.argv[1],body:fs.readFileSync(process.argv[2],"utf8").trimEnd(),target_commitish:"main",draft:false,prerelease:false}))' "$tag" "$release_notes")
resp_file=$(mktemp)
http_code=$(curl --silent --show-error -o "$resp_file" -w '%{http_code}' \
  -X POST \
  -H "$auth_header" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  "$api_url" \
  --data-binary "$payload") || true

if [[ $http_code != 200 && $http_code != 201 ]]; then
  cat "$resp_file" >&2 || true
  rm -f "$resp_file"
  rm -f "$release_notes"
  fail "GitHub Release 创建失败（HTTP $http_code），请手动创建：https://${REPO_HOST}/${REPO_NAME}/releases/new?tag=$tag"
fi
rm -f "$resp_file"
echo "GitHub Release 已创建：https://${REPO_HOST}/${REPO_NAME}/releases/tag/$tag"

# 同步创建官方 AtomGit Release
if [ -n "${ATOMGIT_TOKEN:-}" ]; then
  printf '==> 发布 %s：创建 AtomGit Release\n' "$tag"
  atomgit_resp=$(mktemp)
  atomgit_code=$(curl --silent --show-error -o "$atomgit_resp" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer $ATOMGIT_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "$ATOMGIT_API_URL" \
    --data-binary "$payload") || true

  if [[ $atomgit_code == 200 || $atomgit_code == 201 ]]; then
    echo "AtomGit Release 已创建：${ATOMGIT_URL}/releases"
  else
    echo "警告：AtomGit Release 创建失败（HTTP $atomgit_code）" >&2
  fi
  rm -f "$atomgit_resp"
fi

# 同步创建国内 HamGit 平台 Release（若已配置 HamGit 凭据）
if [ -n "${HAMGIT_GIT_HOST:-}" ] && [ -n "${HAMGIT_REPO_TOKEN:-}" ]; then
  printf '==> 发布 %s：同步创建国内 HamGit Release\n' "$tag"
  hamgit_api_url="https://$HAMGIT_GIT_HOST/api/v1/repos/$HAMGIT_REPO_NAME/releases"
  hamgit_resp_file=$(mktemp)
  hamgit_http_code=$(curl --silent --show-error -o "$hamgit_resp_file" -w '%{http_code}' \
    -X POST \
    -H "Authorization: token $HAMGIT_REPO_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "$hamgit_api_url" \
    --data-binary "$payload") || true

  if [[ $hamgit_http_code == 200 || $hamgit_http_code == 201 ]]; then
    echo "国内 HamGit Release 已创建：https://$HAMGIT_GIT_HOST/$HAMGIT_REPO_NAME/releases/tag/$tag"
  else
    echo "警告：国内 HamGit Release 创建失败（HTTP $hamgit_http_code）" >&2
  fi
  rm -f "$hamgit_resp_file"
fi

rm -f "$release_notes"

printf '==> %s 发布完成！\n' "$tag"
printf '    • 代码已推送并已在各代码平台创建 Release\n'
printf '    • GitHub Actions 正在云端构建并发布 GHCR 多架构镜像\n'
printf '    • 如需同步至 Docker Hub 或 HamGit 镜像库，可运行：npm run image:sync\n'
printf '    • 全量同步所有历史版本镜像可运行：npm run image:sync full\n'
