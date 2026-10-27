import type { MediaAsset, MediaRepository } from '../domain/media.js';
import { ApplicationError } from '../../../common/application-error.js';

export class MemoryMediaRepository implements MediaRepository {
  private readonly assets = new Map<string, { asset: MediaAsset; bytes: Uint8Array | null }>();
  constructor(private readonly onDelete: (id: string) => void) {}
  async list(ownerId: string) {
    return [...this.assets.values()]
      .map(({ asset }) => ({ ...asset }))
      .filter((asset) => asset.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, 100);
  }
  async find(ownerId: string, id: string) {
    const asset = this.assets.get(id)?.asset;
    return asset?.ownerId === ownerId ? { ...asset } : null;
  }
  async create(asset: MediaAsset, bytes: Uint8Array | null) {
    const owned = [...this.assets.values()].filter(
      (value) => value.asset.ownerId === asset.ownerId,
    );
    if (
      owned.length >= 100 ||
      owned.reduce((total, value) => total + value.asset.size, 0) + asset.size > 100 * 1024 * 1024
    )
      throw new ApplicationError(413, 'MEDIA_QUOTA', 'Your media storage quota is full');
    this.assets.set(asset.id, { asset: { ...asset }, bytes: bytes ? new Uint8Array(bytes) : null });
  }
  async readBytes(ownerId: string, id: string) {
    const row = this.assets.get(id);
    return row?.asset.ownerId === ownerId && row.bytes ? new Uint8Array(row.bytes) : null;
  }
  async delete(ownerId: string, id: string) {
    if (this.assets.get(id)?.asset.ownerId === ownerId) {
      this.assets.delete(id);
      this.onDelete(id);
    }
  }
  ownsImage(ownerId: string, id: string) {
    const asset = this.assets.get(id)?.asset;
    return asset?.ownerId === ownerId && asset.contentType.startsWith('image/');
  }
}
