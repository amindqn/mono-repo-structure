process.env.HOSTNAME = process.env.HOST ?? process.env.HOSTNAME ?? '127.0.0.1';
process.env.PORT ??= '3000';
await import('../.next/standalone/apps/web/server.js');
