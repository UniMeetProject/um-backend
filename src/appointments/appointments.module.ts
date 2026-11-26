import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module.js';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  imports: [GroupsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
