import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';
import { stableStringify } from './stable-stringify';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const key = req.headers?.['idempotency-key'];

    if (!key || typeof key !== 'string') {
      return next.handle();
    }

    const method: string = req.method;
    const path: string = req.route?.path ?? req.url;
    const requestHash = createHash('sha256')
      .update(stableStringify(req.body ?? {}))
      .digest('hex');

    return from(this.idempotency.lookup(key, method, path, requestHash)).pipe(
      switchMap((cached) => {
        if (cached) {
          res.status(cached.responseStatus);
          return of(JSON.parse(cached.responseBody));
        }
        return next.handle().pipe(
          tap(async (body) => {
            const status: number = res.statusCode ?? 200;
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
          }),
        );
      }),
    );
  }
}
