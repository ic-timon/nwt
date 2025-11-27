# 网络类型检测工具 (Network Type Detection Tool)

一个基于WebRTC和STUN协议的现代化网络类型检测工具，能够准确识别用户的网络类型、公网IP、本地IP等信息。

## 🌟 功能特性

- **网络类型检测**: 自动检测网络类型（公网型、全锥型NAT、受限网络、防火墙阻断等）
- **详细网络信息**: 显示公网IP、本地IP、STUN服务器可达状态
- **实时检测**: 支持实时网络状态检测和更新
- **响应式设计**: 适配不同屏幕尺寸的设备
- **纯前端架构**: 无需服务器，可直接部署到静态托管平台

## 🛠️ 技术栈

### 前端
- **React 19** - 现代化前端框架
- **TypeScript** - 类型安全的JavaScript
- **Vite** - 快速构建工具
- **Ant Design 6.0** - 企业级UI组件库

### 架构特点
- **纯前端实现**: 所有网络检测逻辑在浏览器中执行
- **无服务器依赖**: 无需后端服务，部署简单

### 网络检测
- **WebRTC** - 实时通信技术
- **STUN协议** - NAT穿透协议
- **多STUN服务器** - 提高检测准确性

## 📦 项目结构

```
nwt/
├── src/
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # 应用入口
│   └── utils/
│       └── stunClient.ts    # STUN客户端工具类
├── dist/                    # 构建输出目录
└── package.json             # 项目配置
```

## 🚀 快速开始

### 环境要求
- Node.js 18+ (仅开发环境需要)
- npm 或 yarn (仅开发环境需要)

### 安装依赖

```bash
# 安装项目依赖
npm install
```

### 开发模式

```bash
# 启动开发服务器
npm run dev
```

开发服务器将在 http://localhost:5173 启动

### 生产构建

```bash
# 构建应用
npm run build

# 预览生产版本
npm run preview
```

预览服务器将在 http://localhost:4173 启动

### 静态部署

构建完成后，可将 `dist` 目录部署到任何静态托管服务：
- GitHub Pages
- Vercel
- Netlify
- 其他静态文件服务器

## 🔧 配置说明

### STUN服务器配置
在 `src/utils/stunClient.ts` 中可以配置使用的STUN服务器：

## 🔧 配置说明

### STUN服务器配置
在 `src/utils/stunClient.ts` 中可以配置使用的STUN服务器：

```typescript
const stunServers: StunServer[] = [
  { host: 'stun1.l.google.com', port: 19302 },
  { host: 'stun2.l.google.com', port: 19302 },
  { host: 'stun3.l.google.com', port: 19302 },
  { host: 'stun4.l.google.com', port: 19302 },
  { host: 'stun.voip.blackberry.com', port: 3478 }
];
```

### 开发服务器端口配置
在 `vite.config.ts` 中可以修改开发服务器端口：

## 🧪 检测原理

本工具使用WebRTC技术结合多个STUN服务器进行网络类型检测：

1. **公网IP检测**: 通过STUN服务器获取用户的公网IP地址
2. **本地IP检测**: 通过WebRTC的ICE候选机制获取本地IP
3. **NAT类型检测**: 
   - 测试多个STUN服务器的可达性
   - 分析网络连接模式
   - 判断NAT类型（全锥型、受限型等）
4. **防火墙检测**: 测试网络连接限制情况

## 📊 检测结果说明

- **公网型网络**: 直接连接到互联网，无NAT
- **全锥型NAT**: 允许外部任意IP和端口访问内部主机
- **受限网络**: 存在防火墙或NAT限制
- **防火墙阻断**: 网络连接被防火墙完全阻断

## 🐛 故障排除

### 常见问题

1. **检测失败**
   - 检查网络连接
   - 确认浏览器支持WebRTC
   - 检查防火墙设置
   - 尝试刷新页面重新检测

2. **STUN服务器不可达**
   - 某些STUN服务器可能被网络屏蔽
   - 尝试更换其他STUN服务器
   - 检查网络代理设置

### 调试模式

在浏览器开发者工具中查看控制台输出，获取详细的检测日志。

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目！

## 📄 许可证

MIT License

## 📞 联系方式

如有问题或建议，请通过以下方式联系：
- 提交GitHub Issue
- 发送邮件至项目维护者

---

**注意**: 本工具仅用于技术学习和网络诊断目的，请遵守相关法律法规和网络使用规范。