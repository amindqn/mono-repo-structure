export type StorageKind = 'database' | 'object';
export type MediaContentType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
export interface MediaAsset {
  id: string;
  ownerId: string;
  filename: string;
  contentType: MediaContentType;
  size: number;
  storage: StorageKind;
  createdAt: string;
}
export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
export interface MediaRepository {
  list(ownerId: string): Promise<MediaAsset[]>;
  find(ownerId: string, id: string): Promise<MediaAsset | null>;
  create(asset: MediaAsset, bytes: Uint8Array | null): Promise<void>;
  readBytes(ownerId: string, id: string): Promise<Uint8Array | null>;
  delete(ownerId: string, id: string): Promise<void>;
}
export interface MediaStorage {
  store(asset: MediaAsset, bytes: Uint8Array): Promise<void>;
  read(asset: MediaAsset): Promise<Uint8Array>;
  remove(asset: MediaAsset): Promise<void>;
}
export interface FileInspector {
  inspect(bytes: Uint8Array, claimedType: string): Promise<MediaContentType | null>;
}
