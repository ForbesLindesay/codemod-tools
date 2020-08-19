import * as t from '@babel/types';

export default class NodeReplacements {
  private readonly _prefixes = new Map<t.Node, t.Node[]>();
  private readonly _replacements = new Map<t.Node, t.Node[]>();
  private readonly _suffixes = new Map<t.Node, t.Node[]>();
  public resolve(node: t.Node) {
    const prefix = this._prefixes.get(node);
    const replacement = this._replacements.get(node);
    const suffix = this._suffixes.get(node);
    if (prefix || replacement || suffix) {
      return [...(prefix || []), ...(replacement || [node]), ...(suffix || [])];
    }
    return undefined;
  }

  public replace(node: t.Node, ...replacements: t.Node[]) {
    this._replacements.set(node, replacements);
  }

  public insertBefore(node: t.Node, ...prefixes: t.Node[]) {
    this._prefixes.set(node, [
      ...prefixes,
      ...(this._prefixes.get(node) || []),
    ]);
  }

  public insertAfter(node: t.Node, ...suffixes: t.Node[]) {
    this._suffixes.set(node, [
      ...(this._suffixes.get(node) || []),
      ...suffixes,
    ]);
  }
}
