import { S3Client } from '@aws-sdk/client-s3';
export class ManagedS3Client extends S3Client {
  onApplicationShutdown() {
    this.destroy();
  }
}
