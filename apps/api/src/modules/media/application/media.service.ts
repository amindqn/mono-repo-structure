import type {
  FileInspector,
  MediaAsset,
  MediaRepository,
  MediaStorage,
  StorageKind,
} from '../domain/media.js';
import { ApplicationError } from '../../../common/application-error.js';

export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: ReadonlyMap<StorageKind, MediaStorage>,
    private readonly inspector: FileInspector,
    private readonly newId: () => string,
  ) {}
  config() {
    return {
      providers: [...this.storage.keys()],
      maxUploadBytes: 5 * 1024 * 1024,
      contentTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    };
  }
  async list(ownerId: string) {
    return { items: await this.repository.list(ownerId) };
  }
  async upload(
    ownerId: string,
    input: { filename: string; claimedType: string; storage: StorageKind; bytes: Uint8Array },
  ) {
    const sink = this.storage.get(input.storage);
    if (!sink)
      throw new ApplicationError(
        400,
        'STORAGE_UNAVAILABLE',
        'Object storage is not configured for this workspace',
      );
    if (!input.bytes.byteLength || input.bytes.byteLength > 5 * 1024 * 1024)
      throw new ApplicationError(413, 'FILE_SIZE', 'Choose a nonempty file up to 5 MiB');
    const contentType = await this.inspector.inspect(input.bytes, input.claimedType);
    if (!contentType)
      throw new ApplicationError(
        415,
        'FILE_TYPE',
        'Upload a JPEG, PNG, WebP, or PDF with matching file contents',
      );
    const filename =
      input.filename
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/[^\p{L}\p{N} ._-]/gu, '_')
        .slice(0, 180)
        .trim() || 'upload';
    const asset: MediaAsset = {
      id: this.newId(),
      ownerId,
      filename,
      contentType,
      size: input.bytes.byteLength,
      storage: input.storage,
      createdAt: new Date().toISOString(),
    };
    await sink.store(asset, input.bytes);
    return asset;
  }
  async read(ownerId: string, id: string) {
    const asset = await this.ownedAsset(ownerId, id);
    const storage = this.storage.get(asset.storage);
    if (!storage)
      throw new ApplicationError(
        503,
        'STORAGE_UNAVAILABLE',
        'This storage provider is temporarily unavailable',
      );
    return { asset, bytes: await storage.read(asset) };
  }
  async remove(ownerId: string, id: string) {
    const asset = await this.ownedAsset(ownerId, id);
    const storage = this.storage.get(asset.storage);
    if (!storage)
      throw new ApplicationError(
        503,
        'STORAGE_UNAVAILABLE',
        'This storage provider is temporarily unavailable',
      );
    await storage.remove(asset);
  }
  private async ownedAsset(ownerId: string, id: string) {
    const asset = await this.repository.find(ownerId, id);
    if (!asset) throw new ApplicationError(404, 'MEDIA_NOT_FOUND', 'File was not found');
    return asset;
  }
}
