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

interface NetworkDetectionResult {
  type: string;
  details: {
    hasPublicIP: boolean;
    canReceiveFromAny: boolean;
    canConnectToStun: boolean;
    stunServersReachable: number;
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
    
    // 2. 检测公网IP
    const hasPublicIP = await this.detectPublicIP();
    
    // 3. 检测NAT类型
    const natType = await this.detectNATType();
    
    // 4. 综合判断网络类型
    let networkType: string;
    
    if (reachableServers.length === 0) {
      networkType = '防火墙阻断网络';
    } else if (hasPublicIP) {
      // 更严格的公网检测：需要同时满足公网IP和多个STUN服务器可达
      if (reachableServers.length >= 2) {
        networkType = '公网型网络';
      } else {
        networkType = '受限网络';
      }
    } else if (natType === 'Full Cone or Restricted Cone') {
      networkType = '全锥型/受限锥型NAT';
    } else if (natType === 'Restricted Cone') {
      networkType = '受限锥型NAT';
    } else if (natType === 'Symmetric NAT') {
      networkType = '对称型NAT';
    } else if (natType === 'Port Restricted') {
      networkType = '端口受限型NAT';
    } else {
      networkType = '受限网络';
    }
    
    return {
      type: networkType,
      details: {
        hasPublicIP,
        canReceiveFromAny: natType === 'Full Cone' || natType === 'Full Cone or Restricted Cone',
        canConnectToStun: reachableServers.length > 0,
        stunServersReachable: reachableServers.length
      }
    };
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
   * 测试单个STUN服务器
   */
  private async testStunServer(server: StunServer): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 5000);

