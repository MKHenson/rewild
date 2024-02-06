import { Node } from "./Node";
import { Portal } from "./Portal";

describe("Routing - Node", () => {
  it("is not disposed by default", () => {
    const node = new Node("test");
    expect(node.isDisposed).toBe(false);
  });

  it("is not mounted by default", () => {
    const node = new Node("test");
    expect(node.mounted).toBe(false);
  });

  it("is auto-disposed by default", () => {
    const node = new Node("test");
    expect(node.autoDispose).toBe(true);
  });

  it("can add a node as a child of this node", () => {
    const parentNode = new Node("parent");
    const childNode1 = new Node("child01");

    parentNode.addChild(childNode1);
    expect(parentNode.children.length).toBe(1);
    expect(childNode1.parent).toBe(parentNode);
  });

  it("can remove a node as a child of this node", () => {
    const parentNode = new Node("parent");
    const childNode1 = new Node("child01");
    const childNode2 = new Node("child02");
    parentNode.addChild(childNode1).addChild(childNode2);

    parentNode.removeChild(childNode1);
    expect(parentNode.children.length).toBe(1);
    expect(parentNode.children.at(0)).toBe(childNode2);
    expect(childNode1.parent).toBe(null);
  });

  it("will dispose all children when disposed", () => {
    const parentNode = new Node("parent");
    const childNode1 = new Node("child01");
    const childNode2 = new Node("child02");
    parentNode.addChild(childNode1).addChild(childNode2);

    parentNode.dispose();
    expect(parentNode.children.length).toBe(0);
    expect(childNode1.isDisposed).toBe(true);
    expect(childNode2.isDisposed).toBe(true);
    expect(parentNode.isDisposed).toBe(true);
  });

  it("can add a portal to this node", () => {
    const parentNode = new Node("parent");
    const portal = new Portal("portal");
    parentNode.addPortal(portal);

    expect(parentNode.portals.length).toBe(1);
    expect(portal.node).toBe(parentNode);
  });

  it("can remove a portal from this node", () => {
    const parentNode = new Node("parent");
    const portal1 = new Portal("portal01");
    const portal2 = new Portal("portal02");
    parentNode.addPortal(portal1);
    parentNode.addPortal(portal2);

    parentNode.removePortal(portal1);
    expect(parentNode.portals.length).toBe(1);
    expect(parentNode.portals.at(0)).toBe(portal2);
    expect(portal1.node).toBe(null);
  });

  it("will dispose all portals when disposed", () => {
    const parentNode = new Node("parent");
    const portal1 = new Portal("portal01");
    const portal2 = new Portal("portal02");
    parentNode.addPortal(portal1);
    parentNode.addPortal(portal2);

    parentNode.dispose();
    expect(parentNode.portals.length).toBe(0);
    expect(portal1.disposed).toBe(true);
    expect(portal2.disposed).toBe(true);
  });

  it("can get a portal by name", () => {
    const parentNode = new Node("parent");
    const portal1 = new Portal("portal01");
    const portal2 = new Portal("portal02");
    parentNode.addPortal(portal1);
    parentNode.addPortal(portal2);

    expect(parentNode.getPortal("portal01")).toBe(portal1);
    expect(parentNode.getPortal("portal02")).toBe(portal2);
  });
});
