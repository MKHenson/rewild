/** Creates a mock fetch Response with the given status and optional JSON body. */
export function mockResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Installs a mock global.fetch that returns the given responses in sequence. */
export function mockFetch(...responses: Response[]): void {
  let i = 0;
  global.fetch = jest.fn(() => Promise.resolve(responses[i++]));
}
