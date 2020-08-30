import {Doc} from 'prettier';

function assertDoc(val: Doc) {
  /* istanbul ignore if */
  if (
    !(typeof val === 'string' || (val != null && typeof val.type === 'string'))
  ) {
    throw new Error(
      'Value ' + JSON.stringify(val) + ' is not a valid document',
    );
  }
}

export function concat(parts: Doc[]): Doc {
  parts.forEach(assertDoc);

  if (parts.length === 1) {
    // If it's a single document, no need to concat it.
    return parts[0];
  }
  return {type: 'concat', parts};
}

export function indent(contents: Doc): Doc {
  assertDoc(contents);

  return {type: 'indent', contents};
}

export function align(n: number | string, contents: Doc): Doc {
  if (process.env.NODE_ENV !== 'production') {
    assertDoc(contents);
  }

  return {type: 'align', contents, n};
}

/**
 * @param {Doc} contents
 * @param {object} [opts] - TBD ???
 * @returns Doc
 */
export function group(
  contents: Doc,
  opts: {shouldBreak?: boolean; expandedStates: Doc[]},
): Doc {
  assertDoc(contents);

  return {
    type: 'group',
    // id: opts.id,
    contents,
    break: !!opts.shouldBreak,
    expandedStates: opts.expandedStates,
  };
}

export function dedentToRoot(contents: Doc) {
  return align(-Infinity, contents);
}

export function markAsRoot(contents: Doc) {
  // @ts-expect-error
  return align({type: 'root'}, contents);
}

export function dedent(contents: Doc) {
  return align(-1, contents);
}

export function conditionalGroup(states: Doc[], opts: {}) {
  return group(states[0], {...opts, expandedStates: states});
}

export function fill(parts: Doc[]) {
  parts.forEach(assertDoc);

  return {type: 'fill', parts};
}

export function ifBreak(
  breakContents: Doc,
  flatContents: Doc,
  // opts: {groupId?: string},
): Doc {
  if (breakContents) {
    assertDoc(breakContents);
  }
  if (flatContents) {
    assertDoc(flatContents);
  }

  return {
    type: 'if-break',
    breakContents,
    flatContents,
    // groupId: opts.groupId,
  };
}

export function lineSuffix(contents: Doc): Doc {
  assertDoc(contents);
  return {type: 'line-suffix', contents};
}

export const lineSuffixBoundary: Doc = {type: 'line-suffix-boundary'};
export const breakParent: Doc = {type: 'break-parent'};
export const trim: Doc = {type: 'trim'};
export const line: Doc = {type: 'line'};
export const softline: Doc = {type: 'line', soft: true};
export const hardline: Doc = concat([{type: 'line', hard: true}, breakParent]);
export const literalline: Doc = concat([
  {type: 'line', hard: true, literal: true},
  breakParent,
]);
export const cursor: Doc = {type: 'cursor', placeholder: Symbol('cursor')};

export function join(sep: Doc, arr: Doc[]) {
  const res = [];

  for (let i = 0; i < arr.length; i++) {
    if (i !== 0) {
      res.push(sep);
    }

    res.push(arr[i]);
  }

  return concat(res);
}

export function addAlignmentToDoc(
  doc: Doc,
  size: number,
  tabWidth: number,
): Doc {
  let aligned = doc;
  if (size > 0) {
    // Use indent to add tabs for all the levels of tabs we need
    for (let i = 0; i < Math.floor(size / tabWidth); ++i) {
      aligned = indent(aligned);
    }
    // Use align for all the spaces that are needed
    aligned = align(size % tabWidth, aligned);
    // size is absolute from 0 and not relative to the current
    // indentation, so we use -Infinity to reset the indentation to 0
    aligned = align(-Infinity, aligned);
  }
  return aligned;
}
