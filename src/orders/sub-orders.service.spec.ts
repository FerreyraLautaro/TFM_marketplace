import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SubOrder } from './sub-order.entity';
import { SubOrdersService } from './sub-orders.service';

describe('SubOrdersService', () => {
  let service: SubOrdersService;
  const subOrder = { id: 'sub-1', sellerId: 'seller-a' } as SubOrder;
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(({ where }: { where: { id: string; sellerId: string } }) =>
      Promise.resolve(
        where.id === subOrder.id && where.sellerId === subOrder.sellerId
          ? subOrder
          : null,
      ),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SubOrdersService,
        { provide: getRepositoryToken(SubOrder), useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(SubOrdersService);
  });

  it('returns the suborder to its seller', async () => {
    await expect(service.findOneForSeller('sub-1', 'seller-a')).resolves.toBe(
      subOrder,
    );
  });

  it('returns 404 for a suborder of another seller', async () => {
    await expect(
      service.findOneForSeller('sub-1', 'seller-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only the seller suborders, newest first', async () => {
    repository.find.mockResolvedValue([subOrder]);

    await service.findAllForSeller('seller-a');

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId: 'seller-a' },
        order: { createdAt: 'DESC' },
      }),
    );
  });
});
