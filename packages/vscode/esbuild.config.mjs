import esbuild from 'esbuild';

const prod = process.argv.includes('production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  sourcemap: !prod,
  minify: prod,
  target: 'es2022',
  logLevel: 'info',
};

// Extension host bundle
const extensionConfig = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
};

// Webview bundle
const webviewConfig = {
  ...shared,
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  define: {
    'process.env.NODE_ENV': prod ? '"production"' : '"development"',
  },
};

if (watch) {
  const extCtx = await esbuild.context(extensionConfig);
  const webCtx = await esbuild.context(webviewConfig);
  await Promise.all([extCtx.watch(), webCtx.watch()]);
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
  ]);
}
