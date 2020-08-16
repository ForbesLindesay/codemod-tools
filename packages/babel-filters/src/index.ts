import * as t from '@babel/types';
import {ancestor} from 'babel-walk';
import {TYPES, FLIPPED_ALIAS_KEYS} from './RuntimeTypes';
import {Filter, NodeFilter, AllFilters} from './Types';

export type {Filter, NodeFilter, AllFilters};

function findType(type: string) {
  type State = {onNode: (node: t.Node, parents: t.Node[]) => void};
  const walker = ancestor<State>({
    [type]: (node: t.Node, state: State, parents: t.Node[]) => {
      state.onNode(node, parents);
    },
  });
  return (node: t.Node, onNode: (node: t.Node, parents: t.Node[]) => void) =>
    walker(node, {onNode});
}
function makeFilter<T extends t.Node>(
  fn: Filter<T>,
  findBase: (
    node: t.Node,
    onNode: (node: t.Node, parents: t.Node[]) => void,
  ) => void,
): NodeFilter<T> {
  return Object.assign(fn, {
    and(filter: any) {
      if (typeof filter === 'function') {
        return makeFilter(
          (node): node is any => fn(node) && filter(node),
          findBase,
        );
      } else {
        const entries = Object.entries(filter);
        return makeFilter((node): node is any => {
          if (!fn(node)) return false;
          for (const [key, val] of entries) {
            const v = (node as any)[key];
            if (!(v === val || (typeof val === 'function' && val(v)))) {
              return false;
            }
          }
          return true;
        }, findBase);
      }
    },
    find(
      ast: t.Node,
      map: (node: t.Node, parents: t.Node[]) => any = (n) => n,
    ) {
      const results: any[] = [];
      findBase(ast, (node, parents) => {
        if (fn(node)) results.push(map(node, parents));
      });
      return results;
    },
  }) as any;
}

function getFilters() {
  const result: {[key: string]: NodeFilter<any>} = {};
  for (const type of TYPES) {
    result[type] = makeFilter(
      (value): value is any =>
        !!(value && typeof value === 'object' && value.type === type),
      findType(type),
    );
  }
  for (const [alias, types] of Object.entries(FLIPPED_ALIAS_KEYS)) {
    const typesSet = new Set(types);
    result[alias] = makeFilter(
      (value): value is any =>
        !!(value && typeof value === 'object' && typesSet.has(value.type)),
      findType(alias),
    );
  }
  return result as AllFilters;
}

export default getFilters();
