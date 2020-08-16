import parse, {t} from '../index';

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
  const {ast, replace, print} = parse(code);

  // Grab a reference to the function declaration we just parsed.
  const add = ast.program.body[0];

  if (!t.isFunctionDeclaration(add)) {
    throw new Error('expected function declaration');
  }

  // This kind of manipulation should seem familiar if you've used Esprima or the
  // Mozilla Parser API before.
  replace(
    ast.program.body[0],
    t.variableDeclaration('var', [
      t.variableDeclarator(
        add.id!,
        t.functionExpression(
          null, // Anonymize the function expression.
          // Just for fun, because addition is commutative:
          add.params.reverse(),
          add.body,
        ),
      ),
    ]),
  );

  expect(print()).toEqual(`var add = function (b, a) {
  return a   +
    // Weird formatting, huh?
    b;
};`);
});
