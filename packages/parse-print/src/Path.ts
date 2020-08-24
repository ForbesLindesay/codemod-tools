import * as t from '@babel/types';
import {ScopeInfo} from '@codemod-tools/babel-scope';
import filters, {NodeFilter} from '@codemod-tools/babel-filters';
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

  public replace(replacements: t.Node) {
    this._ctx.replacements.replace(this.node, replacements);
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

  public is<S extends T>(filter: NodeFilter<S>): this is Path<S> {
    return filter(this.node);
  }
  public isInside(
    parent: Path<t.Node>,
    {includeSelf = false}: {includeSelf?: boolean} = {},
  ) {
    return (
      (includeSelf && parent.node === this.node) ||
      this.parents.includes(parent.node)
    );
  }

  public map<TResult>(
    mapper: {
      [Type in T['type']]: (path: Path<Extract<T, {type: Type}>>) => TResult;
    },
  ): TResult;
  public map<TResult, TKeys extends T['type']>(
    mapper: {
      [Type in TKeys]?: (path: Path<Extract<T, {type: Type}>>) => TResult;
    },
    fallback: (
      path: Path<Extract<T, {type: Exclude<T['type'], TKeys>}>>,
    ) => TResult,
  ): TResult;
  public map<TResult>(
    mapper: {[Type in string]?: (path: Path<any>) => TResult},
    fallback?: (path: Path<any>) => TResult,
  ): TResult {
    const m = mapper[this.node.type];
    return typeof m === 'function' ? m(this) : fallback!(this);
  }

  public get parentPath(): Path<t.Node> {
    return this._ctx.path(this.parents[0], () => this.parents.slice(1));
  }

  public get<TKey extends keyof T>(
    key: TKey,
  ): T[TKey] extends t.Node
    ? Path<T[TKey]>
    : T[TKey] extends (infer E)[]
    ? (E extends t.Node
        ? Path<
            // We have to redo the inference here because we want `Path<t.NodeTypeA | t.NodeTypeB>` not `Path<t.NodeTypeA> | Path<t.NodeTypeB>`
            T[TKey] extends (infer E)[] ? (E extends t.Node ? E : never) : never
          >
        : E)[]
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

  public find<T extends t.Node>(filter: NodeFilter<T>): Path<T>[] {
    return filter.find(this.node, (node, parents) =>
      this._ctx.path(node, () => [
        ...parents.slice().reverse().slice(1),
        ...this.parents,
      ]),
    );
  }

  public findClosestParent<T extends t.Node>(
    filter: NodeFilter<T>,
    {includeSelf = false}: {includeSelf?: boolean} = {},
  ): Path<T> | undefined {
    if (includeSelf && filter(this.node)) {
      // @ts-expect-error
      return this;
    }
    const i = this.parents.findIndex(filter);
    if (i === -1) {
      return undefined;
    }
    return this._ctx.path(this.parents[i] as T, () =>
      this.parents.slice(i + 1),
    );
  }

  public findDeclaration(
    this: Path<t.Identifier>,
  ): Path<t.Identifier> | undefined {
    const declaration = this._ctx.scope.declarations.get(this.node);
    return (
      declaration && this._ctx.path(declaration.node, () => declaration.parents)
    );
  }

  /**
   * Find the outermost scope in which all identifiers of this expression are declared
   */
  public findOuterScope():
    | Path<
        t.CatchClause | t.For | t.BlockStatement | t.FunctionParent | t.Program
      >
    | undefined {
    const node = this.node;
    if (filters.Identifier(node)) {
      const declaration = this._ctx.scope.declarations.get(node) || {node};
      const scope = this._ctx.scope.declarationScope.get(declaration.node);
      return scope && this._ctx.path(scope.node, () => scope.parents);
    } else {
      const scopes = new Set<
        t.CatchClause | t.For | t.BlockStatement | t.FunctionParent | t.Program
      >();
      const identifers = this.find(filters.Identifier);
      for (const identifier of identifers) {
        const declaration =
          this._ctx.scope.declarations.get(identifier.node) || identifier;
        const scope = this._ctx.scope.declarationScope.get(declaration.node);
        if (scope) {
          scopes.add(scope.node);
        }
      }
      if (!scopes.size) {
        return undefined;
      }
      let result = this.parentPath;
      while (
        !result.is(filters.Program) &&
        !scopes.has(
          result.node as
            | t.CatchClause
            | t.For
            | t.BlockStatement
            | t.FunctionParent
            | t.Program,
        )
      ) {
        result = result.parentPath;
      }
      return result as Path<
        t.CatchClause | t.For | t.BlockStatement | t.FunctionParent | t.Program
      >;
    }
  }

  public findClosestCommonParent(...paths: Path<t.Node>[]) {
    return Path.findClosestCommonParent(this, ...paths);
  }

  public static findClosestCommonParent(
    path: Path<t.Node>,
    ...paths: Path<t.Node>[]
  ) {
    const candidates = new Set([path.node, ...path.parents]);
    for (const path of paths) {
      const intersectionCandidates = new Set([path.node, ...path.parents]);
      for (const candidate of candidates) {
        if (!intersectionCandidates.has(candidate)) {
          candidates.delete(candidate);
        }
      }
    }
    if (candidates.size) {
      let candidate = path;
      while (!candidates.has(candidate.node)) {
        candidate = candidate.parentPath;
      }
      return candidate;
    } else {
      return undefined;
    }
  }

  public findReferences(this: Path<t.Identifier>): Path<t.Identifier>[] {
    const references = this._ctx.scope.references.get(this.node);
    return (references || []).map((r) =>
      this._ctx.path(r.node, () => r.parents),
    );
  }

  public findImportDeclarations(
    this: Path<t.Program | t.File>,
    packageName: string,
  ): Path<t.ImportDeclaration>[] {
    return this.find(
      filters.ImportDeclaration.and({
        source: filters.StringLiteral.and({value: packageName}),
      }),
    );
  }

  public findRequireCalls(
    this: Path<t.Node>,
    packageName: string,
  ): Path<t.CallExpression>[] {
    return this.find(
      filters.CallExpression.and({
        callee: filters.Identifier.and({name: 'require'}),
      }),
    ).filter(
      (requireCall) =>
        requireCall.node.arguments.length === 1 &&
        filters.StringLiteral.and({value: packageName})(
          requireCall.node.arguments[0],
        ),
    );
  }

  public getObjectProperty(this: Path<t.ObjectExpression>, keyName: string) {
    const computedProperties: Path<t.ObjectProperty | t.ObjectMethod>[] = [];
    const spreadElements: Path<t.SpreadElement>[] = [];
    let value: Path<t.Node> | undefined;

    this.get('properties').forEach((prop) => {
      prop.map(
        {
          SpreadElement: (spreadElement) => {
            spreadElements.push(spreadElement);
          },
        },
        (objectPropertyOrMethod) => {
          const key = objectPropertyOrMethod.get('key');
          const name = key.map(
            {
              Identifier: (path): string | undefined =>
                objectPropertyOrMethod.node.computed
                  ? undefined
                  : path.node.name,
              StringLiteral: (path): string | undefined => path.node.value,
              NumericLiteral: (path): string | undefined =>
                `${path.node.value}`,
              BooleanLiteral: (path): string | undefined =>
                `${path.node.value}`,
            },
            (): string | undefined => undefined,
          );
          if (!name) {
            computedProperties.push(objectPropertyOrMethod);
          } else if (name === keyName) {
            computedProperties.splice(0, computedProperties.length);
            spreadElements.splice(0, computedProperties.length);
            value = objectPropertyOrMethod.map<Path<t.Node>>({
              ObjectProperty: (op) => op.get('value'),
              ObjectMethod: (om) => om,
            });
          }
        },
      );
    });
    return {value, computedProperties, spreadElements};
  }

  public findPropertyReferences(
    this: Path<
      t.Expression | t.ImportDeclaration | t.VariableDeclarator | t.Pattern
    >,
    name: string | number,
  ) {
    /**
     * All declarations for the given property. This may include namespace declarations,
     * which may or may not also be used for other properties.
     */
    const declarations: Path<
      t.ImportSpecifier | t.ImportNamespaceSpecifier | t.VariableDeclarator
    >[] = [];
    /**
     * References that codemod-tools couldn't follow, e.g. if the entire namespace is
     * passed as a parameter to a function.
     */
    const unsupportedNamespaceReferences: Path<t.Node>[] = [];
    /**
     * Actual references to the property
     */
    const references: Path<
      t.Identifier | t.MemberExpression | t.Pattern
    >[] = [];

    function findValueReferences(
      valueReference: Path<t.Identifier | t.MemberExpression>,
    ) {
      const parentPath = valueReference.parentPath;
      if (
        parentPath.is(
          filters.VariableDeclarator.and({id: filters.Identifier}),
        ) &&
        parentPath.node.init === valueReference.node
      ) {
        declarations.push(parentPath);
        parentPath
          .get('id')
          .findReferences()
          .forEach((ref) => findValueReferences(ref));
      } else if (
        parentPath.is(filters.VariableDeclarator.and({id: filters.Pattern})) &&
        parentPath.node.init === valueReference.node
      ) {
        declarations.push(parentPath);
        references.push(parentPath.get('id'));
      } else {
        references.push(valueReference);
      }
    }
    function findPropertyReferences(
      namespaceReference: Path<
        t.Expression | t.ImportDeclaration | t.VariableDeclarator | t.Pattern
      >,
    ) {
      namespaceReference.map(
        {
          ImportDeclaration: (importDeclaration) => {
            importDeclaration.get('specifiers').forEach((specifier) => {
              specifier.map({
                ImportDefaultSpecifier: () => {
                  // ignore
                },
                ImportNamespaceSpecifier: (namespaceSpecifier) => {
                  declarations.push(namespaceSpecifier);
                  const namespaceReferences = namespaceSpecifier
                    .get('local')
                    .findReferences();
                  for (const namespaceReference of namespaceReferences) {
                    findPropertyReferences(namespaceReference);
                  }
                },
                ImportSpecifier: (namedSpecifier) => {
                  if (namedSpecifier.get('imported').node.name === `${name}`) {
                    declarations.push(namedSpecifier);
                    namedSpecifier
                      .get('local')
                      .findReferences()
                      .forEach((ref) => findValueReferences(ref));
                  }
                },
              });
            });
          },
          VariableDeclarator: (variableDeclarator) => {
            declarations.push(variableDeclarator);
            variableDeclarator.get('id').map(
              {
                Identifier: (identifier) => {
                  identifier
                    .findReferences()
                    .forEach((ref) => findPropertyReferences(ref));
                },
                ObjectPattern: (objectPattern) => {
                  findPropertyReferences(objectPattern);
                },
              },
              () => {
                unsupportedNamespaceReferences.push(variableDeclarator);
              },
            );
          },
          ObjectPattern: (objectPattern) => {
            let found = false;
            for (const prop of objectPattern.get('properties')) {
              if (found) break;
              prop.map({
                RestElement: (restElement) => {
                  const argument = restElement.get('argument');
                  if (argument.is(filters.Identifier)) {
                    argument
                      .findReferences()
                      .forEach((ref) => findPropertyReferences(ref));
                  } else {
                    unsupportedNamespaceReferences.push(restElement);
                  }
                },
                ObjectProperty: (objectProperty) => {
                  const key = objectProperty.get('key');
                  const propertyName = key.map(
                    {
                      Identifier: (path): string | undefined =>
                        objectProperty.node.computed
                          ? undefined
                          : path.node.name,
                      StringLiteral: (path): string | undefined =>
                        path.node.value,
                      NumericLiteral: (path): string | undefined =>
                        `${path.node.value}`,
                      BooleanLiteral: (path): string | undefined =>
                        `${path.node.value}`,
                    },
                    (): string | undefined => undefined,
                  );
                  if (propertyName === `${name}`) {
                    const value = objectProperty.get('value');
                    if (value.is(filters.Identifier)) {
                      found = true;
                      value
                        .findReferences()
                        .forEach((ref) => findValueReferences(ref));
                    } else if (value.is(filters.Pattern)) {
                      references.push(value);
                    } else {
                      unsupportedNamespaceReferences.push(objectProperty);
                    }
                  }
                },
              });
            }
          },
          ArrayPattern: (arrayPattern) => {
            const elements = arrayPattern.get('elements');
            const index =
              typeof name === 'number'
                ? name
                : /^[0-9]+$/.test(name)
                ? parseInt(name, 10)
                : undefined;
            if (index !== undefined && elements.length > index) {
              const element = elements[index];
              if (element?.is(filters.Identifier)) {
                element
                  .findReferences()
                  .forEach((ref) => findValueReferences(ref));
              } else if (element?.is(filters.Pattern)) {
                references.push(element);
              } else {
                unsupportedNamespaceReferences.push(element || arrayPattern);
              }
            } else {
              unsupportedNamespaceReferences.push(arrayPattern);
            }
          },
        },
        () => {
          namespaceReference.parentPath.map(
            {
              MemberExpression: (memberExpression) => {
                const key = memberExpression.get('property');
                const propertyName = key.map(
                  {
                    Identifier: (path): string | undefined =>
                      memberExpression.node.computed
                        ? undefined
                        : path.node.name,
                    StringLiteral: (path): string | undefined =>
                      path.node.value,
                    NumericLiteral: (path): string | undefined =>
                      `${path.node.value}`,
                    BooleanLiteral: (path): string | undefined =>
                      `${path.node.value}`,
                  },
                  (): string | undefined => undefined,
                );
                if (propertyName === undefined) {
                  unsupportedNamespaceReferences.push(namespaceReference);
                } else if (propertyName === `${name}`) {
                  findValueReferences(memberExpression);
                }
              },
              VariableDeclarator: (variableDeclarator) => {
                if (variableDeclarator.node.init !== namespaceReference.node) {
                  unsupportedNamespaceReferences.push(namespaceReference);
                } else {
                  findPropertyReferences(variableDeclarator);
                }
              },
            },
            () => {
              unsupportedNamespaceReferences.push(namespaceReference);
            },
          );
        },
      );
    }

    findPropertyReferences(this);

    return {references, unsupportedNamespaceReferences, declarations};
  }
}
