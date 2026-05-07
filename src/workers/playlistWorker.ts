import amqplib from "amqplib";
import { PrismaClient } from "@prisma/client";
import { analyzeMood } from "../services/claude";
import { searchTracks } from "../services/spotify";
import logger from "../logger";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// función principal del worker
async function startWorker() {
  try {
    // conectamos a RabbitMQ
    const connection = await amqplib.connect(
      process.env.RABBITMQ_URL || "amqp://localhost:5672"
    );

    // creamos el canal
    const channel = await connection.createChannel();

    // declaramos la misma cola que usa el route
    // si la cola ya existe no hace nada, si no existe la crea
    await channel.assertQueue("playlists", { durable: true });

    // prefetch(1) — el worker procesa un mensaje a la vez
    // sin esto RabbitMQ mandaría todos los mensajes de golpe
    // y el worker se saturaría llamando a Claude y Spotify en paralelo
    channel.prefetch(1);

    logger.info("Worker escuchando la cola playlists...");

    // consume — registra una función que se ejecuta cada vez
    // que llega un mensaje a la cola
    channel.consume("playlists", async (msg) => {
      // msg puede ser null si el canal se cierra
      if (!msg) return;

      // parseamos el contenido del mensaje
      // el route mandó un JSON, aquí lo convertimos de vuelta a objeto
      const { jobId, mood, genre, artist } = JSON.parse(
        msg.content.toString()
      );

      logger.info(`Procesando job ${jobId}`);

      try {
        // paso 1 — Claude analiza el mood y genera una query optimizada
        const query = await analyzeMood(mood, genre, artist);
        logger.info(`Query generada por Claude: ${query}`);

        // paso 2 — Spotify busca canciones con esa query
        const tracks = await searchTracks(query, artist);
        logger.info(`Encontradas ${tracks.length} canciones`);

        // paso 3 — guardamos el resultado en la BD
        await prisma.playlist.update({
          where: { jobId },
          data: {
            tracks,          // las canciones encontradas
            status: "completed", // marcamos como completada
          },
        });

        // ack — le decimos a RabbitMQ que el mensaje fue procesado correctamente
        // RabbitMQ lo elimina de la cola
        channel.ack(msg);
        logger.info(`Job ${jobId} completado`);

      } catch (error) {
        logger.error(`Error procesando job ${jobId}: ${error}`);

        // actualizamos el status a "failed" en la BD
        await prisma.playlist.update({
          where: { jobId },
          data: { status: "failed" },
        });

        // nack — le decimos a RabbitMQ que el mensaje falló
        // false = no lo regresa a la cola, lo descarta
        channel.nack(msg, false, false);
      }
    });

  } catch (error) {
    logger.error(`Error iniciando worker: ${error}`);
    // si falla la conexión esperamos 5 segundos y reintentamos
    setTimeout(startWorker, 5000);
  }
}

startWorker();