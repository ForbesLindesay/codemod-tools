import * as t from '@babel/types';
import Path from './Path';

type Remover<T extends t.Node> = ({
  node,
  parent,
  parentPath,
  removeFrom,
}: {
  node: t.Node;
  parent: T;
  parentPath: Path<T>;
  removeFrom: (key: keyof T) => void;
}) => void;

const Removers: {
  [T in t.Node['type']]?: Remover<Extract<t.Node, {type: T}>>;
} = {
  ArrayExpression: ({removeFrom}) => {
    removeFrom('elements');
  },
  ArrowFunctionExpression: ({removeFrom}) => {
    removeFrom('params');
  },
  FunctionDeclaration: ({removeFrom}) => {
    removeFrom('params');
  },
  FunctionExpression: ({removeFrom}) => {
    removeFrom('params');
  },
  ObjectMethod: ({removeFrom}) => {
    removeFrom('params');
  },
  BlockStatement: ({removeFrom}) => {
    removeFrom('body');
  },
  Program: ({removeFrom}) => {
    removeFrom('body');
  },
  ClassBody: ({removeFrom}) => {
    removeFrom('body');
  },
  TSInterfaceBody: ({removeFrom}) => {
    removeFrom('body');
  },
  TSModuleBlock: ({removeFrom}) => {
    removeFrom('body');
  },
  CallExpression: ({removeFrom}) => {
    removeFrom('arguments');
  },
  NewExpression: ({removeFrom}) => {
    removeFrom('arguments');
  },
  OptionalCallExpression: ({removeFrom}) => {
    removeFrom('arguments');
  },
  ExportNamedDeclaration: ({node, parent, parentPath, removeFrom}) => {
    if (parent.declaration === node || parent.specifiers.length === 1) {
      parentPath.remove();
    } else {
      removeFrom('specifiers');
    }
  },
  ExpressionStatement: ({parentPath}) => {
    parentPath.remove();
  },
  ImportDeclaration: ({parent, parentPath, removeFrom}) => {
    if (parent.specifiers.length === 1) {
      parentPath.remove();
    } else {
      removeFrom('specifiers');
    }
  },
  JSXElement: ({removeFrom}) => {
    removeFrom('children');
  },
  JSXFragment: ({removeFrom}) => {
    removeFrom('children');
  },
  JSXOpeningElement: ({removeFrom}) => {
    removeFrom('attributes');
  },
  LogicalExpression: ({node, parent, parentPath}) => {
    parentPath.replace(node === parent.left ? parent.right : parent.left);
  },
  ObjectExpression: ({removeFrom}) => {
    removeFrom('properties');
  },
  ObjectPattern: ({removeFrom}) => {
    removeFrom('properties');
  },
  ObjectTypeAnnotation: ({removeFrom, node}) => {
    if (t.isObjectTypeCallProperty(node)) {
      removeFrom('callProperties');
    } else if (t.isObjectTypeIndexer(node)) {
      removeFrom('indexers');
    } else {
      removeFrom('properties');
    }
  },
  SequenceExpression: ({removeFrom, node, parent, parentPath}) => {
    if (parent.expressions.length > 2) {
      removeFrom('expressions');
    } else {
      parentPath.replace(parent.expressions.find((p) => p !== node)!);
    }
  },
  SwitchStatement: ({removeFrom}) => {
    removeFrom('cases');
  },
  TSCallSignatureDeclaration: ({removeFrom}) => {
    removeFrom('parameters');
  },
  TSConstructSignatureDeclaration: ({removeFrom}) => {
    removeFrom('parameters');
  },
  TSConstructorType: ({removeFrom}) => {
    removeFrom('parameters');
  },
  TSFunctionType: ({removeFrom}) => {
    removeFrom('parameters');
  },
  TSMethodSignature: ({removeFrom}) => {
    removeFrom('parameters');
  },
  TSDeclareFunction: ({removeFrom}) => {
    removeFrom('params');
  },
  TSDeclareMethod: ({removeFrom}) => {
    removeFrom('params');
  },
  TSEnumDeclaration: ({removeFrom}) => {
    removeFrom('members');
  },
  TSIntersectionType: ({removeFrom}) => {
    removeFrom('types');
  },
  TSUnionType: ({removeFrom}) => {
    removeFrom('types');
  },
  TSTupleType: ({removeFrom}) => {
    removeFrom('elementTypes');
  },
  VariableDeclaration: ({parent, parentPath, removeFrom}) => {
    if (parent.declarations.length === 1) {
      parentPath.remove();
    } else {
      removeFrom('declarations');
    }
  },
};

export default Removers;
