import { prisma } from "./db";
import { PairingService, type PairingStore } from "./pairing";

export const prismaPairingStore: PairingStore = {
  async createPairing(rec) {
    await prisma.pairingToken.create({ data: rec });
  },
  async findPairing(tokenHash) {
    return prisma.pairingToken.findUnique({ where: { tokenHash } });
  },
  async markPairingUsed(tokenHash, at) {
    const r = await prisma.pairingToken.updateMany({ where: { tokenHash, usedAt: null }, data: { usedAt: at } });
    return r.count === 1;
  },
  async createGrant(rec) {
    await prisma.hostGrant.create({ data: rec });
  },
  async findGrant(tokenHash) {
    return prisma.hostGrant.findUnique({ where: { tokenHash } });
  },
};

export const pairing = new PairingService(prismaPairingStore);
