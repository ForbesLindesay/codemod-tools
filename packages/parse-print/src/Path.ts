import * as t from '@babel/types';
import {ScopeInfo} from '@codemod-tools/babel-scope';
import {NodeFilter} from '@codemod-tools/babel-filters';
import NodeReplacements from './NodeReplacements';
import {PrintOptions} from './Generator';
import Removers from './Removers';

interface PathContext {
  path<T extends t.Node>(node: T, parents: () => t.Node[]): Path<T>;
  scope: ScopeInfo;
  src: string;
  replacements: NodeReplacements;
  overridePrintOptions(node: t.Node, options: PrintOptions): void;
}

export default class Path<T extends t.Node> {
  public readonly node: T;
  public readonly parents: t.Node[];
  private readonly _ctx: PathContext;
  constructor(node: T, parents: t.Node[], ctx: PathContext) {
    this.node = node;
    this.parents = parents;
    this._ctx = ctx;
  }

  get source() {
    // @ts-expect-error
    const [start, end]: [number, number] = this.node.range;
    return this._ctx.src.substring(start, end);
  }

  // Update methods

  public replace(...replacements: t.Node[]) {
    this._ctx.replacements.replace(this.node, ...replacements);
  }

  public insertBefore(...prefixes: t.Node[]) {
    this._ctx.replacements.insertBefore(this.node, ...prefixes);
  }

  public insertAfter(...suffixes: t.Node[]) {
    this._ctx.replacements.insertAfter(this.node, ...suffixes);
  }

  public overridePrintOptions(options: PrintOptions) {
    this._ctx.overridePrintOptions(this.node, options);
  }

  public replaceString(this: Path<t.StringLiteral>, value: string) {
    const source = this.source;
    const literal = t.stringLiteral(value);
    this.replace(literal);
    this._ctx.overridePrintOptions(literal, {
      strings: {
        quotes: source[0] === `'` ? 'single' : 'double',
      },
    });
  }

  public remove() {
    const parentPath = this.parentPath;
    const parent = parentPath.node;
    const remover = Removers[parent.type];
    if (remover) {
      remover({
        node: this.node,
        // @ts-expect-error
        parentPath,
        // @ts-expect-error
        parent: this._ctx.replacements.resolveRemovals(parent) || parent,
        removeFrom: (key: string) =>
          this._ctx.replacements.remove(
            parent,
            // @ts-expect-error
            key,
            this.node,
          ),
      });
    } else {
      throw new Error(
        `parse-print does not know how to remove a child of ${parent.type}`,
      );
    }
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
