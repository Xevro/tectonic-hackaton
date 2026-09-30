import { prisma } from "../lib/db";
import { resetDemo } from "../lib/reset-demo";

resetDemo()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
