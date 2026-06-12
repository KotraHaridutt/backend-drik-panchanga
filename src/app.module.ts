import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PanchangaModule } from './panchanga/panchanga.module';

@Module({
  imports: [PanchangaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
