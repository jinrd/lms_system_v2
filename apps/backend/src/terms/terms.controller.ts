import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { CreateTermsDocumentDto } from './dto/create-terms-document.dto';
import { UpdateTermsDocumentDto } from './dto/update-terms-document.dto';
import { type TermsDocumentResponse, TermsService } from './terms.service';

@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Public()
  @Get('current')
  findCurrentTerms(): Promise<TermsDocumentResponse[]> {
    return this.termsService.findCurrentTerms();
  }

  @Roles(UserRole.ADMIN)
  @Get('versions')
  findAllVersions(): Promise<TermsDocumentResponse[]> {
    return this.termsService.findAllVersions();
  }

  @Roles(UserRole.ADMIN)
  @Post('versions')
  createVersion(
    @Body() dto: CreateTermsDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TermsDocumentResponse> {
    return this.termsService.createVersion(dto, user, request.ip);
  }

  @Roles(UserRole.ADMIN)
  @Patch('versions/:id')
  updateVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTermsDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TermsDocumentResponse> {
    return this.termsService.updateVersion(id, dto, user, request.ip);
  }

  @Roles(UserRole.ADMIN)
  @Post('versions/:id/activate')
  activateVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TermsDocumentResponse> {
    return this.termsService.activateVersion(id, user, request.ip);
  }
}
