import type { MediaAsset, MediaRepository, MediaStorage } from '../domain/media.js';
import { ApplicationError } from '../../../common/application-error.js';

export class DatabaseMediaStorage implements MediaStorage {
  constructor(private readonly repository: MediaRepository) {}
  store(asset: MediaAsset, bytes: Uint8Array) {
    return this.repository.create(asset, bytes);
  }
  async read(asset: MediaAsset) {
    const bytes = await this.repository.readBytes(asset.ownerId, asset.id);
    if (!bytes) throw new ApplicationError(404, 'MEDIA_NOT_FOUND', 'File was not found');
    return bytes;
  }
  remove(asset: MediaAsset) {
    return this.repository.delete(asset.ownerId, asset.id);
  }
}
