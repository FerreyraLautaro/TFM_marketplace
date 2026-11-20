import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/user-role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  function contextWithRole(role: UserRole): ExecutionContext {
    return {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: '1', email: 'a@b.com', role } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithRole(UserRole.BUYER))).toBe(true);
  });

  it('allows a user with a required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SELLER]);

    expect(guard.canActivate(contextWithRole(UserRole.SELLER))).toBe(true);
  });

  it('denies a user without a required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.SELLER]);

    expect(guard.canActivate(contextWithRole(UserRole.BUYER))).toBe(false);
  });
});
