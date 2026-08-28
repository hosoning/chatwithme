# 隔离性检查 - 微信 PWA 与钱包系统

## ✅ 验证项目

### 1. 文件隔离
- ✅ wallet.html 是独立的 HTML 文件
- ✅ wallet/ 目录是独立的钱包系统文件夹
- ✅ index.html（微信 PWA）未被修改
- ✅ js/ 目录（微信 PWA 脚本）未被修改
- ✅ style.css（微信 PWA 样式）未被修改

### 2. JavaScript 隔离
- ✅ wallet.html 使用内联 `<script>` 标签
- ✅ wallet.html 不加载任何微信 PWA 的 js 文件
- ✅ 没有全局变量污染
- ✅ 使用块级作用域（const/let），避免命名冲突
- ✅ 所有变量都在函数内部定义

### 3. CSS 隔离
- ✅ wallet.html 使用内联 `<style>` 标签
- ✅ 所有选择器都使用特定的类名（.container, .nav-bar, .wallet-item 等）
- ✅ 不使用通用选择器（* 或 body）修改全局样式
- ✅ 使用深色模式媒体查询（@media prefers-color-scheme）隔离

### 4. Service Worker 隔离
- ✅ Service Worker (sw.js) 只缓存微信 PWA 资源
- ✅ wallet.html 不在 sw.js 的预缓存列表中
- ✅ wallet.md 使用缓存破坏（?t=timestamp）防止 SW 缓存过期数据
- ✅ wallet.md 使用 cache: 'no-store' 强制从网络获取最新数据

### 5. PWA 配置隔离
- ✅ manifest.json 的 start_url 指向 index.html（微信 PWA）
- ✅ wallet.html 不在 manifest.json 中
- ✅ 安装 PWA 时启动的是微信应用，不会加载钱包系统

### 6. 数据存储隔离
- ✅ 微信 PWA 使用 localStorage key: "tarot_*"
- ✅ 钱包系统使用本地文件 wallet.md（不依赖 localStorage）
- ✅ 不存在数据冲突

### 7. URL 路由隔离
- ✅ 微信 PWA: `index.html`
- ✅ 钱包系统: `wallet.html`
- ✅ 两个独立的入口点，互不影响

## 🔒 安全措施

### 缓存防护
```javascript
// wallet.html 中的缓存破坏
fetch('wallet.md?t=' + Date.now(), { cache: 'no-store' })
```
- 时间戳 (?t=) 防止浏览器缓存
- cache: 'no-store' 强制从网络获取
- Service Worker 无法缓存过期数据

### 作用域隔离
```javascript
// 所有变量都在函数内
async function loadWallet() {
  let walletData = null;  // 局部变量，不污染全局
  // ...
}
```

### CSS 命名空间
```css
.container { /* 只影响 wallet.html 内的 container */ }
.nav-bar { /* 特定的钱包系统样式 */ }
```

## 📋 测试步骤

### 测试 1: 微信 PWA 正常运作
```bash
# 打开 index.html
open index.html
# ✅ 应该看到微信对话界面
# ✅ 所有功能正常
```

### 测试 2: 钱包系统正常运作
```bash
# 打开 wallet.html
open wallet.html
# ✅ 应该看到钱包仪表盘
# ✅ 显示余额、交易、愿望单
```

### 测试 3: 并行运作（两个标签页）
```bash
# 标签页1: index.html
# 标签页2: wallet.html
# ✅ 两个页面可以同时打开
# ✅ 切换时互不影响
# ✅ 数据独立
```

### 测试 4: Service Worker 缓存检查
```bash
# 浏览器开发者工具 → Application → Service Workers
# ✅ sw.js 只缓存微信 PWA 资源
# ✅ wallet.html 不在缓存中（或缓存会被时间戳破坏）
```

### 测试 5: 更新钱包数据后刷新
```bash
# 更新钱包数据
python wallet/wallet.py topup 100 "test"

# 在 wallet.html 中刷新
# ✅ 应该立即看到新数据（不依赖缓存）
```

## 🚨 已知限制

### 不会发生的问题
- ❌ 微信 PWA 会被覆盖 ✅ 不会
- ❌ 钱包数据会干扰聊天数据 ✅ 不会
- ❌ Service Worker 会缓存过期数据 ✅ 防护好了
- ❌ CSS 冲突 ✅ 命名隔离

### 可能的注意事项
- 用户需要手动切换页面 (可以在菜单里添加链接改善)
- wallet.md 依赖于 Python 脚本更新 (独立运作，不影响微信)
- 需要 HTTP 服务器运行两个页面 (都需要)

## 📊 文件依赖关系

```
index.html
├── js/ai.js
├── js/app.js
├── js/cloud.js
├── js/tarot.js
├── js/wordcards.js
├── style.css
├── sw.js (Service Worker)
└── manifest.json

wallet.html (独立)
├── 内联 CSS
├── 内联 JavaScript
└── 读取 wallet.md (外部文件，不与微信 PWA 共用)

wallet/ (后端系统)
├── wallet.py
└── wallet.db
```

## ✨ 结论

**完全安全隔离** ✅

- 微信 PWA 和钱包系统完全独立
- 不会互相干扰或造成 bug
- 可以放在同一个仓库安全运作
- 用户可以自由选择访问哪个应用
