import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Reference catalog of known brands, seeded by the CreateCatalog migration. */
@Entity()
export class Brand {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  name!: string;

  // Alternative spellings seen in raw supplier text (e.g. "Seren" for La Serenísima).
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  aliases!: string[];
}
