import * as t from '@babel/types';

export default class NodeReplacements {
  private readonly _prefixes = new Map<t.Node, t.Node[]>();
  private readonly _replacements = new Map<t.Node, t.Node[]>();
  private readonly _suffixes = new Map<t.Node, t.Node[]>();
  private readonly _removals = new Map<t.Node, Set<t.Node>>();
  private readonly _removalParents = new Map<t.Node, t.Node>();
  public resolve(node: t.Node) {
    const prefix = this._prefixes.get(node);
    const replacement = this._replacements.get(node);
    const suffix = this._suffixes.get(node);
    if (prefix || replacement || suffix) {
      return [...(prefix || []), ...(replacement || [node]), ...(suffix || [])];
    }
    return undefined;
  }
  public isRemovalParent(removalParent: t.Node) {
    return this._removals.has(removalParent);
  }
  public isRemoved(removalParent: t.Node, child: t.Node) {
    return !!this._removals.get(removalParent)?.has(child);
  }
  public resolveRemovals(
    node: t.Node,
    {keepChildren = false}: {keepChildren?: boolean} = {},
  ) {
    const parent = this._removalParents.get(node);
    if (parent) {
      if (keepChildren) {
        return parent;
      }
      const removals = this._removals.get(parent)!;
      return Object.fromEntries(
        Object.entries(parent).map(([key, value]) => {
          if (Array.isArray(value)) {
            return [key, value.filter((v: t.Node) => !removals.has(v))];
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
    let removalParent = this._removalParents.get(parent);
    if (!removalParent) {
      const {range, ...p} = parent as any;
      removalParent = p as t.Node;
      this._removalParents.set(parent, removalParent);
      this._removals.set(removalParent, new Set());
    }
    const removals = this._removals.get(removalParent)!;
    removals.add(child);
  }
}
