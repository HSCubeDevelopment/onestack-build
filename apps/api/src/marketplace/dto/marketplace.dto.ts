import { IsObject, IsOptional } from 'class-validator';
export class ConnectIntegrationDto {
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}
