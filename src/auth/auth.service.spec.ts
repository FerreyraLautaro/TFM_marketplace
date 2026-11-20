import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    findByEmailWithPassword: jest.fn(),
    create: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn() };

  const password = 'super-secret-password';

  async function existingUser(): Promise<User> {
    return {
      id: 'user-id',
      email: 'seller@example.com',
      passwordHash: await bcrypt.hash(password, 4),
      role: UserRole.SELLER,
      createdAt: new Date(),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    jwtService.signAsync.mockResolvedValue('signed-token');
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('stores a bcrypt hash instead of the plain password and returns a token', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);
      usersService.create.mockImplementation((data: Partial<User>) =>
        Promise.resolve({ ...data, id: 'new-id' }),
      );

      const result = await service.register({
        email: 'seller@example.com',
        password,
        role: UserRole.SELLER,
      });

      const [created] = usersService.create.mock.calls[0] as [
        { passwordHash: string },
      ];
      expect(created.passwordHash).not.toBe(password);
      expect(await bcrypt.compare(password, created.passwordHash)).toBe(true);
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'new-id',
        email: 'seller@example.com',
        role: UserRole.SELLER,
      });
      expect(result).toEqual({ accessToken: 'signed-token' });
    });

    it('rejects an email that is already registered', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(
        await existingUser(),
      );

      await expect(
        service.register({
          email: 'seller@example.com',
          password,
          role: UserRole.SELLER,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token for valid credentials', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(
        await existingUser(),
      );

      const result = await service.login({
        email: 'seller@example.com',
        password,
      });

      expect(result).toEqual({ accessToken: 'signed-token' });
    });

    it('rejects a wrong password', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(
        await existingUser(),
      );

      await expect(
        service.login({ email: 'seller@example.com', password: 'wrong-pass' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('rejects an unknown email with the same message', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });
});
