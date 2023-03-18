import expect from "expect.js";
import { Store } from "../src/ts/ui/Store";

describe("Stores", () => {
  it("returns true when a proxied property is compared against itself", () => {
    const store = new Store({ person: { name: "John" } });
    expect(store.defaultProxy.person).to.equal(store.defaultProxy.person);
  });

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
    store.signaller.getListeners().push((prop, prev, cur) => {
      expect(prop).to.equal("person.name.first");
      expect(prev).to.equal("John");
      expect(cur).to.equal("Mary");
    });

    store.defaultProxy.person.name.first = "Mary";
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
    expect(numCalls).to.equal(4);
  });
});
