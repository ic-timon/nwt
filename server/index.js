const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 - 提供前端构建文件
app.use(express.static(path.join(__dirname, '../dist')));

// API路由 - 网络检测接口
app.post('/api/detect-network', async (req, res) => {
  try {
    // 这里可以添加服务器端的网络检测逻辑
    // 目前直接返回前端检测的结果
    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        type: '服务器端检测待实现',
        message: '前端网络检测功能已实现，服务器端检测逻辑待扩展'
      }
    };
    
    res.json(result);
  } catch (error) {
    console.error('网络检测API错误:', error);
    res.status(500).json({
      success: false,
      error: '网络检测失败'
    });
  }
});

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 默认路由 - 提供前端应用
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`访问地址: http://localhost:${PORT}`);
});