/** Small fetch helpers shared by feature repositories. Keeps the existing API contract intact. */
export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function readError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => ({} as { error?: string }));
  return new Error((payload as { error?: string }).error || fallback);
}
