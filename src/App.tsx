import { useState } from 'react'
import { Card, Button, Typography, Space, Alert, Spin, Descriptions, message } from 'antd'
import { WifiOutlined, ReloadOutlined } from '@ant-design/icons'
import './App.css'
import StunClient from './utils/stunClient'

const { Title, Text } = Typography

function App() {
  const [isDetecting, setIsDetecting] = useState(false)
  const [networkType, setNetworkType] = useState<string>('')
  const [networkDetails, setNetworkDetails] = useState<any>(null)

  const detectNetworkType = async () => {
    setIsDetecting(true)
    setNetworkType('')
    setNetworkDetails(null)
    
    try {
      const stunClient = new StunClient()
      const detailedInfo = await stunClient.getDetailedNetworkInfo()
      
      setNetworkType(detailedInfo.type)
      setNetworkDetails({
        ...detailedInfo,
        stunServersReachable: detailedInfo.stunServers.filter(s => s.reachable).length
      })
      
      // 调用后端API记录检测结果
      try {
        await fetch('/api/detect-network', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            networkType: detailedInfo.type,
            publicIP: detailedInfo.publicIP,
            localIP: detailedInfo.localIP,
            natType: detailedInfo.natType,
            timestamp: new Date().toISOString()
          })
        });
      } catch (apiError) {
        console.warn('API调用失败，但前端检测已完成:', apiError);
      }
      
      message.success('网络检测完成');
    } catch (error) {
      console.error('网络检测失败:', error)
      setNetworkType('检测失败')
      message.error('网络检测失败');
    } finally {
      setIsDetecting(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Title level={2}>
              <WifiOutlined /> 网络类型检测工具
            </Title>
            <Text type="secondary">
              检测您的网络类型，包括公网型网络、全锥型NAT、受限网络和防火墙阻断网络
            </Text>
          </Space>
        </Card>

        <Card>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Button 
              type="primary" 
              size="large"
              onClick={detectNetworkType}
              loading={isDetecting}
              icon={<ReloadOutlined />}
            >
              开始检测网络类型
            </Button>

            {isDetecting && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin size="large" />
                <div style={{ marginTop: '10px' }}>
                  <Text>正在检测网络类型...</Text>
                </div>
              </div>
            )}

            {networkType && !isDetecting && (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Alert
                  message={`检测结果：${networkType}`}
                  type={
                    networkType === '公网型网络' ? 'success' :
                    networkType === '全锥型NAT' ? 'info' :
                    networkType === '受限网络' ? 'warning' : 'error'
                  }
                  showIcon
                />
                
                {networkDetails && (
                  <Card size="small" title="详细信息">
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="网络类型">
                        <Text strong>{networkDetails.type}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="公网IP">
                        {networkDetails.publicIP || '未检测到'}
                      </Descriptions.Item>
                      <Descriptions.Item label="本地IP">
                        {networkDetails.localIP || '未检测到'}
                      </Descriptions.Item>
                      <Descriptions.Item label="STUN服务器可达">
                        {networkDetails.stunServersReachable} / {networkDetails.stunServers.length} 个
                      </Descriptions.Item>
                      <Descriptions.Item label="检测时间">
                        {new Date().toLocaleString()}
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </Space>
            )}
          </Space>
        </Card>

        <Card title="网络类型说明">
          <Space orientation="vertical" size="small">
            <Text strong>公网型网络</Text>
            <Text type="secondary">您的设备拥有公网IP地址，可以直接被外部访问</Text>
            
            <Text strong>全锥型NAT</Text>
            <Text type="secondary">外部设备可以通过任何端口访问您的设备</Text>
            
            <Text strong>受限网络</Text>
            <Text type="secondary">包括受限锥型NAT、端口受限锥型NAT、对称型NAT和VPN/代理网络</Text>
            
            <Text strong>防火墙阻断网络</Text>
            <Text type="secondary">网络连接被防火墙完全阻断</Text>
          </Space>
        </Card>
      </Space>
    </div>
  )
}

export default App
