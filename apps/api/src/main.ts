import { createApplication } from './app.js';
import { parseEnvironment } from './config/environment.js';

try {
  const env = parseEnvironment(process.env);
  const app = await createApplication(env);
  await app.listen(env.PORT, env.HOST);
  if (env.PERSISTENCE === 'memory')
    app
      .getHttpAdapter()
      .getInstance()
      .log.warn('Disposable memory storage enabled; all tasks disappear when this process stops');
} catch {
  // Configuration may include secrets: do not print raw environment validation errors.
  console.error(
    'API startup failed. Check environment settings, dependencies, and port availability.',
  );
  process.exitCode = 1;
}
