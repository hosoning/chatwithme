# chatwithme

tarot-wechat-pwa/
├── index.html
├── style.css
├── manifest.json
├── sw.js
├── icons/ (自行放 192x192 / 512x512 图标)
└── js/
    ├── tarot.js       // 78张塔罗牌数据 + 抽牌逻辑
    ├── wordcards.js   // 字卡 CRUD（localStorage）
    ├── ai.js          // AI 理解/决策逻辑（本地兜底 + 大模型接口预留）
    └── app.js         // 主程序：UI 渲染 + 交互 + 状态管理