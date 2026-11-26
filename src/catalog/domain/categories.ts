/** Closed category list. The output schema enforces it, so the model cannot invent one. */
export const CATEGORIES = [
  'LACTEOS',
  'CARNES',
  'FIAMBRES_Y_QUESOS',
  'FRUTAS_Y_VERDURAS',
  'PANADERIA',
  'ALMACEN',
  'CONSERVAS',
  'ACEITES_Y_CONDIMENTOS',
  'DESAYUNO_Y_MERIENDA',
  'SNACKS_Y_GOLOSINAS',
  'BEBIDAS_SIN_ALCOHOL',
  'BEBIDAS_CON_ALCOHOL',
  'CONGELADOS',
  'LIMPIEZA',
  'PERFUMERIA_E_HIGIENE',
  'BEBES',
  'MASCOTAS',
  'SIN_CATEGORIA',
] as const;

export type Category = (typeof CATEGORIES)[number];
