/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Permite CORS da extensão Chrome e do WhatsApp Web
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-SF-Access-Token, X-SF-Instance-Url' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
