import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../domain/user.entity';
import { UserRole } from '../domain/user-role.enum';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  create(data: CreateUserData): Promise<User> {
    const user = this.usersRepository.create({
      ...data,
      email: normalizeEmail(data.email),
    });
    return this.usersRepository.save(user);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
