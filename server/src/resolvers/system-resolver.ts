import { Resolver, Query } from "type-graphql";
import { System } from "../models/system-type";

@Resolver((of) => System)
export class SystemResolver {
  @Query((returns) => System)
  async system() {
    return new System();
  }
}
