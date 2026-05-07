import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import amqplib from "amqplib";
import { v4 as uuidv4 } from "uuid";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import logger from "../logger";

const router = Router();
const prisma = new PrismaClient();

// todas las rutas requieren autenticación
router.use(authMiddleware);

// POST /playlists — crear una nueva playlist
router.post("/", async (req: AuthRequest, res: Response) => {
  // extraemos mood, genre y artist del body
  const { mood, genre, artist } = req.body;

  // validamos que vengan los campos obligatorios
  if (!mood || !genre) {
    res.status(400).json({ error: "mood y genre son requeridos" });
    return;
  }

  // generamos un id único para este job
  // uuid v4 genera un string aleatorio como "550e8400-e29b-41d4-a716-446655440000"
  // lo usamos para identificar esta playlist en RabbitMQ y en el WebSocket
  const jobId = uuidv4();

  // guardamos la playlist en la BD con status "pending"
  // pending significa que está en la cola esperando ser procesada
  await prisma.playlist.create({
    data: {
      jobId,
      mood,
      genre,
      artist: artist || null,
      tracks: [],
      status: "pending",
      userId: req.user!.id,
    },
  });

  try {
    // conectamos a RabbitMQ
    const connection = await amqplib.connect(
      process.env.RABBITMQ_URL || "amqp://localhost:5672"
    );

    // creamos un canal — es como una sesión dentro de la conexión
    // puedes tener múltiples canales en una sola conexión TCP
    const channel = await connection.createChannel();

    // declaramos la cola "playlists"
    // durable: true — la cola sobrevive si RabbitMQ se reinicia
    await channel.assertQueue("playlists", { durable: true });

    // mandamos el mensaje a la cola
    // el mensaje contiene todo lo que el worker necesita para procesar
    channel.sendToQueue(
      "playlists",
      Buffer.from(JSON.stringify({ jobId, mood, genre, artist })),
      { persistent: true } // el mensaje sobrevive si RabbitMQ se reinicia
    );

    logger.info(`Job ${jobId} encolado para mood: ${mood}, genre: ${genre}`);

    // cerramos el canal y la conexión
    await channel.close();
    await connection.close();
  } catch (error) {
    logger.error(`Error conectando a RabbitMQ: ${error}`);
    res.status(500).json({ error: "Error procesando la solicitud" });
    return;
  }

  // retornamos el jobId inmediatamente sin esperar a que el worker termine
  // el frontend usará este jobId para escuchar el resultado por WebSocket
  res.status(202).json({ jobId });
});

// GET /playlists — obtener historial de playlists del usuario
router.get("/", async (req: AuthRequest, res: Response) => {
  const playlists = await prisma.playlist.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    // no retornamos tracks para no sobrecargar la respuesta
    select: {
      id: true,
      jobId: true,
      mood: true,
      genre: true,
      artist: true,
      status: true,
      createdAt: true,
    },
  });

  res.json(playlists);
});

// GET /playlists/:jobId — obtener una playlist específica con sus tracks
router.get("/:jobId", async (req: AuthRequest, res: Response) => {
  const playlist = await prisma.playlist.findUnique({
    where: { jobId: String(req.params.jobId) },
  });

  if (!playlist) {
    res.status(404).json({ error: "Playlist no encontrada" });
    return;
  }

  // verificamos que la playlist pertenece al usuario
  if (playlist.userId !== req.user!.id) {
    res.status(403).json({ error: "No autorizado" });
    return;
  }

  res.json(playlist);
});

export default router;