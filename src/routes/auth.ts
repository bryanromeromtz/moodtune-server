import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// POST /auth/register
router.post("/register", async (req: Request, res: Response) => {
  // extraemos email y password del body del request
  const { email, password } = req.body;

  // validamos que vengan los dos campos
  if (!email || !password) {
    res.status(400).json({ error: "Email y password son requeridos" });
    return;
  }

  // verificamos que el email no esté ya registrado
  // findUnique busca un registro único por un campo con @unique en el schema
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: "El email ya está registrado" });
    return;
  }

  // hasheamos la contraseña con bcrypt
  // el 10 es el "salt rounds" — cuántas veces se aplica el algoritmo
  // más alto = más seguro pero más lento. 10 es el estándar
  const hashedPassword = await bcrypt.hash(password, 10);

  // creamos el usuario en la BD
  const user = await prisma.user.create({
    data: { email, password: hashedPassword },
  });

  // retornamos solo id y email — nunca el password aunque sea hasheado
  res.status(201).json({ id: user.id, email: user.email });
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email y password son requeridos" });
    return;
  }

  // buscamos el usuario por email
  const user = await prisma.user.findUnique({ where: { email } });

  // si no existe retornamos el mismo error que si el password es incorrecto
  // esto es importante por seguridad — no queremos decirle al atacante
  // si el email existe o no
  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  // comparamos el password ingresado con el hash guardado
  // bcrypt.compare hace el hash del password y lo compara con el guardado
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  // generamos el JWT con el id y email del usuario
  // este token expira en 7 días
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  res.json({ token, user: { id: user.id, email: user.email } });
});

export default router;