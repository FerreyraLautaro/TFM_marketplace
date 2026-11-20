import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordAndRoleToUser1795199725892 implements MigrationInterface {
  name = 'AddPasswordAndRoleToUser1795199725892';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "passwordHash" character varying NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role_enum" AS ENUM('BUYER', 'SELLER')`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "role" "public"."user_role_enum" NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordHash"`);
  }
}
