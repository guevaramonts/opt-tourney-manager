import { io, Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
  }
  return socket;
}

export interface ClockState {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  isBreak: boolean;
  breakLabel: string | null;
  remainingSeconds: number;
  running: boolean;
  nextSmallBlind: number | null;
  nextBigBlind: number | null;
  nextAnte: number | null;
  nextIsBreak: boolean;
  nextBreakLabel: string | null;
}

export function useClockState(): ClockState | null {
  const [state, setState] = useState<ClockState | null>(null);

  useEffect(() => {
    const s = getSocket();
    const onState = (payload: ClockState) => setState(payload);
    const onTick = (payload: ClockState) => setState(payload);
    s.on('clock:state', onState);
    s.on('clock:tick', onTick);
    return () => {
      s.off('clock:state', onState);
      s.off('clock:tick', onTick);
    };
  }, []);

  return state;
}

export function usePlayerEliminated(callback: (payload: unknown) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on('player:eliminated', callback);
    return () => { s.off('player:eliminated', callback); };
  }, [callback]);
}

export function useSeatsAssigned(callback: (payload: unknown) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on('seats:assigned', callback);
    return () => { s.off('seats:assigned', callback); };
  }, [callback]);
}

export function useConsolidationExecuted(callback: (payload: unknown) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on('table:consolidationExecuted', callback);
    return () => { s.off('table:consolidationExecuted', callback); };
  }, [callback]);
}

export function useTournamentProgressReset(callback: (payload: unknown) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on('tournament:progressReset', callback);
    return () => { s.off('tournament:progressReset', callback); };
  }, [callback]);
}
