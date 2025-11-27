/**
 * STUN客户端工具类
 * 用于检测网络类型：公网型网络、全锥型NAT、受限网络、防火墙阻断网络
 */

interface StunServer {
  url: string;
  host: string;
  port: number;
  name: string;
}

interface NATTypeResult {
  type: string;
  mappedAddresses: { ip: string; port: number; server: string }[];
}

interface SpeedTestResult {
  latency: number; // 延迟（ms）
  throughput: number; // 吞吐量（KB/s）
  packetLoss: number; // 丢包率（%）
  connectionTime: number; // 连接建立时间（ms）
  status: 'success' | 'failed';
  packetsSent: number;
  packetsReceived: number;
  // 映射地址标识
  mappedAddress: {
    ip: string;
    port: number;
    server: string;
    protocol: 'UDP' | 'TCP';
    ipVersion: 'IPv4' | 'IPv6';
  };
}

interface NetworkDetectionResult {
  type: string;
  details: {
    hasPublicIP: boolean;
    canReceiveFromAny: boolean;
    canConnectToStun: boolean;
    stunServersReachable: number;
    // IPv4检测结果
    ipv4: {
      udp: NATTypeResult | null;
      tcp: NATTypeResult | null;
      udpCanConnect: boolean;
      tcpCanConnect: boolean;
    };
    // IPv6检测结果
    ipv6: {
      udp: NATTypeResult | null;
      tcp: NATTypeResult | null;
      udpCanConnect: boolean;
      tcpCanConnect: boolean;
    };
    // 向后兼容的字段
    udpNatType: string;
    tcpNatType: string | null;
    udpCanConnect: boolean;
    tcpCanConnect: boolean;
    // 连通性和速度测试结果（为每个映射地址分别测试）
    speedTests: SpeedTestResult[];
  };
}

class StunClient {
  // 注意：为了更准确地检测NAT类型（特别是对称型NAT），建议使用至少2个不同的STUN服务器
  // 对称型NAT的检测需要比较不同服务器返回的映射端口是否一致
  private stunServers: StunServer[] = [
    { url: 'stun:stun.miwifi.com:3478', host: 'stun.miwifi.com', port: 3478, name: 'stun.miwifi.com' },
    { url: 'stun:stun.l.google.com:19302', host: 'stun.l.google.com', port: 19302, name: 'stun.l.google.com' },
  ];

