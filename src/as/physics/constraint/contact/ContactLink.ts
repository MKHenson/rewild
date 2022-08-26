import { RigidBody } from "../../core/RigidBody";
import { Shape } from "../../shape/Shape";
import { Contact } from "./Contact";

/**
 * A link list of contacts.
 * @author saharan
 */
export class ContactLink {
  prev: null;
  next: null;
  shape: Shape | null;
  body: RigidBody | null;
  contact: null | Contact;

  constructor(contact: Contact) {
    // The previous contact link.
    this.prev = null;
    // The next contact link.
    this.next = null;
    // The shape of the contact.
    this.shape = null;
    // The other rigid body.
    this.body = null;
    // The contact of the link.
    this.contact = contact;
  }
}
