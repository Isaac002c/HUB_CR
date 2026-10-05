/** @type {import('next').NextConfig} */

// Em desenvolvimento: proxy para localhost:5000
// Em produção (Vercel): BACKEND_URL aponta para a API própria da CR Recursos.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const PUBLIC_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },

  async rewrites() {
    return [
      // Proxy todas as chamadas /api/* e /auth/* para o backend
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: '/auth/:path*',
        destination: `${BACKEND_URL}/auth/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              `connect-src 'self'${PUBLIC_BACKEND_URL ? ` ${PUBLIC_BACKEND_URL}` : ''}`,
              "frame-ancestors 'none'",
              "object-src 'none'",
            ].join('; '),
          },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
