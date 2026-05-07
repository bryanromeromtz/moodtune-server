import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import authRouter from "./routes/auth";
import playlistsRouter from "./routes/playlists";
import logger from "./logger";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const prisma = new PrismaClient();

// rate limiter general — 100 peticiones por 15 minutos por IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Demasiadas peticiones, intenta más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

// rate limiter estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Demasiados intentos, intenta más tarde" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use(generalLimiter);

// middleware para loggear todas las peticiones
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// health check que verifica servidor y base de datos
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info("Health check OK");
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        server: "ok",
        database: "ok",
      },
    });
  } catch (error) {
    logger.error("Health check failed", error);
    res.status(503).json({
      status: "error",
      timestamp: new Date().toISOString(),
      services: {
        server: "ok",
        database: "error",
      },
    });
  }
});

app.use("/auth", authLimiter, authRouter);
app.use("/playlists", playlistsRouter);

// middleware para loggear errores no manejados
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  logger.info(`MoodTune server running on port ${PORT}`);
});