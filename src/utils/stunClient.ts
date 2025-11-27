/**
 * STUN客户端工具类
 * 用于检测网络类型：公网型网络、全锥型NAT、受限网络、防火墙阻断网络
 */

interface StunServer {
  url: string;
  host: string;
  port: number;
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
  private stunServers: StunServer[] = [
    { url: 'stun:stun.miwifi.com:3478', host: 'stun.miwifi.com', port: 3478 },
    { url: 'stun:stun.qq.com:3478', host: 'stun.qq.com', port: 3478 }
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
    } else if (natType === 'Full Cone') {
      networkType = '全锥型NAT';
    } else if (natType === 'Port Restricted') {
      networkType = '端口受限型NAT';
    } else {
      networkType = '受限网络';
    }
    
    return {
      type: networkType,
      details: {
        hasPublicIP,
        canReceiveFromAny: natType === 'Full Cone',
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
          clearTimeout(timeout);
          pc.close();
          resolve(true);
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
            
            console.log('找到IP:', ip, '是否为私有IP:', isPrivateIP);
            
            if (!isPrivateIP) {
              pc.close();
              resolve(ip);
            }
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
   * 检测NAT类型
   */
  private async detectNATType(): Promise<string> {
    try {
      // 先测试所有STUN服务器的连接性
      const connectionTests = await Promise.all(
        this.stunServers.map(server => this.testStunServer(server))
      );
      const successfulConnections = connectionTests.filter(result => result).length;
      
      console.log('STUN服务器连接测试结果:', connectionTests);
      console.log('成功连接的服务器数量:', successfulConnections);
      
      // 如果所有服务器都能连接，可能是全锥型NAT
      if (successfulConnections === this.stunServers.length) {
        return 'Full Cone';
      }
      
      // 如果能连接部分服务器（1个或更多，但不是全部），可能是端口受限NAT
      if (successfulConnections > 0 && successfulConnections < this.stunServers.length) {
        return 'Port Restricted';
      }
      
      // 测试STUN服务器可达性
      const reachableServers = await this.testStunServers();
      
      if (reachableServers.length > 0) {
        return 'Restricted NAT';
      }
      
      return 'Unknown';
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