import { DemoController } from './demo.controller';

describe('DemoController', () => {
  it('serves the demo page as a full HTML document', () => {
    const html = new DemoController().page();

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>Marketplace · Demo</title>');
  });

  it('calls the API with relative URLs only', () => {
    const html = new DemoController().page();

    expect(html).not.toMatch(/https?:\/\/localhost/);
  });
});
