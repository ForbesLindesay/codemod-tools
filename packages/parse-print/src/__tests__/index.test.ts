import parse, {types as t, filters} from '../index';

test('parse', () => {
  const code = [
    // Let's turn this function declaration into a variable declaration.
    'function add(a, b) {',
    '  return a   +',
    '    // Weird formatting, huh?',
    '    b;',
    '}',

    // and export these declarations (and rename them while we're at it)
    'const hello = "foo"     + (\'bar\');',
    // tslint:disable-next-line:no-invalid-template-strings
    `const world = 32 + \`a \${   1 *   3\}\``,

    // when we rename the variables, we'll have to rename these references, but
    // we don't want to rename the function parameters, even though it has the
    // same name
    'function foo(hello) { return hello +    world; }',
    'foo(  hello );',
  ].join('\n');

  const {root, template, print} = parse(code);

  for (const fn of root.find(
    filters.FunctionDeclaration.and({id: filters.Identifier}),
  )) {
    // The wacky spacing in the template is ignored,
    // but the wacky spacing in the original parsed source is perserved
    fn.replace(
      template.statement`
        var 
        
        ${fn.node.id} =     function
        
          (${fn.node.params.slice().reverse()}) 
          ${fn.node.body.body}
        
      `,
    );
  }

  for (const decl of root.find(filters.VariableDeclaration)) {
    decl.replace(t.exportNamedDeclaration(decl.node));
    for (const d of decl.find(
      filters.VariableDeclarator.and({id: filters.Identifier}),
    )) {
      // reverse the names of variable identifiers, and any references to them
      // leaves other identifiers un-touched, even if they have the same name
      const identifier = d.get('id');
      const reversed = t.identifier(
        identifier.node.name.split('').reverse().join(''),
      );
      identifier.replace(reversed);
      for (const ref of identifier.findReferences()) {
        ref.replace(reversed);
      }
    }
  }

  expect(print()).toEqual(`var add = function (b, a) {
  return a   +
    // Weird formatting, huh?
    b;
};
export const olleh = "foo"     + ('bar');
export const dlrow = 32 + \`a \${   1 *   3}\`
var foo = function (hello) {
  return hello +    dlrow;
};
foo(  olleh );`);
});
