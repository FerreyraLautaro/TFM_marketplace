import { ArgumentsHost } from '@nestjs/common';
import {
  LlmRequestError,
  LlmUnavailableError,
} from '../../llm/application/ports/llm.errors';
import {
  CatalogExceptionFilter,
  DEFAULT_RETRY_AFTER_SECONDS,
} from './catalog-exception.filter';
import { InvalidLlmOutputError } from '../domain/catalog.errors';

describe('CatalogExceptionFilter', () => {
  const filter = new CatalogExceptionFilter();
  const response = {
    status: jest.fn(),
    setHeader: jest.fn(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  beforeEach(() => {
    jest.clearAllMocks();
    response.status.mockReturnValue(response);
    response.setHeader.mockReturnValue(response);
  });

  it('maps an unavailable provider to 503 with Retry-After in seconds', () => {
    filter.catch(new LlmUnavailableError('down', 3, 4_200), host);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503 }),
    );
  });

  it('uses a default Retry-After when the provider gives none', () => {
    filter.catch(new LlmUnavailableError('down', 3), host);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      String(DEFAULT_RETRY_AFTER_SECONDS),
    );
  });

  it('maps invalid output to 502 with the run id', () => {
    filter.catch(new InvalidLlmOutputError('run-1', 'bad json'), host);

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 502, runId: 'run-1' }),
    );
  });

  it('maps a rejected request to 502 without a run id', () => {
    filter.catch(new LlmRequestError('rejected', 1), host);

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.setHeader).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.not.objectContaining({ runId: expect.anything() as unknown }),
    );
  });
});
