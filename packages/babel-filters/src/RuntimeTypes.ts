import * as t from '@babel/types';

// @ts-expect-error
const TYPES: string[] = t.TYPES;

if (!(Array.isArray(TYPES) && TYPES.every((t) => typeof t === 'string'))) {
  throw new Error('@babel/types TYPES does not match the expected type.');
}

// @ts-expect-error
const FLIPPED_ALIAS_KEYS: {[key: string]: string[]} = t.FLIPPED_ALIAS_KEYS;

if (
  !(
    FLIPPED_ALIAS_KEYS &&
    // tslint:disable-next-line: strict-type-predicates
    typeof FLIPPED_ALIAS_KEYS === 'object' &&
    Object.keys(FLIPPED_ALIAS_KEYS).every(
      (key) =>
        Array.isArray(FLIPPED_ALIAS_KEYS[key]) &&
        // tslint:disable-next-line: strict-type-predicates
        FLIPPED_ALIAS_KEYS[key].every((v) => typeof v === 'string'),
    )
  )
) {
  throw new Error(
    '@babel/types FLIPPED_ALIAS_KEYS does not match the expected type.',
  );
}

export {TYPES, FLIPPED_ALIAS_KEYS};
