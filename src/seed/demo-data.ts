import { UserRole } from '../users/domain/user-role.enum';

export interface DemoUser {
  email: string;
  role: UserRole;
  commissionRate: number;
}

export interface DemoProduct {
  sellerEmail: string;
  name: string;
  description: string;
  price: number;
}

// The README's test users are the buyer and vendedor@example.com. Sellers have
// different commission rates so an order shows the per-seller split.
export const DEMO_USERS: DemoUser[] = [
  { email: 'comprador@example.com', role: UserRole.BUYER, commissionRate: 10 },
  { email: 'vendedor@example.com', role: UserRole.SELLER, commissionRate: 10 },
  {
    email: 'vendedor.mayorista@example.com',
    role: UserRole.SELLER,
    commissionRate: 5,
  },
  {
    email: 'vendedor.bebidas@example.com',
    role: UserRole.SELLER,
    commissionRate: 15,
  },
];

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    sellerEmail: 'vendedor@example.com',
    name: 'Leche entera La Serenísima 1 L',
    description: 'Leche entera larga vida en sachet.',
    price: 1250,
  },
  {
    sellerEmail: 'vendedor@example.com',
    name: 'Yerba mate Taragüi 1 kg',
    description: 'Yerba mate con palo.',
    price: 3890,
  },
  {
    sellerEmail: 'vendedor@example.com',
    name: 'Galletitas Criollitas Bagley 300 g',
    description: 'Galletitas de agua.',
    price: 1150,
  },
  {
    sellerEmail: 'vendedor@example.com',
    name: 'Aceite de girasol Natura 1,5 L',
    description: 'Aceite de girasol.',
    price: 2890,
  },
  {
    sellerEmail: 'vendedor.mayorista@example.com',
    name: 'Arroz largo fino Marolio 1 kg',
    description: 'Arroz largo fino tipo 00000.',
    price: 1390,
  },
  {
    sellerEmail: 'vendedor.mayorista@example.com',
    name: 'Fideos spaghetti Lucchetti 500 g',
    description: 'Fideos secos de sémola.',
    price: 990,
  },
  {
    sellerEmail: 'vendedor.mayorista@example.com',
    name: 'Azúcar Ledesma 1 kg',
    description: 'Azúcar común tipo A.',
    price: 1190,
  },
  {
    sellerEmail: 'vendedor.bebidas@example.com',
    name: 'Coca-Cola Zero 2,25 L',
    description: 'Gaseosa sin azúcar.',
    price: 2650,
  },
  {
    sellerEmail: 'vendedor.bebidas@example.com',
    name: 'Agua mineral Villavicencio sin gas 1,5 L',
    description: 'Agua mineral natural.',
    price: 990,
  },
  {
    sellerEmail: 'vendedor.bebidas@example.com',
    name: 'Cerveza Quilmes Clásica lata 473 ml',
    description: 'Cerveza rubia.',
    price: 1290,
  },
];
