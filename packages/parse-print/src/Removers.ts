import * as t from '@babel/types';
import Path from './Path';

type Remover<T extends t.Node> = ({
  node,
  parent,
  parentPath,
  remove,
}: {
  node: t.Node;
  parent: T;
  parentPath: Path<T>;
  remove: (key: keyof T) => void;
}) => void;

const Removers: {
  [T in t.Node['type']]?: Remover<Extract<t.Node, {type: T}>>;
} = {
  ArrayExpression: ({remove}) => {
    remove('elements');
  },
  ArrowFunctionExpression: ({remove}) => {
    remove('params');
  },
  FunctionDeclaration: ({remove}) => {
    remove('params');
  },
  FunctionExpression: ({remove}) => {
    remove('params');
  },
  ObjectMethod: ({remove}) => {
    remove('params');
  },
  BlockStatement: ({remove}) => {
    remove('body');
  },
  Program: ({remove}) => {
    remove('body');
  },
  ClassBody: ({remove}) => {
    remove('body');
  },
  TSInterfaceBody: ({remove}) => {
    remove('body');
  },
  TSModuleBlock: ({remove}) => {
    remove('body');
  },
  CallExpression: ({remove}) => {
    remove('arguments');
  },
  NewExpression: ({remove}) => {
    remove('arguments');
  },
  OptionalCallExpression: ({remove}) => {
    remove('arguments');
  },
  ExportNamedDeclaration: ({node, parent, parentPath, remove}) => {
    if (parent.declaration === node || parent.specifiers.length === 1) {
      parentPath.remove();
    } else {
      remove('specifiers');
    }
  },
  ExpressionStatement: ({parentPath}) => {
    parentPath.remove();
  },
  ImportDeclaration: ({parent, parentPath, remove}) => {
    if (parent.specifiers.length === 1) {
      parentPath.remove();
    } else {
      remove('specifiers');
    }
  },
  JSXElement: ({remove}) => {
    remove('children');
  },
  JSXFragment: ({remove}) => {
    remove('children');
  },
  JSXOpeningElement: ({remove}) => {
    remove('attributes');
  },
  LogicalExpression: ({node, parent, parentPath}) => {
    parentPath.replace(node === parent.left ? parent.right : parent.left);
  },
  ObjectExpression: ({remove}) => {
    remove('properties');
  },
  ObjectPattern: ({remove}) => {
    remove('properties');
  },
  ObjectTypeAnnotation: ({remove, node}) => {
    if (t.isObjectTypeCallProperty(node)) {
      remove('callProperties');
    } else if (t.isObjectTypeIndexer(node)) {
      remove('indexers');
    } else {
      remove('properties');
    }
  },
  SequenceExpression: ({remove, node, parent, parentPath}) => {
    if (parent.expressions.length > 2) {
      remove('expressions');
    } else {
      parentPath.replace(parent.expressions.find((p) => p !== node)!);
    }
  },
  SwitchStatement: ({remove}) => {
    remove('cases');
  },
  TSCallSignatureDeclaration: ({remove}) => {
    remove('parameters');
  },
  TSConstructSignatureDeclaration: ({remove}) => {
    remove('parameters');
  },
  TSConstructorType: ({remove}) => {
    remove('parameters');
  },
  TSFunctionType: ({remove}) => {
    remove('parameters');
  },
  TSMethodSignature: ({remove}) => {
    remove('parameters');
  },
  TSDeclareFunction: ({remove}) => {
    remove('params');
  },
  TSDeclareMethod: ({remove}) => {
    remove('params');
  },
  TSEnumDeclaration: ({remove}) => {
    remove('members');
  },
  TSIntersectionType: ({remove}) => {
    remove('types');
  },
  TSUnionType: ({remove}) => {
    remove('types');
  },
  TSTupleType: ({remove}) => {
    remove('elementTypes');
  },
  VariableDeclaration: ({parent, parentPath, remove}) => {
    if (parent.declarations.length === 1) {
      parentPath.remove();
    } else {
      remove('declarations');
    }
  },
};

export default Removers;
