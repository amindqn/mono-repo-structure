import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { MediaAsset, MediaRepository, MediaStorage } from '../domain/media.js';

/** Object storage adapter. Metadata failure compensates by removing the uploaded object. */
export class S3MediaStorage implements MediaStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly repository: MediaRepository,
  ) {}
  private key(asset: MediaAsset) {
    return `private/${asset.ownerId}/${asset.id}`;
  }
  async store(asset: MediaAsset, bytes: Uint8Array) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(asset),
        Body: bytes,
        ContentType: asset.contentType,
        ContentLength: asset.size,
      }),
    );
    try {
      await this.repository.create(asset, null);
    } catch (error) {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(asset) }),
      );
      throw error;
    }
  }
  async read(asset: MediaAsset) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(asset) }),
    );
    if (!response.Body) throw new Error('Object body unavailable');
    if (response.ContentLength !== undefined && response.ContentLength !== asset.size)
      throw new Error('Object size does not match metadata');
    const bytes = await response.Body.transformToByteArray();
    if (bytes.byteLength !== asset.size) throw new Error('Object size does not match metadata');
    return bytes;
  }
  async remove(asset: MediaAsset) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(asset) }));
    await this.repository.delete(asset.ownerId, asset.id);
  }
}
