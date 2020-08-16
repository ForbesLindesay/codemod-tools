import parse, {types as t, filters} from '../index';

test('parse', () => {
  // Let's turn this function declaration into a variable declaration.
  const code = [
    'function add(a, b) {',
    '  return a   +',
    '    // Weird formatting, huh?',
    '    b;',
    '}',
  ].join('\n');

  // Parse the code using an interface similar to require("esprima").parse.
  const {root, print} = parse(code);

  for (const fn of root.find(
    filters.FunctionDeclaration.and({id: filters.Identifier}),
  )) {
    // This kind of manipulation should seem familiar if you've used Esprima or the
    // Mozilla Parser API before.
    fn.replace(
      t.variableDeclaration('var', [
        t.variableDeclarator(
          fn.node.id,
          t.functionExpression(
            null, // Anonymize the function expression.
            // Just for fun, because addition is commutative:
            fn.node.params.slice().reverse(),
            fn.node.body,
          ),
        ),
      ]),
    );
  }

  expect(print()).toEqual(`var add = function (b, a) {
  return a   +
    // Weird formatting, huh?
    b;
};`);
});
