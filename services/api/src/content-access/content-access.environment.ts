import { BadRequestException } from '@nestjs/common';
import type { CommerceEnvironment } from '@icao/contracts';

export function contentCommerceEnvironment(value: string | undefined): CommerceEnvironment {
  if (value === undefined || value === '') return 'production';
  if (value === 'sandbox' || value === 'production') return value;
  throw new BadRequestException('invalid_commerce_environment');
}
