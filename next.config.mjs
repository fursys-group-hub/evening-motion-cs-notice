/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // 첫 화면은 정적 안내사항 페이지(public/notice.html) 한 장이다
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/notice.html' }] };
  },
};

export default nextConfig;
