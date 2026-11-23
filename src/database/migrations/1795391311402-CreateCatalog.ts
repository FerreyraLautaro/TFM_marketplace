import { MigrationInterface, QueryRunner } from 'typeorm';

// Reference data, seeded here so every environment (dev, e2e, Railway) has it.
// Kept inline: a migration must not depend on application code that may change.
const BRANDS: Array<[name: string, aliases: string[]]> = [
  ['La Serenísima', ['Serenisima', 'Seren']],
  ['SanCor', ['San Cor']],
  ['Danone', []],
  ['Ilolay', []],
  ['Paladini', []],
  ['Swift', []],
  ['Paty', []],
  ['Coca-Cola', ['Coca', 'Coca Cola', 'Coke']],
  ['Pepsi', []],
  ['Sprite', []],
  ['Fanta', []],
  ['Villavicencio', ['Villa Vicencio']],
  ['Quilmes', []],
  ["Hellmann's", ['Hellmanns', 'Hellmans', 'Helmans']],
  ['Natura', []],
  ['Cocinero', []],
  ['Marolio', []],
  ['Lucchetti', ['Luchetti']],
  ['Knorr', []],
  ['Ledesma', []],
  ['Arcor', []],
  ['Bagley', []],
  ['Terrabusi', []],
  ['Nestlé', ['Nestle']],
  ['Taragüi', ['Taragui']],
  ['Playadito', []],
  ['La Virginia', ['Virginia']],
  ['Cabrales', []],
  ['Magistral', []],
  ['Ayudín', ['Ayudin']],
  ['Ala', []],
  ['Skip', []],
  ['Dove', []],
  ['Pampers', []],
  ['Dog Chow', ['Purina Dog Chow']],
];

export class CreateCatalog1795391311402 implements MigrationInterface {
  name = 'CreateCatalog1795391311402';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "brand" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(80) NOT NULL, "aliases" text array NOT NULL DEFAULT '{}', CONSTRAINT "UQ_5f468ae5696f07da025138e38f7" UNIQUE ("name"), CONSTRAINT "PK_a5d20765ddd942eb5de4eee2d7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."normalization_run_status_enum" AS ENUM('SUCCESS', 'INVALID_OUTPUT', 'ERROR')`,
    );
    await queryRunner.query(
      `CREATE TABLE "normalization_run" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "rawText" text NOT NULL, "promptVersion" character varying(20) NOT NULL, "model" character varying(100), "status" "public"."normalization_run_status_enum" NOT NULL, "rawOutput" text, "result" jsonb, "error" text, "attempts" integer NOT NULL, "latencyMs" integer NOT NULL, "inputTokens" integer, "outputTokens" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_be54f76fc3dcfb21b5851b166b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df7871fb953d873b5dcf0f78a9" ON "normalization_run" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "normalization_run" ADD CONSTRAINT "FK_df7871fb953d873b5dcf0f78a99" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    for (const [name, aliases] of BRANDS) {
      await queryRunner.query(
        `INSERT INTO "brand" ("name", "aliases") VALUES ($1, $2)`,
        [name, aliases],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "brand" WHERE "name" = ANY($1)`, [
      BRANDS.map(([name]) => name),
    ]);
    await queryRunner.query(
      `ALTER TABLE "normalization_run" DROP CONSTRAINT "FK_df7871fb953d873b5dcf0f78a99"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_df7871fb953d873b5dcf0f78a9"`,
    );
    await queryRunner.query(`DROP TABLE "normalization_run"`);
    await queryRunner.query(
      `DROP TYPE "public"."normalization_run_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE "brand"`);
  }
}
