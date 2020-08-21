import * as t from '@babel/types';

export default class NodeReplacements {
  private readonly _prefixes = new Map<t.Node, t.Node[]>();
  private readonly _replacements = new Map<t.Node, t.Node[]>();
  private readonly _suffixes = new Map<t.Node, t.Node[]>();
  private readonly _removals = new Map<t.Node, Map<string, Set<t.Node>>>();
  public resolve(node: t.Node) {
    const prefix = this._prefixes.get(node);
    const replacement = this._replacements.get(node);
    const suffix = this._suffixes.get(node);
    if (prefix || replacement || suffix) {
      return [...(prefix || []), ...(replacement || [node]), ...(suffix || [])];
    }
    return undefined;
  }
  public resolveRemovals(node: t.Node) {
    const removals = this._removals.get(node);
    if (removals) {
      return Object.fromEntries(
        Object.entries(node)
          .filter(([key]) => key !== 'range')
          .map(([key, value]) => {
            const keyRemovals = removals.get(key);
            if (keyRemovals) {
              return [key, value.filter((v: t.Node) => !keyRemovals.has(v))];
            }
            return [key, value];
          }),
      ) as t.Node;
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

  public remove<T extends t.Node>(
    parent: T,
    key: Extract<keyof T, string>,
    child: t.Node,
  ) {
    if (!(key in parent)) {
      throw new Error(
        `The key ${key} does not exist in parent of type ${parent.type}, so we cannot remove a node from it.`,
      );
    }
    const parentList = parent[key];
    if (!Array.isArray(parentList)) {
      throw new Error(
        `${parent.type}.${key} is not an Array, so we cannot remove a node from it.`,
      );
    }
    if (!parentList.includes(child)) {
      throw new Error(
        `${parent.type}.${key} does not include the child you asked to remove (of type ${child.type}).`,
      );
    }
    let removals = this._removals.get(parent);
    if (!removals) {
      removals = new Map();
      this._removals.set(parent, removals);
    }
    let keyRemovals = removals.get(key);
    if (!keyRemovals) {
      keyRemovals = new Set();
      removals.set(key, keyRemovals);
    }
    keyRemovals.add(child);
  }
}
