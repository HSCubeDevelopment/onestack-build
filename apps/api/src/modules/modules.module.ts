import { Global, Module } from '@nestjs/common';
import { ModuleCatalog } from './module-catalog';

@Global()
@Module({
  providers: [ModuleCatalog],
  exports: [ModuleCatalog],
})
export class ModulesModule {}
