import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Next.js 16 Proxy（原 middleware）
 * 首页无需登录即可访问；保护管理后台路由（如 /settings），未登录用户重定向到 /login
 * 排除：API、静态资源、登录页
 */
export const config = {
  matcher: [
    // 排除 api、静态资源、品牌图标/manifest/Service Worker（登录页也需加载）、离线页、低版本内核引导页、离线安装包目录、login 页本身
    '/((?!api|_next/static|_next/image|fonts|brand|icons|wallpapers|favicon.ico|icon.svg|apple-icon.png|opengraph-image.png|manifest.webmanifest|sw.js|offline.html|outdated.html|browsers|login).*)',
  ],
};

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;

  // 仅保护管理后台路由（/settings 及其子路由）
  if (pathname.startsWith('/settings')) {
    if (!isAuthed) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
});
