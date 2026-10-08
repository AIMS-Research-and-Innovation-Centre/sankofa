import { Container } from '@cloudflare/containers';

export class SankofaApi extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
  envVars = {
    LA_REPOSITORY_DB_PATH: '/app/data/repository.sqlite3',
    LA_REPOSITORY_STORAGE_PATH: '/app/data/repository-files',
    LA_PUBLIC_URL: 'https://sankofa-web.couma.workers.dev',
    LA_SESSION_COOKIE_SECURE: 'true',
  };
}

export interface Env {
  SANKOFA_API: DurableObjectNamespace<SankofaApi>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = env.SANKOFA_API.getByName('production');
    return container.fetch(request);
  },
};
