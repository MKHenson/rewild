import { Dispatcher } from 'rewild-common';
import {
  UserAccount,
  getAdminUser,
  getAdminUsers,
  sendAdminPasswordReset,
  updateAdminUser,
  UpdateUserRequest,
} from '../../api/admin';

export type AdminStoreEvents = { kind: 'changed' };

export const USER_ROLES = [
  { value: 'user', label: 'User' },
  { value: 'super_admin', label: 'Super Admin' },
];

export function roleLabel(role: string): string {
  return USER_ROLES.find((r) => r.value === role)?.label ?? role;
}

export class AdminStore {
  loading = false;
  error?: string;
  users: UserAccount[] = [];

  readonly dispatcher = new Dispatcher<AdminStoreEvents>();

  async fetchUsers() {
    this.loading = true;
    this.error = undefined;
    this.dispatcher.dispatch({ kind: 'changed' });

    try {
      this.users = await getAdminUsers();
    } catch (err: any) {
      this.error = err.message;
    }

    this.loading = false;
    this.dispatcher.dispatch({ kind: 'changed' });
  }

  getUser(id: string): Promise<UserAccount> {
    return getAdminUser(id);
  }

  async updateUser(id: string, req: UpdateUserRequest): Promise<UserAccount> {
    const user = await updateAdminUser(id, req);
    this.users = this.users.map((u) => (u.id === id ? user : u));
    this.dispatcher.dispatch({ kind: 'changed' });
    return user;
  }

  sendPasswordReset(id: string): Promise<void> {
    return sendAdminPasswordReset(id);
  }
}

export const adminStore = new AdminStore();
