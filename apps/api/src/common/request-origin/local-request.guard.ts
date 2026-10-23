import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { readAllowedOrigins } from '../cors/allowed-origins';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REJECTED_CODE = 'request_origin_rejected';
const REJECTED_EVENT = 'request.origin_rejected';

interface GuardRequest {
  readonly method?: unknown;
  readonly path?: unknown;
  readonly url?: unknown;
  readonly headers?: {
    readonly host?: unknown;
    readonly origin?: unknown;
  };
}

function extractHostname(rawHost: unknown): string | null {
  if (typeof rawHost !== 'string') {
    return null;
  }
  try {
    return new URL(`http://${rawHost}`).hostname;
  } catch {
    return null;
  }
}

function readMethod(request: GuardRequest): string {
  return typeof request.method === 'string' ? request.method.toUpperCase() : '';
}

function readPath(request: GuardRequest): string {
  if (typeof request.path === 'string') {
    return request.path;
  }
  if (typeof request.url === 'string') {
    return request.url;
  }
  return '/';
}

@Injectable()
export class LocalRequestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest() as GuardRequest;
    const method = readMethod(request);
    const path = readPath(request);
    const hostname = extractHostname(request.headers?.host);
    if (hostname === null || !LOOPBACK_HOSTS.has(hostname)) {
      console.log(REJECTED_EVENT, { method, path, reason: 'host' });
      throw new ForbiddenException({ code: REJECTED_CODE });
    }
    if (!STATE_CHANGING_METHODS.has(method)) {
      return true;
    }
    const origin = request.headers?.origin;
    if (origin === undefined) {
      return true;
    }
    if (typeof origin !== 'string' || origin === 'null' || !this.isAllowedOrigin(origin)) {
      console.log(REJECTED_EVENT, { method, path, reason: 'origin' });
      throw new ForbiddenException({ code: REJECTED_CODE });
    }
    return true;
  }

  private isAllowedOrigin(origin: string): boolean {
    return readAllowedOrigins(process.env['CORS_ORIGINS']).includes(origin);
  }
}
