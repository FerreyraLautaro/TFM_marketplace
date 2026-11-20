import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../users/user-role.enum';
import { AuthUser } from '../auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Must run after JwtAuthGuard, which populates request.user.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    return !!user && roles.includes(user.role);
  }
}
