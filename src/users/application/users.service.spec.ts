import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../domain/user.entity';
import { UserRole } from '../domain/user-role.enum';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const repository = {
    create: jest.fn((data: Partial<User>) => data),
    save: jest.fn((user: Partial<User>) => Promise.resolve(user)),
    findOneBy: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('normalizes the email before saving', async () => {
    await service.create({
      email: '  Seller@Example.COM ',
      passwordHash: 'hash',
      role: UserRole.SELLER,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'seller@example.com' }),
    );
  });

  it('normalizes the email and selects the password hash on lookup', async () => {
    const user = { id: '1', email: 'seller@example.com', passwordHash: 'hash' };
    queryBuilder.getOne.mockResolvedValue(user);

    const result = await service.findByEmailWithPassword(' Seller@Example.com');

    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
    expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'seller@example.com',
    });
    expect(result).toBe(user);
  });
});
