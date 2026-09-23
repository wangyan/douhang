import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Prisma 与 libsql 含原生模块，交给运行时 require，不参与打包
  serverExternalPackages: ['@prisma/client', '@libsql/client'],
};

export default nextConfig;
