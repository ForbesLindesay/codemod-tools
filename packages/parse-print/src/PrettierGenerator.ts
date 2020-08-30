import {format, Doc} from 'prettier';
import types from '@babel/types';
// import print from '@babel/generator';
import NodeReplacements from './NodeReplacements';
import {hardline, concat, join} from './PrettierBuilders';

function print(
  node: types.Node,
  context: PrintContext,
): {doc: Doc; modified: boolean} {
  if (node.type in printers) {
    // @ts-expect-error
    return printers[node.type](node, context);
  }
  return {doc: 'Hello World', modified: false};
}

function printStatementSequence(
  statements: types.Node[],
  context: PrintContext,
): {doc: Doc; modified: boolean} {
  const printed: Doc[] = [];
  let modified = false;

  for (const stmt of statements) {
    // Just in case the AST has been modified to contain falsy
    // "statements," it's safer simply to skip them.
    /* istanbul ignore if */
    if (!stmt) {
      continue;
    }

    // Skip printing EmptyStatement nodes to avoid leaving stray
    // semicolons lying around.
    if (stmt.type === 'EmptyStatement') {
      continue;
    }

    const {doc: stmtPrinted, modified: stmtModified} = print(stmt, context);
    modified = modified || stmtModified;
    // const text = options.originalText;
    const parts = [];

    // in no-semi mode, prepend statement with semicolon if it might break ASI
    if (!context.semi && stmtNeedsASIProtection(stmt, context)) {
      parts.push(';', stmtPrinted);
    } else {
      parts.push(stmtPrinted);
    }

    // if (!options.semi && isClass) {
    //   if (classPropMayCauseASIProblems(stmtPath)) {
    //     parts.push(';');
    //   } else if (stmt.type === 'ClassProperty') {
    //     const nextChild = bodyNode.body[i + 1];
    //     if (classChildNeedsASIProtection(nextChild)) {
    //       parts.push(';');
    //     }
    //   }
    // }

    // if (
    //   isNextLineEmpty(text, stmt, options.locEnd) &&
    //   !isLastStatement(stmtPath)
    // ) {
    //   parts.push(hardline);
    // }

    printed.push(concat(parts));
  }

  return {doc: join(hardline, printed), modified};
}

const printers: {
  [key in types.Node['type']]?: (
    node: Extract<types.Node, {type: key}>,
    context: PrintContext,
  ) => {doc: Doc; modified: boolean};
} = {
  File: (node, context) => {
    return print(node.program, context);
  },
  Program: (n, context) => {
    const parts: Doc[] = [];
    let modified = false;

    if (n.directives) {
      for (const directive of n.directives) {
        parts.push(print(directive, context).doc, context.semi, hardline);
      }
    }

    const {doc: stmtsPrinted, modified: stmtsModified} = printStatementSequence(
      n.body,
      context,
    );
    parts.push(stmtsPrinted);
    modified = stmtsModified || stmtsModified;

    // TODO: Only force a trailing newline if there were any contents.
    parts.push(hardline);

    return {doc: concat(parts), modified};
  },
  VariableDeclaration: (n, context) => {
    const printed = n.declarations.map((d) => print(d, context));

    // We generally want to terminate all variable declarations with a
    // semicolon, except when they in the () part of for loops.
    const parentNode = path.getParentNode();

    const isParentForLoop =
      parentNode.type === 'ForStatement' ||
      parentNode.type === 'ForInStatement' ||
      parentNode.type === 'ForOfStatement';

    const hasValue = n.declarations.some((decl) => decl.init);

    let firstVariable;
    if (printed.length === 1 && !n.declarations[0].comments) {
      firstVariable = printed[0];
    } else if (printed.length > 0) {
      // Indent first var to comply with eslint one-var rule
      firstVariable = indent(printed[0]);
    }

    parts = [
      n.declare ? 'declare ' : '',
      n.kind,
      firstVariable ? concat([' ', firstVariable]) : '',
      indent(
        concat(
          printed
            .slice(1)
            .map((p) =>
              concat([',', hasValue && !isParentForLoop ? hardline : line, p]),
            ),
        ),
      ),
    ];

    if (!(isParentForLoop && parentNode.body !== n)) {
      parts.push(semi);
    }

    return group(concat(parts));
  },
};
export default function prettierPrint(
  originalSource: string,
  originalAST: types.File,
  _replacements: NodeReplacements,
) {
  // function source(node: any) {
  //   if (!node.range) return undefined;
  //   const [start, end]: [number, number] = node.range;
  //   return originalSource.substring(start, end);
  // }
  return format(originalSource, {
    parser: 'codemod-tools' as any,
    plugins: [
      {
        parsers: {
          'codemod-tools': {
            parse: () => ({}),
            astFormat: 'codemod-tools',
            locStart: () => 0,
            locEnd: () => 0,
          },
        },
        printers: {
          'codemod-tools': {
            print() {
              return print(originalAST, new PrintContext());
            },
          },
        },
      },
    ],
    // parser(text, {'babel-ts': babelParse}) {
    //   const ast = babelParse(text);
    //   // console.log(ast.program.body);
    //   function walk(
    //     prettierNode: any,
    //     babelNode: any,
    //     babelParentNode: any,
    //     replaced: Set<types.Node>,
    //   ): {modified: boolean; node: any} {
    //     if (Array.isArray(prettierNode)) {
    //       let modified = false;
    //       const result = [];
    //       for (let i = 0; i < prettierNode.length; i++) {
    //         if (replacements.isRemoved(babelParentNode, babelNode)) {
    //           modified = true;
    //         } else {
    //           const r = walk(
    //             prettierNode[i],
    //             babelNode[i],
    //             babelParentNode,
    //             replaced,
    //           );
    //           modified = modified || r.modified;
    //           result.push(r.node);
    //         }
    //       }
    //       return {modified, node: result};
    //     }
    //     if (
    //       typeof prettierNode === 'object' &&
    //       prettierNode &&
    //       typeof prettierNode.type === 'string'
    //     ) {
    //       const replacement =
    //         !replaced.has(babelNode) && replacements.resolve(babelNode);
    //       if (replacement) {
    //         replaced.add(babelNode);
    //         try {
    //           console.log('replacement', prettierNode, replacement);
    //           return {
    //             modified: true,
    //             node: walk(replacement, replacement, babelParentNode, replaced)
    //               .node,
    //           };
    //         } finally {
    //           replaced.delete(babelNode);
    //         }
    //       }
    //       let modified = false;
    //       for (const key of Object.keys(prettierNode)) {
    //         const r = walk(
    //           prettierNode[key],
    //           babelNode[key],
    //           babelNode,
    //           replaced,
    //         );
    //         modified = modified || r.modified;
    //         prettierNode[key] = r.node;
    //       }
    //       // if (!modified)
    //       //   return {modified: false, node: source(babelNode) || prettierNode};
    //       return {modified: true, node: prettierNode};
    //     }
    //     return {modified: false, node: prettierNode};
    //   }
    //   ast.program = walk(
    //     ast.program,
    //     originalAST.program,
    //     originalAST,
    //     new Set(),
    //   ).node;
    //   return ast;
    // },
  });
}

