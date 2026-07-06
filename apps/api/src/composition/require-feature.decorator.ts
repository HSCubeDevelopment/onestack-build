import { SetMetadata } from '@nestjs/common';
import { ModuleKey } from './module-registry';

export const REQUIRE_FEATURE = 'require_feature';

/** Gate a route/controller behind a module flag. Module OFF for the tenant → 404 (card #6.2). */
export const RequireFeature = (key: ModuleKey) => SetMetadata(REQUIRE_FEATURE, key);
