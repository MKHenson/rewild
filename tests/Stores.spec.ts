import expect from "expect.js";
import { Store } from "../src/ts/ui/Store";

interface IReference {}
interface IPerson extends IReference {
  name: {
    first: string;
  };
}
interface IPeopleStore extends IReference {
  person1: IPerson;
  referencePointer: IReference;
}

describe("Stores", () => {
  it("returns true when a proxied property is compared against itself", () => {
    const store = new Store({ person: { name: "John" } });
    expect(store.defaultProxy.person).to.equal(store.defaultProxy.person);
  });

  it("creates a helper boolean to identify if an object is a proxy", () => {
    const store = new Store({ person: { name: "John" } });
    expect((store.defaultProxy.person as any).__isProxy).to.equal(true);
  });

  it("correctly calls the listeners on a set command, and passes the correct args", () => {
    const store = new Store({ person: { name: { first: "John" } } });
    store.signaller._getListeners().push((prop, prev, cur) => {
      expect(prop).to.equal("person.name.first");
      expect(prev).to.equal("John");
      expect(cur).to.equal("Mary");
    });

    store.defaultProxy.person.name.first = "Mary";
  });

  it("strips out proxies when setting properties on a store target", () => {
    const store = new Store<IPeopleStore>({ person1: { name: { first: "John" } }, referencePointer: { type: "none" } });

    const person1Proxied = store.defaultProxy.person1;
    store.defaultProxy.referencePointer;

    let keys = Array.from(store.signaller._getProxies().keys());
    expect(keys).to.contain("person1");
    expect(keys).to.contain("referencePointer");

    store.defaultProxy.referencePointer = person1Proxied;

    // Has cleared away key
    keys = Array.from(store.signaller._getProxies().keys());
    expect(keys).to.not.contain("referencePointer");

    // target is not a proxy
    expect((store.signaller.target.person1 as any).__isProxy).to.equal(undefined);
    expect((store.signaller.target.referencePointer as any).__isProxy).to.equal(undefined);

    // references still work on the original target - i.e. the proxy was stripped out
    expect(store.signaller.target.referencePointer).to.equal(store.signaller.target.person1);
    expect(store.signaller.target.referencePointer).to.not.equal(person1Proxied);

    // Now update the reference on the proxy, which should affect the original as its the same
    (store.defaultProxy.referencePointer as IPerson).name = { first: "Mary" };
    expect(store.defaultProxy.person1.name.first).to.equal("Mary");
  });

  it("does not duplicate proxies in arrays", () => {
    const store = new Store({
      world: {
        people: [
          { name: "george", age: 0 },
          { name: "mary", age: 0 },
        ],
      },
    });
    let numCalls = 0;

    for (let i = 0; i < 20; i++) {
      const newPeople = store.defaultProxy.world.people.map((person) => person);
      store.defaultProxy.world.people = newPeople;
    }

    store.signaller.__debuggerGetDelegate = (target, prop) => {
      numCalls++;
    };

    store.defaultProxy.world.people[0].age;
    expect(numCalls).to.equal(3);
  });
});
