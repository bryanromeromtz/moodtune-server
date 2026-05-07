import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: { id: number; email: string };
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  // el token viene en el header Authorization: Bearer <token>
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token requerido" });
    return;
  }

  // extraemos el token quitando el prefijo "Bearer "
  const token = authHeader.split(" ")[1];

  try {
    // verificamos que el token sea válido y no haya expirado
    // jwt.verify lanza una excepción si el token es inválido
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as { id: number; email: string };

    // agregamos el usuario decodificado al request
    // para que las rutas puedan acceder a él con req.user
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}