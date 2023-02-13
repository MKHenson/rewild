import { Store } from "../Store";

interface IAuth {
  loggedIn: boolean;
  user: {
    name: string;
    age: number;
    pies: string[];
  };
}

export class AuthStore extends Store<IAuth> {
  constructor() {
    super({ loggedIn: false, user: { age: 0, name: "Mathew Henson", pies: ["1", "1", "1", "1", "1"] } });
  }
}

export const authStore = new AuthStore();