      // 创建RTCPeerConnection测试STUN连接
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }]
      });

      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          console.log(`STUN服务器 ${server.name} 检测到候选:`, candidate);
          
          // 检查候选类型，只有UDP srflx类型的候选才表示真正的STUN连接成功
          // 忽略TCP srflx候选
          if (candidate.includes('typ srflx') && candidate.includes('UDP') && !candidate.includes('TCP')) {
            console.log(`STUN服务器 ${server.name} 连接成功，检测到UDP公网候选`);
            clearTimeout(timeout);
            pc.close();
            resolve(true);
          } else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
            console.log(`STUN服务器 ${server.name} 检测到TCP srflx候选，忽略`);
            // TCP srflx候选不处理
          } else if (candidate.includes('typ host') || candidate.includes('typ relay')) {
            console.log(`STUN服务器 ${server.name} 只检测到本地候选或中继候选，连接失败`);
            // 只有本地候选或中继候选，说明STUN服务器没有响应
          }
        }
      };

      // 如果5秒内没有收到ICE候选，则认为连接失败
      setTimeout(() => {
        pc.close();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * 测试公网IP
   */
  private async detectPublicIP(): Promise<boolean> {
    try {
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      
      return new Promise((resolve) => {
        let hasReceivedCandidate = false;
        
        connection.onicecandidate = (event) => {
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
              hasReceivedCandidate = true;
              resolve(!isPrivateIP);
              connection.close();
            } else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
              console.log('检测到TCP srflx候选，忽略');
            }
          }
        };
        
        // 设置超时，如果没有收到候选，则认为是私有网络
        setTimeout(() => {
          if (!hasReceivedCandidate) {
            resolve(false);
            connection.close();
          }
        }, 5000);
        
        connection.createDataChannel('');
        connection.createOffer().then(offer => connection.setLocalDescription(offer));
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
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }]
      });

      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => resolve(null));

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
                pc.close();
                resolve(ip);
              }
            }
          } else if (candidate.includes('typ srflx') && candidate.includes('TCP')) {
            console.log('检测到TCP srflx候选，忽略');
          }
        }
      };

      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 从STUN服务器获取映射的IP和端口信息
   */
  private async getMappedAddress(server: StunServer): Promise<{ ip: string; port: number } | null> {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: server.url }]
      });

      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => resolve(null));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          
          // 只处理UDP srflx类型的候选
          if (candidate.includes('typ srflx') && candidate.includes('UDP') && !candidate.includes('TCP')) {
            // 解析候选字符串格式: candidate:1 1 UDP 1685987327 112.193.176.245 37737 typ srflx raddr 0.0.0.0 rport 0
            // 格式: candidate:foundation component protocol priority IP port typ type ...
            const parts = candidate.split(' ');
            if (parts.length >= 6) {
              const ip = parts[4];
              const port = parseInt(parts[5], 10);
              
              // 验证IP和端口是否有效
              if (ip && !isNaN(port) && port > 0) {
                console.log(`从 ${server.name} 获取映射地址: ${ip}:${port}`);
                pc.close();
                resolve({ ip, port });
                return;
              }
            }
          }
        } else if (event.candidate === null) {
          // ICE候选收集完成
          pc.close();
          resolve(null);
        }
      };

      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 检测NAT类型（更准确的检测方法）
   */
  private async detectNATType(): Promise<string> {
    try {
      // 如果只有一个STUN服务器，使用简化检测
      if (this.stunServers.length === 1) {
        const isReachable = await this.testStunServer(this.stunServers[0]);
        if (isReachable) {
          // 单个服务器无法判断对称型NAT，返回可能的类型
          return 'Full Cone or Restricted Cone';
        }
        return 'Unknown';
      }

      // 从多个STUN服务器获取映射地址
      const mappedAddresses = await Promise.all(
        this.stunServers.map(server => this.getMappedAddress(server))
      );

      // 过滤掉null值（无法获取映射的服务器）
      const validAddresses = mappedAddresses.filter(addr => addr !== null) as { ip: string; port: number }[];
      
      console.log('从各STUN服务器获取的映射地址:', validAddresses);

      if (validAddresses.length === 0) {
        return 'Unknown';
      }

      // 检查所有映射的IP是否相同
      const firstIP = validAddresses[0].ip;
      const allSameIP = validAddresses.every(addr => addr.ip === firstIP);

      if (!allSameIP) {
        // IP不同，可能是多宿主网络或其他复杂情况
        return 'Unknown';
      }

      // 检查所有映射的端口是否相同
      const firstPort = validAddresses[0].port;
      const allSamePort = validAddresses.every(addr => addr.port === firstPort);

      if (allSamePort) {
        // 端口相同，可能是全锥型或受限锥型NAT
        // 注意：在浏览器环境中无法完全区分全锥型和受限锥型
        // 因为无法测试是否允许任意外部主机访问
        if (validAddresses.length === this.stunServers.length) {
          // 所有服务器都能获取映射，更可能是全锥型
          return 'Full Cone or Restricted Cone';
        } else {
          // 部分服务器能获取映射，可能是受限锥型
          return 'Restricted Cone';
        }
      } else {
        // 端口不同，很可能是对称型NAT
        // 对称型NAT：不同目标IP会映射到不同的外部端口
        return 'Symmetric NAT';
      }
    } catch (error) {
      console.error('检测NAT类型失败:', error);
      return 'Unknown';
    }
  }



  /**
   * 获取详细的网络检测信息
   */
  async getDetailedNetworkInfo(): Promise<{
    type: string;
    stunServers: { server: StunServer; reachable: boolean }[];
    publicIP: string | null;
    localIP: string | null;
  }> {
    const stunServerResults = await Promise.all(
      this.stunServers.map(async (server) => ({
        server,
        reachable: await this.testStunServer(server)
      }))
    );

    const publicIP = await this.getPublicIPFromStun(this.stunServers[0]);
    const localIP = await this.getLocalIP();

    const networkType = await this.detectNetworkType();

    return {
      type: networkType.type,
      stunServers: stunServerResults,
      publicIP,
      localIP
    };
  }

  /**
   * 获取本地IP地址
   */
  private async getLocalIP(): Promise<string | null> {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      
      pc.createDataChannel('test');
      
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => resolve(null));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          console.log('本地IP检测候选:', candidate);
          // 查找本地IP地址（包含所有私有IP段，但不包括.local域名）
          const localIPMatch = candidate.match(/(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3}|169\.254\.[0-9]{1,3}\.[0-9]{1,3}|127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (localIPMatch) {
            console.log('找到本地IP:', localIPMatch[1]);
            pc.close();
            resolve(localIPMatch[1]);
          }
        }
      };

      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 5000);
    });
  }
}

export default StunClient;