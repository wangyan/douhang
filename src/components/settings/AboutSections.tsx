import 'server-only';

import { Button } from '@astryxdesign/core/Button';
import {
  MetadataList,
  MetadataListItem,
} from '@astryxdesign/core/MetadataList';
import { Text } from '@astryxdesign/core/Text';
import { version as PRISMA_VERSION } from '@prisma/client/package.json';
import {
  Container,
  ExternalLink,
  GitBranch,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { version as NEXT_VERSION } from 'next/package.json';
import { ChangelogTimeline } from '@/components/layout/ChangelogTimeline';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ICON_SIZE } from '@/lib/design-tokens';
import {
  ADMIN_GUIDE_URL,
  APP_VERSION,
  DEPLOYMENT_GUIDE_URL,
  DOCKERHUB_URL,
  REPO_URL,
} from '@/lib/version';

/** 官方项目与技术文档快速入口。 */
export function AboutResourceLinks() {
  return (
    <div className="about-resource-links flex flex-wrap items-center gap-2">
      <Button
        label="项目主页"
        icon={<GitBranch size={ICON_SIZE.sm} />}
        variant="secondary"
        size="sm"
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
      />
      <Button
        label="容器镜像"
        icon={<Container size={ICON_SIZE.sm} />}
        variant="secondary"
        size="sm"
        href={DOCKERHUB_URL}
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
  );
}

/** 基于 CHANGELOG 构建产物展示版本发布亮点。 */
export function AboutChangelog({ releasesUrl }: { releasesUrl: string }) {
  return (
    <SettingsSection
      title="更新日志"
      description="版本发布亮点与历史记录"
      actions={
        <Button
          label="完整更新日志"
          icon={<ExternalLink size={ICON_SIZE.sm} />}
          variant="ghost"
          size="sm"
          href={releasesUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <ChangelogTimeline />
    </SettingsSection>
  );
}

/** 服务端运行环境与已安装的核心组件版本。 */
export function AboutSystemInfo() {
  const specs = [
    { label: '核心版本', value: `v${APP_VERSION}` },
    { label: 'Node.js 运行时', value: process.version },
    { label: 'Web 框架', value: `Next.js ${NEXT_VERSION}` },
    { label: '数据引擎', value: `SQLite / LibSQL / Prisma ${PRISMA_VERSION}` },
    { label: '平台架构', value: `${process.platform} (${process.arch})` },
    {
      label: '运行模式',
      value:
        process.env.NODE_ENV === 'production'
          ? '生产环境（Production）'
          : '开发环境（Development）',
    },
  ];

  return (
    <SettingsSection
      title="运行环境"
      description="当前实例运行平台与核心组件规格"
    >
      <MetadataList
        columns="single"
        label={{ position: 'start', width: '8rem' }}
      >
        {specs.map((item) => (
          <MetadataListItem key={item.label} label={item.label}>
            <Text size="sm" className="font-mono break-words">
              {item.value}
            </Text>
          </MetadataListItem>
        ))}
      </MetadataList>
    </SettingsSection>
  );
}