class PrintContext {
  // TODO: autodetect whether we should use semicolons from source
  public readonly semi = ';';
  public readonly arrowParens: 'always' | 'avoid' = 'always';
}

function stmtNeedsASIProtection(node: types.Node, context: PrintContext) {
  if (node.type !== 'ExpressionStatement') {
    return false;
  }

  return exprNeedsASIProtection(node.expression, context);
}

function exprNeedsASIProtection(
  node: types.Expression | types.LVal,
  context: PrintContext,
) {
  const maybeASIProblem =
    // pathNeedsParens(path, options) ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'TypeCastExpression' ||
    (node.type === 'ArrowFunctionExpression' &&
      !shouldPrintParamsWithoutParens(node, context)) ||
    node.type === 'ArrayExpression' ||
    node.type === 'ArrayPattern' ||
    (node.type === 'UnaryExpression' &&
      node.prefix &&
      (node.operator === '+' || node.operator === '-')) ||
    node.type === 'TemplateLiteral' ||
    // node.type === 'TemplateElement' ||
    // isJSXNode(node) ||
    (node.type === 'BindExpression' && !node.object) ||
    node.type === 'RegExpLiteral';
  // (node.type === 'Literal' && node.pattern) ||
  // (node.type === 'Literal' && node.regex);

  if (maybeASIProblem) {
    return true;
  }

  return false;
  // if (!hasNakedLeftSide(node)) {
  //   return false;
  // }

  // return path.call(
  //   (childPath) => exprNeedsASIProtection(childPath, options),
  //   ...getLeftSidePathName(path, node),
  // );
}

function shouldPrintParamsWithoutParens(
  node: types.ArrowFunctionExpression,
  context: PrintContext,
) {
  if (context.arrowParens === 'always') {
    return false;
  }

  if (context.arrowParens === 'avoid') {
    return canPrintParamsWithoutParens(node);
  }

  // Fallback default; should be unreachable
  /* istanbul ignore next */
  return false;
}
function canPrintParamsWithoutParens(node: types.ArrowFunctionExpression) {
  return (
    node.params.length === 1 &&
    // !node.rest &&
    !node.typeParameters &&
    // !hasDanglingComments(node) &&
    node.params[0].type === 'Identifier' &&
    !node.params[0].typeAnnotation &&
    // !node.params[0].comments &&
    !node.params[0].optional &&
    // !node.predicate &&
    !node.returnType
  );
}
