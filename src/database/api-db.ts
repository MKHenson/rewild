import { apiFetch } from '../api/auth/api-client';

export class ApiDataTable<T> {
  private readonly collection: string;

  constructor(collection: string) {
    this.collection = collection;
  }

  async getOne(id: string): Promise<(T & { id: string }) | null> {
    const res = await apiFetch(`/api/${this.collection}/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${this.collection}/${id} failed: ${res.status}`);
    return res.json();
  }

  async getAll(): Promise<(T & { id: string })[]> {
    const res = await apiFetch(`/api/${this.collection}`);
    if (!res.ok) throw new Error(`GET ${this.collection} failed: ${res.status}`);
    return res.json();
  }

  async put(record: T & { id: string }): Promise<T & { id: string }> {
    const res = await apiFetch(`/api/${this.collection}/${record.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`PUT ${this.collection}/${record.id} failed: ${res.status}`);
    return res.json();
  }

  async remove(id: string): Promise<boolean> {
    const res = await apiFetch(`/api/${this.collection}/${id}`, { method: 'DELETE' });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`DELETE ${this.collection}/${id} failed: ${res.status}`);
    return true;
  }
}
