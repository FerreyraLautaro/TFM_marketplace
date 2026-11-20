import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubOrder } from './sub-order.entity';

@Injectable()
export class SubOrdersService {
  constructor(
    @InjectRepository(SubOrder)
    private readonly subOrdersRepository: Repository<SubOrder>,
  ) {}

  findAllForSeller(sellerId: string): Promise<SubOrder[]> {
    return this.subOrdersRepository.find({
      where: { sellerId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  // Filtering by seller in the query makes another seller's suborder indistinguishable from a missing one.
  async findOneForSeller(id: string, sellerId: string): Promise<SubOrder> {
    const subOrder = await this.subOrdersRepository.findOne({
      where: { id, sellerId },
      relations: { items: true },
    });
    if (!subOrder) {
      throw new NotFoundException('Suborder not found');
    }
    return subOrder;
  }
}
