import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class RegisterDto {
  @IsEmail()
  email!: string;

  // bcrypt only uses the first 72 bytes of the input.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
