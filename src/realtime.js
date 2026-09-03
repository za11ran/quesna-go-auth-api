// Socket.IO — إشعارات لحظية. الاتصال يتطلب JWT في socket.handshake.auth.token
const jwt = require('jsonwebtoken');
let io = null;

function initRealtime(server) {
  try {
    const { Server } = require('socket.io');
    io = new Server(server, { cors: { origin: '*' }, path: '/socket.io' });
    io.use((socket, next) => {
      const raw =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        (socket.handshake.headers.authorization || '').replace('Bearer ', '');
      if (!raw) return next(new Error('AUTH_REQUIRED'));
      try {
        socket.data.user = jwt.verify(raw, process.env.JWT_SECRET);
        next();
      } catch {
        next(new Error('AUTH_INVALID'));
      }
    });
    io.on('connection', (socket) => {
      const u = socket.data.user;
      if (u.kind === 'staff') {
        socket.join(`staff:${u.sub}`);
        socket.join(`role:${u.role}`);
        if (u.vendor_id) socket.join(`vendor:${u.vendor_id}`);
        if (u.driver_id) socket.join(`driver:${u.driver_id}`);
      } else {
        socket.join(`customer:${u.sub}`);
      }
    });
    console.log('🔌 Socket.IO جاهز على /socket.io');
  } catch (e) {
    console.error('[realtime] تعذّر تشغيل Socket.IO:', e.message);
  }
  return io;
}

function emitTo(room, event, payload) {
  if (io && room) io.to(room).emit(event, payload);
}

module.exports = { initRealtime, emitTo };
