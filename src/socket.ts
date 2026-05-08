import { Server } from "socket.io";

let io: Server;

export function initSocket(server: any) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io no inicializado");
  return io;
}