# 网络类型检测工具 (Network Type Detection Tool)

一个基于WebRTC和STUN协议的现代化网络类型检测工具，能够准确识别用户的网络类型、公网IP、本地IP等信息。

## 🌟 功能特性

- **网络类型检测**: 自动检测网络类型（公网型、全锥型NAT、受限网络、防火墙阻断等）
- **详细网络信息**: 显示公网IP、本地IP、STUN服务器可达状态
- **实时检测**: 支持实时网络状态检测和更新
- **响应式设计**: 适配不同屏幕尺寸的设备
- **生产就绪**: 完整的前后端分离架构，支持生产环境部署

## 🛠️ 技术栈

### 前端
- **React 19** - 现代化前端框架
- **TypeScript** - 类型安全的JavaScript
- **Vite** - 快速构建工具
- **Ant Design 6.0** - 企业级UI组件库

### 后端
- **Express.js** - Node.js Web框架
- **CORS** - 跨域资源共享中间件

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
├── server/
│   ├── index.js             # Express服务器
│   └── package.json         # 服务器依赖
├── dist/                    # 构建输出目录
└── package.json             # 项目配置
```

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
# 安装前端依赖
npm install

# 安装服务器依赖
cd server && npm install
```

### 开发模式

```bash
# 启动开发服务器（前端）
npm run dev

# 启动开发服务器（后端）
npm run server:dev
```

开发服务器将在以下地址启动：
- 前端：http://localhost:5173
- 后端：http://localhost:8080

### 生产构建

```bash
# 构建前端应用
npm run build

# 启动生产服务器
npm run server
```

生产服务器将在 http://localhost:8080 启动

## 📡 API接口

### 健康检查
```http
GET /api/health
```

响应示例：
```json
{
  "status": "healthy",
  "timestamp": "2025-11-27T00:33:25.660Z",
  "version": "1.0.0"
}
```

### 网络检测
```http
POST /api/detect-network
```

请求体：
```json
{
  "networkType": "Full Cone",
  "publicIP": "123.123.123.123",
  "localIP": "192.168.1.100",
  "stunServers": [
    {"server": "stun1.l.google.com:19302", "reachable": true}
  ],
  "timestamp": "2025-11-27T00:33:25.660Z"
}
```

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

### 服务器端口配置
在 `server/index.js` 中可以修改服务器端口：

```javascript
const PORT = process.env.PORT || 8080;
```

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

2. **端口占用**
   - 修改服务器端口配置
   - 检查是否有其他服务占用端口

3. **CORS错误**
   - 确保前后端域名配置正确
   - 检查服务器CORS设置

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