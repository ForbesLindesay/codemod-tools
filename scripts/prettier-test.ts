import prettier from 'prettier';
import parser from 'prettier/parser-babel';
// const printer = require('prettier/')
console.log(parser.parsers.babel);
console.log(
  prettier.format(
    [
      'function bar() {',
      '  return "bar";',
      '}',
      'function foo() {',
      "  return 'foo:' + bar();",
      '}',
      'console.log(foo());',
    ].join('\n'),
    {
      // plugins: [{printers: {estree: {}}}],
      parser(text, {'babel-ts': babel}) {
        const ast = babel(text);
        ast.program.body[1] = [
          'function foo() {',
          "  return 'foo:' + bar();",
          '}',
        ].join('\n');
        return ast;
      },
    },
  ),
);
