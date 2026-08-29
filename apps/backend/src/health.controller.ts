import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

type HealthResponse = {
  status: 'ok';
  service: 'lms-backend';
  timestamp: string;
};

@Public()
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'lms-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
