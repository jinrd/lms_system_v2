import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import Joi from 'joi';
import { GlobalExceptionFilter } from './global-exception.filter';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RequestIdMiddleware } from './request-id.middleware';
import { AuthModule } from './auth/auth.module';
import { TermsModule } from './terms/terms.module';
import { UsersModule } from './users/users.module';
import { EducationModule } from './education/education.module';
import { CoursesModule } from './courses/courses.module';
import { ClassesModule } from './classes/classes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .required(),
        PORT: Joi.number().integer().min(1).max(65535).required(),
        DATABASE_URL: Joi.string()
          .uri({
            scheme: ['postgresql', 'postgres'],
          })
          .required(),
        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ISSUER: Joi.string().required(),
        JWT_AUDIENCE: Joi.string().required(),
        CORS_ORIGIN: Joi.string().required(),
      }),
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    PrismaModule,
    AuthModule,
    TermsModule,
    UsersModule,
    EducationModule,
    CoursesModule,
    ClassesModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}
