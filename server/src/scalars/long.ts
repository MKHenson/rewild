import { GraphQLScalarType, Kind } from 'graphql';

export const LongType = new GraphQLScalarType({
  name: 'Long',
  description: '64-bit integral numbers',
  // TODO: Number is only 52-bit
  serialize: Number,
  parseValue: Number,
  parseLiteral: function parseLiteral(ast) {
    if (ast.kind === Kind.INT) {
      const num = parseInt(ast.value, 10);
      return num;
    }
    return null;
  }
});
