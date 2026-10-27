import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ManagedS3Client } from './infrastructure/managed-s3.client.js';
import type { Environment } from '../../config/environment.js';
import { MEDIA_REPOSITORY } from './domain/media.js';
import type { MediaRepository, MediaStorage, StorageKind } from './domain/media.js';
import { MediaService } from './application/media.service.js';
import { DatabaseMediaStorage } from './infrastructure/database-media.storage.js';
import { S3MediaStorage } from './infrastructure/s3-media.storage.js';
import { MagicFileInspector } from './infrastructure/magic-file.inspector.js';
import { MediaController } from './presentation/media.controller.js';

@Module({})
export class MediaModule {
  static register(env: Environment): DynamicModule {
    return {
      module: MediaModule,
      controllers: [MediaController],
      providers: [
        {
          provide: ManagedS3Client,
          useFactory: () =>
            new ManagedS3Client({
              region: env.S3_REGION,
              ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
              ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
                ? {
                    credentials: {
                      accessKeyId: env.S3_ACCESS_KEY_ID,
                      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
                    },
                  }
                : {}),
              requestChecksumCalculation: 'WHEN_REQUIRED',
              requestHandler: { requestTimeout: 10_000, connectionTimeout: 3000 },
            }),
        },
        {
          provide: MediaService,
          inject: [MEDIA_REPOSITORY, ManagedS3Client],
          useFactory: (repository: MediaRepository, client: ManagedS3Client) => {
            const adapters = new Map<StorageKind, MediaStorage>([
              ['database', new DatabaseMediaStorage(repository)],
            ]);
            if (env.S3_BUCKET) {
              adapters.set('object', new S3MediaStorage(client, env.S3_BUCKET, repository));
            }
            return new MediaService(repository, adapters, new MagicFileInspector(), randomUUID);
          },
        },
      ],
    };
  }
}
