import { ApiDataTable } from './api-db';
import { authService } from '../api/auth/auth-service';
import { mockResponse } from '../test-utils';

type Widget = { name: string; value: number };

describe('ApiDataTable', () => {
  let table: ApiDataTable<Widget>;

  beforeEach(() => {
    table = new ApiDataTable<Widget>('widgets');
    global.fetch = jest.fn();
    jest.spyOn(authService, 'getToken').mockReturnValue(null);
    jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getOne', () => {
    it('returns the parsed record on 200', async () => {
      const record = { id: 'abc', name: 'Sprocket', value: 42 };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, record));

      const result = await table.getOne('abc');

      expect(result).toEqual(record);
      expect(global.fetch).toHaveBeenCalledWith('/api/widgets/abc', undefined);
    });

    it('returns null on 404', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(404));

      const result = await table.getOne('missing');

      expect(result).toBeNull();
    });

    it('throws on non-2xx non-404 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(500));

      await expect(table.getOne('abc')).rejects.toThrow('GET widgets/abc failed: 500');
    });
  });

  describe('getAll', () => {
    it('returns all records on 200', async () => {
      const records = [
        { id: 'a', name: 'Sprocket', value: 1 },
        { id: 'b', name: 'Cog', value: 2 },
      ];
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, records));

      const result = await table.getAll();

      expect(result).toEqual(records);
      expect(global.fetch).toHaveBeenCalledWith('/api/widgets', undefined);
    });

    it('throws on non-2xx response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(503));

      await expect(table.getAll()).rejects.toThrow('GET widgets failed: 503');
    });
  });

  describe('put', () => {
    it('sends PUT with JSON body and returns the upserted record', async () => {
      const record = { id: 'abc', name: 'Sprocket', value: 42 };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200, record));

      const result = await table.put(record);

      expect(result).toEqual(record);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/widgets/abc');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body as string)).toEqual(record);
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('throws on non-2xx response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(422));

      await expect(table.put({ id: 'abc', name: 'Bad', value: 0 })).rejects.toThrow(
        'PUT widgets/abc failed: 422'
      );
    });
  });

  describe('remove', () => {
    it('sends DELETE and returns true on 200', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(200));

      const result = await table.remove('abc');

      expect(result).toBe(true);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/widgets/abc');
      expect(init.method).toBe('DELETE');
    });

    it('returns false on 404', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(404));

      const result = await table.remove('missing');

      expect(result).toBe(false);
    });

    it('throws on non-2xx non-404 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(500));

      await expect(table.remove('abc')).rejects.toThrow('DELETE widgets/abc failed: 500');
    });
  });

  describe('401 retry behaviour', () => {
    it('retries the request once with a new token after a 401', async () => {
      const record = { id: 'abc', name: 'Sprocket', value: 42 };
      jest.spyOn(authService, 'getToken').mockReturnValue('old.token');
      jest.spyOn(authService, 'refreshToken').mockResolvedValue('new.token');
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(mockResponse(401))
        .mockResolvedValueOnce(mockResponse(200, record));

      const result = await table.getOne('abc');

      expect(authService.refreshToken).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [, retryInit] = (global.fetch as jest.Mock).mock.calls[1] as [unknown, RequestInit];
      expect((retryInit.headers as Headers).get('Authorization')).toBe('Bearer new.token');
      expect(result).toEqual(record);
    });

    it('returns the 401 response as an error when refresh fails', async () => {
      jest.spyOn(authService, 'getToken').mockReturnValue('old.token');
      jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse(401));

      await expect(table.getOne('abc')).rejects.toThrow('GET widgets/abc failed: 401');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
