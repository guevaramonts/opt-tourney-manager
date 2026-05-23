import { Server } from 'socket.io';
import { getClockState } from '../services/clockService';

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    // Send current clock state to newly connected client
    socket.emit('clock:state', getClockState());

    socket.on('disconnect', () => {
      // no cleanup needed
    });
  });
}
