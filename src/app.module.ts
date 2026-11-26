import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAccessGuard } from './auth/guards/jwt-access.guard.js';
import { validateEnv } from './config/env.validation.js';
import { GroupsModule } from './groups/groups.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    UsersModule,
    AuthModule,
    GroupsModule,
    AppointmentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAccessGuard },
  ],
})
export class AppModule {}
