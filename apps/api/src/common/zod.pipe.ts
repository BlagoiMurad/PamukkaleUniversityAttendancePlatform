import { PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { AppError } from './errors';

export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError('VALIDATION_FAILED', 'Validation failed', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
