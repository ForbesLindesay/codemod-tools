import assertNever from 'assert-never';
import {ancestor as walk} from 'babel-walk';
import * as t from '@babel/types';
import isReference from './isReference';

export type Scope = t.FunctionParent | t.Program;
export type BlockScope = t.CatchClause | t.For | t.BlockStatement | Scope;
export type ThisAndArgumentsScope = Exclude<
  t.Function,
  t.ArrowFunctionExpression
>;

export const isScope = (node: t.Node): node is Scope =>
  t.isFunctionParent(node) || t.isProgram(node);
export const isBlockScope = (node: t.Node): node is BlockScope =>
  t.isBlockStatement(node) || t.isFor(node) || isScope(node);

export const declaresArguments = (
  node: t.Node,
): node is ThisAndArgumentsScope =>
  t.isFunction(node) && !t.isArrowFunctionExpression(node);

export const declaresThis = declaresArguments;

export interface ScopeInfo {
  // Map<ReferenceIdentifier, DeclarationIdentifier>
  declarations: Map<t.Identifier, {node: t.Identifier; parents: t.Node[]}>;
  // Map<DeclarationIdentifier, ReferenceIdentifier>
  references: Map<t.Identifier, {node: t.Identifier; parents: t.Node[]}[]>;

  // Map<DeclarationIdentifier, Scope>
  declarationScope: Map<t.Identifier, {node: BlockScope; parents: t.Node[]}>;

  argumentsDeclarations: Map<
    t.Identifier,
    {node: ThisAndArgumentsScope; parents: t.Node[]}
  >;
  argumentsReferences: Map<
    ThisAndArgumentsScope,
    {node: t.Identifier; parents: t.Node[]}[]
  >;

  thisDeclarations: Map<
    t.ThisExpression,
    {node: ThisAndArgumentsScope; parents: t.Node[]}
  >;
  thisReferences: Map<
    ThisAndArgumentsScope,
    {node: t.ThisExpression; parents: t.Node[]}[]
  >;

  globals: Map<string, {node: t.Identifier; parents: t.Node[]}[]>;
  globalThisRefrences: {node: t.ThisExpression; parents: t.Node[]}[];
}
interface Context extends ScopeInfo {
  declarationsByName: Map<
    BlockScope,
    Map<string, {node: t.Identifier; parents: t.Node[]}>
  >;
}

// const LOCALS_SYMBOL = Symbol('locals');

const declareLocals = (ctx: Context, node: BlockScope) => {
  let result = ctx.declarationsByName.get(node);
  if (result) return result;
  result = new Map();
  ctx.declarationsByName.set(node, result);
  return result;
};

const setLocal = (
  ctx: Context,
  node: BlockScope,
  id: t.Identifier,
  parents: t.Node[],
) => {
  declareLocals(ctx, node).set(id.name, {node: id, parents});
  ctx.declarationScope.set(id, {
    node,
    parents: parents.slice(parents.indexOf(node) + 1),
  });
};

const getLocals = (ctx: Context, node: t.Node) =>
  isBlockScope(node) ? ctx.declarationsByName.get(node) : undefined;

// First pass

function declarePattern(
  ctx: Context,
  node: t.LVal,
  parent: BlockScope,
  parents: t.Node[],
) {
  switch (node.type) {
    case 'Identifier':
      setLocal(ctx, parent, node, parents);
      break;
    case 'ObjectPattern':
      for (const prop of node.properties) {
        switch (prop.type) {
          case 'RestElement':
            declarePattern(ctx, prop.argument, parent, parents);
            break;
          case 'ObjectProperty':
            declarePattern(ctx, prop.value as t.LVal, parent, parents);
            break;
          default:
            assertNever(prop);
            break;
        }
      }
      break;
    case 'ArrayPattern':
      for (const element of node.elements) {
        if (element) declarePattern(ctx, element, parent, parents);
      }
      break;
    case 'RestElement':
      declarePattern(ctx, node.argument, parent, parents);
      break;
    case 'AssignmentPattern':
      declarePattern(ctx, node.left, parent, parents);
      break;
    // istanbul ignore next
    default:
      throw new Error('Unrecognized pattern type: ' + node.type);
  }
}

function declareModuleSpecifier(
  node:
    | t.ImportSpecifier
    | t.ImportDefaultSpecifier
    | t.ImportNamespaceSpecifier,
  ctx: Context,
  parents: t.Node[],
) {
  for (let i = parents.length - 2; i >= 0; i--) {
    const parent = parents[i];
    if (isScope(parent)) {
      setLocal(ctx, parent, node.local, parents.slice().reverse().slice(1));
      return;
    }
  }
}

