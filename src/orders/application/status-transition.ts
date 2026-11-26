import { ConflictException } from '@nestjs/common';
import { EntityManager, EntityTarget, QueryDeepPartialEntity } from 'typeorm';
import { Order } from '../domain/order.entity';
import { SubOrder } from '../domain/sub-order.entity';

// Compare-and-set: the row only changes if it still has the status we validated,
// so two concurrent requests cannot both apply a transition from the same state.
export async function transitionStatus<T extends Order | SubOrder>(
  manager: EntityManager,
  entity: EntityTarget<T>,
  id: string,
  from: T['status'],
  to: T['status'],
): Promise<void> {
  const result = await manager
    .createQueryBuilder()
    .update(entity)
    .set({ status: to } as unknown as QueryDeepPartialEntity<T>)
    .where({ id, status: from })
    .execute();
  if (result.affected !== 1) {
    throw new ConflictException(
      'Status was changed by another request, try again',
    );
  }
}
