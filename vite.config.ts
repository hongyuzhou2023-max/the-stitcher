import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = __dirname
const devHtmlPath = path.resolve(root, 'dev/index.html')

/**
 * 根目录 index.html 是给设计师双击的自包含成品（IIFE）。
 * 开发时拦截 /，改用 dev/index.html 走 Vite 热更新。
 */
function serveDevHtml() {
  return {
    name: 'serve-dev-html',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/' && url !== '/index.html') {
          next()
          return
        }
        try {
          let html = fs.readFileSync(devHtmlPath, 'utf8')
          html = html.replace('../src/main.tsx', '/src/main.tsx')
          html = await server.transformIndexHtml(url || '/', html)
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.statusCode = 200
          res.end(html)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveDevHtml()],
  publicDir: 'public',
  server: {
    fs: { allow: [root] },
  },
})
