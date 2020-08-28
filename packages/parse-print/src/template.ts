import babelTemplate, {
  TemplateBuilder,
  TemplateBuilderOptions,
} from '@babel/template';
import {ParserOptions} from '@babel/parser';
import {Statement, Expression} from '@babel/types';

export interface TemplateHelpers {
  statement: ((tpl: TemplateStringsArray, ...args: unknown[]) => Statement) & {
    withoutComments: (
      tpl: TemplateStringsArray,
      ...args: unknown[]
    ) => Statement;
  };
  statements: ((
    tpl: TemplateStringsArray,
    ...args: unknown[]
  ) => Statement[]) & {
    withoutComments: (
      tpl: TemplateStringsArray,
      ...args: unknown[]
    ) => Statement[];
  };
  expression: ((
    tpl: TemplateStringsArray,
    ...args: unknown[]
  ) => Expression) & {
    withoutComments: (
      tpl: TemplateStringsArray,
      ...args: unknown[]
    ) => Expression;
  };
}
export default function template(
  opts: Omit<ParserOptions, 'ranges'> = {},
): TemplateHelpers {
  return {
    statement: syntacticTemplateWithCommentsHelper(
      babelTemplate.statement({...opts, ranges: false}),
    ),
    statements: syntacticTemplateWithCommentsHelper(
      babelTemplate.statements({...opts, ranges: false}),
    ),
    expression: syntacticTemplateWithCommentsHelper(
      babelTemplate.expression({...opts, ranges: false}),
    ),
  };
}
function syntacticTemplateWithCommentsHelper<T>(builder: TemplateBuilder<T>) {
  return Object.assign(syntacticTemplate(builder({preserveComments: true})), {
    withoutComments: syntacticTemplate(builder({preserveComments: false})),
  });
}
function syntacticTemplate<T>(builder: TemplateBuilder<T>) {
  const builder2 = builder({
    syntacticPlaceholders: true,
  } as TemplateBuilderOptions);
  const templateFnCache = new WeakMap<
    TemplateStringsArray,
    (arg: {[index: string]: unknown}) => T
  >();
  return (tpl: TemplateStringsArray, ...args: unknown[]) => {
    let fn = templateFnCache.get(tpl);
    if (!fn) {
      fn = builder2(
        tpl
          .map((str, i) => (i === 0 ? str : `%%placeholder${i - 1}%%${str}`))
          .join(''),
      );
      templateFnCache.set(tpl, fn);
    }
    const argsObj: {[index: string]: unknown} = {};
    for (let i = 0; i < args.length; i++) {
      argsObj[`placeholder${i}`] = args[i];
    }
    return fn(argsObj);
  };
}
