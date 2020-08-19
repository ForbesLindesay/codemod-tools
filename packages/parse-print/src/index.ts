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
    insertBefore: replacements.insertBefore.bind(replacements),
    insertAfter: replacements.insertAfter.bind(replacements),
    overridePrintOptions: overrides.setOverride.bind(overrides),
  };
  const pathCache = new Map<t.Node, Path<any>>();
  const pathCTX = {
    ...ctx,
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
  insertBefore(node: t.Node, ...prefixes: t.Node[]): void;
  insertAfter(node: t.Node, ...suffixes: t.Node[]): void;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
  print(options?: PrintOptions): string;
}

interface PathContext {
  path<T extends t.Node>(node: T, parents: () => t.Node[]): Path<T>;
  scope: ScopeInfo;
  replace(node: t.Node, ...replacements: t.Node[]): void;
  insertBefore(node: t.Node, ...prefixes: t.Node[]): void;
  insertAfter(node: t.Node, ...suffixes: t.Node[]): void;
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
  public insertBefore(...prefixes: t.Node[]) {
    this._ctx.insertBefore(this.node, ...prefixes);
  }
  public insertAfter(...suffixes: t.Node[]) {
    this._ctx.insertAfter(this.node, ...suffixes);
  }

  public overridePrintOptions(options: PrintOptions) {
    this._ctx.overridePrintOptions(this.node, options);
  }

  // Navigation Methods

  public get parentPath() {
    return this._ctx.path(this.parents[0], () => this.parents.slice(1));
  }

  public get<TKey extends keyof T>(
    key: TKey,
  ): T[TKey] extends t.Node
    ? Path<T[TKey]>
    : T[TKey] extends (infer E)[]
    ? (E extends t.Node ? Path<E> : E)[]
    : T[TKey] {
    let parentsCache: t.Node[] | undefined;
    const parents = () =>
      parentsCache || (parentsCache = [this.node, ...this.parents]);
    const value: any = this.node[key];
    if (t.isNode(value)) {
      return this._ctx.path(value, parents) as any;
    }
    if (Array.isArray(value)) {
      return value.map((v) => {
        if (t.isNode(v)) {
          return this._ctx.path(v, parents);
        }
        return v;
      }) as any;
    }
    return value;
  }

  public find<T extends t.Node>(filter: NodeFilter<T>) {
    return filter.find(this.node, (node, parents) =>
      this._ctx.path(node, () => [
        ...parents.slice().reverse().slice(1),
        ...this.parents,
      ]),
    );
  }

  public findClosestParent<T extends t.Node>(filter: NodeFilter<T>) {
    const i = this.parents.findIndex(filter);
    if (i === -1) {
      return undefined;
    }
    return this._ctx.path(this.parents[i] as T, () =>
      this.parents.slice(i + 1),
    );
  }

  public findDeclaration(this: Path<t.Identifier>) {
    const declaration = this._ctx.scope.declarations.get(this.node);
    return (
      declaration && this._ctx.path(declaration.node, () => declaration.parents)
    );
  }

  public findReferences(this: Path<t.Identifier>) {
    const references = this._ctx.scope.references.get(this.node);
    return (references || []).map((r) =>
      this._ctx.path(r.node, () => r.parents),
    );
  }
}
