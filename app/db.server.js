import { PrismaClient } from "@prisma/client";

let prisma;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // Always create a fresh PrismaClient in development when db.server is reloaded
  global.prismaGlobal = new PrismaClient();
  prisma = global.prismaGlobal;
}

export default prisma;