  /**
   * 检测网络类型
   */
  async detectNetworkType(): Promise<NetworkDetectionResult> {
    // 实现网络类型检测逻辑
    // 1. 测试STUN服务器可达性
    const reachableServers = await this.testStunServers();
    
    // 2. 检测TCP和UDP连接能力
    const connectionResults = await Promise.all(
      this.stunServers.map(server => this.testStunServerConnection(server))
    );
    const udpCanConnect = connectionResults.some(r => r.udp);
    const tcpCanConnect = connectionResults.some(r => r.tcp);
    
    // 3. 检测公网IP
    const hasPublicIP = await this.detectPublicIP();
    
    // 4. 分别检测IPv4和IPv6的UDP和TCP NAT类型
    const [
      ipv4UdpResult,
      ipv4TcpResult,
      ipv6UdpResult,
      ipv6TcpResult
    ] = await Promise.all([
      this.detectIPv4UDPNATType(),
      this.detectIPv4TCPNATType(),
      this.detectIPv6UDPNATType(),
      this.detectIPv6TCPNATType()
    ]);

    // 5. 向后兼容：获取UDP和TCP的NAT类型（优先使用IPv4）
    const udpNatType = ipv4UdpResult?.type || ipv6UdpResult?.type || 'Unknown';
    const tcpNatType = ipv4TcpResult?.type || ipv6TcpResult?.type || null;
    
    // 6. 综合判断网络类型
    let networkType: string;
    
    if (reachableServers.length === 0) {
      networkType = '防火墙阻断网络';
    } else if (hasPublicIP && udpNatType === 'Unknown' && !tcpNatType) {
      // 检测到公网IP且没有NAT，判断为公网型网络
      networkType = '公网型网络';
    } else {
      // 根据UDP和TCP的NAT类型综合判断
      const udpType = this.formatNATType(udpNatType);
      const tcpType = tcpNatType ? this.formatNATType(tcpNatType) : null;
      
      if (tcpType && udpType !== tcpType) {
        // TCP和UDP的NAT类型不同 - 这解释了为什么BT（TCP）可以正常工作但WebRTC（UDP）可能受限
        networkType = `UDP ${udpType}，TCP ${tcpType}`;
        console.log(`检测到TCP和UDP NAT类型不同：UDP=${udpNatType}, TCP=${tcpNatType}`);
        console.log('这解释了为什么BT（TCP）可以正常工作，但WebRTC（UDP）可能受限');
      } else if (tcpType) {
        // TCP和UDP类型相同，或只有TCP检测成功
        networkType = `${tcpType}（TCP/UDP）`;
      } else {
        // 只有UDP检测成功（TCP检测失败或未检测到TCP srflx候选）
        networkType = `${udpType}（仅UDP检测）`;
        if (tcpCanConnect) {
          console.log('UDP NAT类型已检测，但TCP srflx候选未获取到（TCP可能使用不同的NAT策略）');
        }
      }
    }
    
    // 7. 确定IPv4和IPv6的连接能力
    const ipv4UdpCanConnect = ipv4UdpResult !== null;
    const ipv4TcpCanConnect = ipv4TcpResult !== null;
    const ipv6UdpCanConnect = ipv6UdpResult !== null;
    const ipv6TcpCanConnect = ipv6TcpResult !== null;
    
    // 8. 为每个检测到的映射地址分别执行连通性和速度测试
    const speedTests: SpeedTestResult[] = [];
    
    if (reachableServers.length > 0 && (udpCanConnect || tcpCanConnect)) {
      // 收集所有检测到的映射地址
      const mappedAddresses: Array<{
        ip: string;
        port: number;
        server: string;
        protocol: 'UDP' | 'TCP';
        ipVersion: 'IPv4' | 'IPv6';
      }> = [];

      // 收集IPv4 UDP映射地址
      if (ipv4UdpResult && ipv4UdpResult.mappedAddresses.length > 0) {
        ipv4UdpResult.mappedAddresses.forEach(addr => {
          mappedAddresses.push({
            ip: addr.ip,
            port: addr.port,
            server: addr.server,
            protocol: 'UDP',
            ipVersion: 'IPv4'
          });
        });
      }

      // 收集IPv4 TCP映射地址
      if (ipv4TcpResult && ipv4TcpResult.mappedAddresses.length > 0) {
        ipv4TcpResult.mappedAddresses.forEach(addr => {
          mappedAddresses.push({
            ip: addr.ip,
            port: addr.port,
            server: addr.server,
            protocol: 'TCP',
            ipVersion: 'IPv4'
          });
        });
      }

      // 收集IPv6 UDP映射地址
      if (ipv6UdpResult && ipv6UdpResult.mappedAddresses.length > 0) {
        ipv6UdpResult.mappedAddresses.forEach(addr => {
          mappedAddresses.push({
            ip: addr.ip,
            port: addr.port,
            server: addr.server,
            protocol: 'UDP',
            ipVersion: 'IPv6'
          });
        });
      }

      // 收集IPv6 TCP映射地址
      if (ipv6TcpResult && ipv6TcpResult.mappedAddresses.length > 0) {
        ipv6TcpResult.mappedAddresses.forEach(addr => {
          mappedAddresses.push({
            ip: addr.ip,
            port: addr.port,
            server: addr.server,
            protocol: 'TCP',
            ipVersion: 'IPv6'
          });
        });
      }

      console.log(`检测到 ${mappedAddresses.length} 个映射地址，开始分别进行测速测试...`);

      // 为每个映射地址执行测速（并行执行以提高效率）
      const speedTestPromises = mappedAddresses.map(async (mappedAddr) => {
        try {
          console.log(`开始为 ${mappedAddr.ip}:${mappedAddr.port} (${mappedAddr.ipVersion} ${mappedAddr.protocol}, ${mappedAddr.server}) 进行测速...`);
          const result = await this.performSpeedTest(mappedAddr);
          console.log(`测速完成: ${mappedAddr.ip}:${mappedAddr.port}`, result);
          return result;
        } catch (error) {
          console.error(`测速失败: ${mappedAddr.ip}:${mappedAddr.port}`, error);
          return {
            latency: 0,
            throughput: 0,
            packetLoss: 100,
            connectionTime: 0,
            status: 'failed' as const,
            packetsSent: 0,
            packetsReceived: 0,
            mappedAddress: mappedAddr
          };
        }
      });

      const results = await Promise.all(speedTestPromises);
      speedTests.push(...results);
      
      console.log(`所有测速测试完成，共 ${speedTests.length} 个结果`);
    }
    
    return {
      type: networkType,
      details: {
        hasPublicIP,
        canReceiveFromAny: udpNatType === 'Full Cone' || udpNatType === 'Full Cone or Restricted Cone',
        canConnectToStun: reachableServers.length > 0,
        stunServersReachable: reachableServers.length,
        // IPv4检测结果
        ipv4: {
          udp: ipv4UdpResult,
          tcp: ipv4TcpResult,
          udpCanConnect: ipv4UdpCanConnect,
          tcpCanConnect: ipv4TcpCanConnect
        },
        // IPv6检测结果
        ipv6: {
          udp: ipv6UdpResult,
          tcp: ipv6TcpResult,
          udpCanConnect: ipv6UdpCanConnect,
          tcpCanConnect: ipv6TcpCanConnect
        },
        // 向后兼容的字段
        udpNatType,
        tcpNatType,
        udpCanConnect,
        tcpCanConnect,
        // 连通性和速度测试结果（为每个映射地址分别测试）
        speedTests
      }
    };
  }

