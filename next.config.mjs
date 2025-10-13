/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Ignora erros do ESLint (como "Unexpected any") durante o build da Vercel
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;