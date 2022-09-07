import { GraphQLEnumType } from 'graphql';

export const SortOrderEnumType = new GraphQLEnumType({
  name: 'SortOrderEnumType',
  values: { asc: { value: 'asc' }, desc: { value: 'desc' } }
});
