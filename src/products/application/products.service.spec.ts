import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../domain/product.entity';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  const repository = {
    create: jest.fn((data: Partial<Product>) => data),
    save: jest.fn((product: Partial<Product>) => Promise.resolve(product)),
    merge: jest.fn((target: Product, source: Partial<Product>) =>
      Object.assign(target, source),
    ),
    remove: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };

  const ownerId = 'seller-a';
  const otherSellerId = 'seller-b';
  const buildProduct = (): Product =>
    ({
      id: 'product-1',
      name: 'Lamp',
      description: null,
      price: 100,
      sellerId: ownerId,
    }) as Product;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: repository },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  it('assigns the seller id on create', async () => {
    await service.create(ownerId, { name: 'Lamp', price: 100 });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Lamp', price: 100, sellerId: ownerId }),
    );
  });

  it('throws NotFound when the product does not exist', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applies changes when the owner updates', async () => {
    repository.findOneBy.mockResolvedValue(buildProduct());

    const result = await service.update('product-1', ownerId, {
      name: 'Desk lamp',
      price: 120.5,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Desk lamp', price: 120.5 }),
    );
    expect(result).toMatchObject({ name: 'Desk lamp', price: 120.5 });
  });

  it('forbids updating a product of another seller', async () => {
    repository.findOneBy.mockResolvedValue(buildProduct());

    await expect(
      service.update('product-1', otherSellerId, { name: 'Hijacked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('throws NotFound when updating a missing product', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(
      service.update('missing', ownerId, { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('deletes the product when the owner removes it', async () => {
    const product = buildProduct();
    repository.findOneBy.mockResolvedValue(product);

    await service.remove('product-1', ownerId);

    expect(repository.remove).toHaveBeenCalledWith(product);
  });

  it('forbids removing a product of another seller', async () => {
    repository.findOneBy.mockResolvedValue(buildProduct());

    await expect(
      service.remove('product-1', otherSellerId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