  /**
   * 格式化NAT类型名称
   */
  private formatNATType(natType: string): string {
    switch (natType) {
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
        return '受限网络（可STUN通信）';
    }
  }

  /**
   * 测试STUN服务器可达性
   */
  private async testStunServers(): Promise<StunServer[]> {
    const reachableServers: StunServer[] = [];
    
    for (const server of this.stunServers) {
      try {
        const isReachable = await this.testStunServer(server);
        if (isReachable) {
          reachableServers.push(server);
        }
      } catch (error) {
        console.warn(`STUN服务器 ${server.host} 不可达:`, error);
      }
    }
    
    return reachableServers;
  }

  /**
   * 测试单个STUN服务器的TCP和UDP连接能力
   */
  private async testStunServerConnection(server: StunServer): Promise<{ udp: boolean; tcp: boolean }> {
    return new Promise((resolve) => {
      let resolved = false;
      let pc: RTCPeerConnection | null = null;
      let timeout: number | null = null;
      let udpConnected = false;
      let tcpConnected = false;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (pc) {
          try {
            pc.close();
          } catch (e) {
            // 忽略关闭错误
          }
          pc = null;
        }
      };

      const finish = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ udp: udpConnected, tcp: tcpConnected });
      };

      timeout = setTimeout(() => {
        finish();
      }, 5000);

      // 创建RTCPeerConnection测试STUN连接
      pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }]
      });

      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc?.setLocalDescription(offer))
        .catch(() => {
          finish();
        });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          console.log(`STUN服务器 ${server.name} 检测到候选:`, candidate);
          
          // 检查UDP srflx候选
          if (candidate.includes('typ srflx') && candidate.includes('UDP') && !candidate.includes('TCP')) {
            console.log(`STUN服务器 ${server.name} 连接成功，检测到UDP公网候选`);
            udpConnected = true;
          } 
          // 检查TCP srflx候选
          else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
            console.log(`STUN服务器 ${server.name} 连接成功，检测到TCP公网候选`);
            tcpConnected = true;
          } else if (candidate.includes('typ host') || candidate.includes('typ relay')) {
            console.log(`STUN服务器 ${server.name} 只检测到本地候选或中继候选`);
            // 只有本地候选或中继候选，说明STUN服务器没有响应
          }
        } else if (event.candidate === null) {
          // ICE候选收集完成
          finish();
        }
      };
    });
  }

  /**
   * 测试单个STUN服务器（保持向后兼容）
   */
  private async testStunServer(server: StunServer): Promise<boolean> {
    const result = await this.testStunServerConnection(server);
    // 如果UDP或TCP任一能连接，就认为服务器可达
    return result.udp || result.tcp;
  }

  /**
   * 测试公网IP（使用配置的STUN服务器）
   */
  private async detectPublicIP(): Promise<boolean> {
    try {
      // 使用第一个可用的STUN服务器进行检测
      if (this.stunServers.length === 0) {
        return false;
      }

      const server = this.stunServers[0];
      return new Promise((resolve) => {
        let resolved = false;
        let pc: RTCPeerConnection | null = null;
        let timeout: number | null = null;

        const cleanup = () => {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          if (pc) {
            try {
              pc.close();
            } catch (e) {
              // 忽略关闭错误
            }
            pc = null;
          }
        };

        const finish = (result: boolean) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve(result);
        };

        timeout = setTimeout(() => {
          finish(false);
        }, 5000);

        pc = new RTCPeerConnection({
          iceServers: [{ urls: server.url }]
        });
        
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            console.log('检测到ICE候选:', candidate);
            
            // 只处理UDP srflx类型的候选，忽略TCP srflx
            if (candidate.includes('typ srflx') && candidate.includes('UDP') && !candidate.includes('TCP')) {
              // 检查是否包含公网IP - 更严格的检测
              const isPrivateIP = candidate.includes('192.168.') || 
                                 candidate.includes('10.') ||
                                 candidate.includes('172.16.') ||
                                 candidate.includes('172.17.') ||
                                 candidate.includes('172.18.') ||
                                 candidate.includes('172.19.') ||
                                 candidate.includes('172.20.') ||
                                 candidate.includes('172.21.') ||
                                 candidate.includes('172.22.') ||
                                 candidate.includes('172.23.') ||
                                 candidate.includes('172.24.') ||
                                 candidate.includes('172.25.') ||
                                 candidate.includes('172.26.') ||
                                 candidate.includes('172.27.') ||
                                 candidate.includes('172.28.') ||
                                 candidate.includes('172.29.') ||
                                 candidate.includes('172.30.') ||
                                 candidate.includes('172.31.') ||
                                 candidate.includes('169.254.') || // 链路本地地址
                                 candidate.includes('127.0.0.1') || // 环回地址
                                 candidate.includes('::1') || // IPv6环回地址
                                 candidate.includes('fc00:') || // 私有IPv6
                                 candidate.includes('fd00:') || // 私有IPv6
                                 candidate.includes('fe80:') || // 链路本地IPv6
                                 candidate.includes('.local') || // 本地域名
                                 candidate.includes('localhost') || // 本地主机
                                 candidate.includes('0.0.0.0') || // 任意地址
                                 candidate.includes('255.255.255.255'); // 广播地址
              
              console.log('是否为私有IP:', isPrivateIP, '候选类型:', event.candidate.type);
              finish(!isPrivateIP);
            } else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
              console.log('检测到TCP srflx候选，忽略');
            }
          } else if (event.candidate === null) {
            // ICE候选收集完成
            if (!resolved) {
              finish(false);
            }
          }
        };
        
        pc.createDataChannel('');
        pc.createOffer()
          .then(offer => pc?.setLocalDescription(offer))
          .catch(() => finish(false));
      });
    } catch (error) {
      console.error('检测公网IP失败:', error);
      return false;
    }
  }

  /**
   * 从STUN服务器获取公网IP
   */
  private async getPublicIPFromStun(server: StunServer): Promise<string | null> {
    return new Promise((resolve) => {
      let resolved = false;
      let pc: RTCPeerConnection | null = null;
      let timeout: number | null = null;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (pc) {
          try {
            pc.close();
          } catch (e) {
            // 忽略关闭错误
          }
          pc = null;
        }
      };

      const finish = (result: string | null) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      timeout = setTimeout(() => {
        finish(null);
      }, 5000);

      pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }]
      });

      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc?.setLocalDescription(offer))
        .catch(() => finish(null));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          console.log('公网IP检测候选:', candidate);
          
          // 只处理UDP srflx类型的候选，忽略TCP srflx
          if (candidate.includes('typ srflx') && candidate.includes('UDP') && !candidate.includes('TCP')) {
            // 解析候选信息获取IP地址
            const ipMatch = candidate.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
            if (ipMatch) {
              const ip = ipMatch[1];
              // 检查是否为私有IP
              const isPrivateIP = ip.startsWith('192.168.') || 
                                 ip.startsWith('10.') || 
                                 ip.startsWith('172.16.') || 
                                 ip.startsWith('172.17.') || 
                                 ip.startsWith('172.18.') || 
                                 ip.startsWith('172.19.') || 
                                 ip.startsWith('172.20.') || 
                                 ip.startsWith('172.21.') || 
                                 ip.startsWith('172.22.') || 
                                 ip.startsWith('172.23.') || 
                                 ip.startsWith('172.24.') || 
                                 ip.startsWith('172.25.') || 
                                 ip.startsWith('172.26.') || 
                                 ip.startsWith('172.27.') || 
                                 ip.startsWith('172.28.') || 
                                 ip.startsWith('172.29.') || 
                                 ip.startsWith('172.30.') || 
                                 ip.startsWith('172.31.') || 
                                 ip.startsWith('169.254.') || 
                                 ip.startsWith('127.') ||
                                 ip === '0.0.0.0' ||
                                 ip === '255.255.255.255';
              
              console.log('找到UDP srflx IP:', ip, '是否为私有IP:', isPrivateIP);
              
              if (!isPrivateIP) {
                finish(ip);
              }
            }
          } else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
            console.log('检测到TCP srflx候选，忽略');
          }
        } else if (event.candidate === null) {
          // ICE候选收集完成
          if (!resolved) {
            finish(null);
          }
        }
      };
    });
  }

  /**
   * 判断IP地址是IPv4还是IPv6
   */
  private isIPv6(ip: string): boolean {
    return ip.includes(':');
  }

  /**
   * 从STUN服务器获取映射的IP和端口信息（分别收集IPv4和IPv6的TCP/UDP地址）
   */
  private async getMappedAddress(server: StunServer): Promise<{
    ipv4: { udp: { ip: string; port: number } | null, tcp: { ip: string; port: number } | null },
    ipv6: { udp: { ip: string; port: number } | null, tcp: { ip: string; port: number } | null }
  }> {
    return new Promise((resolve) => {
      let resolved = false;
      let pc: RTCPeerConnection | null = null;
      let timeout: number | null = null;
      const addresses = {
        ipv4: { udp: null as { ip: string; port: number } | null, tcp: null as { ip: string; port: number } | null },
        ipv6: { udp: null as { ip: string; port: number } | null, tcp: null as { ip: string; port: number } | null }
      };

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (pc) {
          try {
            pc.close();
          } catch (e) {
            // 忽略关闭错误
          }
          pc = null;
        }
      };

      const finish = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(addresses);
      };

      timeout = setTimeout(() => {
        finish();
      }, 5000);

      pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }]
      });

      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc?.setLocalDescription(offer))
        .catch(() => finish());

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          
          // 处理UDP srflx类型的候选
          if (candidate.includes('typ srflx') && candidate.includes('UDP') && !candidate.includes('TCP')) {
            // 解析候选字符串格式: candidate:1 1 UDP 1685987327 112.193.176.245 37737 typ srflx raddr 0.0.0.0 rport 0
            // 格式: candidate:foundation component protocol priority IP port typ type ...
            const parts = candidate.split(' ');
            if (parts.length >= 6) {
              const ip = parts[4];
              const port = parseInt(parts[5], 10);
              
              // 验证IP和端口是否有效
              if (ip && !isNaN(port) && port > 0) {
                const isIPv6Addr = this.isIPv6(ip);
                if (isIPv6Addr) {
                  addresses.ipv6.udp = { ip, port };
                  console.log(`从 ${server.name} 获取IPv6 UDP映射地址: ${ip}:${port}`);
                } else {
                  addresses.ipv4.udp = { ip, port };
                  console.log(`从 ${server.name} 获取IPv4 UDP映射地址: ${ip}:${port}`);
                }
                return;
              }
            }
          }
          // 处理TCP srflx类型的候选
          else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
            // 解析TCP候选字符串格式
            const parts = candidate.split(' ');
            if (parts.length >= 6) {
              const ip = parts[4];
              const port = parseInt(parts[5], 10);
              
              // 验证IP和端口是否有效
              if (ip && !isNaN(port) && port > 0) {
                const isIPv6Addr = this.isIPv6(ip);
                if (isIPv6Addr) {
                  addresses.ipv6.tcp = { ip, port };
                  console.log(`从 ${server.name} 获取IPv6 TCP映射地址: ${ip}:${port}`);
                } else {
                  addresses.ipv4.tcp = { ip, port };
                  console.log(`从 ${server.name} 获取IPv4 TCP映射地址: ${ip}:${port}`);
                }
                return;
              }
            }
          }
        } else if (event.candidate === null) {
          // ICE候选收集完成
          finish();
        }
      };
    });
  }

  /**
   * 检测NAT类型（通用方法，支持IPv4/IPv6和UDP/TCP）
   */
  private detectNATTypeFromAddresses(
    addresses: { ip: string; port: number; server: string }[],
    protocol: 'UDP' | 'TCP',
    ipVersion: 'IPv4' | 'IPv6'
  ): NATTypeResult | null {
    if (addresses.length === 0) {
      return null;
    }

    // 检查所有映射的IP是否相同
    const firstIP = addresses[0].ip;
    const allSameIP = addresses.every(addr => addr.ip === firstIP);

    if (!allSameIP) {
      // IP不同，可能是多宿主网络或其他复杂情况
      console.log(`${ipVersion} ${protocol} IP不同，可能是多宿主网络`);
      return {
        type: 'Unknown',
        mappedAddresses: addresses
      };
    }

    // 检查所有映射的端口是否相同
    const firstPort = addresses[0].port;
    const allSamePort = addresses.every(addr => addr.port === firstPort);

    let natType: string;
    if (allSamePort) {
      // 端口相同，可能是全锥型或受限锥型NAT
      if (addresses.length === this.stunServers.length) {
        // 所有服务器都能获取映射，更可能是全锥型
        natType = 'Full Cone or Restricted Cone';
      } else {
        // 部分服务器能获取映射，可能是受限锥型
        natType = 'Restricted Cone';
      }
    } else {
      // 端口不同，很可能是对称型NAT
      natType = 'Symmetric NAT';
      console.log(`检测到${ipVersion} ${protocol}对称型NAT：不同STUN服务器返回的映射端口不同`);
    }

    return {
      type: natType,
      mappedAddresses: addresses
    };
  }

  /**
   * 检测IPv4 UDP NAT类型
   */
  private async detectIPv4UDPNATType(): Promise<NATTypeResult | null> {
    try {
      if (this.stunServers.length === 1) {
        const connectionResult = await this.testStunServerConnection(this.stunServers[0]);
        if (connectionResult.udp) {
          return {
            type: 'Full Cone or Restricted Cone',
            mappedAddresses: []
          };
        }
        return null;
      }

      const mappedAddresses = await Promise.all(
        this.stunServers.map(server => this.getMappedAddress(server))
      );

      const ipv4UdpAddresses = mappedAddresses
        .map((addr, index) => ({
          address: addr.ipv4.udp,
          server: this.stunServers[index].name
        }))
        .filter(item => item.address !== null)
        .map(item => ({
          ip: item.address!.ip,
          port: item.address!.port,
          server: item.server
        }));

      console.log('从各STUN服务器获取的IPv4 UDP映射地址:', ipv4UdpAddresses);
      return this.detectNATTypeFromAddresses(ipv4UdpAddresses, 'UDP', 'IPv4');
    } catch (error) {
      console.error('检测IPv4 UDP NAT类型失败:', error);
      return null;
    }
  }

  /**
   * 检测IPv6 UDP NAT类型
   */
  private async detectIPv6UDPNATType(): Promise<NATTypeResult | null> {
    try {
      if (this.stunServers.length === 1) {
        const connectionResult = await this.testStunServerConnection(this.stunServers[0]);
        if (connectionResult.udp) {
          return {
            type: 'Full Cone or Restricted Cone',
            mappedAddresses: []
          };
        }
        return null;
      }

      const mappedAddresses = await Promise.all(
        this.stunServers.map(server => this.getMappedAddress(server))
      );

      const ipv6UdpAddresses = mappedAddresses
        .map((addr, index) => ({
          address: addr.ipv6.udp,
          server: this.stunServers[index].name
        }))
        .filter(item => item.address !== null)
        .map(item => ({
          ip: item.address!.ip,
          port: item.address!.port,
          server: item.server
        }));

      console.log('从各STUN服务器获取的IPv6 UDP映射地址:', ipv6UdpAddresses);
      return this.detectNATTypeFromAddresses(ipv6UdpAddresses, 'UDP', 'IPv6');
    } catch (error) {
      console.error('检测IPv6 UDP NAT类型失败:', error);
      return null;
    }
  }

  /**
   * 检测IPv4 TCP NAT类型
   */
  private async detectIPv4TCPNATType(): Promise<NATTypeResult | null> {
    try {
      if (this.stunServers.length === 1) {
        const connectionResult = await this.testStunServerConnection(this.stunServers[0]);
        if (connectionResult.tcp) {
          return {
            type: 'Full Cone or Restricted Cone',
            mappedAddresses: []
          };
        }
        return null;
      }

      const mappedAddresses = await Promise.all(
        this.stunServers.map(server => this.getMappedAddress(server))
      );

      const ipv4TcpAddresses = mappedAddresses
        .map((addr, index) => ({
          address: addr.ipv4.tcp,
          server: this.stunServers[index].name
        }))
        .filter(item => item.address !== null)
        .map(item => ({
          ip: item.address!.ip,
          port: item.address!.port,
          server: item.server
        }));

      console.log('从各STUN服务器获取的IPv4 TCP映射地址:', ipv4TcpAddresses);
      return this.detectNATTypeFromAddresses(ipv4TcpAddresses, 'TCP', 'IPv4');
    } catch (error) {
      console.error('检测IPv4 TCP NAT类型失败:', error);
      return null;
    }
  }

  /**
   * 检测IPv6 TCP NAT类型
   */
  private async detectIPv6TCPNATType(): Promise<NATTypeResult | null> {
    try {
      if (this.stunServers.length === 1) {
        const connectionResult = await this.testStunServerConnection(this.stunServers[0]);
        if (connectionResult.tcp) {
          return {
            type: 'Full Cone or Restricted Cone',
            mappedAddresses: []
          };
        }
        return null;
      }

      const mappedAddresses = await Promise.all(
        this.stunServers.map(server => this.getMappedAddress(server))
      );

      const ipv6TcpAddresses = mappedAddresses
        .map((addr, index) => ({
          address: addr.ipv6.tcp,
          server: this.stunServers[index].name
        }))
        .filter(item => item.address !== null)
        .map(item => ({
          ip: item.address!.ip,
          port: item.address!.port,
          server: item.server
        }));

      console.log('从各STUN服务器获取的IPv6 TCP映射地址:', ipv6TcpAddresses);
      return this.detectNATTypeFromAddresses(ipv6TcpAddresses, 'TCP', 'IPv6');
    } catch (error) {
      console.error('检测IPv6 TCP NAT类型失败:', error);
      return null;
    }
  }



  /**
   * 获取详细的网络检测信息
   * 优化：复用 detectNetworkType 的结果，避免重复检测
   */
  async getDetailedNetworkInfo(): Promise<{
    type: string;
    stunServers: { server: StunServer; reachable: boolean }[];
    publicIP: string | null;
    localIP: string | null;
    details: NetworkDetectionResult['details'];
  }> {
    // 并行执行检测任务
    const [networkTypeResult, publicIP, localIP] = await Promise.all([
      this.detectNetworkType(),
      this.getPublicIPFromStun(this.stunServers[0]),
      this.getLocalIP()
    ]);

    // 获取STUN服务器可达性（复用已有的检测结果）
    const reachableServers = await this.testStunServers();
    const stunServerResults = this.stunServers.map(server => ({
      server,
      reachable: reachableServers.some(rs => rs.host === server.host)
    }));

    return {
      type: networkTypeResult.type,
      stunServers: stunServerResults,
      publicIP,
      localIP,
      details: networkTypeResult.details
    };
  }

  /**
   * 获取本地IP地址
   */
  private async getLocalIP(): Promise<string | null> {
    return new Promise((resolve) => {
      let resolved = false;
      let pc: RTCPeerConnection | null = null;
      let timeout: number | null = null;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (pc) {
          try {
            pc.close();
          } catch (e) {
            // 忽略关闭错误
          }
          pc = null;
        }
      };

      const finish = (result: string | null) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(result);
      };

      timeout = setTimeout(() => {
        finish(null);
      }, 5000);

      pc = new RTCPeerConnection({ iceServers: [] });
      
      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc?.setLocalDescription(offer))
        .catch(() => finish(null));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          console.log('本地IP检测候选:', candidate);
          // 查找本地IP地址（包含所有私有IP段，但不包括.local域名）
          const localIPMatch = candidate.match(/(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3}|169\.254\.[0-9]{1,3}\.[0-9]{1,3}|127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (localIPMatch) {
            console.log('找到本地IP:', localIPMatch[1]);
            finish(localIPMatch[1]);
          }
        } else if (event.candidate === null) {
          // ICE候选收集完成
          if (!resolved) {
            finish(null);
          }
        }
      };
    });
  }

  /**
   * 执行连通性和速度测试（本地回环测试）
   * @param mappedAddress 要测试的映射地址信息
   */
  async performSpeedTest(mappedAddress: {
    ip: string;
    port: number;
    server: string;
    protocol: 'UDP' | 'TCP';
    ipVersion: 'IPv4' | 'IPv6';
  }): Promise<SpeedTestResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let connectionStartTime = startTime;
      let connectionEstablished = false;
      let pc1: RTCPeerConnection | null = null;
      let pc2: RTCPeerConnection | null = null;
      let dataChannel1: RTCDataChannel | null = null;
      let dataChannel2: RTCDataChannel | null = null;
      let timeout: number | null = null;

      const testDuration = 4000; // 4秒测试时间
      const packetSize = 1024; // 1KB数据包
      const packets: { sent: number; received: number; timestamps: Map<number, number> } = {
        sent: 0,
        received: 0,
        timestamps: new Map()
      };
      let totalBytesReceived = 0;
      const latencies: number[] = [];

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (dataChannel1) {
          try {
            dataChannel1.close();
          } catch (e) {
            // 忽略关闭错误
          }
          dataChannel1 = null;
        }
        if (dataChannel2) {
          try {
            dataChannel2.close();
          } catch (e) {
            // 忽略关闭错误
          }
          dataChannel2 = null;
        }
        if (pc1) {
          try {
            pc1.close();
          } catch (e) {
            // 忽略关闭错误
          }
          pc1 = null;
        }
        if (pc2) {
          try {
            pc2.close();
          } catch (e) {
            // 忽略关闭错误
          }
          pc2 = null;
        }
      };

      const finish = (result: Omit<SpeedTestResult, 'mappedAddress'>) => {
        cleanup();
        resolve({
          ...result,
          mappedAddress
        });
      };

      // 使用指定映射地址对应的STUN服务器
      const stunServer = this.stunServers.find(s => s.name === mappedAddress.server) || this.stunServers[0];
      const iceServers = stunServer ? [{ urls: stunServer.url }] : [];
      
      console.log(`开始为映射地址 ${mappedAddress.ip}:${mappedAddress.port} (${mappedAddress.ipVersion} ${mappedAddress.protocol}, ${mappedAddress.server}) 进行测速测试`);

      // 创建两个RTCPeerConnection
      pc1 = new RTCPeerConnection({ iceServers });
      pc2 = new RTCPeerConnection({ iceServers });

      // 设置ICE候选交换
      pc1.onicecandidate = (event) => {
        if (event.candidate) {
          pc2?.addIceCandidate(event.candidate).catch(() => {
            // 忽略错误
          });
        }
      };

      pc2.onicecandidate = (event) => {
        if (event.candidate) {
          pc1?.addIceCandidate(event.candidate).catch(() => {
            // 忽略错误
          });
        }
      };

      // 创建DataChannel（只在pc1上创建，pc2通过ondatachannel接收）
      dataChannel1 = pc1.createDataChannel('test', { ordered: true });
      
      // pc2监听DataChannel创建事件
      pc2.ondatachannel = (event) => {
        dataChannel2 = event.channel;
        setupDataChannel2();
      };

      // 设置DataChannel1事件处理
      dataChannel1.onopen = () => {
        if (!connectionEstablished) {
          connectionEstablished = true;
          connectionStartTime = Date.now();
          console.log('DataChannel连接已建立，开始数据传输测试');

          // 开始发送测试数据包
          const sendInterval = setInterval(() => {
            if (dataChannel1 && dataChannel1.readyState === 'open') {
              const packetId = packets.sent;
              const timestamp = Date.now();
              packets.timestamps.set(packetId, timestamp);
              
              // 创建测试数据包：包含ID和时间戳
              const data = new ArrayBuffer(packetSize);
              const view = new DataView(data);
              view.setUint32(0, packetId, true);
              view.setFloat64(4, timestamp, true);
              
              try {
                dataChannel1.send(data);
                packets.sent++;
              } catch (e) {
                console.error('发送数据包失败:', e);
              }
            } else {
              clearInterval(sendInterval);
            }
          }, 50); // 每50ms发送一个数据包

          // 测试时间结束后停止发送
          setTimeout(() => {
            clearInterval(sendInterval);
          }, testDuration);
        }
      };

      // 设置DataChannel2事件处理
      const setupDataChannel2 = () => {
        if (!dataChannel2) return;
        
        dataChannel2.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer && event.data.byteLength >= 12) {
            const view = new DataView(event.data);
            const packetId = view.getUint32(0, true);
            const sentTimestamp = view.getFloat64(4, true);
            const receiveTimestamp = Date.now();
            
            const latency = receiveTimestamp - sentTimestamp;
            latencies.push(latency);
            totalBytesReceived += event.data.byteLength;
            packets.received++;
            
            // 回送数据包以测试双向通信
            if (dataChannel2 && dataChannel2.readyState === 'open') {
              try {
                dataChannel2.send(event.data);
              } catch (e) {
                // 忽略错误
              }
            }
          }
        };

        dataChannel2.onerror = (error) => {
          console.error('DataChannel2错误:', error);
        };
      };

      dataChannel1.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer && event.data.byteLength >= 12) {
          const view = new DataView(event.data);
          const sentTimestamp = view.getFloat64(4, true);
          const receiveTimestamp = Date.now();
          
          const latency = receiveTimestamp - sentTimestamp;
          latencies.push(latency);
          totalBytesReceived += event.data.byteLength;
        }
      };

      // 处理连接错误
      dataChannel1.onerror = (error) => {
        console.error('DataChannel1错误:', error);
      };


      // 建立连接
      pc1.createOffer()
        .then(offer => {
          return pc1!.setLocalDescription(offer);
        })
        .then(() => {
          return pc2!.setRemoteDescription(pc1!.localDescription!);
        })
        .then(() => {
          return pc2!.createAnswer();
        })
        .then(answer => {
          return pc2!.setLocalDescription(answer);
        })
        .then(() => {
          return pc1!.setRemoteDescription(pc2!.localDescription!);
        })
        .catch((error) => {
          console.error('建立连接失败:', error);
          finish({
            latency: 0,
            throughput: 0,
            packetLoss: 100,
            connectionTime: Date.now() - startTime,
            status: 'failed',
            packetsSent: 0,
            packetsReceived: 0
          });
        });

      // 设置超时
      timeout = setTimeout(() => {
        const connectionTime = connectionEstablished ? (connectionStartTime - startTime) : (Date.now() - startTime);
        const avgLatency = latencies.length > 0 
          ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
          : 0;
        const throughput = totalBytesReceived > 0 
          ? (totalBytesReceived / 1024) / (testDuration / 1000) 
          : 0;
        const packetLoss = packets.sent > 0 
          ? ((packets.sent - packets.received) / packets.sent) * 100 
          : 100;

        console.log(`测速结果 (${mappedAddress.ip}:${mappedAddress.port} ${mappedAddress.ipVersion} ${mappedAddress.protocol}):`, {
          latency: avgLatency.toFixed(2),
          throughput: throughput.toFixed(2),
          packetLoss: packetLoss.toFixed(2),
          connectionTime,
          packetsSent: packets.sent,
          packetsReceived: packets.received
        });

        finish({
          latency: Math.round(avgLatency),
          throughput: Math.round(throughput * 100) / 100,
          packetLoss: Math.round(packetLoss * 100) / 100,
          connectionTime,
          status: connectionEstablished ? 'success' : 'failed',
          packetsSent: packets.sent,
          packetsReceived: packets.received
        });
      }, testDuration + 2000); // 测试时间 + 2秒缓冲
    });
  }
}

export default StunClient;