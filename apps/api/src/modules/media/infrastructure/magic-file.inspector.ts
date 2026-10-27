import { fileTypeFromBuffer } from 'file-type';
import type { FileInspector, MediaContentType } from '../domain/media.js';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
export class MagicFileInspector implements FileInspector {
  async inspect(bytes: Uint8Array, claimedType: string): Promise<MediaContentType | null> {
    try {
      const result = await fileTypeFromBuffer(bytes);
      if (
        !result ||
        !allowed.has(result.mime) ||
        (claimedType && claimedType !== 'application/octet-stream' && claimedType !== result.mime)
      )
        return null;
      return result.mime as MediaContentType;
    } catch {
      return null;
    }
  }
}
