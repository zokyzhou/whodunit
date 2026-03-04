/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/skill.md', destination: '/api/protocol/skill' },
      { source: '/heartbeat.md', destination: '/api/protocol/heartbeat' },
      { source: '/skill.json', destination: '/api/protocol/skill-json' },
    ];
  },
};

module.exports = nextConfig;
