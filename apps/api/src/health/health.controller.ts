import { Controller, Get } from '@nestjs/common';
import { health, HealthStatus } from '../health';

@Controller('health')
export class HealthController {
  @Get()
  get(): HealthStatus {
    return health();
  }
}
