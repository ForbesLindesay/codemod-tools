import * as t from '@babel/types';

export default function isReference(
  node: t.Identifier,
  parent: t.Node,
  grandParent: t.Node,
) {
  switch (parent.type) {
    // yes: left = NODE;
    // yes: NODE = right;
    case 'AssignmentExpression':
      return true;
  }

  return t.isReferenced(node, parent, grandParent);
}
