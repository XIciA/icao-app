import { ForbiddenException, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { OpsStaffRole } from '@icao/contracts';
import { Reflector } from '@nestjs/core';

import type { OpsAuthenticatedRequest } from './admin.types';

const OPS_ROLES = 'ops_roles';

export const OpsRoles = (...roles: OpsStaffRole[]) => SetMetadata(OPS_ROLES, roles);

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<OpsStaffRole[]>(OPS_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<OpsAuthenticatedRequest>();
    if (!request.opsStaff || !roles.includes(request.opsStaff.role)) {
      throw new ForbiddenException('ops_role_forbidden');
    }
    return true;
  }
}
