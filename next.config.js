const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remotion's bundler/renderer are Node-only (native binaries, esbuild, rspack).
  // Keep them out of the webpack bundle so they're required at runtime instead.
  experimental: {
    serverComponentsExternalPackages: [
      '@remotion/bundler',
      '@remotion/renderer',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  async redirects() {
    return [
      { source: '/bpi', destination: '/smm/bpi', permanent: true },
      { source: '/bpi/social', destination: '/smm/bpi/social', permanent: true },
      { source: '/bsi', destination: '/smm/bsi', permanent: true },
      { source: '/bsi/social', destination: '/smm/bsi/social', permanent: true },
    ]
  },
}

module.exports = nextConfig
