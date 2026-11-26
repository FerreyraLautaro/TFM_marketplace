import { CatalogBrand, brandKey, matchBrand } from './brand-matching';

const brands: CatalogBrand[] = [
  { id: 'b-1', name: 'La Serenísima', aliases: ['Serenisima', 'Seren'] },
  { id: 'b-2', name: 'Coca-Cola', aliases: ['Coca', 'Coca Cola'] },
  { id: 'b-3', name: "Hellmann's", aliases: ['Hellmans'] },
  { id: 'b-4', name: 'Nestlé', aliases: ['Nestle'] },
];

describe('brandKey', () => {
  it.each([
    ['La Serenísima', 'serenisima'],
    ['SERENISIMA', 'serenisima'],
    ['Coca-Cola', 'cocacola'],
    ['Coca Cola', 'cocacola'],
    ["Hellmann's", 'hellmanns'],
    ['Taragüi', 'taragui'],
    ['  El Cocinero ', 'cocinero'],
    ['Los Andes', 'andes'],
    ['Las Marías', 'marias'],
  ])('normalizes %p to %p', (value, expected) => {
    expect(brandKey(value)).toBe(expected);
  });

  it('only drops an article followed by more words', () => {
    expect(brandKey('Lala')).toBe('lala');
    expect(brandKey('La')).toBe('la');
  });
});

describe('matchBrand', () => {
  it('matches the catalog name ignoring case, accents and articles', () => {
    expect(matchBrand('LA SERENISIMA', brands)).toEqual({
      brand: 'La Serenísima',
      brandStatus: 'MATCHED',
      brandId: 'b-1',
      matchedBy: 'name',
    });
  });

  it('treats punctuation and spaces as equal', () => {
    expect(matchBrand('COCA COLA', brands)).toMatchObject({
      brand: 'Coca-Cola',
      matchedBy: 'name',
    });
    expect(matchBrand('HELLMANNS', brands)).toMatchObject({
      brand: "Hellmann's",
      matchedBy: 'name',
    });
  });

  it('matches an alias when the name does not match', () => {
    expect(matchBrand('SEREN', brands)).toEqual({
      brand: 'La Serenísima',
      brandStatus: 'MATCHED',
      brandId: 'b-1',
      matchedBy: 'alias',
    });
    expect(matchBrand('Hellmans', brands)).toMatchObject({
      brandId: 'b-3',
      matchedBy: 'alias',
    });
  });

  it('sends an unknown brand to review as extracted, without guessing', () => {
    expect(matchBrand(' Serenisma ', brands)).toEqual({
      brand: 'Serenisma',
      brandStatus: 'PENDIENTE_REVISION',
      brandId: null,
      matchedBy: null,
    });
  });

  it.each([null, '', '   '])('reports SIN_MARCA for %p', (extracted) => {
    expect(matchBrand(extracted, brands)).toEqual({
      brand: null,
      brandStatus: 'SIN_MARCA',
      brandId: null,
      matchedBy: null,
    });
  });
});
