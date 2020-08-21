import {parse as babelParse, ParserOptions} from '@babel/parser';
import * as t from '@babel/types';
import template, {
  TemplateBuilder,
  TemplateBuilderOptions,
} from '@babel/template';
import analyzeScope, {
  ScopeInfo,
  Scope,
  BlockScope,
  ThisAndArgumentsScope,
  isScope,
  isBlockScope,
  declaresArguments,
  declaresThis,
} from '@codemod-tools/babel-scope';
import filters, {
  Filter,
  NodeFilter,
  AllFilters,
} from '@codemod-tools/babel-filters';
import {ancestor, AncestorFunction, AncestorVisitor} from 'babel-walk';
import NodeReplacements from './NodeReplacements';
import Generator, {PrintOptions, PrintOptionsOverride} from './Generator';
import Path from './Path';

export type {ScopeInfo, Scope, BlockScope, ThisAndArgumentsScope};
export {isScope, isBlockScope, declaresArguments, declaresThis};

export type {Filter, NodeFilter, AllFilters};
export {filters};

export type {AncestorFunction as WalkFunction, AncestorVisitor as Visitors};
export {ancestor as walk};

export {t as types};

export {Path};

export default function parse(
  src: string,
  opts?: Omit<ParserOptions, 'ranges'>,
): ParsePrint {
  const ast = babelParse(src, {ranges: true, ...opts});
  const replacements = new NodeReplacements();
  const overrides = new PrintOptionsOverride();
  const ctx = {
    scope: analyzeScope(ast),
    overridePrintOptions: overrides.setOverride.bind(overrides),
  };
  const pathCache = new Map<t.Node, Path<any>>();
  const pathCTX = {
    ...ctx,
    src,
    remove: replacements.remove.bind(replacements),
    replacements,
    path<T extends t.Node>(node: T, parents: () => t.Node[]): Path<T> {
      const cached = pathCache.get(node);
      if (cached) return cached;
      const created = new Path(node, parents(), pathCTX);
      pathCache.set(node, created);
      return created;
    },
  };
  return {
    ...ctx,
    root: pathCTX.path(ast, () => []),
    replace: replacements.replace.bind(replacements),
    insertBefore: replacements.insertBefore.bind(replacements),
    insertAfter: replacements.insertAfter.bind(replacements),
    template: {
      statement: syntacticTemplate(
        template.statement({...opts, ranges: false}),
      ),
      statements: syntacticTemplate(
        template.statements({...opts, ranges: false}),
      ),
      expression: syntacticTemplate(
        template.expression({...opts, ranges: false}),
      ),
    },
    print(options) {
      const g = new Generator({
        source: src,
        replacements,
        overrides,
        options: options || {},
      });
      const output: string = g.generate(ast).code;
      if (/\n$/.test(src) && !/\n$/.test(output)) {
        return `${output}\n`;
      }
      if (!/\n$/.test(src) && /\n$/.test(output)) {
        return output.substr(0, output.length - 1);
      }
      return output;
    },
  };
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

export interface ParsePrint {
  root: Path<t.File>;
  scope: ScopeInfo;
  template: {
    statement(tpl: TemplateStringsArray, ...args: unknown[]): t.Statement;
    statements(tpl: TemplateStringsArray, ...args: unknown[]): t.Statement[];
    expression(tpl: TemplateStringsArray, ...args: unknown[]): t.Expression;
  };
  replace(node: t.Node, ...replacements: t.Node[]): void;
  insertBefore(node: t.Node, ...prefixes: t.Node[]): void;
  insertAfter(node: t.Node, ...suffixes: t.Node[]): void;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
  print(options?: PrintOptions): string;
}
