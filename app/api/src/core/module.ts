import { Router, type RequestHandler } from 'express';
import { authenticate, requirePasswordChanged, requireSystemRole } from './auth.ts';

/**
 * Функциональный модуль системы: свои маршруты API и (необязательно) фоновые задачи.
 * Модули подключаются в app.ts списком — добавить новый модуль = создать папку и вписать его в список.
 */
export interface AppModule {
  name: string;
  routes: { path: string; router: Router }[];
  /** Фоновые задачи. В кластере запускаются только в одном рабочем процессе. */
  startJobs?: () => void;
}

/** Только для вошедших администраторов, сменивших временный пароль. */
export const adminOnly: RequestHandler[] = [authenticate, requirePasswordChanged, requireSystemRole('ADMIN')];

/** Любой вошедший пользователь, сменивший временный пароль. */
export const signedIn: RequestHandler[] = [authenticate, requirePasswordChanged];

/** Обёртка устаревшего префикса: те же обработчики плюс Deprecation и Link на канонический путь. */
export function deprecatedAlias(successorPath: string, router: Router): Router {
  const alias = Router();
  alias.use((_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
    next();
  });
  alias.use(router);
  return alias;
}

/** Заголовок Deprecation для маршрута, у которого есть преемник в `/api/me`. */
export const deprecateTo = (successorPath: string): RequestHandler => (_req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
  next();
};
