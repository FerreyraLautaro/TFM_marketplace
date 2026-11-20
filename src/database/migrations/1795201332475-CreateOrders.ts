import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1795201332475 implements MigrationInterface {
  name = 'CreateOrders1795201332475';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_enum" AS ENUM('PENDING', 'PAID', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "buyerId" uuid NOT NULL, "status" "public"."order_status_enum" NOT NULL DEFAULT 'PENDING', "total" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_20981b2b68bf03393c44dd1b9d" ON "order"  ("buyerId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sub_order_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'SHIPPED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sub_order" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "sellerId" uuid NOT NULL, "status" "public"."sub_order_status_enum" NOT NULL DEFAULT 'PENDING', "subtotal" numeric(12,2) NOT NULL, "commissionRate" numeric(5,2) NOT NULL, "commissionAmount" numeric(12,2) NOT NULL, "sellerNet" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e07c98da0cb6b2b2c59c811af62" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4447a2b720214f17688c73f3e1" ON "sub_order"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f4322c111200228b6559be83a0" ON "sub_order"  ("sellerId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_item" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "subOrderId" uuid NOT NULL, "productId" uuid, "productName" character varying(120) NOT NULL, "unitPrice" numeric(12,2) NOT NULL, "quantity" integer NOT NULL, "subtotal" numeric(12,2) NOT NULL, CONSTRAINT "PK_d01158fe15b1ead5c26fd7f4e90" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "commissionRate" numeric(5,2) NOT NULL DEFAULT '10'`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" ADD CONSTRAINT "FK_20981b2b68bf03393c44dd1b9d7" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD CONSTRAINT "FK_4447a2b720214f17688c73f3e1c" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" ADD CONSTRAINT "FK_f4322c111200228b6559be83a0a" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD CONSTRAINT "FK_c4275d16b99178c809cc508bc5a" FOREIGN KEY ("subOrderId") REFERENCES "sub_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" ADD CONSTRAINT "FK_904370c093ceea4369659a3c810" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP CONSTRAINT "FK_904370c093ceea4369659a3c810"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_item" DROP CONSTRAINT "FK_c4275d16b99178c809cc508bc5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP CONSTRAINT "FK_f4322c111200228b6559be83a0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sub_order" DROP CONSTRAINT "FK_4447a2b720214f17688c73f3e1c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order" DROP CONSTRAINT "FK_20981b2b68bf03393c44dd1b9d7"`,
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "commissionRate"`);
    await queryRunner.query(`DROP TABLE "order_item"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f4322c111200228b6559be83a0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4447a2b720214f17688c73f3e1"`,
    );
    await queryRunner.query(`DROP TABLE "sub_order"`);
    await queryRunner.query(`DROP TYPE "public"."sub_order_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_20981b2b68bf03393c44dd1b9d"`,
    );
    await queryRunner.query(`DROP TABLE "order"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
  }
}
