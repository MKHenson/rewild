import { ObjectType, Field } from "type-graphql";

@ObjectType({ description: "Object representing the server system" })
export class System {
  @Field()
  status: string;

  constructor() {
    this.status = "OK";
  }
}
