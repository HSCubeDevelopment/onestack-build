import { Global, Module } from '@nestjs/common';
import { TerminologyService } from './terminology.service';

@Global()
@Module({
  providers: [TerminologyService],
  exports: [TerminologyService],
})
export class TerminologyModule {}
