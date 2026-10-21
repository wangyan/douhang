import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Prisma 与 libsql 含原生模块，交给运行时 require，不参与打包
  serverExternalPackages: ['@prisma/client', '@libsql/client'],
  // 离线安装包一律按附件下载：浏览器不得将其作为页面导航处理，
  // 否则安装包缺失时低版本内核会落到 404 页面并再次触发版本拦截
  async headers() {
    return [
      {
        source: '/browsers/:path*',
        headers: [
          { key: 'Content-Disposition', value: 'attachment' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