const firstPass = walk<Context>({
  VariableDeclaration(node, state, parents) {
    for (let i = parents.length - 2; i >= 0; i--) {
      const parent = parents[i];
      if ((node.kind === 'var' && isBlockScope(parent)) || isScope(parent)) {
        for (const declaration of node.declarations) {
          declarePattern(
            state,
            declaration.id,
            parent,
            parents.slice().reverse().slice(1),
          );
        }
        return;
      }
    }
  },
  FunctionDeclaration(node, state, parents) {
    if (node.id) {
      for (let i = parents.length - 2; i >= 0; i--) {
        const parent = parents[i];
        if (isScope(parent)) {
          setLocal(state, parent, node.id, parents.slice().reverse().slice(1));
          return;
        }
      }
    }
  },
  Function(node: t.Function, ctx: Context, parents: t.Node[]) {
    for (const param of node.params) {
      declarePattern(ctx, param, node, parents.slice().reverse().slice(1));
    }
    const id = (node as t.FunctionDeclaration).id;
    if (id) {
      setLocal(ctx, node, id, parents.slice().reverse().slice(1));
    }
  },
  ClassDeclaration(node, state, parents) {
    for (let i = parents.length - 2; i >= 0; i--) {
      const parent = parents[i];
      if (isScope(parent)) {
        setLocal(state, parent, node.id, parents.slice().reverse().slice(1));
        return;
      }
    }
  },
  TryStatement(node, state, parents) {
    if (node.handler === null) return;
    if (node.handler.param === null) return;
    declarePattern(
      state,
      node.handler.param,
      node.handler,
      parents.slice().reverse().slice(1),
    );
  },
  ImportDefaultSpecifier: declareModuleSpecifier,
  ImportSpecifier: declareModuleSpecifier,
  ImportNamespaceSpecifier: declareModuleSpecifier,
});

// Second pass

const secondPass = walk<Context>({
  Identifier(node, state, parents) {
    const name = node.name;
    if (name === 'undefined') return;
    const parentsSorted = parents.slice().reverse().slice(1);

    const lastParent = parents[parents.length - 2];
    if (lastParent) {
      if (!isReference(node, lastParent, parents[parents.length - 3])) return;
      for (const parent of parentsSorted) {
        if (name === 'arguments' && declaresArguments(parent)) {
          state.argumentsDeclarations.set(node, {
            node: parent,
            parents: parentsSorted.slice(parentsSorted.indexOf(parent) + 1),
          });
          state.argumentsReferences.set(parent, [
            ...(state.argumentsReferences.get(parent) || []),
            {node, parents: parentsSorted},
          ]);
          return;
        }
        const declaration = getLocals(state, parent)?.get(name);
        if (declaration) {
          if (declaration.node === node) {
            return;
          }
          state.declarations.set(node, declaration);
          state.references.set(declaration.node, [
            ...(state.references.get(declaration.node) || []),
            {node, parents: parentsSorted},
          ]);
          return;
        }
      }
    }

    state.globals.set(node.name, [
      ...(state.globals.get(node.name) || []),
      {node, parents: parentsSorted},
    ]);
  },

  ThisExpression(node, state, parents) {
    const parentsSorted = parents.slice().reverse().slice(1);
    for (const parent of parents.slice().reverse()) {
      if (declaresThis(parent)) {
        state.thisDeclarations.set(node, {
          node: parent,
          parents: parentsSorted.slice(parentsSorted.indexOf(parent) + 1),
        });
        state.thisReferences.set(parent, [
          ...(state.thisReferences.get(parent) || []),
          {node, parents: parentsSorted},
        ]);
        return;
      }
    }

    state.globalThisRefrences.push({
      node,
      parents: parentsSorted,
    });
  },
});

export default function analyzeScope(ast: t.Node): ScopeInfo {
  // istanbul ignore if
  if (!t.isNode(ast)) {
    throw new TypeError('Source must be a babel AST');
  }

  const result: ScopeInfo = {
    declarations: new Map(),
    references: new Map(),
    declarationScope: new Map(),
    argumentsDeclarations: new Map(),
    argumentsReferences: new Map(),
    thisDeclarations: new Map(),
    thisReferences: new Map(),
    globals: new Map(),
    globalThisRefrences: [],
  };
  const context: Context = {
    declarationsByName: new Map(),
    ...result,
  };

  firstPass(ast, context);
  secondPass(ast, context);

  return result;
}
