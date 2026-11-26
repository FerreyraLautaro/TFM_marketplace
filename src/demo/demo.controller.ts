import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// nest-cli.json copies demo.html next to the compiled controller, so the same
// path works from src (tests) and from dist (start:dev and start:prod).
const PAGE_PATH = join(__dirname, 'demo.html');

// Interactive walkthrough of the main flow. Served by the API itself so the
// page calls the real endpoints from the same origin, with no CORS setup.
@ApiExcludeController()
@Controller('demo')
export class DemoController {
  private html?: string;

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(): string {
    this.html ??= readFileSync(PAGE_PATH, 'utf8');
    return this.html;
  }
}
