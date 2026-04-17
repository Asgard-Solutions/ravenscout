import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';

export function useNetwork() {
  const [isConnected, setIsConnected] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      setIsChecking(true);
      const state = await Network.getNetworkStateAsync();
      setIsConnected(state.isConnected ?? true);
    } catch {
      setIsConnected(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return { isConnected, isChecking, refresh: checkConnection };
}
