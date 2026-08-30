import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  type InstructorClassResponse,
  InstructorClassesService,
} from './instructor-classes.service';

@Roles(UserRole.INSTRUCTOR)
@Controller('instructor/classes')
export class InstructorClassesController {
  constructor(
    private readonly instructorClassesService: InstructorClassesService,
  ) {}

  @Get()
  findMyClasses(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InstructorClassResponse[]> {
    return this.instructorClassesService.findMyClasses(actor.id);
  }
}
