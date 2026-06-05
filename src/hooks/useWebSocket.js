import { useEffect, useRef, useCallback, useState } from 'react';

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);

  const savedHandler = useRef();
  useEffect(() => {
    savedHandler.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    const ENV_URL = import.meta.env.VITE_API_URL || '';
    const API_KEY = import.meta.env.VITE_API_KEY || '';
    const base = ENV_URL
      ? (ENV_URL.startsWith('http') ? ENV_URL.replace(/^http/, 'ws') + '/ws' : `wss://${ENV_URL}/ws`)
      : 'wss://managing-selia-asaaye-fe641587.koyeb.app/ws';
    const wsUrl = API_KEY ? `${base}?api_key=${API_KEY}` : base;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (savedHandler.current) savedHandler.current(data);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected, reconnecting in 3s...');
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      // Don't close explicitly here, let onclose handle it to avoid duplicate triggers
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on explicit unmount
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  return { connected };
}
