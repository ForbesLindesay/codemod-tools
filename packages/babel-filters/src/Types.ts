import * as t from '@babel/types';

export type Filter<T extends t.Node> = (
  node: t.Node | null | undefined,
) => node is T;

export type NodeFilter<T extends t.Node> = Filter<T> & {
  and<S>(filter: (node: T | S) => node is S): Filter<T & S>;
  and<
    S extends {
      [key in keyof T]?:
        | T[key]
        | (T[key] extends t.Node | null | undefined
            ? (node: T[key]) => node is any
            : never);
    }
  >(
    filter: S,
  ): NodeFilter<
    T &
      {
        [key in keyof S]: S[key] extends (node: any) => node is infer KeyVal
          ? KeyVal
          : S[key];
      }
  >;
  find(ast: t.Node): t.Node[];
  find<U>(ast: t.Node, map: (node: T, parents: t.Node[]) => U): U[];
};

export type TypeFilters = {
  [key in t.Node['type']]: NodeFilter<Extract<t.Node, {type: key}>>;
};
export type AliasFilters = {
  [key in keyof t.Aliases]: NodeFilter<t.Aliases[key]>;
};
export type AllFilters = TypeFilters & AliasFilters;
