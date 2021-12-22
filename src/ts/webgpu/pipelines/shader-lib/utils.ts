import { Pipeline } from "../Pipeline";

export type Defines<T> = {
  [K in keyof T]: T[K];
} & {
  NUM_DIR_LIGHTS: number;
};

export type ShaderFunction<T extends Defines<T>> =
  | ((pipeline: Pipeline<T>) => number | string | boolean | undefined | null)
  | string;
export interface SourceFragments<T extends Defines<T>> {
  strings: TemplateStringsArray;
  expressions: (ShaderFunction<T> | string)[];
}

export function shader<T extends Defines<T>>(
  strings: TemplateStringsArray,
  ...expr: ShaderFunction<T>[]
): SourceFragments<T> {
  return {
    strings,
    expressions: expr,
  };
}

export function shaderBuilder<T extends Defines<T>>(sourceFragments: SourceFragments<T>, pipeline: Pipeline<T>) {
  let str = "";
  sourceFragments.strings.forEach((string, i) => {
    if (typeof sourceFragments.expressions[i] === "string" || typeof sourceFragments.expressions[i] === "number")
      str += string + (sourceFragments.expressions[i] || "");
    else if (sourceFragments.expressions[i]) {
      const fnOrText = sourceFragments.expressions[i];
      if (typeof fnOrText === "string") {
        str += string + fnOrText;
      } else {
        const expressionReturn = fnOrText(pipeline);

        if (typeof expressionReturn === "string") {
          str += string + expressionReturn;
        } else if (typeof expressionReturn === "number") {
          str += string + expressionReturn.toString();
        } else {
          str += string;
        }
      }
    } else {
      str += string;
    }
  });
  return str;
}
