import {parse as babelParse, ParserOptions} from '@babel/parser';
import * as t from '@babel/types';
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
import template, {TemplateHelpers} from './template';
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

export type {TemplateHelpers};
export {template};

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
    template: template(opts),
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

export interface ParsePrint {
  root: Path<t.File>;
  scope: ScopeInfo;
  template: TemplateHelpers;
  replace(node: t.Node, ...replacements: t.Node[]): void;
  insertBefore(node: t.Node, ...prefixes: t.Node[]): void;
  insertAfter(node: t.Node, ...suffixes: t.Node[]): void;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
  print(options?: PrintOptions): string;
}
