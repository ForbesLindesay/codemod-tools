import * as t from '@babel/types';

export default class NodeReplacements {
  private readonly _replacements = new Map<t.Node, t.Node[]>();
  public resolve(node: t.Node) {
    return this._replacements.get(node);
  }
  public replace(node: t.Node, ...replacements: t.Node[]) {
    this._replacements.set(node, replacements);
  }
}
