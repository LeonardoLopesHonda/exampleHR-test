import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { concatMap, switchMap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';
import { stableStringify } from './stable-stringify';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const headerValue = req.headers['idempotency-key'];
    const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!key) {
      return next.handle();
    }

    const method = req.method;
    const route = req.route as { path?: string } | undefined;
    const path = route?.path ?? req.url;
    const requestHash = createHash('sha256')
      .update(stableStringify(req.body ?? {}))
      .digest('hex');

    return from(this.idempotency.lookup(key, method, path, requestHash)).pipe(
      switchMap((cached) => {
        if (cached) {
          res.status(cached.responseStatus);
          return of(JSON.parse(cached.responseBody) as unknown);
        }
        return next.handle().pipe(
          concatMap(async (body: unknown) => {
            const status = res.statusCode ?? 200;
            if (status >= 200 && status < 300) {
              await this.idempotency.store(
                key,
                method,
                path,
                requestHash,
                status,
                body,
              );
            }
            return body;
          }),
        );
      }),
    );
  }
}
