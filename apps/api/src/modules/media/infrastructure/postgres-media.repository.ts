import { and, count, desc, eq, sum } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/connection.js';
import { media, users } from '../../../infrastructure/database/schema.js';
import type { MediaAsset, MediaContentType, MediaRepository } from '../domain/media.js';
import { ApplicationError } from '../../../common/application-error.js';

const fields = {
  id: media.id,
  ownerId: media.ownerId,
  filename: media.filename,
  contentType: media.contentType,
  size: media.size,
  storage: media.storage,
  createdAt: media.createdAt,
};
function fromRow(row: Omit<typeof media.$inferSelect, 'data'>): MediaAsset {
  return {
    ...row,
    contentType: row.contentType as MediaContentType,
    createdAt: row.createdAt.toISOString(),
  };
}
export class PostgresMediaRepository implements MediaRepository {
  constructor(private readonly db: Database) {}
  async list(ownerId: string) {
    return (
      await this.db
        .select(fields)
        .from(media)
        .where(eq(media.ownerId, ownerId))
        .orderBy(desc(media.createdAt), desc(media.id))
        .limit(100)
    ).map(fromRow);
  }
  async find(ownerId: string, id: string) {
    const [row] = await this.db
      .select(fields)
      .from(media)
      .where(and(eq(media.ownerId, ownerId), eq(media.id, id)))
      .limit(1);
    return row ? fromRow(row) : null;
  }
  async create(asset: MediaAsset, bytes: Uint8Array | null) {
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, asset.ownerId))
        .for('update');
      const [usage] = await tx
        .select({ count: count(), bytes: sum(media.size) })
        .from(media)
        .where(eq(media.ownerId, asset.ownerId));
      if ((usage?.count ?? 0) >= 100 || Number(usage?.bytes ?? 0) + asset.size > 100 * 1024 * 1024)
        throw new ApplicationError(413, 'MEDIA_QUOTA', 'Your media storage quota is full');
      await tx.insert(media).values({
        ...asset,
        createdAt: new Date(asset.createdAt),
        data: bytes ? Buffer.from(bytes) : null,
      });
    });
  }
  async readBytes(ownerId: string, id: string) {
    const [row] = await this.db
      .select({ data: media.data })
      .from(media)
      .where(and(eq(media.ownerId, ownerId), eq(media.id, id)))
      .limit(1);
    return row?.data ?? null;
  }
  async delete(ownerId: string, id: string) {
    await this.db.delete(media).where(and(eq(media.ownerId, ownerId), eq(media.id, id)));
  }
}
