/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack: (config) => {
    // Fix CSS processing for custom properties
    const cssRule = config.module.rules.find(
      (rule) => rule.test && rule.test.toString().includes('css')
    );
    
    if (cssRule) {
      cssRule.use = cssRule.use.map((loader) => {
        if (typeof loader === 'object' && loader.loader && loader.loader.includes('css-loader')) {
          return {
            ...loader,
            options: {
              ...loader.options,
              importLoaders: 1,
            },
          };
        }
        return loader;
      });
    }
    
    return config;
  },
};

export default nextConfig;
