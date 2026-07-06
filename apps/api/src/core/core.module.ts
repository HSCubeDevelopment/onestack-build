import { Global, Module } from '@nestjs/common';
import { PackRegistry } from './pack-registry';
import { WorkflowEngine } from './workflow.engine';

/** Platform core: the pack registry + the workflow engine. Global so any module can resolve them. */
@Global()
@Module({
  providers: [PackRegistry, WorkflowEngine],
  exports: [PackRegistry, WorkflowEngine],
})
export class CoreModule {}
