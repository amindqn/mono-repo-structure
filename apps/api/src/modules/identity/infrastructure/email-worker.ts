import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { EmailProcessor } from '../application/email-processor.js';
export class EmailWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private readonly processor: EmailProcessor,
    private readonly automatic: boolean,
    private readonly onFailure: () => void,
  ) {}
  onApplicationBootstrap() {
    if (!this.automatic) return;
    this.timer = setInterval(() => {
      void this.processor.flush().catch(this.onFailure);
    }, 1000);
    this.timer.unref();
  }
  async beforeApplicationShutdown() {
    clearInterval(this.timer);
    await this.processor.idle();
  }
}
