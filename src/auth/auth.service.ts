import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './auth-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_COST = 10;

export interface AccessToken {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AccessToken> {
    const existing = await this.usersService.findByEmailWithPassword(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      role: dto.role,
    });
    return this.signToken(user);
  }

  async login(dto: LoginDto): Promise<AccessToken> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    // Same error for unknown email and wrong password, to avoid user enumeration.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.signToken(user);
  }

  private async signToken(user: User): Promise<AccessToken> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
