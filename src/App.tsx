import { useState, useEffect } from 'react'
import { Card, Button, Typography, Space, Alert, Spin, Descriptions, message } from 'antd'
import { WifiOutlined, ReloadOutlined } from '@ant-design/icons'
import './App.css'
import StunClient from './utils/stunClient'

const { Title, Text } = Typography

// 格式化NAT类型名称
const formatNATType = (type: string): string => {
  switch (type) {
    case 'Full Cone or Restricted Cone':
      return '全锥型/受限锥型NAT';
    case 'Restricted Cone':
      return '受限锥型NAT';
    case 'Symmetric NAT':
      return '对称型NAT（可STUN，但P2P困难）';
    case 'Port Restricted':
      return '端口受限型NAT';
    case 'Unknown':
      return '受限网络（可STUN通信）';
    default:
      return type || '未知';
  }
}

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
                  <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    <Card size="small" title="基本信息">
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

                    {networkDetails.details && (
                      <>
                        {/* IPv4检测结果 */}
                        <Card size="small" title="IPv4 检测结果">
                          <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="UDP NAT类型">
                              {networkDetails.details.ipv4?.udp ? (
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <Text strong>{formatNATType(networkDetails.details.ipv4.udp.type)}</Text>
                                  {networkDetails.details.ipv4.udp.mappedAddresses.length > 0 && (
                                    <div style={{ marginTop: '8px' }}>
                                      <Text type="secondary" style={{ fontSize: '12px' }}>映射地址：</Text>
                                      {networkDetails.details.ipv4.udp.mappedAddresses.map((addr: any, idx: number) => (
                                        <div key={idx} style={{ fontSize: '12px', marginLeft: '16px' }}>
                                          {addr.server}: {addr.ip}:{addr.port}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Space>
                              ) : (
                                <Text type="secondary">未检测到</Text>
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="UDP连接能力">
                              {networkDetails.details.ipv4?.udpCanConnect ? (
                                <Text type="success">可连接</Text>
                              ) : (
                                <Text type="secondary">不可连接</Text>
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="TCP NAT类型">
                              {networkDetails.details.ipv4?.tcp ? (
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <Text strong>{formatNATType(networkDetails.details.ipv4.tcp.type)}</Text>
                                  {networkDetails.details.ipv4.tcp.mappedAddresses.length > 0 && (
                                    <div style={{ marginTop: '8px' }}>
                                      <Text type="secondary" style={{ fontSize: '12px' }}>映射地址：</Text>
                                      {networkDetails.details.ipv4.tcp.mappedAddresses.map((addr: any, idx: number) => (
                                        <div key={idx} style={{ fontSize: '12px', marginLeft: '16px' }}>
                                          {addr.server}: {addr.ip}:{addr.port}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Space>
                              ) : (
                                <Text type="secondary">未检测到</Text>
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="TCP连接能力">
                              {networkDetails.details.ipv4?.tcpCanConnect ? (
                                <Text type="success">可连接</Text>
                              ) : (
                                <Text type="secondary">不可连接</Text>
                              )}
                            </Descriptions.Item>
                          </Descriptions>
                        </Card>

                        {/* IPv6检测结果 */}
                        <Card size="small" title="IPv6 检测结果">
                          <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="UDP NAT类型">
                              {networkDetails.details.ipv6?.udp ? (
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <Text strong>{formatNATType(networkDetails.details.ipv6.udp.type)}</Text>
                                  {networkDetails.details.ipv6.udp.mappedAddresses.length > 0 && (
                                    <div style={{ marginTop: '8px' }}>
                                      <Text type="secondary" style={{ fontSize: '12px' }}>映射地址：</Text>
                                      {networkDetails.details.ipv6.udp.mappedAddresses.map((addr: any, idx: number) => (
                                        <div key={idx} style={{ fontSize: '12px', marginLeft: '16px' }}>
                                          {addr.server}: {addr.ip}:{addr.port}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Space>
                              ) : (
                                <Text type="secondary">未检测到</Text>
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="UDP连接能力">
                              {networkDetails.details.ipv6?.udpCanConnect ? (
                                <Text type="success">可连接</Text>
                              ) : (
                                <Text type="secondary">不可连接</Text>
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="TCP NAT类型">
                              {networkDetails.details.ipv6?.tcp ? (
                                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                  <Text strong>{formatNATType(networkDetails.details.ipv6.tcp.type)}</Text>
                                  {networkDetails.details.ipv6.tcp.mappedAddresses.length > 0 && (
                                    <div style={{ marginTop: '8px' }}>
                                      <Text type="secondary" style={{ fontSize: '12px' }}>映射地址：</Text>
                                      {networkDetails.details.ipv6.tcp.mappedAddresses.map((addr: any, idx: number) => (
                                        <div key={idx} style={{ fontSize: '12px', marginLeft: '16px' }}>
                                          {addr.server}: {addr.ip}:{addr.port}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </Space>
                              ) : (
                                <Text type="secondary">未检测到</Text>
                              )}
                            </Descriptions.Item>
                            <Descriptions.Item label="TCP连接能力">
                              {networkDetails.details.ipv6?.tcpCanConnect ? (
                                <Text type="success">可连接</Text>
                              ) : (
                                <Text type="secondary">不可连接</Text>
                              )}
                            </Descriptions.Item>
                          </Descriptions>
                        </Card>

                        {/* 连通性测试结果 */}
                        {networkDetails.details?.speedTest && (
                          <Card size="small" title="连通性测试">
                            <Descriptions column={1} size="small" bordered>
                              <Descriptions.Item label="测试状态">
                                {networkDetails.details.speedTest.status === 'success' ? (
                                  <Text type="success">成功</Text>
                                ) : (
                                  <Text type="error">失败</Text>
                                )}
                              </Descriptions.Item>
                              <Descriptions.Item label="连接建立时间">
                                {networkDetails.details.speedTest.connectionTime} ms
                              </Descriptions.Item>
                              <Descriptions.Item label="延迟 (RTT)">
                                {networkDetails.details.speedTest.latency > 0 ? (
                                  <Text>{networkDetails.details.speedTest.latency} ms</Text>
                                ) : (
                                  <Text type="secondary">未测量</Text>
                                )}
                              </Descriptions.Item>
                              <Descriptions.Item label="吞吐量">
                                {networkDetails.details.speedTest.throughput > 0 ? (
                                  <Text>{networkDetails.details.speedTest.throughput} KB/s</Text>
                                ) : (
                                  <Text type="secondary">未测量</Text>
                                )}
                              </Descriptions.Item>
                              <Descriptions.Item label="丢包率">
                                {networkDetails.details.speedTest.packetLoss >= 0 ? (
                                  <Text type={networkDetails.details.speedTest.packetLoss > 10 ? 'warning' : 'success'}>
                                    {networkDetails.details.speedTest.packetLoss}%
                                  </Text>
                                ) : (
                                  <Text type="secondary">未测量</Text>
                                )}
                              </Descriptions.Item>
                              <Descriptions.Item label="数据包统计">
                                <Text>
                                  发送: {networkDetails.details.speedTest.packetsSent} 个, 
                                  接收: {networkDetails.details.speedTest.packetsReceived} 个
                                </Text>
                              </Descriptions.Item>
                            </Descriptions>
                          </Card>
                        )}
                      </>
                    )}
                  </Space>
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
