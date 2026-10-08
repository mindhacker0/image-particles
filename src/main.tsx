import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Material Design Lite 的 CSS 随 npm 包发布，项目自身的样式紧随其后
import 'material-design-lite/dist/material.brown-teal.min.css'
import '../css/main.css'
import App from './App'

/**
 * 应用启动入口。
 *
 * 引擎接线位于 `src/legacy/`：
 *   twixLegacy.ts       基于 fetch 的 ajax 助手
 *   loadLegacyEngine.ts 顺序、仅一次的加载器
 */
const container = document.getElementById('react-root')

if (!container) {
  throw new Error('Missing #react-root mount point in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
