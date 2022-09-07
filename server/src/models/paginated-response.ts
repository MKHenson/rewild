import { ObjectType, Field, ClassType, Int } from "type-graphql";

export function PaginatedResponse<TItem>(TItemClass: ClassType<TItem>) {
  @ObjectType({ isAbstract: true })
  abstract class PaginatedResponseClassInner {
    // here we use the runtime argument
    @Field((type) => [TItemClass])
    // and here the generic type
    data: TItem[];

    @Field((type) => Int)
    count: number;

    @Field((type) => Int)
    limit: number;

    @Field((type) => Int)
    index: number;
  }

  return PaginatedResponseClassInner as new () => {
    [key in keyof PaginatedResponseClassInner]: PaginatedResponseClassInner[key];
  };
}
