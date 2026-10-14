import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import {
  BookOpen,
  Container,
  ExternalLink,
  GitBranch,
  GitFork,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { ChangelogTimeline } from '@/components/layout/ChangelogTimeline';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  ADMIN_GUIDE_URL,
  APP_VERSION,
  ATOMGIT_URL,
  DEPLOYMENT_GUIDE_URL,
  DOCKERHUB_URL,
  REPO_URL,
  USER_GUIDE_URL,
} from '@/lib/version';

/**
 * 关于页顶部品牌卡片
 *
 * 展示官方品牌标识、版本号、产品定位描述与核心仓库、镜像及文档入口。
 */
export function AboutHero() {
  return (
    <Card padding={6} elevation="low">
      <VStack gap={5}>
        <HStack gap={5} align="center">
          <div className="shrink-0 overflow-hidden rounded-widget ring-1 ring-border/80 shadow-sm">
            <BrandMark size="xl" aria-label="斗航（DouHang）" />
          </div>
          <VStack gap={1.5} className="min-w-0 flex-1">
            <HStack gap={2} align="center" className="flex-wrap">
              <Text
                as="h1"
                style={{
                  fontSize: '1.375rem',
                  fontWeight: 700,
                  lineHeight: '1.75rem',
                }}
                className="text-primary tracking-tight"
              >
                斗航（DouHang）
              </Text>
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-accent border border-accent/20">
                v{APP_VERSION}
              </span>
            </HStack>
            <Text size="sm" color="secondary" className="leading-relaxed">
              面向局域网与私有云的高颜值自托管网址导航站，轻量高效，原生容器化部署，离线可用。
            </Text>
          </VStack>
        </HStack>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Button
            label="GitHub"
            icon={<GitBranch size={ICON_SIZE.sm} />}
            variant="secondary"
            size="sm"
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
          <Button
            label="AtomGit"
            icon={<GitFork size={ICON_SIZE.sm} />}
            variant="secondary"
            size="sm"
            href={ATOMGIT_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
          <Button
            label="Docker Hub"
            icon={<Container size={ICON_SIZE.sm} />}
            variant="secondary"
            size="sm"
            href={DOCKERHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
          <Button
            label="用户指南"
            icon={<BookOpen size={ICON_SIZE.sm} />}
            variant="secondary"
            size="sm"
            href={USER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
          <Button
            label="管理指南"
            icon={<ShieldCheck size={ICON_SIZE.sm} />}
            variant="secondary"
            size="sm"
            href={ADMIN_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
          <Button
            label="部署文档"
            icon={<Server size={ICON_SIZE.sm} />}
            variant="secondary"
            size="sm"
            href={DEPLOYMENT_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </VStack>
    </Card>
  );
}

/**
 * 版本历史与更新日志区块
 *
 * 基于 CHANGELOG 构建产物渲染内置亮点，支持版本手风琴折叠。
 */
export function AboutChangelog({ releasesUrl }: { releasesUrl: string }) {
  return (
    <SettingsSection
      title="更新日志"
      description="内置版本发布亮点与历史记录"
      actions={
        <Button
          label="完整更新日志"
          icon={<ExternalLink size={ICON_SIZE.xs} />}
          variant="ghost"
          size="sm"
          href={releasesUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <div className="max-h-[520px] overflow-y-auto pr-1">
        <ChangelogTimeline />
      </div>
    </SettingsSection>
  );
}

interface SystemSpec {
  label: string;
  value: string;
}

/**
 * 运行环境与规格区块
 *
 * 汇总当前实例 Node 运行时、Next.js 框架、持久层数据库与系统架构信息。
 */
export function AboutSystemInfo() {
  const specs: SystemSpec[] = [
    { label: '核心版本', value: `v${APP_VERSION}` },
    { label: 'Node.js 运行时', value: process.version },
    { label: 'Web 框架', value: 'Next.js 16 (Turbopack)' },
    { label: '数据引擎', value: 'SQLite (LibSQL + Prisma 7)' },
    { label: '平台架构', value: `${process.platform} (${process.arch})` },
    {
      label: '运行模式',
      value:
        process.env.NODE_ENV === 'production'
          ? '生产环境 (Production)'
          : '开发环境 (Development)',
    },
  ];

  return (
    <SettingsSection
      title="运行环境"
      description="当前实例运行平台与核心组件规格"
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {specs.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1 rounded-control border border-border/60 bg-neutral/30 px-3 py-2.5"
          >
            <span className="text-xs text-secondary">{item.label}</span>
            <span className="font-mono text-sm font-medium text-primary break-all">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
