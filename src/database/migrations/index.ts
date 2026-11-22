import { CreateUser1795199499093 } from './1795199499093-CreateUser';
import { AddPasswordAndRoleToUser1795199725892 } from './1795199725892-AddPasswordAndRoleToUser';
import { CreateProduct1795200134338 } from './1795200134338-CreateProduct';
import { CreateOrders1795201332475 } from './1795201332475-CreateOrders';
import { CreateCatalog1795391311402 } from './1795391311402-CreateCatalog';

// Explicit list instead of a glob: globs broke on Windows drive-letter casing and
// had to skip the compiled .d.ts files. Every new migration must be added here.
export const migrations = [
  CreateUser1795199499093,
  AddPasswordAndRoleToUser1795199725892,
  CreateProduct1795200134338,
  CreateOrders1795201332475,
  CreateCatalog1795391311402,
];
