/**
 * 打包为单个可双击打开的 index.html（IIFE，无 ES module，兼容 file://）
 */
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outHtml = path.join(root, 'index.html')

const cssInjectPlugin = {
  name: 'css-inject',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, 'utf8')
      return {
        contents: `
          (() => {
            const style = document.createElement('style');
            style.textContent = ${JSON.stringify(css)};
            document.head.appendChild(style);
          })();
        `,
        loader: 'js',
      }
    })
  },
}

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  loader: {
    '.png': 'dataurl',
    '.jpg': 'dataurl',
    '.jpeg': 'dataurl',
    '.gif': 'dataurl',
    '.svg': 'dataurl',
    '.webp': 'dataurl',
  },
  plugins: [cssInjectPlugin],
  logLevel: 'info',
})

const js = result.outputFiles[0]?.text
if (!js) {
  console.error('打包失败：未生成 JS')
  process.exit(1)
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<title>拼图圣手 The Stitcher</title>
<style>
  html,body,#root{margin:0;height:100%;background:#0e0f12;color:#e8eaed}
  html[data-theme="light"],html[data-theme="light"] body,html[data-theme="light"] #root{background:#edf3f5;color:#1f2f38}
</style>
<script>
try{var __t=localStorage.getItem('stitcher_theme_v1');if(__t==='light'||__t==='dark')document.documentElement.setAttribute('data-theme',__t)}catch(e){}
</script>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
</body>
</html>
`

await fs.promises.writeFile(outHtml, html, 'utf8')
const sizeMb = (Buffer.byteLength(html, 'utf8') / (1024 * 1024)).toFixed(2)
console.log(`已生成可双击打开的文件: ${outHtml} (${sizeMb} MB)`)
