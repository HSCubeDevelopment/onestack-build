import { Global, Module, OnModuleInit } from '@nestjs/common';
import { PackRegistry } from '../core/pack-registry';
import { automotivePack } from './automotive/automotive.pack';

/**
 * Installs the vertical packs at boot. For now the automotive pack is installed globally (single-vertical
 * deployment); per-tenant pack installation is a later refinement. This is the ONLY place that wires a
 * pack into the core — packs themselves never import core internals (enforced by pack-boundary.test.ts).
 */
@Global()
@Module({})
export class PacksModule implements OnModuleInit {
  constructor(private readonly registry: PackRegistry) {}

  onModuleInit(): void {
    if (!this.registry.hasSubjectType('vehicle')) {
      this.registry.register(automotivePack);
    }
  }
}
