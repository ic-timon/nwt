import { useState, useEffect } from 'react'
import { Card, Button, Typography, Space, Alert, Spin, Descriptions, message } from 'antd'
import { WifiOutlined, ReloadOutlined } from '@ant-design/icons'
import './App.css'
import StunClient from './utils/stunClient'

const { Title, Text } = Typography

function App() {
  const [isDetecting, setIsDetecting] = useState(false)
  const [networkType, setNetworkType] = useState<string>('')
  const [networkDetails, setNetworkDetails] = useState<any>(null)

  useEffect(() => {
    detectNetworkType()
  }, [])

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
                  title={`检测结果：${networkType}`}
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


      </Space>
    </div>
  )
}

export default App
