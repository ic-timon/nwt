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
      networkType = '公网型网络';
    } else if (natType === 'Full Cone') {
      networkType = '全锥型NAT';
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
        connection.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate.candidate;
            // 检查是否包含公网IP
            const hasPublicIP = !candidate.includes('192.168.') && 
                               !candidate.includes('10.') && 
                               !candidate.includes('172.16.');
            resolve(hasPublicIP);
            connection.close();
          }
        };
        
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
          // 解析候选信息获取IP地址
          const ipMatch = candidate.match(/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (ipMatch) {
            pc.close();
            resolve(ipMatch[1]);
          }
        }
      };

      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 3000);
    });
  }

  /**
   * 检测NAT类型
   */
  private async detectNATType(): Promise<string> {
    try {
      // 测试全锥型NAT
      const isFullCone = await this.testFullConeNAT();
      
      if (isFullCone) {
        return 'Full Cone';
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
   * 测试全锥型NAT
   */
  private async testFullConeNAT(): Promise<boolean> {
    try {
      // 使用多个STUN服务器测试连接性
      const connectionTests = await Promise.all(
        this.stunServers.slice(0, 2).map(server => this.testStunServer(server))
      );
      
      // 如果多个STUN服务器都能连接，则可能是全锥型NAT
      return connectionTests.filter(result => result).length >= 2;
    } catch (error) {
      return false;
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
          // 查找本地IP地址（通常以192.168、10.、172.开头）
          const localIPMatch = candidate.match(/(192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]{1,3}\.[0-9]{1,3})/);
          if (localIPMatch) {
            pc.close();
            resolve(localIPMatch[1]);
          }
        }
      };

      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 3000);
    });
  }
}

export default StunClient;