import parse, {types as t, filters, Path} from '../index';

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

  // convert all string literals to upper case, leaving
  // the chosen quote marks in tact
  for (const str of root.find(filters.StringLiteral)) {
    str.replaceString(str.node.value.toUpperCase());
  }

  expect(print()).toEqual(`var add = function (b, a) {
  return a   +
    // Weird formatting, huh?
    b;
};
export const olleh = "FOO"     + ('BAR');
export const dlrow = 32 + \`a \${   1 *   3}\`
var foo = function (hello) {
  return hello +    dlrow;
};
foo(  olleh );`);
});

test('remove', () => {
  const code = [
    // Let's turn this function declaration into a variable declaration.
    'const a =   10, b =   20, c =   30;',
    'const foo = "bar", bar = "baz";',
    'const answer = 42;',
    '',
  ].join('\n');

  const {root, print} = parse(code);

  for (const declaration of root.find(filters.VariableDeclaration)) {
    declaration.get('declarations')[0].remove();
  }

  expect(print()).toEqual(`const b =   20, c =   30;
const bar = "baz";
`);
});

test('Path.is', () => {
  const code = [
    'const a = 32, b = 3',
    'const hello = "foo"     + (\'bar\');',
    `const world = a + \`a \${   1 *   b\}\``,

    'function foo(hello) { return hello +    world; }',
    'foo(  hello      + world );',
  ].join('\n');

  const {root, print} = parse(code);

  for (const declarator of root.find(filters.VariableDeclarator)) {
    const id = declarator.get('id');
    const init = declarator.node.init;
    if (id.is(filters.Identifier) && init) {
      for (const reference of id.findReferences()) {
        reference.replace(init);
      }
      declarator.remove();
    }
  }

  expect(print())
    .toEqual(`function foo(hello) { return hello +    32 + \`a \${   1 *   3}\`; }
foo(  "foo"     + ('bar')      + 32 + \`a \${   1 *   3}\` );`);
});

test('insertAfter', () => {
  const code = [
    'const a = 32, b = 3',
    'const hello = "foo"     + (\'bar\');',
    '',
    'function foo() { console.log("foo") }',
    'function bar() { console.log("foo") }',
  ].join('\n');

  const {root, print, template} = parse(code);

  for (const fn of root.find(filters.FunctionDeclaration)) {
    fn.insertAfter(template.statement`${fn.node.id}();`);
  }
  for (const d of root.find(filters.VariableDeclaration)) {
    const decls = d.get('declarations');
    decls[decls.length - 1].insertAfter(
      t.variableDeclarator(t.identifier('extra'), t.numericLiteral(42)),
    );
  }

  expect(print()).toEqual(
    [
      'const a = 32, b = 3,',
      '      extra = 42',
      'const hello = "foo"     + (\'bar\'),',
      '      extra = 42;',
      '',
      'function foo() { console.log("foo") }',
      '',
      'foo();',
      '',
      'function bar() { console.log("foo") }',
      '',
      'bar();',
    ].join('\n'),
  );
});

test('union types', () => {
  const {root} = parse('');

  for (const d of root.find(filters.ImportDeclaration)) {
    for (const s of d.get('specifiers')) {
      // @ts-expect-error
      useImportSpecifier(s);
      if (!s.is(filters.ImportSpecifier)) {
        throw new Error('We only support ImportSpecifiers');
      }
      useImportSpecifier(s);
    }
  }
  function useImportSpecifier(s: Path<t.ImportSpecifier>) {
    return s;
  }
});
