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
import {ancestor, AncestorFunction, AncestorVisitor} from 'babel-walk';
import NodeReplacements from './NodeReplacements';
import Generator, {PrintOptions, PrintOptionsOverride} from './Generator';

export type {ScopeInfo, Scope, BlockScope, ThisAndArgumentsScope};
export {isScope, isBlockScope, declaresArguments, declaresThis};

export type {Filter, NodeFilter, AllFilters};
export {filters};

export type {AncestorFunction as WalkFunction, AncestorVisitor as Visitors};
export {ancestor as walk};

export {t as types};

export default function parse(
  src: string,
  opts?: Omit<ParserOptions, 'ranges'>,
): ParsePrint {
  const ast = babelParse(src, {ranges: true, ...opts});
  const replacements = new NodeReplacements();
  const overrides = new PrintOptionsOverride();
  const ctx = {
    scope: analyzeScope(ast),
    replace: replacements.replace.bind(replacements),
    overridePrintOptions: overrides.setOverride.bind(overrides),
  };
  return {
    ...ctx,
    root: new Path(ast, [], ctx),
    print(options) {
      const g = new Generator({
        source: src,
        replacements,
        overrides,
        options: options || {},
      });
      return g.generate(ast).code;
    },
  };
}

export interface ParsePrint {
  root: Path<t.File>;
  scope: ScopeInfo;
  replace(node: t.Node, ...replacements: t.Node[]): void;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
  print(options?: PrintOptions): string;
}

interface PathContext {
  scope: ScopeInfo;
  replace(node: t.Node, ...replacements: t.Node[]): void;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
}

export class Path<T extends t.Node> {
  public readonly node: T;
  public readonly parents: t.Node[];
  private readonly _ctx: PathContext;
  constructor(node: T, parents: t.Node[], ctx: PathContext) {
    this.node = node;
    this.parents = parents;
    this._ctx = ctx;
  }

  // Update methods

  public replace(...replacements: t.Node[]) {
    this._ctx.replace(this.node, ...replacements);
  }
  public overridePrintOptions(options: PrintOptions) {
    this._ctx.overridePrintOptions(this.node, options);
  }

  // Navigation Methods

  public find<T extends t.Node>(filter: NodeFilter<T>) {
    return filter.find(
      this.node,
      (node, parents) =>
        new Path(
          node,
          [...parents.slice().reverse().slice(1), ...this.parents],
          this._ctx,
        ),
    );
  }

  private _toPath<T extends t.Node>({
    node,
    parents,
  }: {
    node: T;
    parents: t.Node[];
  }) {
    return new Path(node, parents, this._ctx);
  }

  public findDeclaration(this: Path<t.Identifier>) {
    const declaration = this._ctx.scope.declarations.get(this.node);
    return declaration && this._toPath(declaration);
  }

  public findReferences(this: Path<t.Identifier>) {
    const references = this._ctx.scope.references.get(this.node);
    return (references || []).map((r) => this._toPath(r));
  }
}
