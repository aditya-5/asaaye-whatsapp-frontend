import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(onMessage, onConnect) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatRef = useRef(null);

  const savedHandler = useRef();
  const savedOnConnect = useRef();
  useEffect(() => { savedHandler.current = onMessage; }, [onMessage]);
  useEffect(() => { savedOnConnect.current = onConnect; }, [onConnect]);

  const zombieCheckRef = useRef(null);
  const lastReceivedRef = useRef(Date.now());

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
      lastReceivedRef.current = Date.now();
      setConnected(true);
      if (savedOnConnect.current) savedOnConnect.current();

      // Heartbeat: keep Koyeb proxy from dropping idle connection
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 25000);

      // Zombie detection: Koyeb proxy can silently drop the backend while keeping TCP
      // open at the edge — readyState stays OPEN, pings buffer, onclose never fires.
      // Server pings us every 30s; if we haven't received ANYTHING in 35s, force close.
      zombieCheckRef.current = setInterval(() => {
        if (Date.now() - lastReceivedRef.current > 35000) {
          ws.close();
        }
      }, 10000);
    };

    ws.onmessage = (event) => {
      lastReceivedRef.current = Date.now(); // any message resets the zombie timer
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') return; // server heartbeat, ignore
        if (savedHandler.current) savedHandler.current(data);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      clearInterval(heartbeatRef.current);
      clearInterval(zombieCheckRef.current);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      // Let onclose handle reconnect
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      clearInterval(heartbeatRef.current);
      clearInterval(zombieCheckRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [connect]);

  return { connected };
}
