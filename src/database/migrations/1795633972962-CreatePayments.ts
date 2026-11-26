import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1795633972962 implements MigrationInterface {
  name = 'CreatePayments1795633972962';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payment_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "reference" character varying NOT NULL, "amount" numeric(12,2) NOT NULL, "status" "public"."payment_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4bf2af7227a0562a1fa747298aa" UNIQUE ("reference"), CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d09d285fe1645cd2f0db811e29" ON "payment"  ("orderId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_one_pending_per_order" ON "payment"  ("orderId") WHERE "status" = 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE TABLE "processed_webhook_event" ("eventId" character varying NOT NULL, "paymentReference" character varying NOT NULL, "outcome" character varying NOT NULL, "receivedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_711e7b6e968d6af80e17bb013f4" PRIMARY KEY ("eventId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_d09d285fe1645cd2f0db811e293" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_d09d285fe1645cd2f0db811e293"`,
    );
    await queryRunner.query(`DROP TABLE "processed_webhook_event"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_one_pending_per_order"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d09d285fe1645cd2f0db811e29"`,
    );
    await queryRunner.query(`DROP TABLE "payment"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum"`);
  }
}
