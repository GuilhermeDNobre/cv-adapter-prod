import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalRequestGuard } from './local-request.guard';

const ALLOWED_ORIGIN = 'http://localhost:3000';
const ALLOWED_IP_ORIGIN = 'http://127.0.0.1:3000';
const EVIL_ORIGIN = 'https://evil.example';
const REQUEST_PATH = '/resume-imports';

interface TestHeaders {
  readonly host?: unknown;
  readonly origin?: unknown;
}

interface TestRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: TestHeaders;
}

function createContext(method: string, path: string, headers: TestHeaders): ExecutionContext {
  const request: TestRequest = { method, path, headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function readRejectionCode(error: unknown): unknown {
  if (error instanceof ForbiddenException) {
    return error.getResponse();
  }
  return null;
}

describe('LocalRequestGuard host check', () => {
  let guard: LocalRequestGuard;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let previousOrigins: string | undefined;

  beforeEach(() => {
    previousOrigins = process.env['CORS_ORIGINS'];
    process.env['CORS_ORIGINS'] = `${ALLOWED_ORIGIN},${ALLOWED_IP_ORIGIN}`;
    guard = new LocalRequestGuard();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (previousOrigins === undefined) {
      delete process.env['CORS_ORIGINS'];
    } else {
      process.env['CORS_ORIGINS'] = previousOrigins;
    }
  });

  it('should allow localhost without port', () => {
    const context = createContext('GET', '/health', { host: 'localhost' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow localhost with port', () => {
    const context = createContext('GET', '/health', { host: 'localhost:3001' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow 127.0.0.1 without port', () => {
    const context = createContext('GET', '/health', { host: '127.0.0.1' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow 127.0.0.1 with port', () => {
    const context = createContext('POST', REQUEST_PATH, { host: '127.0.0.1:3001' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow [::1] without port', () => {
    const context = createContext('GET', '/health', { host: '[::1]' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow [::1] with port', () => {
    const context = createContext('GET', '/health', { host: '[::1]:3001' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject a foreign hostname', () => {
    const context = createContext('GET', '/health', { host: 'evil.example' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'GET',
      path: '/health',
      reason: 'host',
    });
  });

  it('should reject a foreign hostname with port', () => {
    const context = createContext('POST', REQUEST_PATH, {
      host: 'evil.example:3001',
      origin: ALLOWED_ORIGIN,
    });

    let caught: unknown = null;
    try {
      guard.canActivate(context);
    } catch (error: unknown) {
      caught = error;
    }
    expect(readRejectionCode(caught)).toEqual({ code: 'request_origin_rejected' });
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'POST',
      path: REQUEST_PATH,
      reason: 'host',
    });
  });

  it('should reject a missing Host header', () => {
    const context = createContext('GET', '/health', {});

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'GET',
      path: '/health',
      reason: 'host',
    });
  });

  it('should reject a malformed Host header', () => {
    const context = createContext('GET', '/health', { host: ':::' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'GET',
      path: '/health',
      reason: 'host',
    });
  });
});

describe('LocalRequestGuard origin check', () => {
  let guard: LocalRequestGuard;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let previousOrigins: string | undefined;

  beforeEach(() => {
    previousOrigins = process.env['CORS_ORIGINS'];
    process.env['CORS_ORIGINS'] = `${ALLOWED_ORIGIN},${ALLOWED_IP_ORIGIN}`;
    guard = new LocalRequestGuard();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (previousOrigins === undefined) {
      delete process.env['CORS_ORIGINS'];
    } else {
      process.env['CORS_ORIGINS'] = previousOrigins;
    }
  });

  it('should allow POST without Origin', () => {
    const context = createContext('POST', REQUEST_PATH, { host: '127.0.0.1:3001' });

    expect(guard.canActivate(context)).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('should allow POST with the localhost origin', () => {
    const context = createContext('POST', REQUEST_PATH, {
      host: '127.0.0.1:3001',
      origin: ALLOWED_ORIGIN,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow POST with the 127.0.0.1 origin', () => {
    const context = createContext('POST', REQUEST_PATH, {
      host: '127.0.0.1:3001',
      origin: ALLOWED_IP_ORIGIN,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject POST with a foreign Origin', () => {
    const context = createContext('POST', REQUEST_PATH, {
      host: '127.0.0.1:3001',
      origin: EVIL_ORIGIN,
    });

    let caught: unknown = null;
    try {
      guard.canActivate(context);
    } catch (error: unknown) {
      caught = error;
    }
    expect(readRejectionCode(caught)).toEqual({ code: 'request_origin_rejected' });
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'POST',
      path: REQUEST_PATH,
      reason: 'origin',
    });
  });

  it('should reject POST with the null Origin', () => {
    const context = createContext('POST', REQUEST_PATH, {
      host: '127.0.0.1:3001',
      origin: 'null',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'POST',
      path: REQUEST_PATH,
      reason: 'origin',
    });
  });

  it('should reject PUT with a foreign Origin', () => {
    const context = createContext('PUT', '/settings/deepseek-key', {
      host: 'localhost:3001',
      origin: EVIL_ORIGIN,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'PUT',
      path: '/settings/deepseek-key',
      reason: 'origin',
    });
  });

  it('should reject PATCH with a foreign Origin', () => {
    const context = createContext('PATCH', '/resume-imports/123', {
      host: 'localhost:3001',
      origin: EVIL_ORIGIN,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'PATCH',
      path: '/resume-imports/123',
      reason: 'origin',
    });
  });

  it('should reject DELETE with a foreign Origin', () => {
    const context = createContext('DELETE', '/data/erase', {
      host: 'localhost:3001',
      origin: EVIL_ORIGIN,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(logSpy).toHaveBeenCalledWith('request.origin_rejected', {
      method: 'DELETE',
      path: '/data/erase',
      reason: 'origin',
    });
  });

  it('should allow GET with a foreign Origin', () => {
    const context = createContext('GET', '/health', {
      host: '127.0.0.1:3001',
      origin: EVIL_ORIGIN,
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('should allow GET without Origin', () => {
    const context = createContext('GET', '/health', { host: '127.0.0.1:3001' });

    expect(guard.canActivate(context)).toBe(true);
  });
});
